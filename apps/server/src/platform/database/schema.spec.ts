import { randomBytes, randomUUID } from 'node:crypto';
import { sql, type Insertable, type Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { emailKey } from '../../domain/email-key.js';
import type { Database, TagsTable } from './database.types.js';
import { migrate } from './migrator.js';
import {
  createTestDatabase,
  databaseTestsSkipped,
  type TestDatabase,
} from './test-database.testing.js';

// Invariants of the 0001 schema (spec section 6), checked against a real PostgreSQL: each one is
// a database constraint, so a bug in the application code cannot break it.

const tables = [
  'users',
  'user_revisions',
  'email_tokens',
  'user_preferences',
  'devices',
  'credentials',
  'tags',
  'processed_commands',
] as const;

/** Resolves with the PostgreSQL error the statement raised, so tests can assert its shape. */
async function violation(
  work: PromiseLike<unknown>,
): Promise<{ code: string; constraint: string }> {
  try {
    await work;
  } catch (error) {
    const { code, constraint } = error as { code?: string; constraint?: string };
    return { code: code ?? '', constraint: constraint ?? '' };
  }
  throw new Error('expected the statement to violate a constraint, but it succeeded');
}

const uniqueViolation = '23505';
const checkViolation = '23514';
const foreignKeyViolation = '23503';
const notNullViolation = '23502';

const hash = (): Buffer => randomBytes(32);
const later = '2030-01-01T00:00:00Z';

describe.skipIf(databaseTestsSkipped)('schema 0001 (real PostgreSQL)', () => {
  let database: TestDatabase;
  let db: Kysely<Database>;

  beforeAll(async () => {
    database = await createTestDatabase();
    db = database.db;
    await migrate(db, 'up');
  });
  afterAll(async () => {
    await database.drop();
  });

  async function insertUser(overrides: { email?: string; googleSubject?: string } = {}) {
    const id = randomUUID();
    const email = overrides.email ?? `${id}@example.test`;
    await db
      .insertInto('users')
      .values({
        id,
        email,
        email_key: emailKey(email),
        password_hash: overrides.googleSubject === undefined ? '$argon2id$demo' : null,
        google_subject: overrides.googleSubject ?? null,
      })
      .execute();
    return id;
  }

  async function insertDevice(userId: string) {
    const id = randomUUID();
    await db
      .insertInto('devices')
      .values({ id, user_id: userId, name: 'Laptop', platform: 'windows', app_version: '1.0.0' })
      .execute();
    return id;
  }

  async function insertCredential(userId: string, deviceId: string, familyId = randomUUID()) {
    const id = randomUUID();
    await db
      .insertInto('credentials')
      .values({
        id,
        user_id: userId,
        device_id: deviceId,
        token_hash: hash(),
        family_id: familyId,
        expires_at: later,
      })
      .execute();
    return id;
  }

  const tag = (userId: string, overrides: Partial<Insertable<TagsTable>> = {}) => ({
    id: randomUUID(),
    user_id: userId,
    name: 'Deep work',
    name_key: 'deep work',
    category: 'productive' as const,
    revision: 1,
    ...overrides,
  });

  describe('users', () => {
    it('keeps emails unique by their key, so case and Unicode variants collide', async () => {
      const suffix = randomUUID();
      for (const [first, second] of [
        [`Mixed.Case.${suffix}@Example.test`, `mixed.case.${suffix}@example.test`],
        [`JÉRÔME.${suffix}@example.test`, `jérôme.${suffix}@example.test`],
        [`ИВАН.${suffix}@example.test`, `иван.${suffix}@EXAMPLE.test`],
        [`  padded.${suffix}@example.test `, `padded.${suffix}@example.test`],
      ] as const) {
        await insertUser({ email: first });
        const result = await violation(insertUser({ email: second }));
        expect(result, first).toEqual({ code: uniqueViolation, constraint: 'users_email_key' });
      }
    });

    it('requires an email key between 1 and 4572 characters', async () => {
      const insert = (emailKey: string | null) =>
        sql`insert into users (id, email, email_key, password_hash)
          values (${randomUUID()}, ${`k-${randomUUID()}@example.test`}, ${emailKey}, 'hash')`.execute(
          db,
        );

      expect((await violation(insert(null))).code).toBe(notNullViolation);
      expect((await violation(insert(''))).code).toBe(checkViolation);
      expect((await violation(insert('k'.repeat(4573)))).code).toBe(checkViolation);
      await insert(`k${'k'.repeat(4571)}`);
    });

    it('requires a password hash or a Google link, and accepts either or both', async () => {
      const none = await violation(
        db
          .insertInto('users')
          .values({ id: randomUUID(), email: 'none@example.test', email_key: 'none@example.test' })
          .execute(),
      );
      expect(none).toEqual({ code: checkViolation, constraint: 'users_has_sign_in_method' });

      await insertUser({ googleSubject: `g-${randomUUID()}` });
      await db
        .insertInto('users')
        .values({
          id: randomUUID(),
          email: `both-${randomUUID()}@example.test`,
          email_key: `both-${randomUUID()}@example.test`,
          password_hash: '$argon2id$demo',
          google_subject: `g-${randomUUID()}`,
        })
        .execute();
    });

    it('links a Google subject to one account only', async () => {
      const subject = `g-${randomUUID()}`;
      await insertUser({ googleSubject: subject });
      const result = await violation(insertUser({ googleSubject: subject }));
      expect(result).toEqual({ code: uniqueViolation, constraint: 'users_google_subject_key' });
    });

    it('limits the email to 254 characters', async () => {
      const longest = `${'a'.repeat(241)}@example.test`;
      expect(longest).toHaveLength(254);
      await insertUser({ email: longest });
      const result = await violation(insertUser({ email: `b${longest}` }));
      expect(result.code).toBe(checkViolation);
    });
  });

  describe('user_revisions (R-35)', () => {
    it('holds one counter per user that starts at 0 and only increases', async () => {
      const userId = await insertUser();
      await db.insertInto('user_revisions').values({ user_id: userId }).execute();

      const duplicate = await violation(
        db.insertInto('user_revisions').values({ user_id: userId }).execute(),
      );
      expect(duplicate.code).toBe(uniqueViolation);

      await db
        .updateTable('user_revisions')
        .set({ revision: 5 })
        .where('user_id', '=', userId)
        .execute();
      for (const revision of [5, 4]) {
        const result = await violation(
          db
            .updateTable('user_revisions')
            .set({ revision })
            .where('user_id', '=', userId)
            .execute(),
        );
        expect(result).toEqual({
          code: checkViolation,
          constraint: 'user_revisions_only_increase',
        });
      }
      const row = await db
        .selectFrom('user_revisions')
        .select('revision')
        .where('user_id', '=', userId)
        .executeTakeFirstOrThrow();
      expect(row.revision).toBe(5);
    });

    it('rejects a negative revision', async () => {
      const userId = await insertUser();
      const result = await violation(
        db.insertInto('user_revisions').values({ user_id: userId, revision: -1 }).execute(),
      );
      expect(result.code).toBe(checkViolation);
    });
  });

  describe('email_tokens', () => {
    const token = (userId: string, overrides: Record<string, unknown> = {}) => ({
      id: randomUUID(),
      user_id: userId,
      purpose: 'verify_email' as const,
      token_hash: hash(),
      expires_at: later,
      ...overrides,
    });

    it('stores a token hash for each purpose and requires a new email only for an email change', async () => {
      const userId = await insertUser();
      await db.insertInto('email_tokens').values(token(userId)).execute();
      await db
        .insertInto('email_tokens')
        .values(token(userId, { purpose: 'reset_password' }))
        .execute();
      await db
        .insertInto('email_tokens')
        .values(token(userId, { purpose: 'change_email', new_email: 'new@example.test' }))
        .execute();

      const missing = await violation(
        db
          .insertInto('email_tokens')
          .values(token(userId, { purpose: 'change_email' }))
          .execute(),
      );
      expect(missing.constraint).toBe('email_tokens_new_email_only_for_change');
      const extra = await violation(
        db
          .insertInto('email_tokens')
          .values(token(userId, { new_email: 'new@example.test' }))
          .execute(),
      );
      expect(extra.constraint).toBe('email_tokens_new_email_only_for_change');
    });

    it('rejects an unknown purpose, a duplicate hash and anything that is not a 32-byte hash', async () => {
      const userId = await insertUser();
      const unknown = await violation(
        db
          .insertInto('email_tokens')
          .values(token(userId, { purpose: 'login' }))
          .execute(),
      );
      expect(unknown.code).toBe(checkViolation);

      const shared = hash();
      await db
        .insertInto('email_tokens')
        .values(token(userId, { token_hash: shared }))
        .execute();
      const duplicate = await violation(
        db
          .insertInto('email_tokens')
          .values(token(userId, { token_hash: shared }))
          .execute(),
      );
      expect(duplicate.code).toBe(uniqueViolation);

      // A raw token (up to 512 characters) can never be stored: only the 32-byte digest fits.
      for (const raw of [Buffer.from('a-raw-token-value'), randomBytes(64)]) {
        const result = await violation(
          db
            .insertInto('email_tokens')
            .values(token(userId, { token_hash: raw }))
            .execute(),
        );
        expect(result.code).toBe(checkViolation);
      }
    });

    it('can be marked used once and the mark never changes or clears', async () => {
      const userId = await insertUser();
      const row = token(userId);
      await db.insertInto('email_tokens').values(row).execute();
      const mark = (used: string | null) =>
        db.updateTable('email_tokens').set({ used_at: used }).where('id', '=', row.id).execute();

      await mark('2029-01-01T00:00:00Z');
      for (const attempt of [null, '2029-06-01T00:00:00Z']) {
        const result = await violation(mark(attempt));
        expect(result).toEqual({ code: checkViolation, constraint: 'email_tokens_single_use' });
      }
      // Writing the same instant again is not a change.
      await mark('2029-01-01T00:00:00Z');
    });
  });

  describe('user_preferences', () => {
    it('has one row per user with the Appendix A defaults and no timezone until confirmed', async () => {
      const userId = await insertUser();
      await db.insertInto('user_preferences').values({ user_id: userId }).execute();

      const row = await db
        .selectFrom('user_preferences')
        .selectAll()
        .where('user_id', '=', userId)
        .executeTakeFirstOrThrow();
      expect(row).toMatchObject({
        timezone: null,
        week_start: 'monday',
        count_weekends: true,
        time_format: 'system',
        theme: 'system',
        notify_credit_low: true,
        notify_credit_zero: true,
        notify_credit_below_zero: true,
        notify_daily_goal: true,
        notify_weekly_monthly_goal: true,
        notify_game_suggestion: true,
        onboarding_completed_at: null,
        revision: 0,
      });

      const second = await violation(
        db.insertInto('user_preferences').values({ user_id: userId }).execute(),
      );
      expect(second).toEqual({ code: uniqueViolation, constraint: 'user_preferences_pkey' });
    });

    it.each([
      ['week_start', 'someday'],
      ['time_format', '48h'],
      ['theme', 'neon'],
      ['timezone', ''],
    ])('rejects %s = %j', async (column, value) => {
      const userId = await insertUser();
      const result = await violation(
        sql`insert into user_preferences (user_id, ${sql.ref(column)}) values (${userId}, ${value})`.execute(
          db,
        ),
      );
      expect(result.code).toBe(checkViolation);
    });
  });

  describe('devices and credentials', () => {
    it('limits name, platform, app version and push token (Appendix A)', async () => {
      const userId = await insertUser();
      const device = (overrides: Record<string, unknown>) =>
        db
          .insertInto('devices')
          .values({
            id: randomUUID(),
            user_id: userId,
            name: 'Phone',
            platform: 'android',
            app_version: '1.0.0',
            ...overrides,
          } as never)
          .execute();

      await device({
        name: 'n'.repeat(100),
        app_version: 'v'.repeat(32),
        push_token: 'p'.repeat(4096),
      });
      for (const overrides of [
        { name: '' },
        { name: 'n'.repeat(101) },
        { platform: 'ios' },
        { app_version: '' },
        { app_version: 'v'.repeat(33) },
        { push_token: 'p'.repeat(4097) },
      ]) {
        expect(
          (await violation(device(overrides))).code,
          JSON.stringify(overrides).slice(0, 40),
        ).toBe(checkViolation);
      }
    });

    it("rejects a credential whose user is not the device's user", async () => {
      const owner = await insertUser();
      const other = await insertUser();
      const deviceId = await insertDevice(owner);

      const result = await violation(insertCredential(other, deviceId));
      expect(result).toEqual({ code: foreignKeyViolation, constraint: 'credentials_device_fkey' });
    });

    it('stores only a 32-byte token hash, unique across credentials', async () => {
      const userId = await insertUser();
      const deviceId = await insertDevice(userId);
      const row = {
        user_id: userId,
        device_id: deviceId,
        family_id: randomUUID(),
        expires_at: later,
      };
      const shared = hash();
      await db
        .insertInto('credentials')
        .values({ ...row, id: randomUUID(), token_hash: shared })
        .execute();

      const duplicate = await violation(
        db
          .insertInto('credentials')
          .values({ ...row, id: randomUUID(), token_hash: shared })
          .execute(),
      );
      expect(duplicate.code).toBe(uniqueViolation);
      const raw = await violation(
        db
          .insertInto('credentials')
          .values({ ...row, id: randomUUID(), token_hash: Buffer.from('raw-refresh-token') })
          .execute(),
      );
      expect(raw.code).toBe(checkViolation);
    });

    it('revokes a whole token family with one statement by family id and leaves others alone', async () => {
      const userId = await insertUser();
      const deviceId = await insertDevice(userId);
      const family = randomUUID();
      const otherFamily = randomUUID();
      await insertCredential(userId, deviceId, family);
      await insertCredential(userId, deviceId, family);
      await insertCredential(userId, deviceId, otherFamily);

      const revoked = await db
        .updateTable('credentials')
        .set({ revoked_at: new Date() })
        .where('family_id', '=', family)
        .where('revoked_at', 'is', null)
        .executeTakeFirst();
      expect(revoked.numUpdatedRows).toBe(2n);

      const remaining = await db
        .selectFrom('credentials')
        .select('family_id')
        .where('user_id', '=', userId)
        .where('revoked_at', 'is', null)
        .execute();
      expect(remaining).toEqual([{ family_id: otherFamily }]);
    });

    it('removes credentials with their device', async () => {
      const userId = await insertUser();
      const deviceId = await insertDevice(userId);
      await insertCredential(userId, deviceId);

      await db.deleteFrom('devices').where('id', '=', deviceId).execute();
      const left = await db
        .selectFrom('credentials')
        .select('id')
        .where('device_id', '=', deviceId)
        .execute();
      expect(left).toEqual([]);
    });
  });

  describe('tags', () => {
    it('limits the name to 1-40 characters and the category to the three fixed ones', async () => {
      const userId = await insertUser();
      await db
        .insertInto('tags')
        .values(tag(userId, { name: 'n'.repeat(40), name_key: 'long' }))
        .execute();
      for (const overrides of [
        { name: '' },
        { name: 'n'.repeat(41) },
        { category: 'other' },
        { name_key: '' },
        { revision: 0 },
      ]) {
        const result = await violation(
          db
            .insertInto('tags')
            .values(tag(userId, overrides as never))
            .execute(),
        );
        expect(result.code, JSON.stringify(overrides)).toBe(checkViolation);
      }
    });

    it('accepts the longest possible key of a 40-character name and rejects one more', async () => {
      const userId = await insertUser();
      // U+FDFA expands to 18 characters under NFKC, the largest expansion in Unicode.
      const name = 'ﷺ'.repeat(40);
      const key = name.normalize('NFKC');
      expect(key).toHaveLength(720);

      await db
        .insertInto('tags')
        .values(tag(userId, { name, name_key: key }))
        .execute();
      const tooLong = await violation(
        db
          .insertInto('tags')
          .values(tag(userId, { name, name_key: `${key}x` }))
          .execute(),
      );
      expect(tooLong.code).toBe(checkViolation);
    });

    it('allows a distraction class on Leisure tags only (TAG-08)', async () => {
      const userId = await insertUser();
      await db
        .insertInto('tags')
        .values(
          tag(userId, { name_key: 'games', category: 'leisure', distraction_class: 'gaming' }),
        )
        .execute();
      for (const category of ['productive', 'neutral'] as const) {
        const result = await violation(
          db
            .insertInto('tags')
            .values(
              tag(userId, { name_key: `x-${category}`, category, distraction_class: 'social' }),
            )
            .execute(),
        );
        expect(result).toEqual({
          code: checkViolation,
          constraint: 'tags_distraction_class_leisure_only',
        });
      }
      const unknown = await violation(
        db
          .insertInto('tags')
          .values(
            tag(userId, {
              name_key: 'x-bad',
              category: 'leisure',
              distraction_class: 'news' as never,
            }),
          )
          .execute(),
      );
      expect(unknown.code).toBe(checkViolation);
    });

    it('keeps names unique per user among non-deleted tags only', async () => {
      const userId = await insertUser();
      const otherUser = await insertUser();
      const first = tag(userId, { name_key: 'reading' });
      await db.insertInto('tags').values(first).execute();

      const duplicate = await violation(
        db
          .insertInto('tags')
          .values(tag(userId, { name_key: 'reading' }))
          .execute(),
      );
      expect(duplicate).toEqual({ code: uniqueViolation, constraint: 'tags_user_id_name_key_key' });

      // Another user may use the same name.
      await db
        .insertInto('tags')
        .values(tag(otherUser, { name_key: 'reading' }))
        .execute();

      // After a soft delete the name is free again, and deleted tags may share a key.
      await db
        .updateTable('tags')
        .set({ deleted_at: new Date() })
        .where('id', '=', first.id)
        .execute();
      const replacement = tag(userId, { name_key: 'reading' });
      await db.insertInto('tags').values(replacement).execute();
      await db
        .updateTable('tags')
        .set({ deleted_at: new Date() })
        .where('id', '=', replacement.id)
        .execute();
    });
  });

  describe('processed_commands (R-34)', () => {
    it('stores one result per (user, command id) and lets another user reuse the id', async () => {
      const userId = await insertUser();
      const otherUser = await insertUser();
      const commandId = randomUUID();
      const row = {
        user_id: userId,
        command_id: commandId,
        result: JSON.stringify({ revision: 3 }),
      };
      await db.insertInto('processed_commands').values(row).execute();

      const replay = await violation(db.insertInto('processed_commands').values(row).execute());
      expect(replay).toEqual({ code: uniqueViolation, constraint: 'processed_commands_pkey' });

      await db
        .insertInto('processed_commands')
        .values({ ...row, user_id: otherUser })
        .execute();
      const stored = await db
        .selectFrom('processed_commands')
        .select('result')
        .where('user_id', '=', userId)
        .where('command_id', '=', commandId)
        .executeTakeFirstOrThrow();
      expect(stored.result).toEqual({ revision: 3 });
    });

    it('requires a result', async () => {
      const userId = await insertUser();
      const result = await violation(
        sql`insert into processed_commands (user_id, command_id, result) values (${userId}, ${randomUUID()}, null)`.execute(
          db,
        ),
      );
      expect(result.code).toBe(notNullViolation);
    });
  });

  describe('account deletion', () => {
    it('removes every row of the user from every table and touches no one else', async () => {
      const userId = await insertUser();
      const bystander = await insertUser();
      const deviceId = await insertDevice(userId);
      await insertCredential(userId, deviceId);
      await db.insertInto('user_revisions').values({ user_id: userId }).execute();
      await db.insertInto('user_preferences').values({ user_id: userId }).execute();
      await db.insertInto('tags').values(tag(userId)).execute();
      await db
        .insertInto('email_tokens')
        .values({
          id: randomUUID(),
          user_id: userId,
          purpose: 'reset_password',
          token_hash: hash(),
          expires_at: later,
        })
        .execute();
      await db
        .insertInto('processed_commands')
        .values({ user_id: userId, command_id: randomUUID(), result: '{}' })
        .execute();
      await db.insertInto('user_preferences').values({ user_id: bystander }).execute();

      await db.deleteFrom('users').where('id', '=', userId).execute();

      for (const table of tables) {
        const column = table === 'users' ? 'id' : 'user_id';
        const rows = await sql<{ n: number }>`
          select count(*) as n from ${sql.table(table)} where ${sql.ref(column)} = ${userId}`.execute(
          db,
        );
        expect(rows.rows[0]?.n, table).toBe(0);
      }
      const kept = await db
        .selectFrom('user_preferences')
        .select('user_id')
        .where('user_id', '=', bystander)
        .execute();
      expect(kept).toHaveLength(1);
    });
  });

  describe('secrets', () => {
    it('has no column that could hold a raw token or password', async () => {
      const columns = await sql<{ table_name: string; column_name: string; data_type: string }>`
        select table_name, column_name, data_type from information_schema.columns
        where table_schema = 'public' and table_name <> 'schema_migrations'
          and (column_name ilike '%token%' or column_name ilike '%secret%' or column_name ilike '%password%')
        order by table_name, column_name`.execute(db);

      expect(columns.rows).toEqual([
        { table_name: 'credentials', column_name: 'token_hash', data_type: 'bytea' },
        { table_name: 'devices', column_name: 'push_token', data_type: 'text' },
        { table_name: 'email_tokens', column_name: 'token_hash', data_type: 'bytea' },
        { table_name: 'users', column_name: 'password_hash', data_type: 'text' },
      ]);
    });
  });

  describe('indexes', () => {
    it('serves every foreign key with a full (not partial) index led by its columns', async () => {
      // PostgreSQL does not index referencing columns itself; without one, every cascading
      // delete (account deletion) scans the child table.
      const unindexed = await sql<{ table_name: string; constraint_name: string }>`
        select c.conrelid::regclass::text as table_name, c.conname as constraint_name
        from pg_constraint c
        where c.contype = 'f' and c.connamespace = 'public'::regnamespace
          and not exists (
            select 1 from pg_index i
            where i.indrelid = c.conrelid and i.indpred is null and i.indisvalid
              and (string_to_array(i.indkey::text, ' ')::int2[])[1:cardinality(c.conkey)] @> c.conkey
              and (string_to_array(i.indkey::text, ' ')::int2[])[1:cardinality(c.conkey)] <@ c.conkey
          )
        order by 1, 2`.execute(db);
      expect(unindexed.rows).toEqual([]);
    });

    it('names the unique constraints that code and tests refer to', async () => {
      const names = await sql<{ conname: string }>`
        select conname from pg_constraint
        where contype = 'u' and connamespace = 'public'::regnamespace order by conname`.execute(db);
      expect(names.rows.map((row) => row.conname)).toEqual([
        'credentials_token_hash_key',
        'devices_id_user_id_key',
        'email_tokens_token_hash_key',
        'users_email_key',
        'users_google_subject_key',
      ]);
    });
  });

  describe('rollback', () => {
    it('leaves no table, function or type behind on a database that only we migrated', async () => {
      const second = await createTestDatabase();
      try {
        await migrate(second.db, 'up');
        await migrate(second.db, 'down');

        const leftovers = await sql<{ kind: string; name: string }>`
          select 'table' as kind, tablename as name from pg_tables where schemaname = 'public'
          union all
          select 'function', proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public'
          union all
          select 'type', typname from pg_type t join pg_namespace n on n.oid = t.typnamespace
            where n.nspname = 'public' and t.typtype <> 'c' and t.typelem = 0
          union all
          select 'sequence', relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'S'`.execute(second.db);
        expect(leftovers.rows).toEqual([]);

        // And it applies cleanly again.
        await migrate(second.db, 'up');
        const row = await sql<{ n: number }>`select count(*) as n from users`.execute(second.db);
        expect(row.rows[0]?.n).toBe(0);
      } finally {
        await second.drop();
      }
    });
  });
});
