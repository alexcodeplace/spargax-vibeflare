/**
 * Design tokens — all values reference CSS variables defined in global.css.
 * Never use hex/rgb literals directly; import from here or use var(--token) in class strings.
 */
export const tokens = {
  color: {
    bg: 'var(--color-bg)',
    surface: 'var(--color-surface)',
    surfaceHover: 'var(--color-surface-hover)',
    border: 'var(--color-border)',
    text: 'var(--color-text)',
    muted: 'var(--color-muted)',
    accent: 'var(--color-accent)',
    accentText: 'var(--color-accent-text)',
    success: 'var(--color-success)',
    warn: 'var(--color-warn)',
    danger: 'var(--color-danger)',
    info: 'var(--color-info)',
  },
  radius: {
    sm: 'var(--radius-sm)',
    md: 'var(--radius-md)',
    lg: 'var(--radius-lg)',
    xl: 'var(--radius-xl)',
    full: 'var(--radius-full)',
  },
  font: {
    sans: 'var(--font-sans)',
    mono: 'var(--font-mono)',
  },
} as const;

export type ColorToken = keyof typeof tokens.color;
export type RadiusToken = keyof typeof tokens.radius;
