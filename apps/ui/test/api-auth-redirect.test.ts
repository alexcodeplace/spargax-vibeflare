import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('browser authentication redirect', () => {
  it('collapses simultaneous 401 responses into exactly one login navigation', async () => {
    const replace = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal('window', { location: { pathname: '/analytics', replace } });
    vi.stubGlobal('fetch', fetchMock);

    const { getUsage, recentAudit } = await import('../src/lib/api');
    const results = await Promise.allSettled([getUsage(), recentAudit()]);

    expect(results.map((result) => result.status)).toEqual(['rejected', 'rejected']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith('/login');
  });

  it('is a no-op when already on the login page', async () => {
    window.history.replaceState({}, '', '/login');
    const before = window.location.href;

    const { redirectToLoginOnce } = await import('../src/lib/api');
    expect(() => redirectToLoginOnce()).not.toThrow();
    expect(window.location.pathname).toBe('/login');
    expect(window.location.href).toBe(before);
  });
});
