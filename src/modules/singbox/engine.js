const REAL_TYPES = new Set(['shadowsocks', 'vmess', 'vless', 'trojan', 'hysteria', 'hysteria2', 'tuic', 'wireguard', 'socks', 'http']);
const FLAGS = { HK: '🇭🇰', SG: '🇸🇬', JP: '🇯🇵', US: '🇺🇸', TW: '🇹🇼' };

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
  return input.map((node) => {
    if (node?.tls?.utls?.fingerprint !== undefined) node.tls.utls.fingerprint = String(node.tls.utls.fingerprint);
    if (node?.tls?.reality?.short_id !== undefined) node.tls.reality.short_id = String(node.tls.reality.short_id);
    return node;
  }).filter((node) => {
    const tag = String(node?.tag || '');
    if (!REAL_TYPES.has(node?.type) || banned.test(tag) || /(?:[1-9]\.[1-9]|[2-9]\.\d+)x/i.test(tag) || seen.has(tag)) return false;
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
    const tag = `${FLAGS[region] || ''} ${region}-${source.name}`.trim();
    groups.push({ type: 'urltest', tag, outbounds: tags, ...urltest, interrupt_exist_connections: true });
    byRegion[region].push(tag);
  }
  return { groups, byRegion };
}

function cleanReferences(config) {
  const valid = new Set(config.outbounds.map((outbound) => outbound.tag));
  for (const outbound of config.outbounds) {
    if (Array.isArray(outbound.outbounds)) outbound.outbounds = outbound.outbounds.filter((tag) => valid.has(tag));
  }
  for (const server of config.dns?.servers || []) {
    if (server.detour && !valid.has(server.detour)) delete server.detour;
  }
}

export function injectTemplate(template, nodes, groups, byRegion, directTag = '🎯 全球直连', regionKeywords = null) {
  const config = structuredClone(template);
  const allRegionalTags = Object.values(byRegion).flat();
  const keywords = Object.values(regionKeywords || Object.fromEntries(Object.keys(byRegion).map((region) => [region, [region]]))).flat();
  config.outbounds = config.outbounds.map((outbound) => {
    if (outbound.type !== 'selector') return outbound;
    const rule = parseRule(outbound.x_rule);
    delete outbound.x_rule;
    if (rule?.mode === 'keep') return outbound;
    let selected = ['🗽 节点选择'];
    if (!rule) {
      if (outbound.tag === '🗽 节点选择') {
        const unmatched = nodes.filter((node) => !keywords.some((keyword) => node.tag.toUpperCase().includes(String(keyword).toUpperCase()))).map((node) => node.tag);
        selected = [...allRegionalTags, ...unmatched];
      } else if (['🦚 PeacockTV', '🅾️ OpenAI'].includes(outbound.tag)) selected.push(...(byRegion.US || []));
      else if (outbound.tag === '🌀 Hamivideo') selected.push(...(byRegion.TW || []));
      else if (outbound.tag === '📹️ Viu') selected.push(...(byRegion.HK || []));
      else if (outbound.tag === '🎞 Emby') selected.push(directTag, ...(byRegion.HK || []), ...(byRegion.SG || []), ...(byRegion.US || []));
      else if (['🍎 Apple', '🐧 Tencent'].includes(outbound.tag)) selected.push(directTag);
      else if (!['🐟 漏网之鱼', '🌐 GLOBAL'].includes(outbound.tag)) selected.push(...allRegionalTags);
    } else if (rule.mode === 'direct_only') selected = [directTag];
    else if (rule.mode === 'main') {
      const unmatched = nodes.filter((node) => !keywords.some((keyword) => node.tag.toUpperCase().includes(String(keyword).toUpperCase()))).map((node) => node.tag);
      selected = [...allRegionalTags, ...unmatched];
    } else if (rule.mode === 'all_regions') selected.push(...allRegionalTags);
    else selected.push(...(rule.includeDirect ? [directTag] : []), ...rule.regions.flatMap((region) => byRegion[region] || []));
    outbound.outbounds = [...new Set(selected)];
    return outbound;
  });
  config.outbounds.push(...groups, ...nodes);
  cleanReferences(config);
  validateTemplate(config);
  return config;
}




