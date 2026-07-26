export async function assertSafeUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('unsafe_subscription_url');
  return url;
}

export async function fetchJsonSafe(value, {
  timeoutMs = 10_000, maxBytes = 5_000_000, fetchImpl = fetch, headers = {}
} = {}) {
  const url = await assertSafeUrl(value);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: { 'user-agent': 'ProxyHub/0.1', ...headers }
    });
    if (!response.ok) throw new Error(`upstream_http_${response.status}`);
    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > maxBytes) throw new Error('upstream_too_large');
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      size += chunk.byteLength;
      if (size > maxBytes) throw new Error('upstream_too_large');
      chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally {
    clearTimeout(timer);
  }
}




