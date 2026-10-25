// The generator owns packages/contract/generated/: every file in it is one the generator writes.
// `check` compares without touching anything; `write` regenerates stale files and removes files it
// no longer writes, so a renamed or dropped output cannot linger and be read by mistake.
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  rmdirSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';

export const GENERATED_FOLDER = 'generated';

export interface SyncResult {
  /** Files whose content differs from the generated content, or that are missing. */
  stale: string[];
  /** Files under generated/ that the generator does not write. */
  extra: string[];
}

/** Every file under `folder`, as sorted paths relative to `root` with forward slashes. */
function filesUnder(root: string, folder: string): string[] {
  const path = join(root, folder);
  if (!existsSync(path)) return [];
  return readdirSync(path, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(root, join(entry.parentPath, entry.name)).replaceAll('\\', '/'))
    .sort();
}

function readOrNull(path: string): string | null {
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

/** Removes `folder` and its empty parents up to (not including) generated/ itself. */
function removeEmptyFolders(root: string, folder: string): void {
  let current = join(root, folder);
  const top = join(root, GENERATED_FOLDER);
  while (current.startsWith(top) && current !== top && readdirSync(current).length === 0) {
    rmdirSync(current);
    current = dirname(current);
  }
}

export function syncGeneratedFolder(
  root: string,
  files: readonly [string, string][],
  mode: 'check' | 'write',
): SyncResult {
  const expected = new Set(files.map(([path]) => path));
  const stale = files
    .filter(([path, content]) => readOrNull(join(root, path)) !== content)
    .map(([path]) => path);
  const extra = filesUnder(root, GENERATED_FOLDER).filter((path) => !expected.has(path));
  if (mode === 'write') {
    for (const [path, content] of files.filter(([path]) => stale.includes(path))) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), content);
    }
    for (const path of extra) {
      rmSync(join(root, path));
      removeEmptyFolders(root, dirname(path));
    }
  }
  return { stale, extra };
}
