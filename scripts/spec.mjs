#!/usr/bin/env node
// Print only the parts of the planning docs a task needs, instead of reading whole files.
//
//   node scripts/spec.mjs R-42 T1.4 TIM-01       table rows by ID (with their table header)
//   node scripts/spec.mjs R-37..R-39 T1.1..T1.3  ranges
//   node scripts/spec.mjs TIM-01/02/03 MOB-*     the spec's slash lists and wildcards
//   node scripts/spec.mjs 8.3 "§12.4"            a section, up to the next heading of the same level
//   node scripts/spec.mjs A1.7                   a checklist item from docs/AGENTIC_SETUP.md
//   node scripts/spec.mjs FE-003                 a decision-log row from docs/FE_GUIDE.md
//   node scripts/spec.mjs --task T1.4            a task row plus every row and section it cites
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cache = new Map();
function read(file, required = false) {
  if (!cache.has(file)) {
    const path = join(root, file);
    cache.set(file, existsSync(path) ? readFileSync(path, 'utf8').split(/\r?\n/) : null);
  }
  if (required && !cache.get(file)) {
    console.error(`missing file: ${file}`);
    process.exit(2);
  }
  return cache.get(file);
}

const SPEC = 'docs/REBUILD_SPEC.md';
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// R-8 and R-08 name the same rule.
const sameId = (a, b) => a.replace(/-0+(\d)/, '-$1') === b.replace(/-0+(\d)/, '-$1');

// "T1.1..T1.3", "R-8..R-10", "A1.2..A1.4" -> list of IDs. Padding is kept only when the
// first number is zero-padded (R-01..R-05).
function expandRange(arg) {
  const m = /^([A-Za-z]+-?(?:\d+\.)?)(\d+)\.\.([A-Za-z]+-?(?:\d+\.)?)?(\d+)$/.exec(arg);
  if (!m) {
    if (arg.includes('..')) throw new Error(`unsupported range: ${arg} (write both ends in full, e.g. T1.1..T1.3)`);
    return null;
  }
  const [, prefix, from, endPrefix, to] = m;
  if (endPrefix && endPrefix !== prefix) throw new Error(`range ends do not match: ${arg}`);
  const width = from.startsWith('0') ? from.length : 0;
  const ids = [];
  for (let n = Number(from); n <= Number(to); n++) ids.push(prefix + String(n).padStart(width, '0'));
  if (ids.length === 0) throw new Error(`empty range: ${arg}`);
  return ids;
}

// "TIM-01/02/03/06" -> TIM-01, TIM-02, TIM-03, TIM-06
function expandSlashes(arg) {
  const m = /^([A-Z]+-)(\d+(?:\/\d+)+)$/.exec(arg);
  return m ? m[2].split('/').map((n) => m[1] + n) : null;
}

function expand(arg) {
  return expandRange(arg) || expandSlashes(arg) || [arg];
}

function tableHeader(lines, i) {
  let start = i;
  while (start > 0 && lines[start - 1].startsWith('|')) start--;
  return lines.slice(start, start + 2).join('\n');
}

function rows(file, match) {
  const lines = read(file);
  if (!lines) return null;
  const hits = [];
  lines.forEach((line, i) => {
    const id = /^\| ([^|]+?) \|/.exec(line)?.[1];
    if (id && match(id)) hits.push(`${tableHeader(lines, i)}\n${line}`);
  });
  return hits.length ? hits.join('\n\n') : null;
}

function section(number) {
  const lines = read(SPEC, true);
  const i = lines.findIndex((line) => new RegExp(`^#{2,4} ${escape(number)}[ .]`).test(line));
  if (i === -1) return null;
  const level = lines[i].match(/^#+/)[0].length;
  let end = i + 1;
  while (end < lines.length && !(/^#+ /.test(lines[end]) && lines[end].match(/^#+/)[0].length <= level)) end++;
  return lines.slice(i, end).join('\n').replace(/\n+---\s*$/, '').trim();
}

function checklistItem(id) {
  const lines = read('docs/AGENTIC_SETUP.md');
  if (!lines) return null;
  const i = lines.findIndex((line) => /^- \[/.test(line) && line.includes(`**${id} `));
  if (i === -1) return null;
  let end = i + 1;
  while (end < lines.length && /^\s{2,}\S/.test(lines[end])) end++;
  return lines.slice(i, end).join('\n');
}

// One handler per argument shape; the first that matches wins.
const HANDLERS = [
  [/^§?\d+(\.\d+)*$/, (arg) => section(arg.replace('§', ''))],
  [/^A\d+\.\d+$/, checklistItem],
  [/^FE-\d+$/, (arg) => rows('docs/FE_GUIDE.md', (id) => sameId(id, arg))],
  [/^[A-Z]+-\*$/, (arg) => rows(SPEC, (id) => id.startsWith(arg.slice(0, -1)))],
  [/./, (arg) => rows(SPEC, (id) => sameId(id, arg))],
];
read(SPEC, true); // fail early and clearly if the spec is missing

function lookup(arg) {
  const [, handler] = HANDLERS.find(([re]) => re.test(arg));
  return handler(arg);
}

// IDs and sections cited in a task row: the "Features / rules" cell (prose skipped) plus
// "section N" mentions in the task text (e.g. T0.1 cites sections 11 and 13).
function citedBy(taskId) {
  const line = read(SPEC).find((l) => l.startsWith(`| ${taskId} |`));
  if (!line) return null;
  const cells = line.split('|').map((c) => c.trim());
  const cited = (cells[5] || '') // | ID | Task | WS | Deps | Features / rules | Done when |
    .split(/[,\s]+/)
    .filter((t) => /^(§\d+(\.\d+)*|[A-Z]+-[\d*][\d/.*]*|R-\d+\.\.R-\d+)$/.test(t));
  const sections = [...(cells[2] || '').matchAll(/section (\d+(?:\.\d+)*)/g)].map((m) => m[1]);
  return [...new Set([...cited, ...sections])];
}

let args = process.argv.slice(2);
if (args[0] === '--task') {
  const task = args[1];
  const cited = task && citedBy(task);
  if (!cited) {
    console.error(`not found: task ${task ?? '(missing)'}`);
    process.exit(1);
  }
  args = [task, ...cited];
}
if (args.length === 0) {
  console.error('usage: node scripts/spec.mjs [--task T1.4] <ID | ID..ID | TIM-01/02 | MOB-* | section | A-item | FE-NNN> ...');
  process.exit(1);
}

let missing = 0;
for (const arg of args) {
  let ids;
  try {
    ids = expand(arg);
  } catch (error) {
    console.error(error.message);
    missing++;
    continue;
  }
  for (const id of ids) {
    const out = lookup(id);
    if (out) console.log(`${out}\n`);
    else {
      console.error(`not found: ${id}`);
      missing++;
    }
  }
}
process.exit(missing ? 1 : 0);
