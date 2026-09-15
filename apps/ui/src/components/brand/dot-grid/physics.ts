import geometry from './spargax-dots.json' with { type: 'json' };
/** Sampled geometry from the owner-supplied Spargax mark, not a redrawn symbol.
 * Finite spring interaction adapted from VibeFlare's MIT-licensed dot engine.
 */
export const FLARE_WIDTH = geometry.width;
export const FLARE_HEIGHT = geometry.height;
export const FLARE_COLORS = geometry.colors;
export const FLARE_MARKED_COUNT = geometry.markedCount;
const FLARE_ROWS = geometry.rows;

export interface FlareDot {
  homeX: number; homeY: number; x: number; y: number; vx: number; vy: number;
  color: number; radius: number;
}
export function createFlareDots(): FlareDot[] {
  const dots: FlareDot[] = [];
  for (let y = 0; y < geometry.rows.length; y++) for (let x = 0; x < geometry.columns; x++) {
    const cell = FLARE_ROWS[y]?.[x];
    const color = cell !== undefined && cell !== '.' ? parseInt(cell, 16) : -1;
    const homeX = geometry.offset + x * geometry.spacing; const homeY = geometry.offset + y * geometry.spacing;
    dots.push({ homeX, homeY, x: homeX, y: homeY, vx: 0, vy: 0, color, radius: color < 0 ? .65 : 2.3 });
  }
  return dots;
}

export interface FlareStimulus { x: number; y: number; active: boolean; rippleX: number; rippleY: number; rippleAge: number }
/** Bounded, deterministic spring step. No DOM work or allocations per dot. */
export function stepFlare(dots: FlareDot[], stimulus: FlareStimulus, delta: number): boolean {
  const dt = Math.max(.25, Math.min(2, delta / (1000 / 60)));
  const damping = Math.pow(.72, dt);
  let moving = false;
  const ripple = stimulus.rippleAge >= 0 && stimulus.rippleAge < 1050;
  for (const dot of dots) {
    let targetX = dot.homeX; let targetY = dot.homeY;
    if (stimulus.active) {
      const dx = dot.homeX - stimulus.x; const dy = dot.homeY - stimulus.y;
      const squared = dx * dx + dy * dy;
      if (squared < 95 * 95) {
        const distance = Math.max(1, Math.sqrt(squared));
        const strength = Math.pow(1 - distance / 95, 2) * (dot.color >= 0 ? 38 : 16);
        targetX += (dx / distance - dy / distance * .23) * strength;
        targetY += (dy / distance + dx / distance * .23) * strength;
      }
    }
    if (ripple) {
      const dx = dot.homeX - stimulus.rippleX; const dy = dot.homeY - stimulus.rippleY;
      const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      const waveDistance = Math.abs(distance - stimulus.rippleAge * .45);
      if (waveDistance < 65) {
        const wave = Math.pow(1 - waveDistance / 65, 2) * (1 - stimulus.rippleAge / 1050) * 27;
        targetX += dx / distance * wave; targetY += dy / distance * wave;
      }
    }
    dot.vx = (dot.vx + (targetX - dot.x) * .12 * dt) * damping;
    dot.vy = (dot.vy + (targetY - dot.y) * .12 * dt) * damping;
    dot.x += dot.vx * dt; dot.y += dot.vy * dt;
    if (Math.abs(dot.vx) + Math.abs(dot.vy) + Math.abs(targetX - dot.x) + Math.abs(targetY - dot.y) > .08) moving = true;
    else { dot.x = targetX; dot.y = targetY; dot.vx = 0; dot.vy = 0; }
  }
  return moving || ripple;
}
export function resetFlare(dots: FlareDot[]): void {
  for (const dot of dots) { dot.x = dot.homeX; dot.y = dot.homeY; dot.vx = dot.vy = 0; }
}
