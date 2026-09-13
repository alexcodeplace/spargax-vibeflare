/** Dot-grid sample of the user-supplied VibeFlare logo, 2026-09-13.
 * Source PNG SHA-256: 01e061e72e24ad692ee7afe62f5ec8a9505c1a03b68bca213c2205ca853a5f32.
 * Only the warm VF silhouette is sampled; the black app-icon tile is excluded.
 * The same geometry drives the server-rendered fallback and interactive canvas.
 */
export const FLARE_WIDTH = 504;
export const FLARE_HEIGHT = 316;
export const FLARE_COLORS = ['#9d1536', '#ca1d30', '#e73522', '#f64b16', '#ff6914', '#ff9018', '#ffb41d', '#ffdb27'] as const;
export const FLARE_ROWS = [
  '....................................00234455555556666666665',
  '..................................2455566666666777777777770',
  '................................04555555566666666777777775.',
  '...............................04444455555666666666667777..',
  '..............................044444455555566666666666670..',
  '00000000012200...............033444444455555556666666675...',
  '.13444444455554.............033334444444555555556666676....',
  '..023444444455550...........23333344444444455555566665.....',
  '....12344445555560.........03333333344434445555555540......',
  '....01124555555565........0333333333333200000000...........',
  '.....01113555556663.......2333333333310....................',
  '......1112256556666......033222233330......................',
  '......02122246666663....03332222222....0244555566660.......',
  '.......1222223566666....24332222220..03455566667775........',
  '.......02122223566675..04332222220..04444555566666.........',
  '........0222222356667004443112222..033444555566660.........',
  '.........122222334667534442111120.033344445555564..........',
  '.........02222233346765454111110..23333444455555...........',
  '..........122222333367645201000..033333344444550...........',
  '..........022222333335754000000..22233334444440............',
  '...........1222233334457200000..0222233322210..............',
  '...........0222233334445600000.022222220...................',
  '............12222333344555000..01122220....................',
  '............02222333344555540..1111120.....................',
  '.............022233334445556..0101111......................',
  '..............22223334445550.0000011.......................',
  '..............0222333444555..0000010.......................',
  '...............122333444450.0000000........................',
  '...............02223334454..0000000........................',
  '................0323333440.0000000........................',
  '.................13233341..000000.........................',
  '..................233343..000000..........................',
  '...................0220..00000............................',
] as const;

export interface FlareDot {
  homeX: number; homeY: number; x: number; y: number; vx: number; vy: number;
  color: number; radius: number;
}
export function createFlareDots(): FlareDot[] {
  const dots: FlareDot[] = [];
  for (let y = 0; y < 44; y++) for (let x = 0; x < 70; x++) {
    const cell = FLARE_ROWS[y - 5]?.[x - 5];
    const color = cell !== undefined && cell !== '.' ? Number(cell) : -1;
    const homeX = 7 + x * 7; const homeY = 7 + y * 7;
    dots.push({ homeX, homeY, x: homeX, y: homeY, vx: 0, vy: 0, color, radius: color < 0 ? .65 : 2.15 });
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
