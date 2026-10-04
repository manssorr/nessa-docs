import { describe, expect, it } from 'vitest';
import { createProjects } from './projects.js';
import { loadCatalog } from '../catalog.js';
import { doc, validTree, REPO } from '../testing/documents.js';
import { memoryFiles } from '../testing/memory-files.js';
import { projectPath } from '../../shared/projects.js';

function fixture(capacity = 128) {
  const files = memoryFiles({ ...validTree(), '/other/docs/state/README.md': doc('nessa', null, { title: 'Other project' }), '/alias': { symlink: REPO }, '/empty': { dir: true }, '/bad/docs/state/README.md': 'invalid root' });
  let ids = 0;
  const projects = createProjects({ loadCatalog: (root) => loadCatalog(files, root), mintId: () => `handle-${++ids}` }, capacity);
  return { projects, files };
}

describe('project opening (P1–P3, P7, P9–P12)', () => {
  it('starts with welcome and no read context', async () => {
    const { projects } = fixture();
    expect(await projects.current(null)).toEqual({ kind: 'welcome' });
    expect(projects.read(null)).toEqual({ kind: 'welcome' });
  });
  it('accepts arbitrary root IDs and reports the authored title', async () => {
    const files = memoryFiles({ '/shop/docs/state/README.md': doc('store', null, { title: 'Storefront' }) });
    const projects = createProjects({ loadCatalog: (root) => loadCatalog(files, root), mintId: () => 'opaque' });
    expect(await projects.open('/shop')).toEqual({ kind: 'opened', project: { id: 'opaque', title: 'Storefront' } });
    expect(projects.read('opaque')).toEqual({ kind: 'selected', root: '/shop' });
  });
  it('rejects invalid paths before reads and catalog-invalid folders with original issues', async () => {
    const { projects, files } = fixture();
    for (const path of [undefined, false, {}, 'relative', '', '/bad\0path']) expect(await projects.open(path)).toMatchObject({ kind: 'refused', error: 'invalid-path' });
    expect(files.listings).toEqual([]);
    for (const path of ['/missing', '/empty', '/bad']) {
      const result = await projects.open(path);
      expect(result).toMatchObject({ kind: 'refused', error: 'invalid-project' });
      if (result.kind === 'refused') expect(result.issues.length).toBeGreaterThan(0);
    }
    expect(projects.read(null).kind).toBe('welcome');
  });
  it('reuses canonical folders and separates colliding document IDs', async () => {
    const { projects } = fixture();
    expect(await projects.open(REPO)).toMatchObject({ project: { id: 'handle-1' } });
    expect(await projects.open('/alias')).toMatchObject({ project: { id: 'handle-1' } });
    expect(await projects.open('/other')).toMatchObject({ project: { id: 'handle-2', title: 'Other project' } });
    expect(projects.read('handle-1')).toEqual({ kind: 'selected', root: REPO });
    expect(projects.read('handle-2')).toEqual({ kind: 'selected', root: '/other' });
    expect(projects.read(null)).toEqual({ kind: 'welcome' });
  });
  it('deduplicates overlapping validated openings after their awaited reads', async () => {
    const { projects } = fixture(1);
    const [first, second] = await Promise.all([projects.open(REPO), projects.open('/alias')]);
    expect(first).toEqual(second);
  });
  it('refuses capacity without evicting live handles and still permits reopening', async () => {
    const { projects } = fixture(1);
    await projects.open(REPO);
    expect(await projects.open('/other')).toMatchObject({ kind: 'refused', error: 'project-capacity' });
    expect(projects.read('handle-1')).toEqual({ kind: 'selected', root: REPO });
    expect(await projects.open(REPO)).toMatchObject({ project: { id: 'handle-1' } });
  });
  it('does not fallback to the startup folder for unknown handles after restart', async () => {
    const { projects } = fixture();
    await projects.start(REPO);
    expect(await projects.current(null)).toMatchObject({ kind: 'opened', project: { id: 'handle-1' } });
    expect(await projects.current('previous-server-handle')).toMatchObject({ kind: 'refused', error: 'project-unavailable' });
    expect(projects.read('previous-server-handle')).toEqual({ kind: 'unavailable' });
  });
  it('keeps invalid startup guidance and typed unexpected read failures', async () => {
    const { projects } = fixture();
    await projects.start('/empty');
    expect(await projects.current(null)).toMatchObject({ kind: 'refused', error: 'invalid-project' });
    const failing = createProjects({ loadCatalog: async () => { throw new Error('filesystem failure'); }, mintId: () => 'unused' });
    expect(await failing.open('/repo')).toMatchObject({ kind: 'refused', error: 'project-read-failed' });
  });
  it('accepts a root with child warnings using the catalog owner', async () => {
    const files = memoryFiles({ '/project/docs/state/README.md': doc('store', null, { sources: ['missing.ts'] }) });
    const projects = createProjects({ loadCatalog: (root) => loadCatalog(files, root), mintId: () => 'handle' });
    expect(await projects.open('/project')).toMatchObject({ kind: 'opened' });
  });
});

it('interprets local absolute paths with one syntax owner', () => {
  expect(projectPath(' /tmp/project/ ')).toBeNull();
  expect(projectPath('/project ')).toBe('/project ');
  expect(projectPath('/')).toBe('/');
  expect(projectPath('C:\\project')).toBeNull();
  expect(projectPath('\\\\server\\project')).toBeNull();
  expect(projectPath('/project\\')).toBe('/project\\');
  expect(projectPath('///')).toBe('/');
  expect(projectPath('relative')).toBeNull();
});
