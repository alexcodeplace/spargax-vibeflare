import { describe, expect, it } from 'vitest';
import { PRIVATE_SETTING_KEYS, publicSettingsObject } from '../src/routes/admin';

describe('admin settings visibility', () => {
  it('never exposes generated auth secrets or internal bootstrap state', () => {
    const visible = publicSettingsObject([
      { key: 'github.allowed_logins', value: 'octocat' },
      { key: 'cache.responses.ttl_days', value: '7' },
      { key: 'github.oauth_client_id', value: 'Iv1.client' },
      { key: 'github.oauth_client_secret', value: 'super-secret' },
      { key: 'github.app_slug', value: 'vibeflare-instance' },
      { key: 'system.session_secret', value: 'session-secret' },
      { key: 'models.catalog.ready', value: '1' },
    ]);

    expect(visible).toEqual({
      'github.allowed_logins': 'octocat',
      'cache.responses.ttl_days': '7',
    });
    expect(PRIVATE_SETTING_KEYS.has('github.oauth_client_secret')).toBe(true);
  });
});
