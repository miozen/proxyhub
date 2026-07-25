import http from 'node:http';
import https from 'node:https';

function rewriteSubstoreUi(value) {
  return value
    .replaceAll('"/api', '"/substore-api/api')
    .replaceAll("'/api", "'/substore-api/api")
    .replaceAll('href="/', 'href="/substore/')
    .replaceAll('src="/', 'src="/substore/');
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
      const contentType = String(responseHeaders['content-type'] || '');
      const shouldRewrite = rewriteBody && /(?:text|javascript|json)/i.test(contentType);

      response.status(upstreamResponse.statusCode || 502);
      for (const [name, value] of Object.entries(responseHeaders)) {
        if (value !== undefined) response.setHeader(name, value);
      }
      if (!shouldRewrite) return upstreamResponse.pipe(response);

      const chunks = [];
      upstreamResponse.on('data', (chunk) => chunks.push(chunk));
      upstreamResponse.on('end', () => response.send(rewriteSubstoreUi(Buffer.concat(chunks).toString('utf8'))));
    });
    upstream.on('error', () => {
      if (!response.headersSent) response.status(502).json({ error: 'substore_unavailable' });
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

