import { createFolderPicker } from './project-opening/folder-picker.js';
import { describe, expect, it } from 'vitest';
import { createProjects } from './project-opening/projects.js';
import { loadCatalog } from './catalog.js';
import { readConfig } from './config.js';
import { handleRequest, type HandlerDependencies } from './http.js';
import { REPO, validTree } from './testing/documents.js';
import { memoryFiles } from './testing/memory-files.js';

async function dependencies(): Promise<HandlerDependencies> {
  const files = memoryFiles(validTree());
  const projects = createProjects({ loadCatalog: (root) => loadCatalog(files, root), mintId: () => 'project-one' });
  await projects.start(REPO);
  return {
    files,
    projects,
    folderPicker: createFolderPicker(null),
    exampleRoot: REPO,
    loadCatalog: (root) => loadCatalog(files, root),
    assets: new Map([
      ['/index.html', { body: new TextEncoder().encode('<!doctype html><script type="module" crossorigin src="/assets/app.js"></script>app'), contentType: 'text/html' }],
      ['/assets/app.js', { body: new TextEncoder().encode('js'), contentType: 'text/javascript' }],
    ]),
    allowedHosts: new Set(['127.0.0.1:4311', 'localhost:4311']),
  };
}

const get = async (url: string, host = '127.0.0.1:4311', method = 'GET') => handleRequest(await dependencies(), { method, url, host });
const body = (reply: { body: Uint8Array | string }) =>
  typeof reply.body === 'string' ? reply.body : new TextDecoder().decode(reply.body);

describe('handleRequest', () => {
  it('serves the catalog and documents as JSON', async () => {
    const catalog = await get('/api/catalog');
    expect(catalog.status).toBe(200);
    expect(JSON.parse(body(catalog)).rootId).toBe('nessa');
    const document = await get('/api/documents/chat-send');
    expect(JSON.parse(body(document)).document.id).toBe('chat-send');
    expect(document.headers['Content-Security-Policy']).toContain("script-src 'self'");
  });

  it('answers 404 for unknown or malformed document IDs, including traversal attempts', async () => {
    for (const url of ['/api/documents/missing', '/api/documents/..%2F..%2Fetc%2Fpasswd', '/api/documents/%E0%A4%A', '/api/documents/']) {
      const reply = await get(url);
      expect(reply.status, url).toBe(404);
      expect(JSON.parse(body(reply)).error).toBe('unknown-document');
    }
  });

  it('serves only built assets; other paths get the app shell, which owns document 404s', async () => {
    expect(body(await get('/assets/app.js'))).toBe('js');
    expect((await get('/assets/../../package.json')).status).toBe(200); // URL-normalized to /package.json → shell
    expect(body(await get('/assets/../../package.json'))).toContain('app');
    const missing = await get('/assets/missing.js');
    expect(missing.status).toBe(404);
    expect(missing.headers['Cache-Control']).toBe('no-store');
    expect((await get('/assets/app.js')).headers['Cache-Control']).toContain('immutable');
    expect(body(await get('/docs/chat-send'))).toContain('app');
    expect((await get('/api/unknown')).status).toBe(404);
  });

  it('refuses foreign Host headers and non-read methods', async () => {
    expect((await get('/api/catalog', 'evil.example:4311')).status).toBe(421);
    expect((await handleRequest(await dependencies(), { method: 'GET', url: '/', host: undefined })).status).toBe(421);
    expect((await get('/api/catalog', '127.0.0.1:4311', 'POST')).status).toBe(405);
  });

  it('publishes the served client entry on /api/health, and null when it cannot be served', async () => {
    expect(JSON.parse(body(await get('/api/health')))).toEqual({ ok: true, client: '/assets/app.js' });
    const missing = { ...await dependencies(), assets: new Map([['/index.html', { body: new TextEncoder().encode('<script src="/assets/gone.js"></script>'), contentType: 'text/html' }]]) };
    const reply = await handleRequest(missing, { method: 'GET', url: '/api/health', host: '127.0.0.1:4311' });
    expect(JSON.parse(body(reply)).client).toBeNull();
  });

  it('bounds search queries', async () => {
    expect((await get(`/api/search?q=${'a'.repeat(201)}`)).status).toBe(400);
    expect(JSON.parse(body(await get('/api/search?q=send'))).results.length).toBeGreaterThan(0);
  });
});

describe('readConfig', () => {
  it('defaults to welcome and port 4311', () => {
    expect(readConfig({})).toEqual({
      kind: 'ok',
      config: { project: null, port: 4311 },
    });
  });
  it('accepts NESSA_DOCS_PROJECT and PORT, refusing relative roots and bad ports', () => {
    expect(readConfig({ NESSA_DOCS_PROJECT: '/tmp/repo/', PORT: '5000' })).toEqual({ kind: 'ok', config: { project: '/tmp/repo', port: 5000 } });
    expect(readConfig({ NESSA_DOCS_PROJECT: 'repo' }).kind).toBe('invalid');
    for (const PORT of ['0', '70000', '12a', '-1']) expect(readConfig({ PORT }).kind, PORT).toBe('invalid');
  });
});
