/** Page-scoped behavior. Astro swaps must never stack document listeners. */
let dispose: (() => void) | undefined;
export function initBrandInteractions(): void {
  dispose?.();
  const controller = new AbortController();
  const { signal } = controller;
  const toggle = document.getElementById('menu-toggle');
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  const main = document.querySelector<HTMLElement>('.vf-workspace-main');
  const desktop = window.matchMedia('(min-width: 1024px)');
  let priorOverflow = '';
  let isOpen = false;
  const close = (restoreFocus = true) => {
    if (!isOpen) return;
    isOpen = false;
    sidebar?.classList.remove('sidebar--open');
    backdrop?.classList.remove('sidebar-backdrop--open');
    toggle?.setAttribute('aria-expanded', 'false');
    sidebar?.removeAttribute('role');
    sidebar?.removeAttribute('aria-modal');
    if (main) main.inert = false;
    document.body.style.overflow = priorOverflow;
    if (restoreFocus) toggle?.focus();
  };
  const open = () => {
    if (!sidebar || desktop.matches) return;
    isOpen = true;
    priorOverflow = document.body.style.overflow;
    sidebar.classList.add('sidebar--open');
    sidebar.setAttribute('role', 'dialog');
    sidebar.setAttribute('aria-modal', 'true');
    backdrop?.classList.add('sidebar-backdrop--open');
    toggle?.setAttribute('aria-expanded', 'true');
    if (main) main.inert = true;
    document.body.style.overflow = 'hidden';
    document.getElementById('menu-close')?.focus();
  };
  toggle?.addEventListener('click', () => isOpen ? close() : open(), { signal });
  document.getElementById('menu-close')?.addEventListener('click', () => close(), { signal });
  backdrop?.addEventListener('click', () => close(), { signal });
  sidebar?.addEventListener('click', event => {
    if (event.target instanceof Element && event.target.closest('a')) close(false);
  }, { signal });
  desktop.addEventListener('change', () => { if (desktop.matches) close(false); }, { signal });
  document.addEventListener('keydown', event => {
    if (!isOpen) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if (event.key === 'Tab' && sidebar) {
      const controls = [...sidebar.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex="0"]')].filter(el => el.getClientRects().length);
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }, { signal });

  // Delegate hover effects to opt-in cards, never to the chat editor or document scroll.
  const pointerMotion = window.matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)');
  let frame = 0;
  let target: HTMLElement | null = null;
  let x = 0;
  let y = 0;
  const cancelFrame = () => { if (frame) cancelAnimationFrame(frame); frame = 0; };
  document.addEventListener('pointermove', event => {
    if (!pointerMotion.matches || event.pointerType === 'touch') return;
    const card = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-vf-spotlight]') : null;
    if (!card) return;
    target = card; x = event.clientX; y = event.clientY;
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (!target?.isConnected || !pointerMotion.matches) return;
      const rect = target.getBoundingClientRect();
      target.style.setProperty('--vf-pointer-x', `${x - rect.left}px`);
      target.style.setProperty('--vf-pointer-y', `${y - rect.top}px`);
    });
  }, { passive: true, signal });
  pointerMotion.addEventListener('change', () => {
    cancelFrame();
    document.querySelectorAll<HTMLElement>('[data-vf-spotlight]').forEach(card => {
      card.style.removeProperty('--vf-pointer-x'); card.style.removeProperty('--vf-pointer-y');
    });
  }, { signal });
  dispose = () => { close(false); cancelFrame(); controller.abort(); };
  document.addEventListener('astro:before-swap', () => dispose?.(), { once: true, signal });
}
