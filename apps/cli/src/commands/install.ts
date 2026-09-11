import { defineCommand } from 'citty';
import {
  readFileSync,
  writeFileSync,
  copyFileSync,
  renameSync,
  existsSync,
  mkdirSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { getConfig } from '../config.js';
import { models, ApiError, exitCodeForStatus } from '../client.js';
import { writeMeta } from '../output.js';

const OPENCODE_CFG = join(homedir(), '.config', 'opencode', 'opencode.json');

type OpenCodeConfig = {
  $schema?: string;
  provider?: Record<string, unknown>;
  [key: string]: unknown;
};

function modelDisplayName(id: string): string {
  // Strip @cf/ prefix
  const stripped = id.replace(/^@cf\//, '');
  // Take last segment
  const segment = stripped.split('/').pop() ?? stripped;
  // Split on '-', title-case each token
  const titled = segment
    .split('-')
    .map((tok) => tok.charAt(0).toUpperCase() + tok.slice(1))
    .join(' ');
  return `${titled} (VibeFlare)`;
}

async function probeModels(cfg: ReturnType<typeof getConfig>, modelList: string[]): Promise<string[]> {
  const BATCH = 10;
  const TIMEOUT = 8000;
  const working: string[] = [];

  process.stderr.write(`probing ${modelList.length} models...\n`);

  for (let i = 0; i < modelList.length; i += BATCH) {
    const batch = modelList.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map(async (id) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT);
        try {
          const url = cfg.base_url.replace(/\/$/, '') + '/v1/chat/completions';
          const res = await fetch(url, {
            method: 'POST',
            headers: { Authorization: `Bearer ${cfg.api_key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: id, messages: [{ role: 'user', content: 'hi' }], max_tokens: 1, stream: false }),
            signal: controller.signal,
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return id;
        } finally {
          clearTimeout(timer);
        }
      })
    );
    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      if (r && r.status === 'fulfilled') working.push(r.value);
      else process.stderr.write(`  skip ${batch[j]}: ${r?.status === 'rejected' ? (r.reason as Error).message : 'failed'}\n`);
    }
  }

  process.stderr.write(`probe: ${working.length}/${modelList.length} working\n`);
  return working;
}

async function installOpenCode(force: boolean, probe: boolean): Promise<void> {
  const cfg = getConfig();

  // Fetch models
  const result = await models(cfg, 'text-generation') as { data?: Array<{ id?: string }> };
  const modelList = (result.data ?? []).map((m) => m.id ?? '').filter(Boolean);

  if (modelList.length === 0) {
    process.stderr.write('install: no models returned from vibeflare\n');
    process.exit(1);
  }

  const finalList = probe ? await probeModels(cfg, modelList) : modelList;

  if (finalList.length === 0) {
    process.stderr.write('install: no working models after probe\n');
    process.exit(1);
  }

  // Read existing config or start fresh
  let ocConfig: OpenCodeConfig;
  const fileExists = existsSync(OPENCODE_CFG);
  if (fileExists) {
    try {
      ocConfig = JSON.parse(readFileSync(OPENCODE_CFG, 'utf8')) as OpenCodeConfig;
    } catch {
      ocConfig = { $schema: 'https://opencode.ai/config.json', provider: {} };
    }
  } else {
    ocConfig = { $schema: 'https://opencode.ai/config.json', provider: {} };
  }

  // Already installed check
  if (ocConfig.provider?.vibeflare !== undefined && !force) {
    process.stderr.write('vibeflare already installed in opencode. use --force to overwrite\n');
    process.exit(0);
  }

  // Backup if file existed
  if (fileExists) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    copyFileSync(OPENCODE_CFG, `${OPENCODE_CFG}.bak-${ts}`);
  }

  // Build models map
  const modelsMap: Record<string, { name: string; modalities: { input: string[]; output: string[] } }> = {};
  for (const id of finalList) {
    modelsMap[id] = {
      name: modelDisplayName(id),
      modalities: { input: ['text'], output: ['text'] },
    };
  }

  // Build provider block
  const providerBlock = {
    npm: '@ai-sdk/openai-compatible',
    name: 'VibeFlare',
    options: {
      baseURL: `${cfg.base_url.replace(/\/$/, '')}/v1`,
      apiKey: cfg.api_key,
    },
    models: modelsMap,
  };

  // Set provider
  if (!ocConfig.provider) ocConfig.provider = {};
  ocConfig.provider.vibeflare = providerBlock;

  // Atomic write
  mkdirSync(dirname(OPENCODE_CFG), { recursive: true });
  const tmp = `${OPENCODE_CFG}.tmp`;
  writeFileSync(tmp, JSON.stringify(ocConfig, null, 2) + '\n', { mode: 0o600 });
  renameSync(tmp, OPENCODE_CFG);

  writeMeta(`vibeflare: ${finalList.length} models → ~/.config/opencode/opencode.json`);
}

export default defineCommand({
  meta: { name: 'install', description: 'install vibeflare on platform' },
  args: {
    platform: { type: 'positional', description: 'platform to install on (e.g. opencode)', required: true },
    force: { type: 'boolean', description: 'overwrite existing vibeflare provider block' },
    probe: { type: 'boolean', description: 'test each model via chat completion, skip failures' },
  },
  async run({ args }) {
    try {
      if (args.platform === 'opencode') {
        await installOpenCode(args.force ?? false, args.probe ?? false);
      } else {
        process.stderr.write(`install: unsupported platform '${args.platform}'. supported: opencode\n`);
        process.exit(1);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        process.stderr.write(`install: ${err.message}\n`);
        process.exit(exitCodeForStatus(err.statusCode));
      }
      process.stderr.write(`install: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    }
  },
});
