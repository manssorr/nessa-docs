import { describe, expect, it } from 'vitest';
import { anchorFraction, anchorScrollDelta, clampScale, MAX_SCALE, MIN_SCALE, wheelFactor } from './canvas-gestures';

describe('anchorFraction / anchorScrollDelta', () => {
  const at = (left: number, top: number, width: number, height: number) => ({ left, top, width, height });
  it('keeps the point under the cursor in place when zooming in and out', () => {
    // 400×200 drawn at (100,50); cursor at (300,150) → the centre. Drawn at 800×400 from the same corner, it is 200/100 too far.
    const anchor = anchorFraction(at(100, 50, 400, 200), { x: 300, y: 150 });
    expect(anchor).toEqual({ fx: 0.5, fy: 0.5 });
    expect(anchorScrollDelta(at(100, 50, 800, 400), anchor, { x: 300, y: 150 })).toEqual({ dx: 200, dy: 100 });
    expect(anchorScrollDelta(at(100, 50, 200, 100), anchor, { x: 300, y: 150 })).toEqual({ dx: -100, dy: -50 });
  });
  it('accounts for a centred diagram that moved as it grew', () => {
    const anchor = anchorFraction(at(400, 0, 200, 100), { x: 500, y: 0 });
    expect(anchorScrollDelta(at(350, 0, 300, 150), anchor, { x: 500, y: 0 })).toEqual({ dx: 0, dy: 0 });
  });
});

describe('bounds', () => {
  it('clamps scale and bounds each wheel step', () => {
    expect(clampScale(100)).toBe(MAX_SCALE);
    expect(clampScale(0.01)).toBe(MIN_SCALE);
    expect(wheelFactor(-1000, 0)).toBe(1.25);
    expect(wheelFactor(1000, 0)).toBe(0.8);
    expect(wheelFactor(-3, 0)).toBeGreaterThan(1);
    expect(wheelFactor(-3, 0)).toBeLessThan(1.02);
    expect(wheelFactor(-1, 1)).toBeCloseTo(Math.exp(16 * 0.004));
  });
});
