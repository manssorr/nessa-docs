// Whether this page is still the site's current build. A page keeps running
// the code it loaded; after a rebuild its lazily loaded chunks (Mermaid's
// diagram renderers) no longer exist on the server. The server publishes the
// entry it serves (/api/health); the page compares it with its own.

let ownEntry: string | null = null;
let unloading = false;
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => (unloading = true));
  // A navigation cancels in-flight loads before pagehide; beforeunload comes first.
  // If the navigation never happens, the flag clears itself.
  window.addEventListener('beforeunload', () => {
    unloading = true;
    window.setTimeout(() => (unloading = false), 2000);
  });
}
if (typeof window !== 'undefined') window.addEventListener('pageshow', () => (unloading = false));

/**
 * True once the page is being left. Leaving cancels in-flight module loads
 * (WebKit), so a render that fails then is not checked against the server.
 */
export function isUnloading(): boolean {
  return unloading;
}

/** Called once by the entry module with its own URL. */
export function recordClientEntry(url: string) {
  try {
    const path = new URL(url).pathname;
    ownEntry = path.startsWith('/assets/') ? path : null; // the dev server has no built entry
  } catch {
    ownEntry = null;
  }
}

export type BuildCheck =
  | { readonly kind: 'current' }
  | { readonly kind: 'outdated'; readonly serverEntry: string }
  | { readonly kind: 'unknown' };

/** How long the build check may take before it counts as unknown (CHECKLIST row B3). */
export const BUILD_CHECK_TIMEOUT_MS = 3000;

/**
 * Asks the server which client it serves. Bounded: no answer within
 * BUILD_CHECK_TIMEOUT_MS, or an abort from `signal` (the diagram unmounted),
 * is `unknown`, so the caller shows the real error and the source.
 */
export async function checkBuild(signal?: AbortSignal): Promise<BuildCheck> {
  if (ownEntry === null) return { kind: 'unknown' };
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), BUILD_CHECK_TIMEOUT_MS);
  const forward = () => controller.abort();
  signal?.addEventListener('abort', forward);
  try {
    const response = await fetch('/api/health', { cache: 'no-store', signal: controller.signal });
    const health = (await response.json()) as { client?: unknown };
    if (typeof health.client !== 'string') return { kind: 'unknown' };
    return health.client === ownEntry ? { kind: 'current' } : { kind: 'outdated', serverEntry: health.client };
  } catch {
    return { kind: 'unknown' };
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener('abort', forward);
  }
}

const RELOADED_FOR = 'nessa-state-browser:reloaded-for';

/**
 * Reloads once for a given server build. After the reload this page *is*
 * that build, so it cannot report itself outdated again: no loop. Returns
 * false if a reload for this build was already tried.
 */
export function reloadOnceFor(serverEntry: string): boolean {
  try {
    if (window.sessionStorage.getItem(RELOADED_FOR) === serverEntry) return false;
    window.sessionStorage.setItem(RELOADED_FOR, serverEntry);
  } catch {
    // The once-guard cannot be kept (storage denied), so no automatic reload:
    // the outdated state's Reload button remains (CHECKLIST row B4).
    return false;
  }
  window.location.reload();
  return true;
}
