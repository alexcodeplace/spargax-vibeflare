import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

function restoreStorage() {
  if (storageDescriptor) Object.defineProperty(globalThis, 'localStorage', storageDescriptor);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
}

beforeEach(() => {
  restoreStorage();
  vi.resetModules();
  localStorage.clear();
  document.documentElement.dataset.theme = 'dark';
  document.head.innerHTML = '<meta name="theme-color" content="#061329">';
});
afterEach(restoreStorage);

describe('Spargax theme continuity', () => {
  it('loads a saved light preference and updates the browser chrome', async () => {
    localStorage.setItem('vf-theme', 'light');
    const { initTheme } = await import('../src/lib/theme');
    initTheme();
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.dataset.astryxTheme).toBe('neutral');
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#edf4fc');
  });

  it('defaults to dark when the saved preference is not a supported mode', async () => {
    localStorage.setItem('vf-theme', 'system');
    const { initTheme } = await import('../src/lib/theme');
    initTheme();
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('retains the user choice across a root swap when storage operations are blocked', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new DOMException('Storage is blocked', 'SecurityError'); },
      setItem: () => { throw new DOMException('Storage is blocked', 'SecurityError'); },
    });
    const { initTheme, toggleTheme } = await import('../src/lib/theme');
    initTheme();
    expect(toggleTheme()).toBe('light');
    // Astro replaces the HTML attributes before the after-swap theme hook runs.
    document.documentElement.dataset.theme = 'dark';
    initTheme();
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(toggleTheme()).toBe('dark');
  });

  it('does not restore a stale saved mode when reads work but writes fail', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => 'dark',
      setItem: () => { throw new DOMException('Storage is full', 'QuotaExceededError'); },
    });
    const { initTheme, setTheme } = await import('../src/lib/theme');
    initTheme();
    setTheme('light');
    document.documentElement.dataset.theme = 'dark';
    initTheme();
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('works when accessing the storage property itself throws', async () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() { throw new DOMException('Storage is blocked', 'SecurityError'); },
    });
    const { initTheme, setTheme } = await import('../src/lib/theme');
    expect(() => initTheme()).not.toThrow();
    setTheme('light');
    document.documentElement.dataset.theme = 'dark';
    initTheme();
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('notifies independently hydrated controls when a user changes mode', async () => {
    const { setTheme, THEME_CHANGED_EVENT } = await import('../src/lib/theme');
    const listener = vi.fn();
    window.addEventListener(THEME_CHANGED_EVENT, listener);
    try {
      setTheme('light');
      expect(listener).toHaveBeenCalledTimes(1);
      expect((listener.mock.calls[0][0] as CustomEvent).detail).toBe('light');
      expect(localStorage.getItem('vf-theme')).toBe('light');
    } finally {
      window.removeEventListener(THEME_CHANGED_EVENT, listener);
    }
  });
});
