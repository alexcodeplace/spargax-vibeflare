import { useEffect, useRef, useState } from 'react';
import { Card } from '../primitives/Card';
import { Tabs } from '../primitives/Tabs';
import type { TabItem } from '../primitives/Tabs';
import { Button } from '../primitives/Button';
import { Input } from '../primitives/Input';
import { Spinner } from '../primitives/Spinner';
import { Badge } from '../primitives/Badge';
import { Checkbox } from '../primitives/Checkbox';
import { Toast, ToastProvider } from '../primitives/Toast';
import { PasskeyButton } from './PasskeyButton';
import { HydratedIsland } from '../HydratedIsland';
import { InvitesTab } from './InvitesTab';
import { isSettingsTab, settingsTabFromPath, settingsTabPath, type SettingsTab } from '../../lib/settings-navigation';
import {
  me, logout, getSettings, setSetting,
  listCredentials, revokeCredential,
  listPrompts, createPrompt, deletePrompt,
  listModelPreferences, setModelVisibility, syncModels, MODELS_CHANGED_EVENT, MODEL_POLICY_STORAGE_KEY,
  type UserInfo, type Credential, type PromptRecord, type ModelPreference,
} from '../../lib/api';

/**
 * Personal settings and model visibility with linkable sections.
 */
export function parseExcludePaidSetting(value: string | undefined): boolean {
  if (value === undefined) return true;
  return !['0', 'false', 'off', 'no'].includes(value.trim().toLowerCase());
}

function SettingsPageInner({ initialTab }: { initialTab: SettingsTab }) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [prompts, setPrompts] = useState<PromptRecord[]>([]);
  const [models, setModels] = useState<ModelPreference[]>([]);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [modelSearch, setModelSearch] = useState('');
  const [pendingModels, setPendingModels] = useState<Set<string>>(new Set());
  const pendingModelsRef = useRef(new Set<string>());
  const modelsRequest = useRef(0);
  const [syncingModels, setSyncingModels] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ open: boolean; title: string; variant: 'success' | 'danger' }>({
    open: false, title: '', variant: 'success',
  });
  const [ghAllowed, setGhAllowed] = useState('');
  const [cacheTtl, setCacheTtl] = useState('7');
  const [excludePaid, setExcludePaid] = useState(true);
  const [savingPaidPolicy, setSavingPaidPolicy] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [newPromptLabel, setNewPromptLabel] = useState('');
  const [newPromptContent, setNewPromptContent] = useState('');

  useEffect(() => {
    Promise.all([
      me().catch(() => null),
      listCredentials().catch(() => []),
      getSettings().catch((error: Error) => { setSettingsError(error.message); return []; }),
      listPrompts().catch(() => []),
      listModelPreferences().catch((error: Error) => { setModelsError(error.message); return []; }),
    ]).then(([u, creds, setts, proms, mods]) => {
      setUser(u);
      setCredentials(creds);
      setPrompts(proms);
      setModels(mods);
      const ttl = setts.find(s => s.key === 'cache.responses.ttl_days')?.value;
      if (ttl) setCacheTtl(ttl);
      setGhAllowed(setts.find(s => s.key === 'github.allowed_logins')?.value ?? '');
      setExcludePaid(parseExcludePaidSetting(setts.find(s => s.key === 'models.exclude_paid')?.value));
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const readLocation = () => setActiveTab(settingsTabFromPath(window.location.pathname));
    readLocation();
    window.addEventListener('popstate', readLocation);
    return () => window.removeEventListener('popstate', readLocation);
  }, []);

  useEffect(() => {
    if (!loading && user && activeTab === 'invites' && user.role !== 'owner') {
      window.history.replaceState(window.history.state, '', settingsTabPath('account'));
      setActiveTab('account');
    }
  }, [loading, user, activeTab]);

  useEffect(() => {
    document.title = `VibeFlare | Settings | ${activeTab[0]!.toUpperCase()}${activeTab.slice(1)}`;
  }, [activeTab]);

  function navigateTab(value: string) {
    if (!isSettingsTab(value) || value === activeTab) return;
    const url = new URL(window.location.href);
    url.pathname = settingsTabPath(value);
    url.hash = '';
    window.history.pushState(window.history.state, '', url);
    setActiveTab(value);
  }

  async function reloadModelPreferences() {
    const version = ++modelsRequest.current;
    const fresh = await listModelPreferences();
    if (version !== modelsRequest.current) return;
    // Do not overwrite in-flight optimistic choices with a stale GET response.
    setModels(previous => fresh.map(row => pendingModelsRef.current.has(row.name)
      ? previous.find(model => model.name === row.name) ?? row : row));
    setModelsError(null);
  }

  useEffect(() => {
    const refresh = () => { void reloadModelPreferences().catch((error: Error) => setModelsError(error.message)); };
    const onStorage = (event: StorageEvent) => { if (event.key === MODEL_POLICY_STORAGE_KEY) refresh(); };
    window.addEventListener(MODELS_CHANGED_EVENT, refresh);
    window.addEventListener('storage', onStorage);
    return () => {
      modelsRequest.current++;
      window.removeEventListener(MODELS_CHANGED_EVENT, refresh);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  async function handleModelVisibility(name: string, visible: boolean) {
    if (pendingModelsRef.current.has(name) || syncingModels || savingPaidPolicy) return;
    const previous = models.find(model => model.name === name)?.visible;
    if (previous === undefined) return;
    pendingModelsRef.current.add(name);
    setPendingModels(new Set(pendingModelsRef.current));
    setModels(rows => rows.map(row => row.name === name ? { ...row, visible } : row));
    try {
      await setModelVisibility(name, visible);
      showToast(visible ? 'Model shown in chat' : 'Model hidden from chat');
    } catch (error) {
      setModels(rows => rows.map(row => row.name === name ? { ...row, visible: previous } : row));
      showToast((error as Error).message, 'danger');
    } finally {
      pendingModelsRef.current.delete(name);
      setPendingModels(new Set(pendingModelsRef.current));
    }
  }

  function showToast(title: string, variant: 'success' | 'danger' = 'success') {
    setToast({ open: true, title, variant });
  }

  async function handleLogout() {
    try {
      await logout();
      window.location.href = '/login';
    } catch {
      showToast('Logout failed', 'danger');
    }
  }

  async function saveGhAllowedLogins() {
    try {
      await setSetting('github.allowed_logins', ghAllowed);
      showToast('GitHub allowed logins saved');
    } catch (e) {
      showToast((e as Error).message, 'danger');
    }
  }

  async function saveCacheTtl() {
    try {
      await setSetting('cache.responses.ttl_days', cacheTtl);
      showToast('Cache TTL saved');
    } catch (e) {
      showToast((e as Error).message, 'danger');
    }
  }

  async function clearCache() {
    try {
      await setSetting('cache.flush', String(Date.now()));
      showToast('Cache cleared');
    } catch (e) {
      showToast((e as Error).message, 'danger');
    }
  }

  async function handleRevokeCredential(id: string) {
    try {
      await revokeCredential(id);
      setCredentials(prev => prev.filter(c => c.id !== id));
      showToast('Device removed');
    } catch (e) {
      showToast((e as Error).message, 'danger');
    }
  }

  async function handleAddPrompt() {
    if (!newPromptLabel.trim() || !newPromptContent.trim()) return;
    try {
      const p = await createPrompt(newPromptLabel.trim(), newPromptContent.trim());
      setPrompts(prev => [...prev, p]);
      setNewPromptLabel('');
      setNewPromptContent('');
      showToast('Prompt created');
    } catch (e) {
      showToast((e as Error).message, 'danger');
    }
  }

  async function handleExcludePaidChange(next: boolean) {
    if (savingPaidPolicy || pendingModelsRef.current.size > 0) return;
    const previous = excludePaid;
    setSavingPaidPolicy(true);
    setExcludePaid(next);
    try {
      await setSetting('models.exclude_paid', next ? '1' : '0');
      await reloadModelPreferences().catch((error: Error) => setModelsError(error.message));
      showToast(next ? 'Paid models excluded' : 'Paid models included');
    } catch (e) {
      setExcludePaid(previous);
      showToast((e as Error).message, 'danger');
    } finally {
      setSavingPaidPolicy(false);
    }
  }

  async function handleSyncModels() {
    if (pendingModelsRef.current.size > 0 || savingPaidPolicy) return;
    setSyncingModels(true);
    try {
      const r = await syncModels();
      await reloadModelPreferences();
      showToast(`Synced ${r.synced} models`);
    } catch (e) {
      showToast((e as Error).message, 'danger');
    } finally {
      setSyncingModels(false);
    }
  }

  async function handleDeletePrompt(id: string) {
    try {
      await deletePrompt(id);
      setPrompts(prev => prev.filter(p => p.id !== id));
      showToast('Prompt deleted');
    } catch (e) {
      showToast((e as Error).message, 'danger');
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  const visibleModels = models.filter(model => `${model.name} ${model.task}`.toLowerCase().includes(modelSearch.trim().toLowerCase()));
  const selectedCount = models.filter(model => model.visible).length;

  const tabItems: TabItem[] = [
    {
      value: 'account',
      label: 'Account',
      content: (
        <Card variant="default" className="p-6 space-y-4 mt-4">
          <div className="space-y-1">
            <p className="text-sm text-[var(--color-muted)]">Email</p>
            <p className="text-sm font-medium text-[var(--color-text)]">{user?.email ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-[var(--color-muted)]">Role</p>
            <Badge variant={user?.role === 'owner' ? 'warn' : 'neutral'}>
              {user?.role === 'owner' ? 'Owner' : 'User'}
            </Badge>
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            Sign out
          </Button>
        </Card>
      ),
    },
    {
      value: 'devices',
      label: 'Devices',
      content: (
        <div className="space-y-4 mt-4">
          <Card variant="default" className="p-4 space-y-3">
            <p className="text-sm font-medium text-[var(--color-text)]">Passkeys</p>
            {credentials.length === 0 && (
              <p className="text-sm text-[var(--color-muted)]">No passkeys registered.</p>
            )}
            {credentials.map(c => (
              <div key={c.id} className="flex items-center justify-between py-1 border-b border-[var(--color-border)]">
                <div>
                  <p className="text-sm text-[var(--color-text)]">{c.name || 'Unnamed device'}</p>
                  <p className="text-xs text-[var(--color-muted)]">Added {new Date(c.created_at).toLocaleDateString()}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRevokeCredential(c.id)}
                >
                  Revoke
                </Button>
              </div>
            ))}
          </Card>
          <Card variant="outlined" className="p-4 space-y-3">
            <p className="text-sm font-medium text-[var(--color-text)]">Add new device</p>
            <PasskeyButton mode="register" onSuccess={() => showToast('Device registered')} />
          </Card>
        </div>
      ),
    },
    {
      value: 'auth',
      label: 'Auth',
      content: (
        <Card variant="default" className="p-6 space-y-4 mt-4">
          <p className="text-sm font-medium text-[var(--color-text)]">GitHub — Allowed Logins</p>
          <p className="text-xs text-[var(--color-muted)]">
            Comma-separated GitHub usernames permitted to sign in.
            Leave blank to deny all (except first-user owner bootstrap).
          </p>
          <Input
            label="Allowed Logins (comma-separated)"
            id="sett-gh-allowed"
            fullWidth
            value={ghAllowed}
            onChange={e => setGhAllowed(e.target.value)}
            placeholder="alice,bob"
          />
          <Button variant="primary" size="sm" onClick={saveGhAllowedLogins}>
            Save
          </Button>
        </Card>
      ),
    },
    {
      value: 'models',
      label: 'Models',
      content: (
        <div className="space-y-6 mt-4">
          <Card variant="default" className="p-6 space-y-3">
            <Checkbox
              id="models-exclude-paid"
              label="Exclude paid"
              checked={excludePaid}
              disabled={user?.role !== 'owner' || savingPaidPolicy || pendingModels.size > 0 || settingsError !== null}
              onCheckedChange={handleExcludePaidChange}
            />
            <p className="text-xs text-[var(--color-muted)]">
              Show models available on Workers Free. Turn this off to include 💲 Paid models. Access comes from Cloudflare’s model registry, not a pricing guess or an inference probe. This is not an account spending cap.
            </p>
            {settingsError && <p role="alert" className="text-xs text-[var(--color-danger)]">Settings could not be loaded. Reload to retry.</p>}
          </Card>

          <Card variant="default" className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[var(--color-text)]">Workers AI Models</p>
                <p className="text-xs text-[var(--color-muted)] mt-1">{selectedCount} of {models.length} models shown in your chat</p>
              </div>
              <Button variant="outline" size="sm" loading={syncingModels} disabled={savingPaidPolicy || pendingModels.size > 0} onClick={handleSyncModels}>
                Sync now
              </Button>
            </div>
            <p className="text-xs text-[var(--color-muted)]">Check the models you want in your chat picker. Changes save automatically for your account and do not disable models for other users or API clients.</p>
            <Input id="model-search" label="Search models" fullWidth value={modelSearch} onChange={event => setModelSearch(event.target.value)} placeholder="Search by model or task" />
            {modelsError && <div role="alert" className="text-sm text-[var(--color-danger)]">Could not refresh your model list. <button type="button" className="underline" onClick={() => void reloadModelPreferences().catch((error: Error) => setModelsError(error.message))}>Retry</button></div>}
            <div data-testid="model-visibility-list" className="max-h-96 overflow-y-auto space-y-1">
              {visibleModels.map(m => (
                <div key={m.name} data-model-name={m.name} className="flex min-w-0 flex-wrap items-center gap-2 py-2 border-b border-[var(--color-border)]">
                  <Checkbox
                    id={`model-visible-${encodeURIComponent(m.name)}`}
                    label={`${m.paid_required ? '💲 Paid · ' : ''}${m.name}`}
                    checked={m.visible}
                    disabled={pendingModels.has(m.name) || syncingModels || savingPaidPolicy}
                    onCheckedChange={checked => void handleModelVisibility(m.name, checked)}
                    className="min-w-0 flex-1 [overflow-wrap:anywhere]"
                  />
                  <Badge variant="muted" size="sm">{m.task}</Badge>
                </div>
              ))}
              {!visibleModels.length && !modelsError && <p className="py-3 text-sm text-[var(--color-muted)]">{models.length ? 'No models match your search.' : 'No models are available under the current access policy.'}</p>}
            </div>
          </Card>
        </div>
      ),
    },
    {
      value: 'cache',
      label: 'Cache',
      content: (
        <div className="space-y-6 mt-4">
          <Card variant="default" className="p-6 space-y-4">
            <p className="text-sm font-medium text-[var(--color-text)]">Response Cache</p>
            <Input
              label="TTL (days)"
              id="cache-ttl"
              type="number"
              value={cacheTtl}
              onChange={e => setCacheTtl(e.target.value)}
            />
            <div className="flex gap-2">
              <Button variant="primary" size="sm" onClick={saveCacheTtl}>
                Save TTL
              </Button>
              <Button variant="outline" size="sm" onClick={clearCache}>
                Clear cache
              </Button>
            </div>
          </Card>

          <Card variant="default" className="p-6 space-y-4">
            <p className="text-sm font-medium text-[var(--color-text)]">Prompt Templates</p>
            {prompts.map(p => (
              <div key={p.id} className="flex items-center justify-between py-1 border-b border-[var(--color-border)]">
                <span className="text-sm text-[var(--color-text)]">{p.label}</span>
                <Button variant="ghost" size="sm" onClick={() => handleDeletePrompt(p.id)}>
                  Delete
                </Button>
              </div>
            ))}
            <Input
              label="Label"
              id="new-prompt-label"
              fullWidth
              value={newPromptLabel}
              onChange={e => setNewPromptLabel(e.target.value)}
              placeholder="My prompt"
            />
            <Input
              label="Content"
              id="new-prompt-content"
              fullWidth
              value={newPromptContent}
              onChange={e => setNewPromptContent(e.target.value)}
              placeholder="You are a helpful assistant..."
            />
            <Button
              variant="primary"
              size="sm"
              disabled={!newPromptLabel.trim() || !newPromptContent.trim()}
              onClick={handleAddPrompt}
            >
              Add prompt
            </Button>
          </Card>
        </div>
      ),
    },
  ];

  if (user?.role === 'owner') {
    tabItems.push({
      value: 'invites',
      label: 'Invites',
      testid: 'settings-invites-tab',
      content: (
        <div className="mt-4">
          <InvitesTab />
        </div>
      ),
    });
  }

  return (
    <ToastProvider>
      <div data-testid="settings-page" className="max-w-2xl">
        <Tabs navigation label="Settings sections" items={tabItems.map(item => ({ ...item, href: settingsTabPath(item.value as SettingsTab) }))} value={activeTab} onValueChange={navigateTab} />
      </div>

      <Toast
        open={toast.open}
        onOpenChange={o => setToast(t => ({ ...t, open: o }))}
        title={toast.title}
        variant={toast.variant}
      />
    </ToastProvider>
  );
}

export function SettingsPage({ initialTab = 'account' }: { initialTab?: SettingsTab }) {
  return (
    <HydratedIsland>
      <SettingsPageInner initialTab={initialTab} />
    </HydratedIsland>
  );
}
