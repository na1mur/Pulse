#!/usr/bin/env node
// PreToolUse guard for Bash and PowerShell commands (docs/AGENTIC_SETUP.md A4.2).
// The vendored ECC parser (vendor/ecc/block-no-verify.js) parses the shell command,
// including subshells, prefixes like env/command/sudo, `bash -c` and heredocs, and:
//   - blocks git hook bypasses (--no-verify, -n clusters, core.hooksPath overrides)
//   - blocks destructive pushes (force, +refspec, delete, mirror) - Pulse extension
//   - reports every other git push, which this hook turns into an approval prompt
// For every parsed command, inspectCommand() below blocks recursive deletes that reach
// outside the repo or the temp directory or whose target cannot be determined, inline git
// aliases, and pushes it cannot see through (asks instead).
// This is a guardrail against mistakes, not a sandbox: deletes done by other programs
// (node -e, npx rimraf, .NET calls) are out of its reach.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const ecc = require('./vendor/ecc/block-no-verify');
const { runHook } = require('./lib/hook-io');

const IS_WINDOWS = process.platform === 'win32';
const PS_REMOVE = new Set(['remove-item', 'ri', 'rm', 'del', 'erase', 'rd', 'rmdir']);
const PS_RECURSE = /^-r(e(c(u(r(se?)?)?)?)?)?(:.*)?$/i;
const SH_RECURSE = /^(--recursive|-[a-zA-Z]*[rR][a-zA-Z]*)$/;
const SHELLS = new Set(['sh', 'bash', 'dash', 'zsh', 'ksh', 'pwsh', 'powershell']);
const WRAPPERS = new Set(['time', 'timeout', 'nice', 'nohup', 'busybox', 'stdbuf', 'ionice', 'doas', 'exec']);
const CHDIR = new Set(['cd', 'pushd', 'chdir', 'set-location', 'sl']);
const PUSH_ASK = 'git push sends commits to the remote; the owner approves every push.';

function commandName(word) {
  return path.basename(String(word).replace(/\\/g, '/')).toLowerCase().replace(/\.exe$/, '');
}

function longPath(p) {
  try {
    return fs.realpathSync.native(p);
  } catch {
    return p;
  }
}

// Git Bash spellings (/c/Users/..., /tmp/...) to native Windows paths.
function toNativePath(p) {
  if (!IS_WINDOWS) return p;
  const drive = /^\/([a-zA-Z])(?:\/(.*))?$/.exec(p);
  if (drive) return `${drive[1].toUpperCase()}:\\${(drive[2] || '').replace(/\//g, '\\')}`;
  if (p === '/tmp' || p.startsWith('/tmp/')) return path.join(os.tmpdir(), p.slice(4));
  return p;
}

function isInside(target, root, allowRoot) {
  const rel = path.relative(root, target);
  if (rel === '') return allowRoot;
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

// PowerShell does not treat backslash as an escape, so use the raw text minus quotes.
function wordText(word, ctx) {
  if (ctx.toolName !== 'PowerShell') return word.value;
  return word.raw.replace(/^(['"])([\s\S]*)\1$/, '$2');
}

function resolvePath(text, ctx) {
  return path.resolve(ctx.cwd, toNativePath(text.replace(/^~(?=$|[\\/])/, os.homedir())));
}

// allowRoot: the repo/temp root itself is a valid target (find deletes matches inside it, not the root).
function checkTargets(targetWords, ctx, what, allowRoot = false) {
  if (targetWords.length === 0) return `BLOCKED: ${what} without a literal target; the target cannot be checked.`;
  for (const word of targetWords) {
    const raw = wordText(word, ctx);
    if (word.dynamic) return `BLOCKED: ${what} of "${raw}". Use a literal path so the target can be checked.`;
    if (/\{[^}]*[,.][^}]*\}/.test(raw)) return `BLOCKED: ${what} with brace expansion "${raw}"; list the paths literally.`;
    const parts = ctx.toolName === 'PowerShell' ? raw.split(',').filter(Boolean) : [raw];
    for (const text of parts) {
      if (ctx.toolName === 'PowerShell' && /^[A-Za-z][A-Za-z0-9]+:/.test(text)) {
        return `BLOCKED: ${what} on the PowerShell provider path "${text}".`;
      }
      if (ctx.cwdUnknown && !path.isAbsolute(toNativePath(text))) {
        return `BLOCKED: ${what} of "${text}" after a directory change the guard cannot follow.`;
      }
      const target = resolvePath(text, ctx);
      if (!ctx.roots.some((root) => isInside(target, root, allowRoot))) {
        return `BLOCKED: ${what} of "${text}" (${target}) is outside the repo and the temp directory.`;
      }
    }
  }
  return null;
}

function stripWrappers(words) {
  let i = 0;
  while (i < words.length && WRAPPERS.has(commandName(words[i].value))) {
    const name = commandName(words[i].value);
    i++;
    while (i < words.length && words[i].value.startsWith('-')) i++;
    if ((name === 'timeout' || name === 'nice') && i < words.length && /^[\d.]+[smhd]?$/.test(words[i].value)) i++;
  }
  return words.slice(i);
}

function trackDirectoryChange(name, args, ctx) {
  const target = args.find((w) => !w.value.startsWith('-'));
  if (!target) ctx.cwd = os.homedir();
  else if (target.dynamic) ctx.cwdUnknown = true;
  else ctx.cwd = resolvePath(wordText(target, ctx), ctx);
}

function runsShellDelete(words) {
  return words.some((w, i) => SHELLS.has(commandName(w.value)) && words.slice(i + 1).some((a) => /\brm\b|remove-item/i.test(a.value)));
}

function inspectPowerShellDelete(words, ctx) {
  const at = words.findIndex((w) => PS_REMOVE.has(commandName(w.value)));
  if (at === -1) return null;
  const end = words.findIndex((w, i) => i > at && w.value === '}');
  const args = words.slice(at + 1, end === -1 ? undefined : end);
  if (args.some((w) => w.raw.includes('`'))) return 'BLOCKED: delete with backtick-escaped arguments cannot be checked.';
  if (!args.some((w) => PS_RECURSE.test(w.value))) return null;
  return checkTargets(args.filter((w) => !w.value.startsWith('-')), ctx, 'recursive delete');
}

// cmd.exe: `rd /s` / `rmdir /s` (directory trees) and `del /s` / `erase /s` (files in all subfolders).
// Git Bash spells switches `//s`; a quoted command string is split into its tokens.
function inspectCmd(args, ctx) {
  const tokens = args.flatMap((w) => wordText(w, ctx).split(/\s+/).filter(Boolean).map((value) => ({ ...w, value, raw: value })));
  const at = tokens.findIndex((t) => ['rd', 'rmdir', 'del', 'erase'].includes(t.value.toLowerCase()));
  if (at === -1 || !tokens.slice(at + 1).some((t) => /^\/{1,2}s$/i.test(t.value))) return null;
  return checkTargets(tokens.slice(at + 1).filter((t) => !t.value.startsWith('/')), ctx, 'recursive delete');
}

function inspectGit(args, ctx) {
  let i = 0;
  for (; i < args.length; i++) {
    const value = args[i].value;
    if (!value.startsWith('-')) break;
    if (value === '-c' && /^alias\./i.test(args[i + 1]?.value || '')) return 'BLOCKED: inline git aliases cannot be checked.';
    if (/^-c ?alias\./i.test(value)) return 'BLOCKED: inline git aliases cannot be checked.';
    if (['-c', '-C', '--git-dir', '--work-tree', '--namespace'].includes(value)) i++;
  }
  const sub = args[i];
  if (sub && sub.dynamic) {
    if (args.slice(i + 1).some((w) => /^(-[a-zA-Z]*f[a-zA-Z]*|--force.*)$/.test(w.value))) {
      return 'BLOCKED: git command with a variable subcommand and a force flag.';
    }
    ctx.ask = 'git with a variable subcommand may push; the owner approves it.';
  }
  return null;
}

function inspectCommand(rawWords, ctx) {
  const words = stripWrappers(rawWords);
  if (words.length === 0) return null;
  const name = commandName(words[0].value);
  const args = words.slice(1);

  if (CHDIR.has(name)) {
    trackDirectoryChange(name, args, ctx);
    return null;
  }
  if (name === 'git') return inspectGit(args, ctx);
  if (name === 'cmd') return inspectCmd(args, ctx); // before PowerShell: `cmd /c rd /s` is common there too
  if (ctx.toolName === 'PowerShell') {
    if (['start-process', 'saps', 'start'].includes(name) && args.some((w) => commandName(w.value) === 'git')) {
      const text = args.map((w) => wordText(w, ctx)).join(' ');
      if (/\bpush\b/.test(text)) {
        if (/(^|[\s,'"])(-f|--force[\w-]*)\b/.test(text)) return 'BLOCKED: destructive push through Start-Process.';
        ctx.ask = PUSH_ASK;
      }
    }
    return inspectPowerShellDelete(words, ctx);
  }
  if (name === 'rm') {
    if (!args.some((w) => SH_RECURSE.test(w.value))) return null;
    return checkTargets(args.filter((w) => !w.value.startsWith('-')), ctx, 'recursive delete');
  }
  if (name === 'powershell' || name === 'pwsh') {
    if (args.some((w) => /^-e(nc(odedcommand)?)?$/i.test(w.value))) return 'BLOCKED: encoded PowerShell commands cannot be checked.';
    const code = args.map((w) => w.value).join(' ');
    if (/\b(remove-item|ri|rm|del|erase|rd|rmdir)\b[^;|]*\s-r/i.test(code)) {
      return 'BLOCKED: recursive delete inside a nested PowerShell command; run it directly so the target can be checked.';
    }
    return null;
  }
  if (name === 'xargs') {
    if (args.some((w, i) => commandName(w.value) === 'rm' && args.slice(i + 1).some((a) => SH_RECURSE.test(a.value)))) {
      return 'BLOCKED: recursive delete through xargs; the targets cannot be checked.';
    }
    if (runsShellDelete(args)) return 'BLOCKED: xargs running a shell script that deletes; the targets cannot be checked.';
    return null;
  }
  if (name === 'find') {
    let i = 0;
    while (i < args.length && /^-(H|L|P|O\d*|D)$/.test(args[i].value)) i += args[i].value === '-D' ? 2 : 1;
    const starts = [];
    for (; i < args.length && !/^[-(!]/.test(args[i].value); i++) starts.push(args[i]);
    const execAt = args.findIndex((w) => /^-(exec|execdir|ok|okdir)$/.test(w.value));
    if (execAt !== -1 && runsShellDelete(args.slice(execAt + 1))) {
      return 'BLOCKED: find running a shell script that deletes; the targets cannot be checked.';
    }
    const deletes = args.some((w) => w.value === '-delete') || (execAt !== -1 && commandName(args[execAt + 1]?.value || '') === 'rm');
    if (!deletes) return null;
    const fromCwd = [{ value: '.', raw: '.', dynamic: false }];
    return checkTargets(starts.length ? starts : fromCwd, ctx, 'find with delete', true);
  }
  return null;
}

runHook('guard-bash', 1024 * 1024, (input, raw) => {
  const command = input.tool_input?.command;
  if (typeof command !== 'string') return null;

  const repoRoot = path.resolve(process.env.CLAUDE_PROJECT_DIR || path.join(__dirname, '..', '..'));
  const tmp = path.resolve(os.tmpdir());
  const ctx = {
    toolName: input.tool_name,
    cwd: toNativePath(input.cwd || process.cwd()),
    cwdUnknown: false,
    roots: [...new Set([repoRoot, longPath(repoRoot), tmp, longPath(tmp)])],
    ask: null,
  };

  ecc.setPulseInspector((words) => inspectCommand(words, ctx));
  const result = ecc.run(raw);
  if (result.exitCode === 2) return { decision: 'block', reason: result.stderr };
  if (ecc.pulseResult().sawPush) return { decision: 'ask', reason: PUSH_ASK };
  if (ctx.ask) return { decision: 'ask', reason: ctx.ask };
  return null;
});
