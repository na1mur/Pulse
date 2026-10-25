import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { errorCode } from './seed-failure.ts';
import {
  SeedFileNameError,
  orderSeedFiles,
  type SeedContext,
  type SeedFile,
} from './seed-runner.ts';

/**
 * Reads the seed folder into runnable files, in name order. README.md and dotfiles are ignored;
 * anything else that is not NNN-name.sql / NNN-name.ts (including a folder) is an error so a typo
 * never silently skips a seed. A missing folder means no seeds.
 */
export async function loadSeedFiles(dir: string): Promise<SeedFile[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (isMissing(error)) {
      return [];
    }
    throw error;
  }

  const files: SeedFile[] = [];
  for (const entry of entries) {
    if (entry.name === 'README.md' || entry.name.startsWith('.')) {
      continue;
    }
    if (!entry.isFile()) {
      throw new SeedFileNameError(`"${entry.name}" in the seed folder is not a file.`);
    }
    files.push(seedFileAt(join(dir, entry.name), entry.name));
  }
  return orderSeedFiles(files);
}

function seedFileAt(path: string, name: string): SeedFile {
  if (name.endsWith('.sql')) {
    // One multi-statement query: pg's simple query protocol, which is what runs when there are no
    // parameters, accepts several statements, so seed authors write plain SQL files.
    return {
      name,
      apply: async (tx) => {
        await tx.query(await readFile(path, 'utf8'));
      },
    };
  }
  return { name, apply: (tx) => runModule(path, name, tx) };
}

async function runModule(path: string, name: string, tx: SeedContext): Promise<void> {
  const loaded = (await import(pathToFileURL(path).href)) as { default?: unknown };
  if (typeof loaded.default !== 'function') {
    throw new TypeError(`${name} must export a default function (tx) => Promise<void>.`);
  }
  await (loaded.default as (tx: SeedContext) => Promise<void> | void)(tx);
}

function isMissing(error: unknown): boolean {
  return errorCode(error) === 'ENOENT';
}
