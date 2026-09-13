// Shared by static route generation and the hydrated Settings navigation.
export const SETTINGS_TABS = ['account', 'devices', 'auth', 'models', 'cache', 'invites'] as const;
export type SettingsTab = typeof SETTINGS_TABS[number];

export function isSettingsTab(value: string): value is SettingsTab {
  return (SETTINGS_TABS as readonly string[]).includes(value);
}

export function settingsTabFromPath(path: string): SettingsTab {
  const match = /^\/settings(?:\/([^/]+))?\/?$/.exec(path);
  return match?.[1] && isSettingsTab(match[1]) ? match[1] : 'account';
}

export function settingsTabPath(tab: SettingsTab): string {
  return `/settings/${tab}/`;
}
