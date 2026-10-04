import { describe, expect, it } from 'vitest';
import { groupByKind } from './kinds';

describe('groupByKind', () => {
  it('puts services before guides and keeps path order within a kind', () => {
    const items = [
      { id: 'g1', kind: 'guide' as const },
      { id: 's1', kind: 'service' as const },
      { id: 'g2', kind: 'guide' as const },
      { id: 's2', kind: 'service' as const },
    ];
    expect(groupByKind(items).map((g) => [g.kind, g.items.map((i) => i.id)])).toEqual([
      ['service', ['s1', 's2']],
      ['guide', ['g1', 'g2']],
    ]);
  });
});
