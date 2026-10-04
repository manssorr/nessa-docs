// Display grouping of child documents: structural kinds before guides.

import type { DocumentKind, DocumentSummary } from '../shared/api';

const ORDER: Record<DocumentKind, number> = {
  system: 0,
  service: 1,
  feature: 2,
  flow: 3,
  statechart: 4,
  operation: 5,
  contract: 6,
  guide: 7,
};

/** Plural, for group headings. */
export const KIND_NAME: Record<DocumentKind, string> = {
  system: 'Systems',
  service: 'Services',
  feature: 'Features',
  flow: 'Flows',
  statechart: 'Statecharts',
  operation: 'Operations',
  contract: 'Contracts',
  guide: 'Guides',
};

/** Stable sort by kind; documents of one kind keep the catalog's path order. */
export function byKind<T extends Pick<DocumentSummary, 'kind'>>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);
}

export function groupByKind<T extends Pick<DocumentSummary, 'kind'>>(items: readonly T[]): { kind: DocumentKind; items: T[] }[] {
  const groups: { kind: DocumentKind; items: T[] }[] = [];
  for (const item of byKind(items)) {
    const last = groups[groups.length - 1];
    if (last?.kind === item.kind) last.items.push(item);
    else groups.push({ kind: item.kind, items: [item] });
  }
  return groups;
}

/** Singular, for the one-line description under a title. */
export const KIND_SINGULAR: Record<DocumentKind, string> = {
  system: 'System',
  service: 'Service',
  feature: 'Feature',
  flow: 'Flow',
  statechart: 'Statechart',
  operation: 'Operation',
  contract: 'Contract',
  guide: 'Guide',
};
