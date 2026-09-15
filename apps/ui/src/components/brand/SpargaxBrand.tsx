const base = '/assets/brand/v-2518955dd2b5ee99';
/** Shared first-party brand with a visible VibeFlare product label. */
export function SpargaxBrand({ compact = false }: { compact?: boolean }) {
  return <span className={`vf-spargax-brand${compact ? ' vf-spargax-brand-compact' : ''}`} aria-hidden="true">
    {compact ? <img className="vf-brand-symbol" src={`${base}/spargax-mark-128.webp`} width={40} height={40} alt="" /> : <>
      <span className="vf-spargax-lockup">
        <img className="vf-brand-logo vf-spargax-light" src={`${base}/spargax-wordmark-light-320.webp`} srcSet={`${base}/spargax-wordmark-light-320.webp 320w, ${base}/spargax-wordmark-light-640.webp 640w`} sizes="(max-width: 700px) 156px, 184px" width={320} height={101} alt="" />
        <img className="vf-brand-logo vf-spargax-dark" src={`${base}/spargax-wordmark-dark-320.webp`} srcSet={`${base}/spargax-wordmark-dark-320.webp 320w, ${base}/spargax-wordmark-dark-640.webp 640w`} sizes="(max-width: 700px) 156px, 184px" width={320} height={101} alt="" />
      </span>
      <span className="vf-spargax-product">VibeFlare</span>
    </>}
  </span>;
}
