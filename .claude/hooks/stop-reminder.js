#!/usr/bin/env node
// Stop hook (docs/AGENTIC_SETUP.md A4.5): when Claude is about to stop with uncommitted changes,
// nudge it once to run the auto-commit gate or say why the work is not ready. It nudges once per
// new set of uncommitted changes (never twice for the same set) and never loops. It does not
// know whether the gate already ran; the nudge asks Claude to say so. Never blocks on its own errors.
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { root, git } = require('./lib/repo');

function main(input) {
  if (input.stop_hook_active) return null; // already continuing because of a stop hook
  const status = git(['status', '--porcelain']).trim();
  if (!status) return null;

  const fingerprint = crypto.createHash('sha256').update(status + git(['diff', 'HEAD', '--stat'])).digest('hex');
  const projectKey = crypto.createHash('sha256').update(root).digest('hex').slice(0, 12);
  const marker = path.join(os.tmpdir(), `pulse-stop-reminder-${projectKey}`);
  let last = '';
  try {
    last = fs.readFileSync(marker, 'utf8');
  } catch {
    // first nudge for this project
  }
  if (last === fingerprint) return null;
  fs.writeFileSync(marker, fingerprint);

  const files = status.split('\n').length;
  return {
    decision: 'block',
    reason:
      `There are ${files} uncommitted file(s). If this unit of work is finished, run the auto-commit skill now. ` +
      'If it is not (mid-task, or waiting for the owner), say so in one line and stop.',
  };
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  raw += chunk;
});
process.stdin.on('end', () => {
  try {
    const result = main(raw.trim() ? JSON.parse(raw) : {});
    if (result) process.stdout.write(JSON.stringify(result));
  } catch {
    // never block stopping because of a reminder failure
  }
  process.exit(0);
});
