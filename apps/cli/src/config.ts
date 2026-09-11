import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface Config {
  base_url: string;
  api_key: string;
  default_model?: string;
}

const CONFIG_DIR = join(homedir(), '.config', 'vibeflare');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

export function loadConfig(): Config | null {
  // Env overrides take full precedence
  const url = process.env['VIBEFLARE_URL'];
  const key = process.env['VIBEFLARE_KEY'];
  const model = process.env['VIBEFLARE_MODEL'];

  let file: Partial<Config> = {};
  try {
    file = JSON.parse(readFileSync(CONFIG_FILE, 'utf8')) as Partial<Config>;
  } catch {
    // no config file — fine
  }

  const base_url = url ?? file.base_url ?? '';
  const api_key = key ?? file.api_key ?? '';
  const default_model = model ?? file.default_model;

  if (!base_url || !api_key) return null;
  return { base_url, api_key, ...(default_model ? { default_model } : {}) };
}

export function getConfig(): Config {
  const cfg = loadConfig();
  if (!cfg) {
    process.stderr.write('vf: not configured. run: vf login <url>\n');
    process.exit(3);
  }
  return cfg;
}

export function writeConfig(cfg: Config): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2) + '\n', { mode: 0o600 });
}
