// vibeflare project rule overrides
// Tunes baseline raw-hex to exclude theme.ts (the token definition file).

/** @type {import('../../../src/config.mjs').Pattern[]} */
export default [
  {
    id: 'raw-hex-color',
    title: 'Hardcoded hex color outside token definition',
    category: 'convention',
    severity: 'high',
    pattern: '#[0-9a-fA-F]{3,8}\\b',
    description: 'Raw hex color in source instead of a CSS custom property (var(--color-*)). Token definitions live in lib/theme.ts and global.css only.',
    resolution: 'Use a CSS custom property: var(--color-accent), var(--color-danger), etc.',
    excludeGlobs: ['**/theme.ts', '**/tokens.css', '**/tokens/**', '**/*.css'],
    canary: 'const BADGE_COLOR = "#ff0044";',
  },
];
