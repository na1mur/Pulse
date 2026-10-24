// Regression tests for the PreToolUse guards. Run: node --test .claude/hooks/guards.test.js
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..');

function runHook(script, payload) {
  const result = spawnSync(process.execPath, [path.join(__dirname, script)], {
    input: typeof payload === 'string' ? payload : JSON.stringify({ cwd: repoRoot, ...payload }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: repoRoot },
    encoding: 'utf8',
  });
  const asked = result.status === 0 && result.stdout.includes('"permissionDecision":"ask"');
  return { blocked: result.status === 2, asked, status: result.status, stderr: result.stderr, stdout: result.stdout };
}

const bash = (command) => runHook('guard-bash.js', { tool_name: 'Bash', tool_input: { command } });
const ps = (command) => runHook('guard-bash.js', { tool_name: 'PowerShell', tool_input: { command } });
const edit = (file_path, tool_name = 'Edit') => runHook('guard-edit.js', { tool_name, tool_input: { file_path } });

function assertAllowed(r, label) {
  assert.strictEqual(r.status, 0, `${label} -> ${r.stderr}`);
  assert.strictEqual(r.stdout, '', `${label} must allow silently`);
}

test('allows ordinary commands silently', () => {
  for (const cmd of [
    'git status --short',
    'git commit -m "Add the timer."',
    'git commit -m "Explain why git push -f is banned."',
    'git commit -m "Fix rm -rf ../x handling"',
    "git commit -q -F - <<'EOF'\nAdd guards.\n\ngit push -f and rm -rf / are blocked.\nEOF",
    'echo "never rm -rf /"',
    'pnpm test',
    'cargo test -p core',
    'rm -rf node_modules',
    'rm -rf ./target dist',
    'rm -rf target > /dev/null',
    'rm -rf /tmp/pulse-x',
    `rm -rf "${path.join(os.tmpdir(), 'pulse scratch')}"`,
    'rm notes.txt',
    'find . -name "*.log" -delete',
    'for d in a b; do echo "$d"; done && git status --short',
    'gh pr create --title "Guards" --body "Blocks git push --force and rm -rf /"',
    'node script.js "rm -rf / is bad; git stuff"',
    'cd target && rm -rf debug',
    'time rm -rf ./dist',
  ]) {
    assertAllowed(bash(cmd), cmd);
  }
  if (process.platform === 'win32') {
    const shortTemp = os.tmpdir(); // often an 8.3 name like C:\Users\NAIMUR~1\...
    assertAllowed(bash(`rm -rf "${path.join(shortTemp, 'pulse-x')}"`), '8.3 temp path');
  }
});

test('allows Git Bash drive paths inside the repo', () => {
  if (process.platform !== 'win32') return;
  const drive = repoRoot[0].toLowerCase();
  const gitBashRepo = `/${drive}/${repoRoot.slice(3).replace(/\\/g, '/')}`;
  assertAllowed(bash(`rm -rf "${gitBashRepo}/target"`), 'git bash repo path');
});

test('blocks hook bypasses anywhere in the command', () => {
  for (const cmd of [
    'git commit --no-verify -m x',
    'git commit -m "x" --no-verify',
    'git commit -anm x',
    'git -c core.hooksPath=/dev/null commit -m x',
    'cd app && git push --no-verify',
    'bash -c "git commit --no-verify -m x"',
  ]) {
    assert.ok(bash(cmd).blocked, cmd);
  }
});

test('blocks destructive pushes in any position or wrapper', () => {
  for (const cmd of [
    'git push --force',
    'git push origin main --force',
    'git push -f origin main',
    'git push origin main -uf',
    'git push --force-with-lease',
    'git push origin +main',
    'git push origin :old-branch',
    'git push --delete origin old',
    'git push --mirror',
    'git status && git push --force',
    '(git push --force)',
    '{ git push -f; }',
    'command git push -f',
    'env git push -f',
    'if true; then git push -f; fi',
    'true & git push --force',
    'bash -c "git push -f"',
  ]) {
    assert.ok(bash(cmd).blocked, cmd);
  }
});

test('asks for approval on every plain push, wherever it appears', () => {
  for (const cmd of ['git push', 'git push -u origin main', 'git status && git push', 'cd app && git push origin main', 'git -C app push', 'x=push; git $x']) {
    const r = bash(cmd);
    assert.ok(r.asked, `${cmd} -> status ${r.status} ${r.stderr}`);
  }
  const r = ps("Start-Process git -ArgumentList 'push'");
  assert.ok(r.asked, `Start-Process push -> status ${r.status} ${r.stderr}`);
});

test('blocks inline git aliases and pushes it cannot see through', () => {
  for (const cmd of ["git -c alias.p='push --force' p", 'x=push; git $x -f']) {
    assert.ok(bash(cmd).blocked, cmd);
  }
  assert.ok(ps("Start-Process git -ArgumentList 'push','-f'").blocked, 'Start-Process force push');
});

test('blocks recursive deletes outside the repo and temp dir', () => {
  for (const cmd of [
    'rm -rf /',
    'rm -rf ~',
    'rm -rf ~/Documents',
    'rm -rf ../other-project',
    'rm -rf "$HOME/x"',
    'rm -r -f /c/Users',
    'rm -rf "C:/Users/Some Person"',
    '(rm -rf /)',
    '\\rm -rf /',
    '"rm" -rf ~',
    'ls | xargs rm -rf',
    'find / -name x -exec rm -rf {} +',
    'find /c/Users -delete',
    'cmd //c rd /s /q C:\\Users',
    'cmd //c rd //s //q C:\\Users',
    'cmd /c "rd /s /q C:\\Users"',
    'powershell -c "Remove-Item -Recurse C:\\Users"',
    'cd /c/Users && rm -rf x',
    'cd .. && rm -rf Pulse-old',
    'pushd /c && rm -rf Windows',
    'cd "$SOMEWHERE" && rm -rf build',
    'time rm -rf /',
    'timeout 5 rm -rf /',
    'nice -n 10 rm -rf /',
    'nohup rm -rf / &',
    'busybox rm -rf /',
    'find -L / -delete',
    'rm -rf {/,x}',
    `find / -exec sh -c 'rm -rf "$1"' _ {} \\;`,
    "ls / | xargs -I{} sh -c 'rm -rf {}'",
    "cmd //c del //s //q 'C:\\Users\\*'",
  ]) {
    assert.ok(bash(cmd).blocked, cmd);
  }
  assert.ok(bash(`rm -rf "${repoRoot}"`).blocked, 'the repo root itself');
});

test('PowerShell: allows normal commands, blocks recursive deletes outside', () => {
  for (const cmd of ['git status', 'Get-ChildItem -Force', 'Get-ChildItem -Recurse | Where-Object { $_.Name -like "*.md" }', 'Remove-Item -Recurse -Force .\\target', 'cmd /c rd /s /q .\\target', 'cmd /c dir']) {
    assertAllowed(ps(cmd), cmd);
  }
  for (const cmd of [
    'Remove-Item -Recurse -Force C:\\Users',
    'Remove-Item -LiteralPath "C:\\Users\\Some Person" -Recurse',
    'Remove-Item C:\\Users -Recurse:$true',
    'rm -r ..\\other',
    'Remove-Item -Recurse $env:USERPROFILE\\x',
    'Get-ChildItem C:\\x | Remove-Item -Recurse',
    'Remove-Item C:\\Users -Re`curse',
    'Remove-Item -Recurse -Force .\\target,C:\\Users',
    'Get-ChildItem C:\\Users | % { rm $_.FullName -r -fo }',
    'Remove-Item -Recurse HKCU:\\Software\\X',
    'cmd /c rd /s /q C:\\Users',
    'cmd /c "rd /s /q C:\\Users"',
    'cmd.exe /c rmdir /s /q C:\\Users',
    'cmd /c del /s /q C:\\Users\\*',
  ]) {
    assert.ok(ps(cmd).blocked, cmd);
  }
});

test('malformed input is blocked, not crashed', () => {
  for (const payload of ['null', 'not json', '42']) {
    assert.strictEqual(runHook('guard-bash.js', payload).status, 2, payload);
    assert.strictEqual(runHook('guard-edit.js', payload).status, 2, payload);
  }
});

test('guard-edit allows normal files, templates, new linter configs and the guards themselves', () => {
  for (const f of [
    'src/main.ts',
    'docs/FE_GUIDE.md',
    '.env.example',
    '.env.sample',
    '.env.template',
    '.env.local.example',
    'id_ed25519.pub',
    path.join(repoRoot, 'eslint.config.mjs'),
    path.join(__dirname, 'guard-edit.js'),
    path.join(__dirname, 'guards.test.js'),
  ]) {
    assertAllowed(edit(f), f);
  }
  for (const tool of ['Write', 'MultiEdit', 'NotebookEdit']) assertAllowed(edit('src/a.ts', tool), tool);
});

test('guard-edit blocks every secret sample, signing material and generated files', () => {
  const { SAMPLES } = require('./lib/secrets');
  for (const f of [...SAMPLES.map((s) => `some/dir/${s}`), 'packages/contract/generated/client.ts']) {
    assert.ok(edit(f).blocked, f);
  }
  assert.ok(edit('android/release.jks', 'Write').blocked, 'Write tool');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-guard-'));
  try {
    const generated = path.join(dir, 'client.ts');
    fs.writeFileSync(generated, '// @generated by the contract build. Do not edit.\nexport {};\n');
    assert.ok(edit(generated).blocked, 'file with @generated header');
    const mentions = path.join(dir, 'notes.ts');
    fs.writeFileSync(mentions, 'const marker = "@generated";\n');
    assertAllowed(edit(mentions), 'file that only mentions the marker');
    const prettier = path.join(dir, '.prettierrc');
    fs.writeFileSync(prettier, '{}\n');
    assert.ok(edit(prettier).blocked, 'existing linter config');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('settings Read deny rules cover every secret sample (no drift between the two lists)', () => {
  const { SAMPLES } = require('./lib/secrets');
  const settings = JSON.parse(fs.readFileSync(path.join(repoRoot, '.claude', 'settings.json'), 'utf8'));
  const globs = settings.permissions.deny
    .map((rule) => /^Read\((.+)\)$/.exec(rule)?.[1])
    .filter(Boolean)
    .map((glob) => new RegExp('^' + glob
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*\//g, '\u0001')
      .replace(/\*\*/g, '\u0002')
      .replace(/\*/g, '[^/]*')
      .replace(/\u0001/g, '(?:.*/)?')
      .replace(/\u0002/g, '.*') + '$'));
  for (const sample of SAMPLES) {
    const file = `some/dir/${sample}`;
    assert.ok(globs.some((re) => re.test(file)), `no Read deny rule covers ${file}`);
  }
});
