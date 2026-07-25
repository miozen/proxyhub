import http from 'node:http';
import https from 'node:https';

const MAX_REWRITE_BYTES = 2 * 1024 * 1024;

function rewriteSubstoreUi(value) {
  return value
    .replaceAll('"/api', '"/substore-api/api')
    .replaceAll("'/api", "'/substore-api/api")
    .replaceAll('`/api', '`/substore-api/api')
    .replaceAll('href="/', 'href="/substore/')
    .replaceAll('src="/', 'src="/substore/')
    .replaceAll('action="/', 'action="/substore/')
    .replaceAll('url(/', 'url(/substore/');
}

function rewriteLocation(value, target, mountPath) {
  if (!value) return value;
  try {
    const resolved = new URL(value, target);
    if (resolved.origin !== target.origin) return value;
    return `${mountPath}${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return value;
  }
}

function rewriteCookies(values, mountPath) {
  if (!values) return values;
  const list = Array.isArray(values) ? values : [values];
  return list.map((value) => {
    const withoutDomain = String(value).replace(/;\s*Domain=[^;]+/gi, '');
    return /;\s*Path=/i.test(withoutDomain)
      ? withoutDomain.replace(/;\s*Path=[^;]*/gi, `; Path=${mountPath}/`)
      : `${withoutDomain}; Path=${mountPath}/`;
  });
}

function proxyTo(origin, mountPath, rewriteBody = false) {
  const target = new URL(origin);
  const client = target.protocol === 'https:' ? https : http;
  return (request, response) => {
    const upstreamPath = request.originalUrl.slice(mountPath.length) || '/';
    const headers = { ...request.headers, host: target.host, 'accept-encoding': 'identity' };
    delete headers['content-length'];

    const upstream = client.request({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || undefined,
      method: request.method,
      path: `${target.pathname.replace(/\/$/, '')}${upstreamPath}`,
      headers
    }, (upstreamResponse) => {
      const responseHeaders = { ...upstreamResponse.headers };
      delete responseHeaders['x-frame-options'];
      delete responseHeaders['content-length'];
      if (responseHeaders.location) {
        responseHeaders.location = rewriteLocation(responseHeaders.location, target, mountPath);
      }
      if (responseHeaders['set-cookie']) {
        responseHeaders['set-cookie'] = rewriteCookies(responseHeaders['set-cookie'], mountPath);
      }
      const contentType = String(responseHeaders['content-type'] || '');
      const shouldRewrite = rewriteBody && /(?:text|javascript|json)/i.test(contentType);

      response.status(upstreamResponse.statusCode || 502);
      for (const [name, value] of Object.entries(responseHeaders)) {
        if (value !== undefined) response.setHeader(name, value);
      }
      if (!shouldRewrite) return upstreamResponse.pipe(response);

      const chunks = [];
      let size = 0;
      upstreamResponse.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_REWRITE_BYTES) {
          upstreamResponse.destroy();
          if (!response.headersSent) response.status(502).json({ error: 'substore_response_too_large' });
          else response.end();
          return;
        }
        chunks.push(chunk);
      });
      upstreamResponse.on('end', () => {
        if (size <= MAX_REWRITE_BYTES && !response.writableEnded) {
          response.send(rewriteSubstoreUi(Buffer.concat(chunks).toString('utf8')));
        }
      });
    });
    upstream.setTimeout(60_000, () => upstream.destroy(new Error('substore_timeout')));
    upstream.on('error', (error) => {
      if (!response.headersSent) response.status(502).json({
        error: error.message === 'substore_timeout' ? 'substore_timeout' : 'substore_unavailable'
      });
      else response.end();
    });
    request.pipe(upstream);
  };
}

export function mountSubstoreProxy(app, { auth, config }) {
  const ownerOnly = [auth.requireUser, auth.requireOwner];
  app.use('/substore-api', ...ownerOnly, proxyTo(config.substoreOrigin, '/substore-api'));
  app.use('/substore', ...ownerOnly, proxyTo(config.substoreUiOrigin, '/substore', true));
}

