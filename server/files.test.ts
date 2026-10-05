import { afterEach, expect, it } from 'vitest';
import { mkdtemp, mkdir, realpath, rename, rm, symlink, unlink, writeFile, link } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nodeRepositoryFiles, nodeReadOperations, type NodeReadOperations } from './files.js';
import { loadCatalog } from './catalog.js';
import { doc } from './testing/documents.js';

const cleanup: string[] = [];
afterEach(async () => { for (const path of cleanup.splice(0)) await rm(path, { recursive: true, force: true }); });
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'nessa-docs-files-'))); cleanup.push(root);
  const project = join(root, 'Project café '); const state = join(project, 'docs/state'); const outside = join(project, 'outside');
  await mkdir(state, { recursive: true }); await mkdir(outside);
  const path = join(state, 'README.md');
  await writeFile(path, doc('root', null, {}, 'INSIDE'));
  await writeFile(join(outside, 'README.md'), doc('root', null, {}, 'OUTSIDE SECRET'));
  return { root, project, state, outside, path };
}
function tracked(operations: NodeReadOperations = nodeReadOperations) {
  const counts = { opened: 0, read: 0, closed: 0 };
  const reads: NodeReadOperations = { ...operations, async open(path, flags) {
    const handle = await operations.open(path, flags); counts.opened++;
    return { stat: () => handle.stat(), read: async (...args) => { counts.read++; return handle.read(...args); }, close: async () => { counts.closed++; await handle.close(); } };
  } };
  return { counts, reads, files: nodeRepositoryFiles(reads) };
}
it.each(['state','nested'])('FS1 rejects persistent %s ancestor swaps scheduled after genuine listing', async (which) => {
  const f = await fixture(); const observer = tracked(); let directory = f.state;
  if (which === 'nested') {
    directory = join(f.state, 'nested'); await mkdir(directory);
    await writeFile(join(directory, 'child.md'), doc('child', 'root', {}, 'INSIDE CHILD'));
    await writeFile(join(f.outside, 'child.md'), doc('child', 'root', {}, 'OUTSIDE SECRET'));
  }
  let switched = false;
  const files = { ...observer.files, async list(path: string) {
    const entries = await observer.files.list(path);
    if (path === directory && !switched) { switched = true; await rename(directory, `${directory}-old`); await symlink(f.outside, directory); }
    return entries;
  } };
  const catalog = await loadCatalog(files, f.project);
  expect(switched).toBe(true);
  expect([...catalog.documents.values()].some((d) => d.body.includes('OUTSIDE SECRET'))).toBe(false);
  expect(catalog.issues).toContainEqual(expect.objectContaining({ code: 'unreadable-file', message: expect.stringContaining('outside docs/state') }));
  expect(observer.counts.opened).toBe(which === 'state' ? 0 : 1); expect(observer.counts.closed).toBe(observer.counts.opened);
});
it('FS2 refuses ABA opening a different inode even when canonical path is restored before comparison', async () => {
  const f = await fixture();
  const observer = tracked({ ...nodeReadOperations, async open(path, flags) {
    await rename(f.state, `${f.state}-old`); await symlink(f.outside, f.state);
    const handle = await nodeReadOperations.open(path, flags);
    await unlink(f.state); await rename(`${f.state}-old`, f.state); return handle;
  } });
  expect(await observer.files.readText(f.path, 4096, f.state)).toMatchObject({ kind: 'unreadable', reason: expect.stringContaining('identity changed') });
  expect(observer.counts).toEqual({ opened: 1, read: 0, closed: 1 });
});
it('FS3 refuses replacement after reading and closes the original handle', async () => {
  const f = await fixture();
  const observer = tracked({ ...nodeReadOperations, async open(path, flags) {
    const handle = await nodeReadOperations.open(path, flags);
    return { stat: () => handle.stat(), close: () => handle.close(), async read(...args) {
      const result = await handle.read(...args); await rename(f.path, `${f.path}-old`); await writeFile(f.path, 'REPLACEMENT'); return result;
    } };
  } });
  expect(await observer.files.readText(f.path, 4096, f.state)).toMatchObject({ kind: 'unreadable', reason: expect.stringContaining('identity changed after') });
  expect(observer.counts).toEqual({ opened: 1, read: 1, closed: 1 });
});
it('FS3 refuses an observed ancestor escape after reading', async () => {
  const f = await fixture();
  // Same inode is reachable outside state: canonical containment still must refuse it.
  await unlink(join(f.outside, 'README.md')); await link(f.path, join(f.outside, 'README.md'));
  const observer = tracked({ ...nodeReadOperations, async open(path, flags) {
    const handle = await nodeReadOperations.open(path, flags);
    return { stat: () => handle.stat(), close: () => handle.close(), async read(...args) {
      const result = await handle.read(...args); await rename(f.state, `${f.state}-old`); await symlink(f.outside, f.state); return result;
    } };
  } });
  expect(await observer.files.readText(f.path, 4096, f.state)).toMatchObject({ kind: 'unreadable', reason: expect.stringContaining('path changed') });
  expect(observer.counts).toEqual({ opened: 1, read: 1, closed: 1 });
});
it('FS4 unchanged Unicode/space paths are accepted, with bounded read and closure', async () => {
  const f = await fixture(); const observer = tracked();
  expect(await observer.files.readText(f.path, 4096, f.state)).toEqual({ kind: 'text', text: doc('root', null, {}, 'INSIDE') });
  expect(observer.counts).toEqual({ opened: 1, read: 1, closed: 1 });
  const catalog = await loadCatalog(observer.files, f.project); expect(catalog.rootId).toBe('root'); expect(catalog.issues).toEqual([]);
});
it('FS5 refuses final symlink, nonregular and preflight oversized candidates', async () => {
  const f = await fixture(); const observer = tracked(); const alias = join(f.state, 'alias.md'); await symlink(f.path, alias);
  expect(await observer.files.readText(alias, 4096, f.state)).toMatchObject({ kind: 'unreadable', reason: 'is a symlink' });
  expect(await observer.files.readText(f.state, 4096, f.state)).toMatchObject({ kind: 'unreadable', reason: 'not a regular file' });
  expect(await observer.files.readText(f.path, 1, f.state)).toMatchObject({ kind: 'too-large' });
  expect(observer.counts).toEqual({ opened: 0, read: 0, closed: 0 });
});
it('FS5 refuses growth of the actual opened inode before allocation/read and closes it', async () => {
  const f = await fixture(); await writeFile(f.path, 'small');
  const observer = tracked({ ...nodeReadOperations, async open(path, flags) { await writeFile(f.path, 'x'.repeat(2000)); return nodeReadOperations.open(path, flags); } });
  expect(await observer.files.readText(f.path, 16, f.state)).toEqual({ kind: 'too-large', size: 2000 });
  expect(observer.counts).toEqual({ opened: 1, read: 0, closed: 1 });
});
it('FS5 an actual opened directory is refused before reading and closed', async () => {
  const f = await fixture(); const observer = tracked({ ...nodeReadOperations, open: (_path, flags) => nodeReadOperations.open(f.state, flags) });
  expect(await observer.files.readText(f.path, 4096, f.state)).toMatchObject({ kind: 'unreadable' });
  expect(observer.counts).toEqual({ opened: 1, read: 0, closed: 1 });
});
