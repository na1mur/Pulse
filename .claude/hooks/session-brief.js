#!/usr/bin/env node
// SessionStart hook (docs/AGENTIC_SETUP.md A0.6/A4.4): prints a short "where are we" brief that
// Claude Code adds to the session context, generated from the repo so it never goes stale:
// current milestone and next spec task, unfinished tasks, open spec decisions, open design
// questions, setup progress, uncommitted changes, recent commits, where to look things up.
// Never fails the session: any error just prints less.
'use strict';

const { readLines, git } = require('./lib/repo');

const SPEC = 'docs/REBUILD_SPEC.md';

function ledger() {
  const rows = readLines('docs/tasks/LEDGER.md')
    .filter((l) => /^\| T\d+\.\d+ \|/.test(l))
    .map((l) => l.split('|').map((c) => c.trim()));
  return new Map(rows.map((cells) => [cells[1], { status: cells[2], note: cells[4] || '' }]));
}

// Spec section 12 tasks in order, each with its milestone (from the "### 12.x Mn - ..." headings).
function specTasks() {
  const tasks = [];
  let milestone = null;
  for (const line of readLines(SPEC)) {
    const heading = /^### 12\.\d+ (M\d+ - [^(]+)/.exec(line);
    if (heading) milestone = heading[1].trim();
    else if (/^## 13\./.test(line)) break;
    const task = /^\| (T\d+\.\d+) \| ([^|]+)\|/.exec(line);
    if (task && milestone) tasks.push({ id: task[1], title: task[2].trim(), milestone });
  }
  return tasks;
}

function openDecisions() {
  const lines = readLines(SPEC);
  const start = lines.findIndex((l) => /^## 13\./.test(l));
  if (start === -1) return [];
  const ids = [];
  for (const line of lines.slice(start + 1)) {
    if (/^## /.test(line)) break;
    const row = /^\| (D-\d+) \|/.exec(line);
    if (row && !/\*\*Decided/.test(line)) ids.push(row[1]);
  }
  return ids;
}

function openDesignQuestions() {
  const lines = readLines('docs/FE_GUIDE.md');
  const start = lines.findIndex((l) => /^## \d+\. Open questions/.test(l));
  if (start === -1) return null;
  const section = lines[start].match(/^## (\d+)\./)[1];
  const count = lines.slice(start + 1).filter((l) => /^\| (?!Question|---)/.test(l)).length;
  return count ? `Open design questions for the owner: ${count} (docs/FE_GUIDE.md section ${section}).` : null;
}

function setupProgress() {
  const items = readLines('docs/AGENTIC_SETUP.md').filter((l) => /^- \[[ x~]\] \*\*A\d+\.\d+/.test(l));
  const count = (mark) => items.filter((l) => l.startsWith(`- [${mark}]`)).length;
  return `Agentic setup: ${count('x')} done, ${count('~')} partial, ${count(' ')} open (docs/AGENTIC_SETUP.md).`;
}

const out = ['Pulse session brief (generated):'];
const done = ledger();
const pending = specTasks().filter((t) => done.get(t.id)?.status !== 'done');
if (pending.length) {
  const next = pending.find((t) => !done.has(t.id));
  out.push(`Milestone: ${pending[0].milestone}.${next ? ` Next spec task not started: ${next.id} ${next.title.slice(0, 70)}.` : ''}`);
}
const unfinished = [...done].filter(([, row]) => row.status !== 'done').map(([id, row]) => `${id} ${row.status}`);
if (unfinished.length) out.push(`Unfinished tasks: ${unfinished.join(', ')} (notes in docs/tasks/LEDGER.md).`);
const decisions = openDecisions();
if (decisions.length) out.push(`Open spec decisions: ${decisions.join(', ')} (spec section 13; node scripts/spec.mjs <D-id>).`);
const questions = openDesignQuestions();
if (questions) out.push(questions);
out.push(setupProgress());
const changes = git(['status', '--porcelain']).split('\n').filter(Boolean).length;
if (changes) out.push(`Uncommitted changes: ${changes} files.`);
const recent = git(['log', '-3', '--format=%h %s']).trim();
if (recent) out.push(`Recent commits:\n${recent.split('\n').map((l) => `  ${l.slice(0, 110)}`).join('\n')}`);
out.push('Find anything: docs/knowledge/INDEX.md; spec rows: node scripts/spec.mjs <ID>.');
process.stdout.write(out.join('\n') + '\n');
