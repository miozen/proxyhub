import http from 'node:http';
import https from 'node:https';

function proxyTo(origin, stripPrefix = '') {
  const target = new URL(origin);
  const client = target.protocol === 'https:' ? https : http;
  return (request, response) => {
    const sourcePath = request.originalUrl || request.url;
    const upstreamPath = stripPrefix && sourcePath.startsWith(stripPrefix)
      ? sourcePath.slice(stripPrefix.length) || '/'
      : sourcePath;
    const upstream = client.request({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || undefined,
      method: request.method,
      path: `${target.pathname.replace(/\/$/, '')}${upstreamPath}`,
      headers: { ...request.headers, host: target.host }
    }, (upstreamResponse) => {
      response.status(upstreamResponse.statusCode || 502);
      for (const [name, value] of Object.entries(upstreamResponse.headers)) {
        if (value !== undefined) response.setHeader(name, value);
      }
      upstreamResponse.pipe(response);
    });
    upstream.on('error', () => {
      if (!response.headersSent) response.status(502).json({ error: 'substore_unavailable' });
      else response.end();
    });
    request.pipe(upstream);
  };
}

export function mountSubstoreProxy(app, { auth, config, service }) {
  const frontendProxy = proxyTo(config.substoreUiOrigin);

  app.use((request, response, next) => {
    const backendPath = service.backendPath();
    if (request.path === backendPath || request.path.startsWith(`${backendPath}/`)) {
      return proxyTo(config.substoreOrigin, backendPath)(request, response);
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
