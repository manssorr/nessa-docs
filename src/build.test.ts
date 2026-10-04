import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// build.ts touches `window` at import and per call; give it a minimal one each test.
const fakeWindow = () => ({
  addEventListener: () => undefined,
  setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
  clearTimeout: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
  sessionStorage: { getItem: () => null, setItem: () => undefined },
  location: { reload: vi.fn() },
});
vi.stubGlobal('window', fakeWindow());
const { BUILD_CHECK_TIMEOUT_MS, checkBuild, recordClientEntry, reloadOnceFor } = await import('./build');

beforeEach(() => {
  vi.stubGlobal('window', fakeWindow());
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('checkBuild (CHECKLIST B3)', () => {
  it('is unknown when /api/health never answers within the bound', async () => {
    vi.useFakeTimers();
    recordClientEntry('http://127.0.0.1:4311/assets/index-A.js');
    vi.stubGlobal('fetch', (_url: string, init: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))),
    );
    const pending = checkBuild();
    await vi.advanceTimersByTimeAsync(BUILD_CHECK_TIMEOUT_MS);
    await expect(pending).resolves.toEqual({ kind: 'unknown' });
  });

  it('is unknown at once when the caller aborts (the diagram unmounted)', async () => {
    recordClientEntry('http://127.0.0.1:4311/assets/index-A.js');
    vi.stubGlobal('fetch', (_url: string, init: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))),
    );
    const caller = new AbortController();
    const pending = checkBuild(caller.signal);
    caller.abort();
    await expect(pending).resolves.toEqual({ kind: 'unknown' });
  });

  it('tells current from outdated by the served entry', async () => {
    recordClientEntry('http://127.0.0.1:4311/assets/index-A.js');
    vi.stubGlobal('fetch', async () => ({ json: async () => ({ ok: true, client: '/assets/index-A.js' }) }));
    await expect(checkBuild()).resolves.toEqual({ kind: 'current' });
    vi.stubGlobal('fetch', async () => ({ json: async () => ({ ok: true, client: '/assets/index-B.js' }) }));
    await expect(checkBuild()).resolves.toEqual({ kind: 'outdated', serverEntry: '/assets/index-B.js' });
  });
});

describe('reloadOnceFor (CHECKLIST B1, B4)', () => {
  it('reloads once per server entry', () => {
    const store = new Map<string, string>();
    const reload = vi.fn();
    vi.stubGlobal('window', {
      sessionStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) },
      location: { reload },
    });
    expect(reloadOnceFor('/assets/index-B.js')).toBe(true);
    expect(reloadOnceFor('/assets/index-B.js')).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not reload, and does not throw, when the guard cannot be stored', () => {
    const reload = vi.fn();
    const denied = () => {
      throw new DOMException('denied', 'SecurityError');
    };
    vi.stubGlobal('window', { sessionStorage: { getItem: denied, setItem: denied }, location: { reload } });
    expect(reloadOnceFor('/assets/index-B.js')).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
