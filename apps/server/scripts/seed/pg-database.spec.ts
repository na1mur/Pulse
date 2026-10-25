import { describe, expect, it } from 'vitest';
import { createSeedDatabase, type QueryClient } from './pg-database.ts';

/** Records every statement; `failOn` makes the matching statement reject. */
const fakeClient = (failOn: Record<string, Error> = {}) => {
  const statements: string[] = [];
  const client: QueryClient = {
    query: (sql) => {
      statements.push(sql);
      const failure = failOn[sql];
      return failure === undefined ? Promise.resolve({ rows: [] }) : Promise.reject(failure);
    },
    end: () => Promise.resolve(),
  };
  return { client, statements };
};

describe('createSeedDatabase transaction', () => {
  it('commits when the work succeeds', async () => {
    const { client, statements } = fakeClient();

    const value = await createSeedDatabase(client, () => undefined).transaction(async (tx) => {
      await tx.query('select 1');
      return 'done';
    });

    expect(value).toBe('done');
    expect(statements).toEqual(['begin', 'select 1', 'commit']);
  });

  it('rolls back and rethrows the work error when the work fails', async () => {
    const { client, statements } = fakeClient();
    const original = new Error('seed failed');

    const result = createSeedDatabase(client, () => undefined).transaction(() =>
      Promise.reject(original),
    );

    await expect(result).rejects.toBe(original);
    expect(statements).toEqual(['begin', 'rollback']);
  });

  it('reports the seed error, not the rollback error, when rollback fails too', async () => {
    const { client } = fakeClient({ rollback: new Error('connection terminated') });
    const original = new Error('seed failed');
    const warnings: string[] = [];

    const result = createSeedDatabase(client, (line) => warnings.push(line)).transaction(() =>
      Promise.reject(original),
    );

    await expect(result).rejects.toBe(original);
    expect(warnings).toEqual(['rollback also failed: connection terminated']);
  });
});
