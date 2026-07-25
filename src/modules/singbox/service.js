import { createHash, randomUUID } from 'node:crypto';
import { decryptUrl } from './crypto.js';
import { buildRegionalGroups, injectTemplate, normalizeNodes, validateTemplate } from './engine.js';
import { fetchJsonSafe } from './fetch.js';

export const DEFAULTS = {
  regions: {
    HK: ['HK', '\u9999\u6e2f'],
    TW: ['TW', '\u53f0\u6e7e'],
    SG: ['SG', '\u65b0\u52a0\u5761'],
    JP: ['JP', '\u65e5\u672c'],
    US: ['US', '\u7f8e\u56fd']
  },
  banned: '\u8fc7\u671f|\u5269\u4f59|\u7f51\u5740|\u5b98\u7f51|\u6d41\u91cf|\u5230\u671f|\u91cd\u7f6e|\u5957\u9910|\u7fa4\u7ec4|\u901a\u77e5|\u8d2d\u4e70|\u7ef4\u62a4',
  urltest: { url: 'https://www.gstatic.com/generate_204', interval: '3m', tolerance: 150 }
};

export function createSingboxService({ database, config, fetchJson = fetchJsonSafe }) {
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
      if (!template(id)) return null;
      const previous = database.prepare('SELECT id FROM template_versions WHERE active=1').get();
      database.prepare('UPDATE template_versions SET active=0 WHERE active=1').run();
      database.prepare("UPDATE template_versions SET active=1,status='ready' WHERE id=?").run(id);
      return { previous_id: previous?.id || null, active_id: id };
    })();
  }

  function hashTemplate(value) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  async function generate(user) {
    const templateRow = database.prepare('SELECT * FROM template_versions WHERE active=1').get();
    if (!templateRow) throw new Error('active_template_required');
    const template = JSON.parse(templateRow.content_json);
    validateTemplate(template);
    const rows = database.prepare('SELECT * FROM subscriptions WHERE user_id=? AND enabled=1 ORDER BY created_at').all(user.id);
    const reports = [];
    const sources = [];
    await Promise.all(rows.map(async (row) => {
      try {
        const payload = await fetchJson(decryptUrl(row.url_encrypted, config.dataEncryptionKey));
        const nodes = normalizeNodes(payload, DEFAULTS.banned);
        sources.push({ name: row.name, nodes, allowed_regions: JSON.parse(row.allowed_regions_json) });
        reports.push({ id: row.id, status: 'success', nodes: nodes.length });
      } catch (error) {
        reports.push({ id: row.id, status: 'error', error: error.message });
      }
    }));
    const seen = new Set();
    const nodes = sources.flatMap((source) => source.nodes).filter((node) => !seen.has(node.tag) && seen.add(node.tag));
    const { groups, byRegion } = buildRegionalGroups(sources, DEFAULTS.regions, DEFAULTS.urltest);
    const directTag = template.outbounds.find((outbound) => outbound.type === 'direct')?.tag || '🎯 全球直连';
    const output = injectTemplate(template, nodes, groups, byRegion, directTag, DEFAULTS.regions);
    return { output, summary: { subscriptions: rows.length, nodes: nodes.length, groups: groups.length, reports } };
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
    activateTemplate
  };
}





