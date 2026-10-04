import { createFolderPicker } from './folder-picker.js';
import { createServer, request as httpRequest } from 'node:http';
import { describe, expect, it } from 'vitest';
import { loadCatalog } from '../catalog.js';
import { createProjects } from './projects.js';
import { handleRequest, nodeHandler, openingGuard, MAX_OPEN_BODY, type HttpRequest } from '../http.js';
import { validTree, REPO } from '../testing/documents.js';
import { memoryFiles } from '../testing/memory-files.js';

function fixture() {
  const files = memoryFiles(validTree());
  const projects = createProjects({ loadCatalog: (root) => loadCatalog(files, root), mintId: () => 'project-handle' });
  const dependencies = { files, projects, folderPicker: createFolderPicker(null), exampleRoot: REPO, loadCatalog: (root: string) => loadCatalog(files, root), assets: new Map(), allowedHosts: new Set(['127.0.0.1:4321']) };
  const request: HttpRequest = { method: 'POST', url: '/api/projects', host: '127.0.0.1:4321', origin: 'http://127.0.0.1:4321', contentType: 'application/json', body: JSON.stringify({ path: REPO }) };
  return { dependencies, request, files };
}
const value = (reply: { body: unknown }) => JSON.parse(String(reply.body));
describe('project HTTP admission (P4)', () => {
  it('requires exact same-origin and allowed host before project reads', async () => {
    const { dependencies, request, files } = fixture();
    for (const origin of [undefined, 'null', 'http://evil.example', 'http://localhost:4321', 'https://127.0.0.1:4321']) {
      expect((await handleRequest(dependencies, { ...request, origin })).status).toBe(403);
      expect(openingGuard(dependencies, { ...request, origin })?.status).toBe(403);
    }
    expect((await handleRequest(dependencies, { ...request, host: 'evil.example' })).status).toBe(421);
    expect(files.listings).toEqual([]);
  });
  it('bounds bytes and rejects malformed/body media before filesystem access', async () => {
    const { dependencies, request, files } = fixture();
    for (const contentType of [undefined, 'text/plain', 'application/x-www-form-urlencoded']) expect((await handleRequest(dependencies, { ...request, contentType })).status).toBe(415);
    for (const body of ['{', 'null', '[]', 'false']) expect((await handleRequest(dependencies, { ...request, body })).status).toBe(400);
    expect((await handleRequest(dependencies, { ...request, body: 'ø'.repeat(MAX_OPEN_BODY / 2 + 1) })).status).toBe(413);
    expect(files.listings).toEqual([]);
  });
  it('opens only a supplied path or the fixed bundled example, then scopes reads', async () => {
    const { dependencies, request } = fixture();
    expect(value(await handleRequest(dependencies, { ...request, body: '{"example":true}' }))).toMatchObject({ kind: 'opened', project: { id: 'project-handle' } });
    expect((await handleRequest(dependencies, { method: 'GET', url: '/api/catalog', host: request.host })).status).toBe(409);
    const catalog = await handleRequest(dependencies, { method: 'GET', url: '/api/catalog?project=project-handle', host: request.host });
    expect(value(catalog).rootId).toBe('nessa');
    const unknown = await handleRequest(dependencies, { method: 'GET', url: '/api/documents/nessa?project=unknown', host: request.host });
    expect(unknown.status).toBe(409); expect(value(unknown).error).toBe('project-unavailable');
  });
  it('returns typed root errors, not accepted empty documentation', async () => {
    const { dependencies, request } = fixture();
    const reply = await handleRequest(dependencies, { ...request, body: '{"path":"/missing"}' });
    expect(reply.status).toBe(422); expect(value(reply)).toMatchObject({ kind: 'refused', error: 'invalid-project' });
  });
});

it('Node transport refuses an oversized stream with JSON 413 before catalog reads', async () => {
  const { dependencies, files } = fixture();
  const hosts = new Set<string>();
  const server = createServer(nodeHandler({ ...dependencies, allowedHosts: hosts }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('test server address');
  const host = `127.0.0.1:${address.port}`; hosts.add(host);
  try {
    const response = await fetch(`http://${host}/api/projects`, { method: 'POST', headers: { Origin: `http://${host}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ path: '/'+ 'x'.repeat(MAX_OPEN_BODY) }) });
    expect(response.status).toBe(413); expect(await response.json()).toEqual({ error: 'body-too-large' }); expect(files.listings).toEqual([]);
  } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
});

it('picker protection rejects origin, body and media before invoking the dialog', async () => {
  const f = fixture(); let calls = 0;
  const folderPicker = createFolderPicker({ choose: async () => { calls++; return { kind: 'cancelled' }; } });
  const dependencies = { ...f.dependencies, folderPicker }; const request = { ...f.request, url: '/api/projects/pick-folder', body: '{}' };
  expect((await handleRequest(dependencies, { ...request, origin: 'http://evil.example' })).status).toBe(403);
  expect((await handleRequest(dependencies, { ...request, body: 'x'.repeat(MAX_OPEN_BODY + 1) })).status).toBe(413);
  expect((await handleRequest(dependencies, { ...request, contentType: 'text/plain' })).status).toBe(415);
  expect((await handleRequest(dependencies, { ...request, body: '[]' })).status).toBe(400);
  expect(calls).toBe(0);
  expect(value(await handleRequest(dependencies, request))).toEqual({ kind: 'cancelled' }); expect(calls).toBe(1); expect(f.files.listings).toEqual([]);
});

it('Node client disconnect aborts the picker owner and permits another request', async () => {
  const f = fixture(); let started!: () => void; let aborted!: () => void;
  const start = new Promise<void>((resolve) => { started = resolve; }); const stopped = new Promise<void>((resolve) => { aborted = resolve; });
  const folderPicker = createFolderPicker({ choose: (signal) => new Promise((resolve) => { started(); signal.addEventListener('abort', () => { aborted(); resolve({ kind: 'cancelled' }); }, { once: true }); }) });
  const hosts = new Set<string>(); const server = createServer(nodeHandler({ ...f.dependencies, folderPicker, allowedHosts: hosts }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve)); const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('test address');
  const host = `127.0.0.1:${address.port}`; hosts.add(host); const controller = new AbortController();
  try {
    const request = fetch(`http://${host}/api/projects/pick-folder`, { method: 'POST', signal: controller.signal, headers: { Origin: `http://${host}`, 'Content-Type': 'application/json' }, body: '{}' }).catch(() => undefined);
    await start; controller.abort(); await stopped; await request;
    const alreadyStopped = new AbortController(); alreadyStopped.abort(); expect(await folderPicker.choose(alreadyStopped.signal)).toEqual({ kind: 'cancelled' });
  } finally { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); }
});


it('Node rejects oversized chunked input before the caller finishes sending its body', async () => {
  const f = fixture(); const hosts = new Set<string>(); const server = createServer(nodeHandler({ ...f.dependencies, allowedHosts: hosts }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve)); const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('test address');
  const host = `127.0.0.1:${address.port}`; hosts.add(host);
  let client: ReturnType<typeof httpRequest> | undefined;
  try {
    const reply = await new Promise<{ status: number | undefined; body: string }>((resolve, reject) => {
      client = httpRequest(`http://${host}/api/projects`, { method: 'POST', headers: { Origin: `http://${host}`, 'Content-Type': 'application/json' } }, (response) => {
        const chunks: Buffer[] = []; response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
      });
      client.on('error', reject); client.setTimeout(1000, () => reject(new Error('body limit waited for end of stream')));
      client.write('x'.repeat(MAX_OPEN_BODY + 1)); // Intentionally never end: refusal must happen on data.
    });
    expect(reply).toEqual({ status: 413, body: '{"error":"body-too-large"}' }); expect(f.files.listings).toEqual([]);
  } finally { client?.destroy(); server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); }
});
