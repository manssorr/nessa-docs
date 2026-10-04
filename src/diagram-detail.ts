// How much of a chart's explanation is drawn: the Diagram detail preference in
// Settings › General. Remembered per browser; a missing, unknown or unreadable
// stored value is Standard, and a write the browser refuses still applies to
// this tab. Presentation only: no choice re-renders a chart or changes content.
//   compact  — transition and edge labels and notes are not drawn (they stay in the
//              accessible names and still open their details)
//   standard — the chart as written; the inspector opens on the section's overview
//   full     — the chart as written; the inspector shows the whole section

import { useSyncExternalStore } from 'react';

export const DIAGRAM_DETAIL_LEVELS = ['compact', 'standard', 'full'] as const;
export type DiagramDetailLevel = (typeof DIAGRAM_DETAIL_LEVELS)[number];
export const DEFAULT_DIAGRAM_DETAIL: DiagramDetailLevel = 'standard';
const KEY = 'nessa-state-browser:diagram-detail';

export function parseDiagramDetail(value: unknown): DiagramDetailLevel {
  return (DIAGRAM_DETAIL_LEVELS as readonly unknown[]).includes(value) ? (value as DiagramDetailLevel) : DEFAULT_DIAGRAM_DETAIL;
}

/** The stored level; Standard when storage is missing, blocked or holds anything else. */
export function readDiagramDetail(storage: () => Pick<Storage, 'getItem'>): DiagramDetailLevel {
  try {
    return parseDiagramDetail(storage().getItem(KEY));
  } catch {
    return DEFAULT_DIAGRAM_DETAIL;
  }
}

/** Stores the level; false when the browser refuses (the level still applies to this tab). */
export function storeDiagramDetail(storage: () => Pick<Storage, 'setItem'>, level: DiagramDetailLevel): boolean {
  try {
    storage().setItem(KEY, level);
    return true;
  } catch {
    return false;
  }
}

const listeners = new Set<() => void>();
// This tab's choice, which wins over storage so a refused write still applies.
let chosen: DiagramDetailLevel | null = null;
const localStorage = () => window.localStorage;

export function setDiagramDetail(level: DiagramDetailLevel) {
  chosen = level;
  storeDiagramDetail(localStorage, level);
  listeners.forEach((listener) => listener());
}

export function useDiagramDetail(): DiagramDetailLevel {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      // A choice made in another tab applies here at once, too.
      const onStorage = (event: StorageEvent) => {
        if (event.key !== KEY) return;
        chosen = parseDiagramDetail(event.newValue);
        listener();
      };
      window.addEventListener('storage', onStorage);
      return () => {
        listeners.delete(listener);
        window.removeEventListener('storage', onStorage);
      };
    },
    () => chosen ?? readDiagramDetail(localStorage),
  );
}
