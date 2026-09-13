import { createFlareDots, FLARE_COLORS, FLARE_HEIGHT, FLARE_WIDTH, resetFlare, stepFlare, type FlareDot, type FlareStimulus } from './flare-dots';

/** A small page-local canvas, not a document-wide animation engine.
 * No requests, timers, worker, WebGL, external dependency or perpetual loop.
 * The spring stops at rest; observers/listeners are disposed on Astro removal.
 */
export class FlareElement extends HTMLElement {
  private dispose?: () => void;
  private readMetrics: () => object = () => ({ state: 'static', frames: 0 });
  getDiagnostics(): object { return this.readMetrics(); }

  connectedCallback(): void {
    this.dispose?.();
    const canvas = this.querySelector('canvas');
    const button = this.querySelector<HTMLButtonElement>('[data-flare-replay]');
    const hint = this.querySelector<HTMLElement>('[data-flare-hint]');
    if (!canvas || !button || !hint) return;
    let context: CanvasRenderingContext2D | null;
    try { context = canvas.getContext('2d', { alpha: true }); } catch { return; }
    if (!context) return;
    const ctx = context;
    const events = new AbortController();
    const signal = events.signal;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const forcedColors = matchMedia('(forced-colors: active)');
    const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
    const dots = createFlareDots();
    const groups: FlareDot[][] = Array.from({ length: 9 }, () => []);
    for (const dot of dots) groups[dot.color + 1]!.push(dot);
    const stimulus: FlareStimulus = { x: 0, y: 0, active: false, rippleX: FLARE_WIDTH / 2, rippleY: FLARE_HEIGHT / 2, rippleAge: -1 };
    let frame = 0; let visible = false; let disconnected = false; let entered = false;
    let lastTime = 0; let rippleStart = -1; let width = 0; let height = 0;
    let rendered = 0; let pulses = 0; let slowFrames = 0; let interval = 1000 / 60; let lastPaint = 0;
    const costs: number[] = [];
    const motionAllowed = () => !reduced.matches && !forcedColors.matches;
    const canRun = () => !disconnected && visible && !document.hidden && motionAllowed();

    const state = (value: string) => { if (this.dataset.state !== value) this.dataset.state = value; };
    const paint = () => {
      const started = performance.now();
      ctx.clearRect(0, 0, FLARE_WIDTH, FLARE_HEIGHT);
      // Batch by palette: nine fill operations, no per-dot shadows or DOM nodes.
      for (let i = 0; i < groups.length; i++) {
        ctx.fillStyle = i === 0 ? '#a6bdce' : FLARE_COLORS[i - 1]!;
        ctx.globalAlpha = i === 0 ? .20 : 1;
        ctx.beginPath();
        for (const dot of groups[i]!) {
          const movement = Math.abs(dot.x - dot.homeX) + Math.abs(dot.y - dot.homeY);
          const radius = dot.radius + Math.min(i ? .72 : .35, movement * .028);
          ctx.moveTo(dot.x + radius, dot.y);
          ctx.arc(dot.x, dot.y, radius, 0, Math.PI * 2);
        }
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      rendered++;
      const cost = performance.now() - started;
      if (costs.length === 120) costs.shift();
      costs.push(cost);
      if (cost > 5 && ++slowFrames > 6) interval = 1000 / 30;
    };
    const stop = () => { if (frame) cancelAnimationFrame(frame); frame = 0; lastTime = 0; };
    const tick = (time: number) => {
      frame = 0;
      if (!canRun()) { state(motionAllowed() ? 'paused' : 'reduced'); return; }
      if (time - lastPaint < interval - 1) { frame = requestAnimationFrame(tick); return; }
      stimulus.rippleAge = rippleStart < 0 ? -1 : time - rippleStart;
      if (stimulus.rippleAge >= 1050) { rippleStart = -1; stimulus.rippleAge = -1; }
      const moving = stepFlare(dots, stimulus, lastTime ? time - lastTime : interval);
      lastTime = lastPaint = time;
      paint();
      if (moving) { state('animating'); frame = requestAnimationFrame(tick); }
      else { state('idle'); lastTime = 0; }
    };
    const wake = () => {
      if (!canRun() || frame) return;
      state('animating'); frame = requestAnimationFrame(tick);
    };
    const settle = () => {
      stop(); stimulus.active = false; rippleStart = -1; stimulus.rippleAge = -1;
      resetFlare(dots);
      if (!document.hidden && visible) paint();
      state(motionAllowed() ? (visible && !document.hidden ? 'idle' : 'paused') : 'reduced');
    };
    const replay = (x = FLARE_WIDTH / 2, y = FLARE_HEIGHT / 2) => {
      // Keyboard focus/touch can scroll the artwork before the observer has
      // delivered its new visibility. An explicit interaction is authoritative.
      if (!visible && !document.hidden && motionAllowed()) {
        const rect = this.getBoundingClientRect();
        visible = rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
      }
      if (!canRun()) return;
      entered = true; pulses++;
      stimulus.rippleX = x; stimulus.rippleY = y; rippleStart = performance.now(); wake();
    };
    const changePreferences = () => {
      button.hidden = !motionAllowed();
      hint.textContent = reduced.matches ? 'A spark, at rest.' : finePointer.matches ? 'Move through the dots.' : 'Tap to spark a ripple.';
      this.dataset.reduced = motionAllowed() ? 'false' : 'true';
      settle();
    };
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      width = rect.width; height = rect.height;
      // Cap memory/paint work even on high-DPI phones or very large displays.
      const ratio = Math.min(devicePixelRatio || 1, 1.5, 900 / width, 570 / height);
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
      ctx.setTransform(canvas.width / FLARE_WIDTH, 0, 0, canvas.height / FLARE_HEIGHT, 0, 0);
      resetFlare(dots); paint(); this.dataset.ready = 'true';
    };
    const coordinates = (event: PointerEvent) => ({ x: event.offsetX / Math.max(1, width) * FLARE_WIDTH, y: event.offsetY / Math.max(1, height) * FLARE_HEIGHT });
    canvas.addEventListener('pointermove', event => {
      if (!canRun() || !finePointer.matches || event.pointerType === 'touch') return;
      const point = coordinates(event); stimulus.x = point.x; stimulus.y = point.y; stimulus.active = true; wake();
    }, { signal, passive: true });
    canvas.addEventListener('pointerleave', () => { stimulus.active = false; wake(); }, { signal, passive: true });
    canvas.addEventListener('pointercancel', () => { stimulus.active = false; wake(); }, { signal, passive: true });
    canvas.addEventListener('pointerdown', event => { const point = coordinates(event); replay(point.x, point.y); }, { signal, passive: true });
    button.addEventListener('click', () => replay(), { signal });
    document.addEventListener('visibilitychange', settle, { signal });
    document.addEventListener('astro:before-swap', () => { visible = false; stop(); }, { signal });
    reduced.addEventListener('change', changePreferences, { signal });
    forcedColors.addEventListener('change', changePreferences, { signal });
    finePointer.addEventListener('change', changePreferences, { signal });
    const intersection = new IntersectionObserver(entries => {
      const wasVisible = visible;
      visible = entries.some(entry => entry.isIntersecting);
      if (!visible) { stop(); state('paused'); return; }
      // Do not erase an explicit ripple when a focus/resize intersection arrives.
      if (!wasVisible && rippleStart < 0) settle();
      if (!entered && canRun()) replay(150, 180);
      else if (rippleStart >= 0 || stimulus.active) wake();
    }, { threshold: .1 });
    intersection.observe(this);
    const resizing = new ResizeObserver(resize); resizing.observe(canvas);
    resize(); changePreferences();
    this.dataset.points = String(dots.length);
    this.readMetrics = () => {
      const sorted = [...costs].sort((a, b) => a - b);
      return { state: this.dataset.state, frames: rendered, pulses, pendingFrame: !!frame, points: dots.length,
        markedPoints: dots.filter(dot => dot.color >= 0).length,
        targetFps: interval > 20 ? 30 : 60, backingWidth: canvas.width, backingHeight: canvas.height,
        paintP95Ms: sorted[Math.floor(sorted.length * .95)] ?? 0,
        paintMaxMs: sorted.at(-1) ?? 0,
        maxDisplacement: Math.max(...dots.map(dot => Math.hypot(dot.x - dot.homeX, dot.y - dot.homeY))) };
    };
    this.dispose = () => {
      disconnected = true; stop(); events.abort(); intersection.disconnect(); resizing.disconnect();
      this.dataset.state = 'disposed';
    };
  }
  disconnectedCallback(): void { this.dispose?.(); this.dispose = undefined; }
}
if (!customElements.get('vf-dot-flare')) customElements.define('vf-dot-flare', FlareElement);
