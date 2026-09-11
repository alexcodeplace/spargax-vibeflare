import { useEffect, useState } from 'react';
import { getAuthMethods, meOrNull, type AuthMethods } from '../../lib/api';
import { Card } from '../primitives/Card';
import { Tabs } from '../primitives/Tabs';
import { PasskeyButton } from './PasskeyButton';
import { GithubDeviceLogin } from './GithubDeviceLogin';
import { GithubWebLogin } from './GithubWebLogin';
import { Spinner } from '../primitives/Spinner';
import { HydratedIsland } from '../HydratedIsland';

/**
 * First-run setup page island.
 * Checks /admin/me — if 200, redirects to /.
 * If 401, shows passkey register or GitHub Device Flow.
 */
function SetupPageInner() {
  const [checking, setChecking] = useState(true);
  const [methods, setMethods] = useState<AuthMethods | null>(null);

  useEffect(() => {
    meOrNull().then(async (user) => {
      if (user) {
        window.location.href = '/';
        return;
      }
      const authMethods = await getAuthMethods();
      setMethods(authMethods);
      setChecking(false);
    });
  }, []);

  if (checking) {
    return (
      <div className="flex items-center justify-center p-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (methods?.cf_access) {
    return (
      <Card data-testid="setup-page" className="w-full max-w-md p-8 space-y-4">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Cloudflare Access is active</h1>
        <p data-testid="cf-access-setup-info" className="text-sm text-[var(--color-muted)]">
          VibeFlare does not use a second passkey or GitHub login in this mode. The first Access identity becomes the owner automatically. If setup is already complete, ask the owner for an invite.
        </p>
      </Card>
    );
  }

  return (
    <Card data-testid="setup-page" className="w-full max-w-md p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Welcome to VibeFlare</h1>
        <p className="text-sm text-[var(--color-muted)] mt-1">First-run setup — create your owner account.</p>
      </div>

      <Tabs
        items={[
          {
            value: 'passkey',
            label: 'Use Passkey',
            content: (
              <div className="space-y-4">
                <p className="text-sm text-[var(--color-muted)]">
                  Register a passkey to secure your owner account. No password needed.
                </p>
                <PasskeyButton
                  mode="register"
                  endpoints={{
                    options: '/auth/setup/start',
                    optionsMethod: 'POST',
                    verify: '/auth/setup/finish',
                  }}
                  buildVerifyBody={(cred, opts) => ({ userId: opts.userId, response: cred })}
                  onSuccess={() => { window.location.href = '/'; }}
                />
              </div>
            ),
          },
          {
            value: 'github',
            label: 'Use GitHub',
            content: (
              <div className="space-y-4">
                <p className="text-sm text-[var(--color-muted)]">
                  Sign in with GitHub to become the owner. Zero-config installs create a small GitHub App owned by your account, so no deployment secret is required.
                </p>
                {methods?.github_flow === 'device' ? (
                  <GithubDeviceLogin
                    mode="register"
                    onSuccess={() => { window.location.href = '/'; }}
                  />
                ) : (
                  <GithubWebLogin
                    mode="register"
                    flow={methods?.github_flow === 'oauth' ? 'oauth' : 'bootstrap'}
                  />
                )}
              </div>
            ),
          },
        ]}
      />
    </Card>
  );
}

export function SetupPage() {
  return (
    <HydratedIsland>
      <SetupPageInner />
    </HydratedIsland>
  );
}
