#!/usr/bin/env node
// PreToolUse guard for file-writing tools (docs/AGENTIC_SETUP.md A4.3).
// Blocks, with the reason on stderr:
//   - secrets and signing material (.env files, keystores, certificates, private keys, secrets/)
//   - generated files: anything under a `generated/` folder, or a file whose header has
//     an @generated comment line. Edit the source (e.g. the contract schema) and regenerate.
//   - edits to existing linter/formatter configs, via vendored ECC config-protection
// Edits to the guards and settings themselves are not blocked here; settings "ask" rules
// make them prompt the owner.
'use strict';

const fs = require('fs');
const { run: checkLinterConfig } = require('./vendor/ecc/config-protection');
const { runHook } = require('./lib/hook-io');
const { isSecret } = require('./lib/secrets');

const GENERATED_HEADER = /^\s*(\/\/|#|\/\*+|\*|<!--|--)\s*@generated\b/m;

function isGenerated(filePath) {
  if (filePath.split(/[\\/]/).some((part) => part.toLowerCase() === 'generated')) return true;
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    const head = Buffer.alloc(1024);
    const bytes = fs.readSync(fd, head, 0, head.length, 0);
    return GENERATED_HEADER.test(head.subarray(0, bytes).toString('utf8'));
  } catch {
    return false; // new or unreadable file: nothing generated to protect
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

runHook('guard-edit', 8 * 1024 * 1024, (input) => {
  const filePath = input.tool_input?.file_path || input.tool_input?.notebook_path;
  if (typeof filePath !== 'string' || filePath === '') return null;

  if (isSecret(filePath)) {
    return { decision: 'block', reason: `BLOCKED: ${filePath} holds secrets or signing material; the agent never writes these. Ask the owner.` };
  }
  if (isGenerated(filePath)) {
    return { decision: 'block', reason: `BLOCKED: ${filePath} is generated. Edit its source (for example the contract schema) and regenerate.` };
  }
  const config = checkLinterConfig(input);
  return config.exitCode === 2 ? { decision: 'block', reason: config.stderr } : null;
});
