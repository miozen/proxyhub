import { createHash, randomUUID } from 'node:crypto';
import { decryptUrl } from './crypto.js';
import { buildRegionalGroups, injectTemplate, normalizeNodes, validateTemplate } from './engine.js';
import { fetchJsonSafe } from './fetch.js';

export const DEFAULTS = {
  regions: { HK: ['HK', '棣欐腐'], TW: ['TW', '鍙版咕'], SG: ['SG', '鏂板姞鍧?], JP: ['JP', '鏃ユ湰'], US: ['US', '缇庡浗'] },
  banned: '杩囨湡|鍓╀綑|缃戝潃|瀹樼綉|娴侀噺|鍒版湡|閲嶇疆|濂楅|缇ょ粍|閫氱煡|璐拱|缁存姢',
  urltest: { url: 'https://www.gstatic.com/generate_204', interval: '3m', tolerance: 150 }
};

export function createSingboxService({ database, config, fetchJson = fetchJsonSafe }) {
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
    const output = injectTemplate(template, nodes, groups, byRegion);
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
    hashTemplate: (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
  };
}

