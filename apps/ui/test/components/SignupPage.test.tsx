import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SignupPage } from '../../src/components/widgets/SignupPage';

// Mock api module
vi.mock('../../src/lib/api', () => ({
  validateInvite: vi.fn(),
  getAuthMethods: vi.fn(),
}));

// Mock react-query internals used by HydratedIsland
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return { ...actual };
});

import { validateInvite, getAuthMethods } from '../../src/lib/api';

const mockValidateInvite = vi.mocked(validateInvite);
const mockGetAuthMethods = vi.mocked(getAuthMethods);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SignupPage', () => {
  it('shows spinner while loading', () => {
    // Never resolves during this test
    mockValidateInvite.mockReturnValue(new Promise(() => {}));
    render(<SignupPage />);
    // Spinner renders as an SVG or div — just check loading state exists
    expect(document.querySelector('.animate-spin') ?? screen.getByRole('status', { hidden: true })).toBeTruthy();
  });

  it('shows invalid state when invite is not ok', async () => {
    mockValidateInvite.mockResolvedValue({ ok: false, reason: 'expired' });
    render(<SignupPage />);
    await waitFor(() => {
      expect(screen.getByText(/invite invalid or expired/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /back to login/i })).toBeInTheDocument();
  });

  it('shows passkey button when invite valid and passkey enabled', async () => {
    mockValidateInvite.mockResolvedValue({ ok: true, expires_at: Date.now() + 3600000 });
    mockGetAuthMethods.mockResolvedValue({ mode: 'standalone', passkey: true, github: false, github_flow: 'none', cf_access: false, setup_required: false });
    render(<SignupPage />);
    await waitFor(() => {
      expect(screen.getByText(/sign up with passkey/i)).toBeInTheDocument();
    });
  });

  it('shows github button when invite valid and github enabled', async () => {
    mockValidateInvite.mockResolvedValue({ ok: true, expires_at: Date.now() + 3600000 });
    mockGetAuthMethods.mockResolvedValue({ mode: 'standalone', passkey: false, github: true, github_flow: 'device', cf_access: false, setup_required: false });
    render(<SignupPage />);
    await waitFor(() => {
      expect(screen.getByText(/sign up with github/i)).toBeInTheDocument();
    });
  });

  it('shows cloudflare access button when cf_access enabled', async () => {
    mockValidateInvite.mockResolvedValue({ ok: true, expires_at: Date.now() + 3600000 });
    mockGetAuthMethods.mockResolvedValue({ mode: 'cf_access', passkey: false, github: false, github_flow: 'none', cf_access: true, setup_required: false });
    render(<SignupPage />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /cloudflare access/i })).toBeInTheDocument();
    });
  });
});
