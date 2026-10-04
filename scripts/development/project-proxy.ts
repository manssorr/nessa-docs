// Vite ingress preserves production's project-opening admission rule before proxying.
import type { Plugin } from 'vite';
import { openingGuard } from '../../server/http';

export function projectProxyGuard(target: string, port: number): Plugin {
  const upstream = new URL(target);
  const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  return {
    name: 'nessa-project-proxy',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = new URL(request.url ?? '/', 'http://localhost').pathname;
        if (request.method === 'POST' && (path === '/api/projects' || path === '/api/projects/pick-folder')) {
          const refusal = openingGuard({ allowedHosts }, {
            method: 'POST', url: request.url ?? '/', host: request.headers.host,
            origin: typeof request.headers.origin === 'string' ? request.headers.origin : undefined,
            contentType: request.headers['content-type'],
          });
          if (refusal) { response.writeHead(refusal.status, refusal.headers); response.end(refusal.body); return; }
          request.headers.host = upstream.host;
          request.headers.origin = upstream.origin;
        }
        next();
      });
    },
  };
}
