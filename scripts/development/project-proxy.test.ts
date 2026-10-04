import { request as httpRequest, createServer as httpServer } from 'node:http';
import { createServer as viteServer } from 'vite';
import { expect, it } from 'vitest';
import { projectProxyGuard } from './project-proxy';
import { nodeHandler, MAX_OPEN_BODY } from '../../server/http';
import { createProjects } from '../../server/project-opening/projects';
import { createFolderPicker } from '../../server/project-opening/folder-picker';
import { loadCatalog } from '../../server/catalog';
import { memoryFiles } from '../../server/testing/memory-files';
import { validTree, REPO } from '../../server/testing/documents';

it('admits same-origin open/picker, refuses foreign callers before forwarding, and keeps Node body bounds', async () => {
  const files = memoryFiles(validTree()); const hosts = new Set<string>(); let forwarded = 0; let chosen = 0;
  const projects = createProjects({ loadCatalog: (root) => loadCatalog(files, root), mintId: () => 'handle' });
  const handler = nodeHandler({ files, projects, exampleRoot: REPO, loadCatalog: (root) => loadCatalog(files, root), assets: new Map(), allowedHosts: hosts, folderPicker: createFolderPicker({ choose: async () => { chosen++; return { kind: 'cancelled' }; } }) });
  const backend = httpServer((request, response) => { forwarded++; void handler(request, response); });
  await new Promise<void>((resolve) => backend.listen(0, '127.0.0.1', resolve));
  const address = backend.address(); if (!address || typeof address === 'string') throw new Error('backend address');
  const target = `http://127.0.0.1:${address.port}`; hosts.add(`127.0.0.1:${address.port}`);
  // Reserve a dynamic frontend port, then give the same explicit port to ingress and Vite.
  const reserve = httpServer(); await new Promise<void>((resolve) => reserve.listen(0, '127.0.0.1', resolve));
  const bound = reserve.address(); if (!bound || typeof bound === 'string') throw new Error('frontend address');
  await new Promise<void>((resolve) => reserve.close(() => resolve()));
  const frontend = await viteServer({ configFile: false, plugins: [projectProxyGuard(target, bound.port)], server: { host: '127.0.0.1', port: bound.port, strictPort: true, allowedHosts: true, proxy: { '/api': { target, changeOrigin: true } } }, logLevel: 'silent' });
  await frontend.listen(); const base = `http://127.0.0.1:${bound.port}`;
  const post = (path: string, headers: Record<string,string> = {}, body = JSON.stringify({ path: REPO })) => new Promise<Response>((resolve, reject) => {
    const request = httpRequest(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers } }, (response) => {
      const chunks: Buffer[] = []; response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => resolve(new Response(Buffer.concat(chunks), { status: response.statusCode })));
    }); request.on('error', reject); request.end(body);
  });
  try {
    for (const path of ['/api/projects', '/api/projects/pick-folder']) for (const headers of [{}, { Origin: 'null' }, { Origin: 'http://evil.example' }, { Origin: base, Host: 'evil.example' }, { Origin: base, 'Content-Type': 'text/plain' }]) {
      const before = forwarded; const response = await post(path, headers);
      expect([403,415,421]).toContain(response.status); expect(forwarded).toBe(before);
    }
    const opened = await post('/api/projects', { Origin: base }); expect(opened.status).toBe(200); expect(await opened.json()).toMatchObject({ kind: 'opened', project: { id: 'handle' } });
    const picked = await post('/api/projects/pick-folder', { Origin: base }, '{}'); expect(await picked.json()).toEqual({ kind: 'cancelled' }); expect(chosen).toBe(1);
    const large = await post('/api/projects', { Origin: base }, JSON.stringify({ path: '/'+'x'.repeat(MAX_OPEN_BODY) })); expect(large.status).toBe(413); expect(await large.json()).toEqual({ error: 'body-too-large' });
  } finally { await frontend.close(); backend.closeAllConnections(); await new Promise<void>((resolve) => backend.close(() => resolve())); }
}, 20_000);
