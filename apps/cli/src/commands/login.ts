import { defineCommand } from 'citty';
import { writeConfig } from '../config.js';
import { writeMeta } from '../output.js';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

export default defineCommand({
  meta: { name: 'login', description: 'Configure CLI with server URL and API key' },
  args: {
    url: { type: 'positional', description: 'VibeFlare server URL', required: true },
  },
  async run({ args }) {
    const rl = readline.createInterface({ input, output });
    let key: string;
    try {
      key = await rl.question('API key: ');
    } finally {
      rl.close();
    }
    key = key.trim();
    if (!key) {
      process.stderr.write('vf: api key required\n');
      process.exit(1);
    }
    writeConfig({ base_url: args.url, api_key: key });
    writeMeta(`saved → ~/.config/vibeflare/config.json`);
  },
});
