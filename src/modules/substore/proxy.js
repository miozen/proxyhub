import http from 'node:http';
import https from 'node:https';

const MAX_REWRITE_BYTES = 2 * 1024 * 1024;
const MAX_REQUEST_BYTES = 5 * 1024 * 1024;
const SUBSTORE_CSP = [
  "default-src 'self' data: blob:",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' ws: wss:",
  "worker-src 'self' blob:",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'"
].join('; ');

function rewriteSubstoreUi(value) {
  return value
    .replaceAll('"/api', '"/substore-api/api')
    .replaceAll("'/api", "'/substore-api/api")
    .replaceAll('`/api', '`/substore-api/api')
    .replaceAll('href="/', 'href="/substore/')
    .replaceAll('src="/', 'src="/substore/')
    .replaceAll('action="/', 'action="/substore/')
    .replace(/(["'`])\/(css|js|assets|fonts|static)\//g, '$1/substore/$2/')
    .replace(/(["'`])\/(favicon(?:\.[a-z0-9]+)?|manifest(?:\.[a-z0-9]+)?)/gi, '$1/substore/$2')
    .replace(/url\((["']?)\/(?!\/|substore\/)/g, 'url($1/substore/');
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
    const declared = Number(request.headers['content-length'] || 0);
    if (!Number.isFinite(declared) || declared < 0 || declared > MAX_REQUEST_BYTES) {
      return response.status(413).json({ error: 'substore_request_too_large' });
    }
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
      if (rewriteBody) responseHeaders['content-security-policy'] = SUBSTORE_CSP;
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
    let received = 0;
    request.on('data', (chunk) => {
      received += chunk.length;
      if (received > MAX_REQUEST_BYTES) {
        upstream.destroy();
        if (!response.headersSent) response.status(413).json({ error: 'substore_request_too_large' });
      }
    });
    request.pipe(upstream);
  };
}

export function mountSubstoreProxy(app, { auth, config }) {
  const ownerOnly = [auth.requireUser, auth.requireOwner];
  app.use('/substore-api', ...ownerOnly, proxyTo(config.substoreOrigin, '/substore-api'));
  app.use('/substore', ...ownerOnly, proxyTo(config.substoreUiOrigin, '/substore', true));
}

