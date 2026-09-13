// Personal model visibility is a UI preference, not an authorization policy.
// Sparse private settings preserve choices across catalog syncs without a new
// schema migration. One atomic row per model avoids lost updates between tabs.
export const MODEL_VISIBILITY_PREFIX = 'system.model_visibility:';

export function modelVisibilityPrefix(userId: string): string {
  return `${MODEL_VISIBILITY_PREFIX}${encodeURIComponent(userId)}:`;
}

export function isModelVisibilitySetting(key: string): boolean {
  return key.startsWith(MODEL_VISIBILITY_PREFIX);
}

export async function hiddenModels(db: D1Database, userId: string): Promise<Set<string>> {
  const prefix = modelVisibilityPrefix(userId);
  const rows = await db.prepare("SELECT key FROM settings WHERE key >= ? AND key < ? AND value = '0'")
    .bind(prefix, prefix + '\uffff').all<{ key: string }>();
  const names = new Set<string>();
  for (const row of rows.results) {
    try { names.add(decodeURIComponent(row.key.slice(prefix.length))); } catch { /* Ignore malformed legacy keys. */ }
  }
  return names;
}

export async function saveModelVisibility(db: D1Database, userId: string, name: string, visible: boolean): Promise<void> {
  const key = modelVisibilityPrefix(userId) + encodeURIComponent(name);
  if (visible) {
    await db.prepare('DELETE FROM settings WHERE key = ?').bind(key).run();
  } else {
    await db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?, '0', ?)
      ON CONFLICT(key) DO UPDATE SET value = '0', updated_at = excluded.updated_at`)
      .bind(key, Date.now()).run();
  }
}
