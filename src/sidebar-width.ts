// The docked sidebar's width: the one place its bounds, default and keyboard
// step live (verification/CHECKLIST.md, "Sidebar resize", R11–R14). Stored per
// browser beside the sidebar's shown/hidden state.

export const SIDEBAR_WIDTH = { min: 220, max: 350, initial: 260, step: 10 } as const;
const KEY = 'nessa-state-browser:sidebar-width';

/** Whole pixels within [min, max]. */
export function clampSidebarWidth(width: number): number {
  return Math.min(SIDEBAR_WIDTH.max, Math.max(SIDEBAR_WIDTH.min, Math.round(width)));
}

/** A stored value: missing or not a whole number → the default; out of range → clamped. */
export function parseSidebarWidth(stored: string | null): number {
  if (stored === null || !/^\d+$/.test(stored.trim())) return SIDEBAR_WIDTH.initial;
  return clampSidebarWidth(Number(stored));
}

export function readSidebarWidth(storage: Pick<Storage, 'getItem'>): number {
  try {
    return parseSidebarWidth(storage.getItem(KEY));
  } catch {
    return SIDEBAR_WIDTH.initial;
  }
}

/** Stores a width already clamped by the caller. Storage can be denied; the width still applies to this page (R14). */
export function storeSidebarWidth(storage: Pick<Storage, 'setItem'>, width: number): void {
  try {
    storage.setItem(KEY, String(width));
  } catch {
    // Not remembered; nothing else depends on it.
  }
}
