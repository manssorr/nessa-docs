import { expect, it, vi } from 'vitest';
import { createHttpProjectSource } from './api';

it('substitutes project reads and preserves identity for catalog, document and search', async () => {
  const request = vi.fn<typeof fetch>().mockImplementation(async () => new Response(JSON.stringify({ version: 'test' }), { status: 200 }));
  const source = createHttpProjectSource(request);
  const reads = source.reads('folder A');
  await reads.catalog(); await reads.document('colliding-id'); await reads.search('red & blue');
  expect(request.mock.calls.map(([path]) => path)).toEqual([
    '/api/catalog?project=folder%20A', '/api/documents/colliding-id?project=folder%20A', '/api/search?q=red%20%26%20blue&project=folder%20A',
  ]);
});

it('reports expired reads and malformed opening responses without pretending success', async () => {
  const source = createHttpProjectSource(async () => new Response(JSON.stringify({ error: 'project-unavailable' }), { status: 409 }));
  expect(await source.reads('expired').catalog()).toMatchObject({ kind: 'failed', message: expect.stringContaining('Open its folder') });
  expect(await source.open({ path: '/folder' })).toMatchObject({ kind: 'refused', error: 'project-read-failed' });
});

it('drops cancellation while surfacing network failures through the injected source', async () => {
  const source = createHttpProjectSource(async () => { throw new Error('offline'); });
  expect(await source.current(null)).toMatchObject({ kind: 'refused', error: 'project-read-failed' });
  const controller = new AbortController(); controller.abort();
  await expect(source.current(null, controller.signal)).rejects.toThrow('offline');
});

it('the folder adapter preserves chosen paths and reports malformed or unavailable capabilities', async () => {
  const chosen = '/tmp/Project café /';
  const source = createHttpProjectSource(async (path) => new Response(JSON.stringify(String(path).endsWith('/picker') ? { kind: 'available' } : { kind: 'selected', path: chosen })));
  expect(await source.pickerStatus()).toEqual({ kind: 'available' }); expect(await source.chooseFolder()).toEqual({ kind: 'selected', path: chosen });
  const malformed = createHttpProjectSource(async () => new Response(JSON.stringify({ kind: 'selected', path: false })));
  expect(await malformed.pickerStatus()).toMatchObject({ kind: 'unsupported' }); expect(await malformed.chooseFolder()).toMatchObject({ kind: 'failed' });
});

it('P15 catalog, document and search body faults are typed and a subsequent read recovers', async () => {
  for (const operation of ['catalog','document','search'] as const) for (const fault of ['malformed','truncated']) {
    let attempts = 0;
    const source = createHttpProjectSource(async () => ++attempts > 1 ? new Response('{"version":"recovered"}') : fault === 'malformed' ? new Response('{"version":') : new Response(new ReadableStream({ start(controller) { controller.error(new Error('body truncated after headers')); } })));
    const reads = source.reads('project');
    const read = () => operation === 'catalog' ? reads.catalog() : operation === 'document' ? reads.document('root') : reads.search('query');
    expect(await read()).toMatchObject({ kind: 'failed', message: expect.stringContaining('unreadable response') });
    expect(await read()).toEqual({ kind: 'ok', value: { version: 'recovered' } });
  }
});
it('P15 deliberate cancellation while consuming the body remains a rejection', async () => {
  const controller = new AbortController(); let failBody!: (cause: Error) => void;
  const source = createHttpProjectSource(async () => new Response(new ReadableStream({ start(body) { failBody = (cause) => body.error(cause); } })));
  const reading = source.reads('project').catalog(controller.signal);
  await Promise.resolve(); controller.abort(); failBody(new Error('cancelled body'));
  await expect(reading).rejects.toThrow('cancelled body');
});
