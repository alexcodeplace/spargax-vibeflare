export type ArtworkName = 'lightbulb-glass' | 'lightning-glass' | 'workflow-panels' | 'template-panels' | 'database-stack' | 'folder-glass';

/** CSS chooses the matching canonical theme asset without a React theme subscription. */
export function BrandArtwork({ name, className = '', size = 80 }: { name: ArtworkName; className?: string; size?: number }) {
  return <span className={`vf-artwork ${className}`} aria-hidden="true">
    {(['light', 'dark'] as const).map(theme => <img key={theme} data-art-theme={theme}
      src={`/assets/club/${theme}/illustrations/${name}.svg`} alt="" width={size} height={size}
      decoding="async" draggable={false} />)}
  </span>;
}
