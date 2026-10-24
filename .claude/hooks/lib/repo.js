// Repo helpers for Pulse's informational hooks (SessionStart brief, Stop reminder).
// Unlike lib/hook-io.js, which fails closed for PreToolUse guards, these helpers fail quiet:
// an informational hook must never block a session because git or a doc is unavailable.
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(process.env.CLAUDE_PROJECT_DIR || path.join(__dirname, '..', '..', '..'));

function readLines(file) {
  try {
    return fs.readFileSync(path.join(root, file), 'utf8').split(/\r?\n/);
  } catch {
    return [];
  }
}

// Returns stdout, or '' when git fails (no repo, no commits, git missing).
function git(args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return '';
  }
}

module.exports = { root, readLines, git };
