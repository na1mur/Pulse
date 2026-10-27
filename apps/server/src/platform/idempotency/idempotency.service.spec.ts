// R-34: a command runs once per user and command ID, and a replay returns the stored result.
// Real PostgreSQL: the guarantee is the primary key, not application code.
import { randomUUID } from 'node:crypto';
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestDatabase,
  databaseTestsSkipped,
  type TestDatabase,
} from '../database/test-database.testing.js';
import type { Database } from '../database/database.types.js';
import { migrate } from '../database/migrator.js';
import { UnitOfWork } from '../database/unit-of-work.js';
import { IdempotencyService } from './idempotency.service.js';

describe.skipIf(databaseTestsSkipped)('IdempotencyService (R-34)', () => {
  let database: TestDatabase;
  let db: Kysely<Database>;
  let unitOfWork: UnitOfWork;
  const idempotency = new IdempotencyService();

  beforeAll(async () => {
    database = await createTestDatabase();
    db = database.db;
    await migrate(db, 'up');
    unitOfWork = new UnitOfWork(db);
  });
  afterAll(async () => {
    await database.drop();
  });

  async function newUser(): Promise<string> {
    const id = randomUUID();
    await db
      .insertInto('users')
      .values({
        id,
        email: `${id}@example.org`,
        email_key: `${id}@example.org`,
        password_hash: 'x',
      })
      .execute();
    return id;
  }

  const run = (userId: string, commandId: string, work: () => Promise<{ n: number }>) =>
    unitOfWork.run((transaction) => idempotency.run(transaction, userId, commandId, work));

  it('runs the work once and returns the stored result to every replay', async () => {
    const userId = await newUser();
    const commandId = randomUUID();
    let runs = 0;
    const work = (): Promise<{ n: number }> => Promise.resolve({ n: (runs += 1) });
    expect(await run(userId, commandId, work)).toEqual({ n: 1 });
    expect(await run(userId, commandId, work)).toEqual({ n: 1 });
    expect(await run(userId, commandId, work)).toEqual({ n: 1 });
    expect(runs).toBe(1);
  });

  it("scopes a command ID to the user: another user's same ID is a different command", async () => {
    const first = await newUser();
    const second = await newUser();
    const commandId = randomUUID();
    expect(await run(first, commandId, () => Promise.resolve({ n: 1 }))).toEqual({ n: 1 });
    expect(await run(second, commandId, () => Promise.resolve({ n: 2 }))).toEqual({ n: 2 });
    expect(await run(first, commandId, () => Promise.resolve({ n: 3 }))).toEqual({ n: 1 });
  });

  it('stores nothing when the work fails, so a retry runs it', async () => {
    const userId = await newUser();
    const commandId = randomUUID();
    await expect(
      run(userId, commandId, () => Promise.reject(new Error('rejected command'))),
    ).rejects.toThrow('rejected command');
    expect(await run(userId, commandId, () => Promise.resolve({ n: 7 }))).toEqual({ n: 7 });
  });

  it('runs the work once when the same command arrives many times at once', async () => {
    const userId = await newUser();
    const commandId = randomUUID();
    let runs = 0;
    const work = async (): Promise<{ n: number }> => {
      runs += 1;
      await new Promise((resolve) => setTimeout(resolve, 30));
      return { n: runs };
    };
    const results = await Promise.all(
      Array.from({ length: 8 }, () => run(userId, commandId, work)),
    );
    expect(runs).toBe(1);
    expect(new Set(results.map((result) => result.n))).toEqual(new Set([1]));
  });

  it('keeps the result in the same transaction as the work: both commit or neither', async () => {
    const userId = await newUser();
    const commandId = randomUUID();
    await expect(
      unitOfWork.run(async (transaction) => {
        await idempotency.run(transaction, userId, commandId, () => Promise.resolve({ n: 1 }));
        throw new Error('later step failed');
      }),
    ).rejects.toThrow('later step failed');
    const rows = await db
      .selectFrom('processed_commands')
      .selectAll()
      .where('user_id', '=', userId)
      .execute();
    expect(rows).toHaveLength(0);
  });
});
