import { describe, expect, it } from 'vitest';
import { clampSidebarWidth, parseSidebarWidth, readSidebarWidth, SIDEBAR_WIDTH, storeSidebarWidth } from './sidebar-width';

describe('clampSidebarWidth', () => {
  it('keeps whole pixels within 220–350', () => {
    expect(clampSidebarWidth(260)).toBe(260);
    expect(clampSidebarWidth(219.6)).toBe(220);
    expect(clampSidebarWidth(100)).toBe(220);
    expect(clampSidebarWidth(350.4)).toBe(350);
    expect(clampSidebarWidth(9999)).toBe(350);
    expect(clampSidebarWidth(287.5)).toBe(288);
  });
});

describe('parseSidebarWidth (CHECKLIST R11, R12)', () => {
  it('defaults when missing or not a whole number', () => {
    for (const stored of [null, '', 'wide', '260px', '-1', '1e3', 'NaN', 'Infinity', '300.5']) {
      expect(parseSidebarWidth(stored)).toBe(SIDEBAR_WIDTH.initial);
    }
  });
  it('clamps an out-of-range stored width', () => {
    expect(parseSidebarWidth('0')).toBe(220);
    expect(parseSidebarWidth('400')).toBe(350);
    expect(parseSidebarWidth('300')).toBe(300);
  });
});

describe('storage (CHECKLIST R14)', () => {
  const denied = () => {
    throw new Error('denied');
  };
  it('reads the default and writes nothing when storage is denied', () => {
    expect(readSidebarWidth({ getItem: denied })).toBe(SIDEBAR_WIDTH.initial);
    expect(() => storeSidebarWidth({ setItem: denied }, 300)).not.toThrow();
  });
  it('stores the width under its key, and reads it back', () => {
    const store = new Map<string, string>();
    storeSidebarWidth({ setItem: (key, value) => store.set(key, value) }, 312);
    expect(readSidebarWidth({ getItem: (key) => store.get(key) ?? null })).toBe(312);
  });
});
