const REAL_TYPES = new Set(['shadowsocks', 'vmess', 'vless', 'trojan', 'hysteria', 'hysteria2', 'tuic', 'wireguard', 'socks', 'http']);

export function validateTemplate(config) {
  if (!config || typeof config !== 'object' || !Array.isArray(config.outbounds)) throw new Error('template_outbounds_required');
  const tags = new Set();
  for (const outbound of config.outbounds) {
    if (!outbound?.tag || !outbound?.type) throw new Error('template_outbound_invalid');
    if (tags.has(outbound.tag)) throw new Error(`duplicate_tag:${outbound.tag}`);
    tags.add(outbound.tag);
  }
  return true;
}

export function parseRule(value = '') {
  if (value === 'keep' || value === 'main' || value === 'direct_only' || value === 'all_regions') return { mode: value, regions: [] };
  const match = value.match(/^(region|region\+direct):(.+)$/);
  return match ? { mode: 'region', includeDirect: match[1].includes('+direct'), regions: match[2].split(',').map((x) => x.trim()).filter(Boolean) } : null;
}

export function normalizeNodes(payload, bannedPattern) {
  const input = Array.isArray(payload) ? payload : payload?.outbounds || [];
  const banned = new RegExp(bannedPattern, 'i');
  const seen = new Set();
  return input.filter((node) => {
    const tag = String(node?.tag || '');
    if (!REAL_TYPES.has(node?.type) || banned.test(tag) || /(?:1\.[1-9]\d*|[2-9]\d*(?:\.\d+)?)x/i.test(tag) || seen.has(tag)) return false;
    seen.add(tag);
    return true;
  });
}

export function buildRegionalGroups(sources, regionKeywords, urltest) {
  const groups = [];
  const byRegion = Object.fromEntries(Object.keys(regionKeywords).map((region) => [region, []]));
  for (const source of sources) for (const region of source.allowed_regions) {
    const tags = source.nodes.filter((node) => regionKeywords[region]?.some((keyword) => node.tag.toUpperCase().includes(String(keyword).toUpperCase()))).map((node) => node.tag);
    if (!tags.length) continue;
    const tag = `[AUTO] ${region}-${source.name}`;
    groups.push({ type: 'urltest', tag, outbounds: tags, ...urltest, interrupt_exist_connections: true });
    byRegion[region].push(tag);
  }
  return { groups, byRegion };
}

export function injectTemplate(template, nodes, groups, byRegion, directTag = 'DIRECT') {
  const config = structuredClone(template);
  config.outbounds = config.outbounds.map((outbound) => {
    if (outbound.type !== 'selector' || !outbound.x_rule) return outbound;
    const rule = parseRule(outbound.x_rule);
    delete outbound.x_rule;
    if (!rule || rule.mode === 'keep') return outbound;
    if (rule.mode === 'direct_only') outbound.outbounds = [directTag];
    else if (rule.mode === 'main' || rule.mode === 'all_regions') outbound.outbounds = Object.values(byRegion).flat();
    else outbound.outbounds = [...(rule.includeDirect ? [directTag] : []), ...rule.regions.flatMap((region) => byRegion[region] || [])];
    return outbound;
  });
  config.outbounds.push(...groups, ...nodes);
  validateTemplate(config);
  return config;
}



