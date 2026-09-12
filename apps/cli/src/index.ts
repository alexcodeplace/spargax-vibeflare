#!/usr/bin/env node
import { defineCommand, runMain } from 'citty';
import chatCmd from './commands/chat.js';
import embedCmd from './commands/embed.js';
import sttCmd from './commands/stt.js';
import ttsCmd from './commands/tts.js';
import imgCmd from './commands/img.js';
import visionCmd from './commands/vision.js';
import modelsCmd from './commands/models.js';
import usageCmd from './commands/usage.js';
import keysCmd from './commands/keys.js';
import batchCmd from './commands/batch.js';
import cacheCmd from './commands/cache.js';
import loginCmd from './commands/login.js';
import installCmd from './commands/install.js';
import doctorCmd from './commands/doctor.js';
import setupCmd from './commands/setup.js';
import deployCmd from './commands/deploy.js';
import statusCmd from './commands/status.js';
import updateCmd from './commands/update.js';
import uninstallCmd from './commands/uninstall.js';

const main = defineCommand({
  meta: {
    name: 'vf',
    version: '0.9.3',
    description: 'VibeFlare CLI — self-hosted Workers AI gateway',
  },
  args: {
    quiet: { type: 'boolean', alias: 'q', description: 'suppress stderr meta' },
    json: { type: 'boolean', description: 'output raw JSON' },
    'max-tokens': { type: 'string', description: 'max tokens (default 256)' },
    head: { type: 'string', description: 'truncate output to N bytes' },
  },
  subCommands: {
    chat: chatCmd,
    embed: embedCmd,
    stt: sttCmd,
    tts: ttsCmd,
    img: imgCmd,
    vision: visionCmd,
    models: modelsCmd,
    usage: usageCmd,
    keys: keysCmd,
    batch: batchCmd,
    cache: cacheCmd,
    login: loginCmd,
    install: installCmd,
    doctor: doctorCmd,
    setup: setupCmd,
    deploy: deployCmd,
    status: statusCmd,
    update: updateCmd,
    uninstall: uninstallCmd,
  },
  run() {
    const sub = process.argv[2];
    const subs = ['chat','embed','stt','tts','img','vision','models','usage','keys','batch','cache','login','install','doctor','setup','deploy','status','update','uninstall'];
    if (sub && subs.includes(sub)) return;
    console.log(`vf — VibeFlare CLI

usage: vf <cmd> [args]

cmds:
  chat <msg>               text gen        -m model -s sys -t temp --cache
  embed <txt>              embedding       -m model
  stt <file>               speech→text     -m model
  tts <txt>                text→speech     -m model -o file -v voice
  img <prompt>             image gen       -m model -o file -n N
  vision <img> <q>         vision QA       -m model
  models [task]            list models
  usage                    quota status
  keys ls|new|rm
  cache ls|clear
  batch                    jsonl pipe
  login <url>              configure
  install <platform>       install vibeflare on platform
  doctor                   health check: server + auth + quota
  setup                    first-run: provision, secrets, deploy
  status                   show install state + owned resources
  update                   migrate + deploy without recreating data
  deploy                   safely redeploy current release
  uninstall                preview or delete owned resources only

global: -q quiet  --json json out  --max-tokens N  --head N
        --cache  --system-id ID  --compress-history

env: VIBEFLARE_URL VIBEFLARE_KEY VIBEFLARE_MODEL
exit: 0 ok  1 err  2 quota  3 auth`);
  },
});

runMain(main);
