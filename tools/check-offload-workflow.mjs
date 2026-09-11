#!/usr/bin/env node
// check-offload-workflow.mjs — executable contract for a self-hosted-offload workflow.
// audience: AI coding agents first. Invoke BY PATH as the local handoff gate on any PR that adds or
// edits a workflow which runs on a self-hosted runner.
//
// WHY THIS EXISTS: the commit-time security band has no detector for workflow YAML, so it reports
// "no applicable detector — NOT a security clean" and the file ships unscanned. The two risk classes
// that actually matter for these files are mechanical and therefore checkable:
//   1. fork-PR execution on a self-hosted runner (RCE from an untrusted fork)
//   2. untrusted-input interpolation into a run: block (command injection)
// A hand review catches both once; this catches them on every future edit.
//
// usage: check-offload-workflow.mjs <workflow.yml> [...]
// exit 0 = all checks pass. exit 1 = a violation, printed with file and job name.

import { readFileSync } from 'node:fs';
import process from 'node:process';

// Event payload fields an attacker can set. Interpolating any of these into a shell command is
// injection; they must reach the step through env: instead, where the value is never re-parsed.
const UNTRUSTED = [
  'github.event.issue.title', 'github.event.issue.body',
  'github.event.pull_request.title', 'github.event.pull_request.body',
  'github.event.pull_request.head.ref', 'github.event.pull_request.head.label',
  'github.event.pull_request.head.repo.default_branch',
  'github.event.comment.body', 'github.event.review.body', 'github.event.review_comment.body',
  'github.event.head_commit.message', 'github.event.head_commit.author.name',
  'github.event.head_commit.author.email',
  'github.event.commits', 'github.event.pages', 'github.event.client_payload',
  'github.head_ref',
];

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('usage: check-offload-workflow.mjs <workflow.yml> [...]');
  process.exit(1);
}

const violations = [];

// A dependency-free reader for the handful of shapes this check needs. Pulling in a YAML parser
// would make the gate itself an install step, which is the opposite of a fast handoff check.
function jobBlocks(text) {
  const lines = text.split('\n');
  const jobsAt = lines.findIndex((l) => /^jobs:\s*$/.test(l));
  if (jobsAt === -1) return [];
  const blocks = [];
  let current = null;
  for (const line of lines.slice(jobsAt + 1)) {
    const header = line.match(/^ {2}([A-Za-z0-9_-]+):\s*$/);
    if (header) {
      if (current) blocks.push(current);
      current = { name: header[1], body: [] };
      continue;
    }
    if (current) current.body.push(line);
  }
  if (current) blocks.push(current);
  return blocks.map((b) => ({ name: b.name, body: b.body.join('\n') }));
}

for (const file of files) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch (err) {
    violations.push(`${file}: cannot read — ${err.message}`);
    continue;
  }

  const triggeredByPullRequest = /^on:/m.test(text) && /^\s{2}pull_request:/m.test(text);

  for (const job of jobBlocks(text)) {
    const selfHosted = /runs-on:.*self-hosted/.test(job.body);

    if (triggeredByPullRequest && selfHosted) {
      const guarded = job.body.includes('github.event.pull_request.head.repo.full_name')
        && job.body.includes('github.repository');
      if (!guarded) {
        violations.push(
          `${file}: job '${job.name}' runs on a self-hosted runner for a pull_request event without a `
          + "fork guard — add: if: github.event.pull_request.head.repo.full_name == github.repository",
        );
      }
    }

    // Only run: bodies matter. An untrusted value in env: or in an if: condition is compared, not
    // executed by a shell, so flagging those would be noise that trains people to ignore the gate.
    for (const step of job.body.split(/^\s*- /m)) {
      const runs = step.match(/run:[\s\S]*?(?=\n\s{6}[a-z-]+:|$)/);
      if (!runs) continue;
      for (const field of UNTRUSTED) {
        if (new RegExp(`\\$\\{\\{[^}]*${field.replace(/\./g, '\\.')}`).test(runs[0])) {
          violations.push(
            `${file}: job '${job.name}' interpolates ${field} into a run: block — pass it through `
            + 'env: and reference it as "$VAR" instead',
          );
        }
      }
    }
  }
}

if (violations.length > 0) {
  for (const v of violations) console.error(`check-offload-workflow: ${v}`);
  process.exit(1);
}

console.log(`check-offload-workflow: ${files.length} workflow(s) pass`);
