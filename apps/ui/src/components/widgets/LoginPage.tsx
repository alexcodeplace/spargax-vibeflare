import { useEffect, useState } from 'react';
import { getAuthMethods, meOrNull, type AuthMethods } from '../../lib/api';
import { Card } from '../primitives/Card';
import { PasskeyButton } from './PasskeyButton';
import { GithubDeviceLogin } from './GithubDeviceLogin';
import { GithubWebLogin } from './GithubWebLogin';
import { Spinner } from '../primitives/Spinner';
import { HydratedIsland } from '../HydratedIsland';

/**
 * Login page island. Shows passkey auth and optionally GitHub Device Flow
 * based on /auth/methods response.
 */
function LoginPageInner() {
  const [methods, setMethods] = useState<AuthMethods | null>(null);
  const [showInviteRequired, setShowInviteRequired] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('reason') === 'invite_required') {
        setShowInviteRequired(true);
      }
    }
    meOrNull().then((user) => {
      if (user) {
        window.location.href = '/';
        return;
      }
      getAuthMethods().then((authMethods) => {
        if (authMethods.setup_required) {
          window.location.replace('/setup');
          return;
        }
        setMethods(authMethods);
      });
    });
  }, []);

  if (!methods) {
    return (
      <div className="flex items-center justify-center p-12">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <Card data-testid="login-page" className="w-full max-w-sm p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Sign in</h1>
        <p className="text-sm text-[var(--color-muted)] mt-1">to VibeFlare</p>
      </div>

      {showInviteRequired && (
        <p className="text-sm text-[var(--color-warn)]">
          An invite link is required to create a new account. Contact your administrator.
        </p>
      )}

      <div className="space-y-3">
        {methods.cf_access ? (
          <div data-testid="cf-access-account-required" className="space-y-2">
            <p className="text-sm text-[var(--color-text)]">
              Cloudflare Access signed you in, but this identity does not have a VibeFlare account yet.
            </p>
            <p className="text-sm text-[var(--color-muted)]">
              Ask the VibeFlare owner for an invite link, then open that link while signed in with this Cloudflare Access identity.
            </p>
          </div>
        ) : (
          <>
            {methods.passkey && (
              <PasskeyButton
                mode="auth"
                onSuccess={() => { window.location.href = '/'; }}
              />
            )}

            {methods.github && methods.github_flow === 'device' && (
              <GithubDeviceLogin
                mode="auth"
                onSuccess={() => { window.location.href = '/'; }}
              />
            )}

            {methods.github && methods.github_flow === 'oauth' && (
              <GithubWebLogin mode="auth" flow="oauth" />
            )}

            {!methods.passkey && !methods.github && (
              <p className="text-sm text-[var(--color-muted)]">
                No browser sign-in method is configured. Run <code>vf doctor</code> on the machine that manages this deployment.
              </p>
            )}
          </>
        )}
      </div>

      {!methods.cf_access && (
        <p className="text-xs text-[var(--color-muted)] text-center">
          New users need an invite link from your administrator.
        </p>
      )}
    </Card>
  );
}

export function LoginPage() {
  return (
    <HydratedIsland>
      <LoginPageInner />
    </HydratedIsland>
  );
}
