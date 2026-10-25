import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadSeedFiles } from './seed-files.ts';
import { SeedFileNameError, type SeedContext } from './seed-runner.ts';

describe('loadSeedFiles', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'pulse-seed-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const recorder = () => {
    const queries: { sql: string; params: readonly unknown[] | undefined }[] = [];
    const tx: SeedContext = {
      query: (sql, params) => {
        queries.push({ sql, params });
        return Promise.resolve({ rows: [] });
      },
    };
    return { tx, queries };
  };

  it('returns an empty list for a folder that holds only the README and dotfiles', async () => {
    await writeFile(join(dir, 'README.md'), '# Seeds');
    await writeFile(join(dir, '.gitkeep'), '');

    await expect(loadSeedFiles(dir)).resolves.toEqual([]);
  });

  it('returns an empty list when the folder does not exist', async () => {
    await expect(loadSeedFiles(join(dir, 'missing'))).resolves.toEqual([]);
  });

  it('lists seed files in name order', async () => {
    await writeFile(join(dir, '010-b.sql'), 'select 1');
    await writeFile(join(dir, '002-a.sql'), 'select 1');
    await writeFile(join(dir, '001-first.ts'), 'export default () => undefined;');

    const files = await loadSeedFiles(dir);

    expect(files.map((file) => file.name)).toEqual(['001-first.ts', '002-a.sql', '010-b.sql']);
  });

  it('sends a .sql file to the database as one multi-statement query', async () => {
    const sql = 'insert into t values (1);\ninsert into t values (2);\n';
    await writeFile(join(dir, '001-rows.sql'), sql);
    const { tx, queries } = recorder();

    const [file] = await loadSeedFiles(dir);
    await file?.apply(tx);

    expect(queries).toEqual([{ sql, params: undefined }]);
  });

  it('runs a .ts file by calling its default export with the transaction', async () => {
    await writeFile(
      join(dir, '001-code.ts'),
      [
        'export default async (tx: { query(sql: string, params?: readonly unknown[]): Promise<unknown> }) => {',
        "  await tx.query('select $1', ['from ts']);",
        '};',
      ].join('\n'),
    );
    const { tx, queries } = recorder();

    const [file] = await loadSeedFiles(dir);
    await file?.apply(tx);

    expect(queries).toEqual([{ sql: 'select $1', params: ['from ts'] }]);
  });

  it('fails a .ts file without a default function export, naming the file', async () => {
    await writeFile(join(dir, '001-bad.ts'), 'export const seed = 1;');
    const { tx } = recorder();

    const [file] = await loadSeedFiles(dir);

    await expect(file?.apply(tx)).rejects.toThrow(/001-bad\.ts.*default/s);
  });

  it('rejects a misnamed file and a sub-folder instead of skipping them', async () => {
    await writeFile(join(dir, 'seed-me.sql'), 'select 1');
    await expect(loadSeedFiles(dir)).rejects.toThrow(SeedFileNameError);

    await rm(join(dir, 'seed-me.sql'));
    await mkdir(join(dir, '001-folder.sql'));
    await expect(loadSeedFiles(dir)).rejects.toThrow(SeedFileNameError);
  });
});
