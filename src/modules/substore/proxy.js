import http from 'node:http';
import https from 'node:https';

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

function rewriteLocation(value, target, publicPrefix) {
  if (!value) return value;
  try {
    const resolved = new URL(value, target);
    if (resolved.origin !== target.origin) return value;
    return `${publicPrefix}${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return value;
  }
}

function rewriteCookies(values, publicPrefix) {
  if (!values) return values;
  const list = Array.isArray(values) ? values : [values];
  const cookiePath = publicPrefix ? `${publicPrefix}/` : '/';
  return list.map((value) => {
    const withoutDomain = String(value).replace(/;\s*Domain=[^;]+/gi, '');
    return /;\s*Path=/i.test(withoutDomain)
      ? withoutDomain.replace(/;\s*Path=[^;]*/gi, `; Path=${cookiePath}`)
      : `${withoutDomain}; Path=${cookiePath}`;
  });
}

function proxyTo(origin, stripPrefix = '', publicPrefix = '', frontend = false) {
  const target = new URL(origin);
  const client = target.protocol === 'https:' ? https : http;
  return (request, response) => {
    const declared = Number(request.headers['content-length'] || 0);
    if (!Number.isFinite(declared) || declared < 0 || declared > MAX_REQUEST_BYTES) {
      return response.status(413).json({ error: 'substore_request_too_large' });
    }
    const sourcePath = request.originalUrl || request.url;
    const upstreamPath = stripPrefix && sourcePath.startsWith(stripPrefix)
      ? sourcePath.slice(stripPrefix.length) || '/'
      : sourcePath;
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
      if (responseHeaders.location) {
        responseHeaders.location = rewriteLocation(responseHeaders.location, target, publicPrefix);
      }
      if (responseHeaders['set-cookie']) {
        responseHeaders['set-cookie'] = rewriteCookies(responseHeaders['set-cookie'], publicPrefix);
      }
      if (frontend) responseHeaders['content-security-policy'] = SUBSTORE_CSP;
      response.status(upstreamResponse.statusCode || 502);
      for (const [name, value] of Object.entries(responseHeaders)) {
        if (value !== undefined) response.setHeader(name, value);
      }
      upstreamResponse.pipe(response);
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

function noOpServiceWorker(_request, response) {
  response
    .type('application/javascript')
    .set('Cache-Control', 'no-store')
    .send(
      "self.addEventListener('install',()=>self.skipWaiting());" +
      "self.addEventListener('activate',event=>event.waitUntil(" +
      "caches.keys().then(keys=>Promise.all(keys.map(key=>caches.delete(key))))" +
      ".then(()=>self.registration.unregister()).then(()=>self.clients.claim())));"
    );
}

export function mountSubstoreProxy(app, { auth, config, service }) {
  const frontendProxy = proxyTo(config.substoreUiOrigin, '', '', true);

  app.use((request, response, next) => {
    const backendPath = service.backendPath();
    if (request.path === backendPath || request.path.startsWith(`${backendPath}/`)) {
      return proxyTo(config.substoreOrigin, backendPath, backendPath)(request, response);
    }
    if (/^\/[a-f0-9]{32}(?:\/|$)/.test(request.path)) {
      return response.status(404).json({ error: 'not_found' });
    }
    return next();
  });

  app.get('/', (request, response, next) => {
    if (typeof request.query.api === 'string' && request.query.api) return next();
    return response.redirect('/proxyhub/');
  });
  app.get('/registerSW.js', noOpServiceWorker);

  app.use((request, response, next) => {
    if (
      request.path === '/proxyhub' || request.path.startsWith('/proxyhub/') ||
      request.path === '/healthz' || request.path.startsWith('/healthz/') ||
      request.path === '/api' || request.path.startsWith('/api/')
    ) return next();
    if (request.path !== '/') return frontendProxy(request, response);
    return auth.requireUser(request, response, () =>
      auth.requireOwner(request, response, () => frontendProxy(request, response)));
  });
}
