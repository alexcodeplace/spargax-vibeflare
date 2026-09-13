import { describe, expect, it } from 'vitest';
import { createFlareDots, FLARE_COLORS, FLARE_HEIGHT, FLARE_WIDTH, resetFlare, stepFlare, type FlareStimulus } from '../src/lib/flare-dots';
const idle = (): FlareStimulus => ({ x: 0, y: 0, active: false, rippleX: 240, rippleY: 160, rippleAge: -1 });

describe('bounded VibeFlare dot simulation', () => {
  it('uses the supplied warm silhouette on a finite, deterministic grid', () => {
    const dots = createFlareDots();
    expect(dots).toHaveLength(3080);
    expect(dots.filter(dot => dot.color >= 0)).toHaveLength(941);
    expect(FLARE_COLORS).toHaveLength(8);
    for (const dot of dots) {
      expect(dot.x).toBeGreaterThan(0); expect(dot.x).toBeLessThan(FLARE_WIDTH);
      expect(dot.y).toBeGreaterThan(0); expect(dot.y).toBeLessThan(FLARE_HEIGHT);
    }
    expect(createFlareDots()).toEqual(dots);
  });
  it('does not request work for a logo at rest', () => {
    expect(stepFlare(createFlareDots(), idle(), 16.67)).toBe(false);
  });
  it('displaces locally and settles while the pointer is stationary', () => {
    const dots = createFlareDots(); const stimulus = { ...idle(), x: 200, y: 130, active: true };
    expect(stepFlare(dots, stimulus, 16.67)).toBe(true);
    expect(dots.some(dot => dot.x !== dot.homeX)).toBe(true);
    expect(dots.filter(dot => Math.hypot(dot.homeX - 200, dot.homeY - 130) >= 95).every(dot => dot.x === dot.homeX && dot.y === dot.homeY)).toBe(true);
    let moving = true; let count = 0;
    while (moving && ++count < 240) moving = stepFlare(dots, stimulus, 16.67);
    expect(moving).toBe(false);
    expect(Math.max(...dots.map(dot => Math.hypot(dot.x - dot.homeX, dot.y - dot.homeY)))).toBeLessThan(40);
    stimulus.active = false; count = 0; moving = true;
    while (moving && ++count < 240) moving = stepFlare(dots, stimulus, 16.67);
    expect(moving).toBe(false);
    expect(dots.every(dot => dot.x === dot.homeX && dot.y === dot.homeY)).toBe(true);
  });
  it('limits elapsed-time jumps and stops a one-shot ripple', () => {
    const dots = createFlareDots(); const stimulus = { ...idle(), rippleAge: 180 };
    expect(stepFlare(dots, stimulus, 10_000)).toBe(true);
    expect(dots.every(dot => Number.isFinite(dot.x) && Number.isFinite(dot.y))).toBe(true);
    stimulus.rippleAge = 2000;
    for (let i = 0; i < 240; i++) stepFlare(dots, stimulus, 16.67);
    expect(stepFlare(dots, stimulus, 16.67)).toBe(false);
    resetFlare(dots);
    expect(dots.every(dot => dot.x === dot.homeX && dot.y === dot.homeY && !dot.vx && !dot.vy)).toBe(true);
  });
});
