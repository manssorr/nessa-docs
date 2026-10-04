import { describe, expect, it } from 'vitest';
import { READABLE_SCALE, scaleFor } from './diagram';

describe('scaleFor', () => {
  it('first view fits the width but never shrinks text below the readable floor', () => {
    expect(scaleFor({ mode: 'readable' }, 0.95)).toBe(0.95);
    expect(scaleFor({ mode: 'readable' }, 0.4)).toBe(READABLE_SCALE);
    expect(scaleFor({ mode: 'readable' }, 1)).toBe(1);
  });
  it('Fit shows the whole diagram; a chosen scale is kept', () => {
    expect(scaleFor({ mode: 'fit' }, 0.4)).toBe(0.4);
    expect(scaleFor({ mode: 'manual', scale: 1.5 }, 0.4)).toBe(1.5);
  });
});
