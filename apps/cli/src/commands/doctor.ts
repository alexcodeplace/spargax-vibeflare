import { defineCommand } from 'citty';
import { loadConfig } from '../config.js';
import { models, usage, ApiError } from '../client.js';
import { readInstallReceipt } from '../lib/install-state.js';

interface CheckResult {
  check: string;
  ok: boolean;
  detail?: string;
  optional?: boolean;
}

async function serverHealth(url: string): Promise<{ ok: boolean; detail: string }> {
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/health`, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
    const body = await res.json() as { ok?: boolean; version?: string };
    return { ok: body.ok === true, detail: body.version ? `v${body.version}` : body.ok === true ? 'live' : 'unhealthy' };
  } catch (error) {
    return { ok: false, detail: String(error) };
  }
}

export default defineCommand({
  meta: { name: 'doctor', description: 'Check installation, server, API authentication, and quota' },
  args: {
    name: { type: 'string', description: 'installation name', default: 'vibeflare' },
    json: { type: 'boolean', description: 'output JSON' },
    quiet: { type: 'boolean', alias: 'q', description: 'suppress stderr' },
  },
  async run({ args }) {
    const name = String(args.name ?? 'vibeflare');
    const receipt = readInstallReceipt(name);
    const cfg = loadConfig();
    const results: CheckResult[] = [];
    let allRequiredOk = true;

    const mark = (check: string, ok: boolean, detail?: string, optional = false): void => {
      results.push({ check, ok, ...(detail ? { detail } : {}), ...(optional ? { optional: true } : {}) });
      if (!ok && !optional) allRequiredOk = false;
    };

    if (receipt) {
      const installOk = receipt.status === 'installed';
      mark('installation', installOk, `${receipt.status}${receipt.release.installed ? ` v${receipt.release.installed}` : ''}`);
      const url = receipt.deployment?.url ?? receipt.browserAuth.origin;
      if (url && receipt.status !== 'removed') {
        const health = await serverHealth(url);
        mark('server', health.ok, health.detail);
      } else if (receipt.status !== 'removed') {
        mark('server', false, 'deployment URL is not recorded');
      }
    }

    if (!cfg) {
      if (!receipt) {
        if (!args.quiet) process.stderr.write('vf: neither an install receipt nor API login is configured. run: vf setup\n');
        process.exit(3);
      }
      mark('api-client', false, 'not configured yet — create an API key, then run `vf login <url>`', true);
    } else {
      const baseUrl = cfg.base_url.replace(/\/$/, '');
      if (!receipt) {
        const health = await serverHealth(baseUrl);
        mark('server', health.ok, health.detail);
      }

      try {
        const body = await models(cfg) as { data?: unknown[] };
        mark('api-auth', true, `${body.data?.length ?? 0} models`);
      } catch (error) {
        mark('api-auth', false, error instanceof ApiError ? `HTTP ${error.statusCode}` : String(error));
      }

      try {
        const body = await usage(cfg) as { used?: number; limit?: number };
        const used = body.used ?? 0;
        const limit = body.limit ?? 10_000;
        const pct = limit > 0 ? Math.round((used / limit) * 100) : 0;
        mark('quota', pct < 100, `${used}/${limit} ${pct}%`);
      } catch (error) {
        mark('quota', false, error instanceof ApiError ? `HTTP ${error.statusCode}` : String(error));
      }
    }

    if (args.json) {
      process.stdout.write(`${JSON.stringify({ ok: allRequiredOk, checks: results }, null, 2)}\n`);
    } else {
      for (const result of results) {
        const glyph = result.optional && !result.ok ? '○' : result.ok ? '✓' : '✗';
        process.stdout.write(`${glyph} ${result.check}${result.detail ? `: ${result.detail}` : ''}\n`);
      }
      if (!allRequiredOk && !args.quiet) process.stderr.write('doctor: one or more required checks failed\n');
    }

    process.exit(allRequiredOk ? 0 : 1);
  },
});
