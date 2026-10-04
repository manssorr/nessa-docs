import { describe, expect, it } from 'vitest';
import { parseDiagramDetail, readDiagramDetail, storeDiagramDetail } from './diagram-detail';

const memory = (initial: Record<string, string> = {}) => {
  const values = new Map(Object.entries(initial));
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => void values.set(key, value), values };
};
const denied = () => {
  throw new DOMException('denied', 'SecurityError');
};

describe('diagram detail preference', () => {
  it('is Standard unless a known level is stored', () => {
    expect(readDiagramDetail(() => memory())).toBe('standard');
    expect(readDiagramDetail(() => memory({ 'nessa-state-browser:diagram-detail': 'full' }))).toBe('full');
    expect(readDiagramDetail(() => memory({ 'nessa-state-browser:diagram-detail': 'compact' }))).toBe('compact');
    for (const stored of ['Full', ' full', 'read', '__proto__', 'constructor', '']) {
      expect(readDiagramDetail(() => memory({ 'nessa-state-browser:diagram-detail': stored }))).toBe('standard');
    }
    expect(parseDiagramDetail(undefined)).toBe('standard');
  });
  it('reads Standard and reports a refused write when storage is blocked', () => {
    expect(readDiagramDetail(denied)).toBe('standard');
    expect(readDiagramDetail(() => ({ getItem: denied }))).toBe('standard');
    expect(storeDiagramDetail(denied, 'full')).toBe(false);
    expect(storeDiagramDetail(() => ({ setItem: denied }), 'full')).toBe(false);
    const store = memory();
    expect(storeDiagramDetail(() => store, 'compact')).toBe(true);
    expect(store.values.get('nessa-state-browser:diagram-detail')).toBe('compact');
  });
});
