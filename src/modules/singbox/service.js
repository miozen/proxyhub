import { createHash, randomUUID } from 'node:crypto';
import { decryptUrl } from './crypto.js';
import { buildRegionalGroups, countRegions, injectTemplate, normalizeNodes, rawNodes, validateTemplate } from './engine.js';
import { assertSafeUrl, fetchJsonSafe } from './fetch.js';

export const DEFAULTS = {
  regions: {
    HK: ['HK', '\u9999\u6e2f'],
    TW: ['TW', '\u53f0\u6e7e'],
    SG: ['SG', '\u65b0\u52a0\u5761'],
    JP: ['JP', '\u65e5\u672c'],
    US: ['US', '\u7f8e\u56fd']
  },
  banned: '\u8fc7\u671f|\u5269\u4f59|\u7f51\u5740|\u5b98\u7f51|\u6d41\u91cf|\u5230\u671f|\u91cd\u7f6e|\u6709\u6548|\u5957\u9910|\u7fa4\u7ec4|\u901a\u77e5|\u5730\u5740|\u8d2d\u4e70|\u7ef4\u62a4',
  urltest: { url: 'https://www.gstatic.com/generate_204', interval: '3m', tolerance: 150 }
};

export function createSingboxService({ database, config, fetchJson = fetchJsonSafe }) {
  function setting(key, fallback) {
    const row = database.prepare('SELECT value_json FROM app_settings WHERE key=?').get(key);
    return row ? JSON.parse(row.value_json) : structuredClone(fallback);
  }

  function settings() {
    return {
      region_keywords: setting('singbox_region_keywords', DEFAULTS.regions),
      banned_keywords: setting('singbox_banned_keywords', DEFAULTS.banned),
      urltest_params: setting('singbox_urltest_params', DEFAULTS.urltest)
    };
  }

  function updateSettings(value) {
    const regions = value?.region_keywords;
    const banned = String(value?.banned_keywords || '').trim() || DEFAULTS.banned;
    const urltest = value?.urltest_params;
    const validRegions = regions && Object.keys(DEFAULTS.regions).every((region) =>
      Array.isArray(regions[region]) && regions[region].length > 0 &&
      regions[region].length <= 30 && regions[region].every((keyword) =>
        typeof keyword === 'string' && keyword.trim().length > 0 && keyword.trim().length <= 40));
    if (!validRegions || Object.keys(regions).some((region) => !(region in DEFAULTS.regions))) {
      throw new Error('invalid_region_keywords');
    }
    if (typeof banned !== 'string' || banned.length > 2000) throw new Error('invalid_banned_keywords');
    try { new RegExp(banned, 'i'); } catch { throw new Error('invalid_banned_keywords'); }
    let parsedUrl;
    try { parsedUrl = new URL(urltest?.url); } catch { throw new Error('invalid_urltest_url'); }
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('invalid_urltest_url');
    if (!/^[1-9]\d*(?:ms|s|m|h)$/.test(urltest?.interval || '')) throw new Error('invalid_urltest_interval');
    const tolerance = Number(urltest?.tolerance);
    if (!Number.isInteger(tolerance) || tolerance < 0 || tolerance > 60_000) {
      throw new Error('invalid_urltest_tolerance');
    }
    const normalized = {
      region_keywords: Object.fromEntries(Object.keys(DEFAULTS.regions).map((region) => [
        region, [...new Set(regions[region].map((keyword) => keyword.trim()))]
      ])),
      banned_keywords: banned,
      urltest_params: { url: parsedUrl.toString(), interval: urltest.interval, tolerance }
    };
    const save = database.prepare(`INSERT INTO app_settings(key,value_json,updated_at) VALUES(?,?,?)
      ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,updated_at=excluded.updated_at`);
    const now = new Date().toISOString();
    database.transaction(() => {
      save.run('singbox_region_keywords', JSON.stringify(normalized.region_keywords), now);
      save.run('singbox_banned_keywords', JSON.stringify(normalized.banned_keywords), now);
      save.run('singbox_urltest_params', JSON.stringify(normalized.urltest_params), now);
    })();
    return normalized;
  }

  function template(id) {
    return database.prepare('SELECT * FROM template_versions WHERE id=?').get(id);
  }

  async function createTemplateVersion({
    sourceType, sourceUrl = null, content, parentId = null
  }) {
    const parent = parentId ? template(parentId) : null;
    if (parentId && !parent) throw new Error('template_not_found');
    const type = sourceType || parent?.source_type;
    const url = sourceUrl || parent?.source_url || null;
    if (!['local', 'remote'].includes(type)) throw new Error('template_source_invalid');
    let resolved = content;
    if (resolved === undefined && type === 'remote') {
      if (!url) throw new Error('template_source_url_required');
      resolved = await fetchJson(url);
    }
    if (resolved === undefined) throw new Error('template_content_required');
    validateTemplate(resolved);
    const id = randomUUID();
    const now = new Date().toISOString();
    database.prepare(`INSERT INTO template_versions
      (id,source_type,source_url,content_json,content_hash,active,created_at,parent_id,status,last_checked_at,last_error)
      VALUES(?,?,?,?,?,0,?,?, 'ready',?,NULL)`)
      .run(id, type, type === 'remote' ? url : null, JSON.stringify(resolved), hashTemplate(resolved), now, parentId, type === 'remote' ? now : null);
    return { id, parent_id: parentId };
  }

  async function refreshTemplate(id) {
    const current = template(id);
    if (!current) throw new Error('template_not_found');
    if (current.source_type !== 'remote' || !current.source_url) throw new Error('template_not_remote');
    const checkedAt = new Date().toISOString();
    try {
      const content = await fetchJson(current.source_url);
      database.prepare("UPDATE template_versions SET status='ready',last_checked_at=?,last_error=NULL WHERE id=?").run(checkedAt, id);
      return await createTemplateVersion({
        sourceType: 'remote', sourceUrl: current.source_url, content, parentId: id
      });
    } catch (error) {
      database.prepare("UPDATE template_versions SET status='error',last_checked_at=?,last_error=? WHERE id=?")
        .run(checkedAt, error.message, id);
      throw error;
    }
  }

  function activateTemplate(id) {
    return database.transaction(() => {
      const target = template(id);
      if (!target) return null;
      validateTemplate(JSON.parse(target.content_json));
      const previous = database.prepare('SELECT id FROM template_versions WHERE active=1').get();
      database.prepare('UPDATE template_versions SET active=0 WHERE active=1').run();
      database.prepare("UPDATE template_versions SET active=1,status='ready' WHERE id=?").run(id);
      return { previous_id: previous?.id || null, active_id: id };
    })();
  }

  function hashTemplate(value) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  async function fetchSubscription(subscription, generationSettings = settings()) {
    const startedAt = Date.now();
    const name = String(subscription?.name || '').trim() || '未命名订阅';
    try {
      const url = await assertSafeUrl(subscription?.url);
      url.searchParams.set('t', String(Date.now()));
      const generationSettings = settings();
      const payload = await fetchJson(url.toString(), {
        timeoutMs: 10_000,
        headers: { 'user-agent': 'Mozilla/5.0 (Clash)' }
      });
      const rawCount = rawNodes(payload).length;
      const nodes = normalizeNodes(payload, generationSettings.banned_keywords);
      return {
        success: true,
        status: nodes.length ? 'success' : 'warning',
        id: subscription?.id,
        name,
        duration_ms: Date.now() - startedAt,
        raw_nodes: rawCount,
        valid_nodes: nodes.length,
        nodes,
        regions: countRegions(nodes, generationSettings.region_keywords, subscription?.allowed_regions),
        warnings: nodes.length ? [] : ['没有可用节点。']
      };
    } catch (error) {
      return {
        success: false, status: 'error', id: subscription?.id, name,
        duration_ms: Date.now() - startedAt, raw_nodes: 0, valid_nodes: 0,
        nodes: [], error: error.message
      };
    }
  }

  async function generate(user) {
    const startedAt = Date.now();
    const steps = [];
    const progress = {};
    const addStep = (name, status, message, details = {}) => steps.push({ name, status, message, details });
    const abort = (message) => {
      const error = new Error(message);
      error.diagnostics = {
        success: false,
        error: message,
        summary: {
          ...progress,
          duration_ms: Date.now() - startedAt,
          warnings: steps.filter((step) => step.status === 'warning').length
        },
        steps
      };
      throw error;
    };
    const generationSettings = settings();
    const templateRow = database.prepare('SELECT * FROM template_versions WHERE active=1').get();
    if (!templateRow) {
      addStep('模板来源', 'error', '请先激活一个模板版本。');
      abort('active_template_required');
    }
    let template;
    try {
      template = JSON.parse(templateRow.content_json);
      validateTemplate(template);
    } catch (error) {
      addStep('模板来源', 'error', `活动模板无效：${error.message}`);
      abort(error.message);
    }
    const templateSource = templateRow.source_type === 'remote' ? 'remote_cached' : 'local_sqlite';
    Object.assign(progress, {
      template_source: templateSource,
      template_version: templateRow.id,
      template_hash: templateRow.content_hash
    });
    addStep('模板来源', 'success',
      templateRow.source_type === 'remote' ? '已使用远程缓存模板版本。' : '已使用 SQLite 本地模板版本。',
      { source: templateSource, version_id: templateRow.id, content_hash: templateRow.content_hash, created_at: templateRow.created_at });

    const rows = database.prepare('SELECT * FROM subscriptions WHERE user_id=? AND enabled=1 ORDER BY created_at').all(user.id);
    const subscriptions = rows.map((row) => ({
      id: row.id, name: row.name,
      url: decryptUrl(row.url_encrypted, config.dataEncryptionKey),
      allowed_regions: JSON.parse(row.allowed_regions_json)
    }));
    const fetched = await Promise.all(subscriptions.map((subscription) =>
      fetchSubscription(subscription, generationSettings)));
    const successCount = fetched.filter((item) => item.status === 'success').length;
    const warningCount = fetched.filter((item) => item.status === 'warning').length;
    const failedCount = fetched.filter((item) => item.status === 'error').length;
    const reports = fetched.map(({ nodes: _nodes, ...report }) => report);
    Object.assign(progress, {
      subscriptions: rows.length,
      successful_subscriptions: successCount,
      warning_subscriptions: warningCount,
      failed_subscriptions: failedCount,
      raw_nodes: reports.reduce((total, report) => total + report.raw_nodes, 0),
      reports
    });
    addStep('订阅源拉取', !rows.length || failedCount || warningCount ? 'warning' : 'success',
      rows.length
        ? `启用 ${rows.length} 个，成功 ${successCount} 个，警告 ${warningCount} 个，失败 ${failedCount} 个。`
        : '没有启用的订阅源，仅验证模板固定配置。',
      { items: reports });

    const sources = fetched.filter((item) => item.nodes.length).map((item) => ({
      name: item.name,
      nodes: item.nodes,
      allowed_regions: subscriptions.find((subscription) => subscription.id === item.id)?.allowed_regions || []
    }));
    const cleanedCount = sources.reduce((total, source) => total + source.nodes.length, 0);
    const seen = new Set();
    const nodes = sources.flatMap((source) => source.nodes)
      .filter((node) => !seen.has(node.tag) && seen.add(node.tag));
    if (rows.length && !nodes.length) {
      addStep('节点清洗', 'error', '没有可用于生成配置的有效节点。');
      abort(failedCount === rows.length ? 'all_subscriptions_failed' : 'no_valid_nodes');
    }
    const rawCount = reports.reduce((total, report) => total + report.raw_nodes, 0);
    Object.assign(progress, { nodes: nodes.length });
    addStep('节点清洗', 'success', `保留 ${nodes.length} 个有效节点。`, {
      raw_nodes: rawCount, cleaned_nodes: cleanedCount,
      duplicate_nodes: cleanedCount - nodes.length, valid_nodes: nodes.length
    });

    const { groups, byRegion } = buildRegionalGroups(
      sources, generationSettings.region_keywords, generationSettings.urltest_params
    );
    addStep('区域分组', 'success', `生成 ${groups.length} 个 urltest 分组。`, {
      total: groups.length,
      regions: Object.fromEntries(Object.keys(generationSettings.region_keywords)
        .map((region) => [region, byRegion[region]?.length || 0])),
      urltest: generationSettings.urltest_params
    });
    Object.assign(progress, { groups: groups.length });

    const selectorCount = template.outbounds.filter((outbound) => outbound.type === 'selector').length;
    const directTag = template.outbounds.find((outbound) => outbound.type === 'direct')?.tag || '🎯 全球直连';
    let output;
    try {
      output = injectTemplate(
        template, nodes, groups, byRegion, directTag, generationSettings.region_keywords
      );
    } catch (error) {
      addStep('策略注入', 'error', `策略注入失败：${error.message}`, { selectors: selectorCount });
      abort(error.message);
    }
    addStep('策略注入', 'success', `处理 ${selectorCount} 个 selector。`, { selectors: selectorCount });
    addStep('最终配置', 'success', `输出 ${output.outbounds.length} 个 outbound。`, { outbounds: output.outbounds.length });
    Object.assign(progress, { selectors: selectorCount, outbounds: output.outbounds.length });
    return {
      success: true,
      output,
      summary: {
        duration_ms: Date.now() - startedAt,
        template_source: templateSource,
        template_version: templateRow.id,
        template_hash: templateRow.content_hash,
        subscriptions: rows.length,
        successful_subscriptions: successCount,
        warning_subscriptions: warningCount,
        failed_subscriptions: failedCount,
        raw_nodes: rawCount,
        nodes: nodes.length,
        groups: groups.length,
        selectors: selectorCount,
        outbounds: output.outbounds.length,
        warnings: steps.filter((step) => step.status === 'warning').length,
        reports
      },
      steps
    };
  }

  async function testSubscription(subscription) {
    const { nodes: _nodes, ...report } = await fetchSubscription(subscription);
    return report;
  }

  function saveRun(userId, status, summary, output, error = null) {
    const now = new Date().toISOString();
    database.prepare(`INSERT INTO generation_runs
      (id,user_id,status,summary_json,error_text,config_json,started_at,finished_at)
      VALUES(?,?,?,?,?,?,?,?)`).run(randomUUID(), userId, status, summary && JSON.stringify(summary), error, output && JSON.stringify(output), now, now);
  }

  return {
    generate,
    saveRun,
    hashTemplate,
    template,
    createTemplateVersion,
    refreshTemplate,
    activateTemplate,
    settings,
    updateSettings,
    testSubscription
  };
}





