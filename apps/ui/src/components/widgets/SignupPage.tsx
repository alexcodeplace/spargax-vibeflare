import { useEffect, useState } from 'react';
import { Card } from '../primitives/Card';
import { Spinner } from '../primitives/Spinner';
import { Button } from '../primitives/Button';
import { PasskeyButton } from './PasskeyButton';
import { GithubDeviceLogin } from './GithubDeviceLogin';
import { GithubWebLogin } from './GithubWebLogin';
import { HydratedIsland } from '../HydratedIsland';
import { validateInvite, getAuthMethods, type AuthMethods } from '../../lib/api';

function SignupPageInner() {
  const [state, setState] = useState<'loading' | 'invalid' | 'valid'>('loading');
  const [methods, setMethods] = useState<AuthMethods | null>(null);

  useEffect(() => {
    (async () => {
      const v = await validateInvite();
      if (!v.ok) { setState('invalid'); return; }
      const m = await getAuthMethods();
      setMethods(m);
      setState('valid');
    })();
  }, []);

  if (state === 'loading') {
    return (
      <div className="flex items-center justify-center p-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (state === 'invalid') {
    return (
      <Card data-testid="signup-page" className="w-full max-w-sm p-8 space-y-4">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Sign up</h1>
        <p className="text-sm text-[var(--color-danger)]">
          Invite invalid or expired. Ask your administrator for a new one.
        </p>
        <Button onClick={() => { window.location.href = '/login'; }} variant="secondary">
          Back to login
        </Button>
      </Card>
    );
  }

  return (
    <Card data-testid="signup-page" className="w-full max-w-sm p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Sign up</h1>
        <p className="text-sm text-[var(--color-muted)] mt-1">Pick a method to create your account.</p>
      </div>
      <div className="space-y-3">
        {methods?.passkey && (
          <PasskeyButton
            mode="register-invite"
            onSuccess={() => { window.location.href = '/'; }}
          />
        )}
        {methods?.github && methods.github_flow === 'device' && (
          <GithubDeviceLogin
            mode="register-invite"
            onSuccess={() => { window.location.href = '/'; }}
          />
        )}
        {methods?.github && methods.github_flow === 'oauth' && (
          <GithubWebLogin mode="register-invite" flow="oauth" />
        )}
        {methods?.cf_access && (
          <Button
            onClick={async () => {
              const r = await fetch('/auth/invite/redeem/access', { method: 'POST', credentials: 'same-origin' });
              if (r.ok) window.location.href = '/';
            }}
          >
            Continue with Cloudflare Access
          </Button>
        )}
      </div>
    </Card>
  );
}

export function SignupPage() {
  return (
    <HydratedIsland>
      <SignupPageInner />
    </HydratedIsland>
  );
}
