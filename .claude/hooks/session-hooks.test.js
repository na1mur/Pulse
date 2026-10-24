// Tests for the SessionStart brief and the Stop reminder. Run: node --test .claude/hooks/session-hooks.test.js
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..');

function run(script, input, projectDir) {
  return spawnSync(process.execPath, [path.join(__dirname, script)], {
    input,
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
    encoding: 'utf8',
  });
}

test('session brief summarises the repo in a few lines and exits 0', () => {
  const r = run('session-brief.js', '{}', repoRoot);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /^Pulse session brief/);
  assert.match(r.stdout, /Milestone: M\d+ - /);
  assert.match(r.stdout, /Next spec task not started: T\d+\.\d+/);
  assert.match(r.stdout, /Open spec decisions: D-\d+/);
  assert.doesNotMatch(r.stdout, /D-19|D-20/, 'decided decisions are not listed as open');
  assert.match(r.stdout, /Agentic setup: \d+ done/);
  assert.ok(r.stdout.split('\n').length <= 20, 'brief stays short');
});

test('session brief survives a directory without the docs', () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-brief-'));
  try {
    const r = run('session-brief.js', '{}', empty);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.match(r.stdout, /Agentic setup: 0 done/);
  } finally {
    fs.rmSync(empty, { recursive: true, force: true });
  }
});

test('stop reminder nudges once per distinct set of changes, never when clean or already continuing', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-stop-'));
  const git = (...args) => execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
  try {
    git('init', '-q');
    git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init');

    assert.strictEqual(run('stop-reminder.js', '{}', repo).stdout, '', 'clean tree: silent');

    fs.writeFileSync(path.join(repo, 'a.txt'), 'one');
    const first = run('stop-reminder.js', '{}', repo);
    assert.strictEqual(first.status, 0);
    assert.strictEqual(JSON.parse(first.stdout).decision, 'block', 'first stop with changes: nudge');

    assert.strictEqual(run('stop-reminder.js', '{}', repo).stdout, '', 'same changes: no second nudge');
    assert.strictEqual(run('stop-reminder.js', '{"stop_hook_active":true}', repo).stdout, '', 'already continuing: silent');

    fs.writeFileSync(path.join(repo, 'b.txt'), 'two');
    assert.strictEqual(JSON.parse(run('stop-reminder.js', '{}', repo).stdout).decision, 'block', 'new changes: nudge again');

    assert.strictEqual(run('stop-reminder.js', 'not json', repo).status, 0, 'bad input never blocks');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
    const key = require('node:crypto').createHash('sha256').update(path.resolve(repo)).digest('hex').slice(0, 12);
    fs.rmSync(path.join(os.tmpdir(), `pulse-stop-reminder-${key}`), { force: true });
  }
});
