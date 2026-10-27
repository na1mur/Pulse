import { randomBytes, randomUUID } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { emailKey } from '../../domain/email-key.js';
import { createDatabase } from './database.factory.js';
import type { Database } from './database.types.js';
import { migrate, type Migration } from './migrator.js';
import {
  createTestDatabase,
  databaseTestsSkipped,
  type TestDatabase,
} from './test-database.testing.js';

// QA (T1.1): adversarial checks written independently of the engineer's specs. Spec section 6
// invariants, R-34, R-35, D-20, D-30.

async function code(work: PromiseLike<unknown>): Promise<string> {
  try {
    await work;
  } catch (error) {
    return (error as { code?: string }).code ?? 'unknown';
  }
  return 'ok';
}

const hash = (): Buffer => randomBytes(32);

describe.skipIf(databaseTestsSkipped)('QA adversarial: schema 0001', () => {
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

  const addUser = (email: string, id = randomUUID()) =>
    sql`insert into users (id, email, email_key, password_hash) values (${id}, ${email}, ${emailKey(email)}, 'h')`.execute(
      db,
    );

  async function user(): Promise<string> {
    const id = randomUUID();
    await addUser(`${id}@x.test`, id);
    return id;
  }

  async function device(userId: string): Promise<string> {
    const id = randomUUID();
    await sql`insert into devices (id, user_id, name, platform, app_version)
      values (${id}, ${userId}, 'd', 'windows', '1')`.execute(db);
    return id;
  }

  describe('email uniqueness', () => {
    it('collation of the throwaway database (diagnostic)', async () => {
      const r = await sql<{
        datcollate: string;
        datctype: string;
        datlocprovider: string;
        lowered: string;
      }>`select datcollate, datctype, datlocprovider, lower('ÉÀÖ') as lowered
        from pg_database where datname = current_database()`.execute(db);
      expect(r.rows).toHaveLength(1);
    });

    it('rejects ASCII case variants', async () => {
      await addUser('Case@Example.test');
      expect(await code(addUser('cAsE@example.TEST'))).toBe('23505');
    });

    it('rejects non-ASCII case variants (É vs é)', async () => {
      await addUser('JÉRÔME@example.test');
      expect(await code(addUser('jérôme@example.test'))).toBe('23505');
    });

    it('rejects Cyrillic and Greek case variants', async () => {
      await addUser('ИВАН@example.test');
      expect(await code(addUser('иван@example.test'))).toBe('23505');
      await addUser('ΣΟΦΙΑ@example.test');
      expect(await code(addUser('σοφια@example.test'))).toBe('23505');
    });

    it('whitespace variants share the key and are rejected', async () => {
      await addUser('ws@example.test');
      const results = [
        await code(addUser(' ws@example.test')),
        await code(addUser('ws@example.test ')),
        await code(addUser('ws@example.test\t')),
        await code(addUser('ws@example.test ')),
      ];
      expect(results).toEqual(['23505', '23505', '23505', '23505']);
    });

    it('rejects an all-whitespace email: its key is empty', async () => {
      const result = await code(addUser('   '));
      expect(result).toBe('23514');
    });

    it('NFC and NFD forms share the key and are rejected', async () => {
      await addUser('café@example.test');
      const result = await code(addUser('café@example.test'));
      expect(result).toBe('23505');
    });

    it('enforces the email length by characters at the boundary', async () => {
      const local = 'é'.repeat(254 - '@a.t'.length);
      expect(await code(addUser(`${local}@a.t`))).toBe('ok');
      expect(await code(addUser(`${local}x@a.t`))).toBe('23514');
      expect(await code(addUser(''))).toBe('23514');
    });

    it('rejects a null email and a null id', async () => {
      expect(
        await code(
          sql`insert into users (id, email, email_key, password_hash) values (${randomUUID()}, null, 'x', 'h')`.execute(
            db,
          ),
        ),
      ).toBe('23502');
    });

    it('updating an email into a case-variant of another is rejected', async () => {
      const a = `a-${randomUUID()}@x.test`;
      await addUser(a);
      const id = await user();
      expect(
        await code(
          sql`update users set email = ${a.toUpperCase()}, email_key = ${emailKey(a.toUpperCase())} where id = ${id}`.execute(
            db,
          ),
        ),
      ).toBe('23505');
    });

    it('both sign-in methods cannot be cleared by update', async () => {
      const id = await user();
      expect(
        await code(sql`update users set password_hash = null where id = ${id}`.execute(db)),
      ).toBe('23514');
      expect(
        await code(sql`update users set password_hash = '' where id = ${id}`.execute(db)),
      ).toBe('23514');
    });
  });

  describe('revisions (R-35)', () => {
    it('a multi-row UPDATE with one non-increasing row fails as a whole', async () => {
      const a = await user();
      const b = await user();
      await sql`insert into user_revisions (user_id, revision) values (${a}, 5), (${b}, 10)`.execute(
        db,
      );
      // a: 5 -> 6 ok, b: 10 -> 6 not ok
      const result = await code(
        sql`update user_revisions set revision = 6 where user_id in (${a}, ${b})`.execute(db),
      );
      expect(result).toBe('23514');
      const rows = await sql<{ revision: number }>`
        select revision from user_revisions where user_id in (${a}, ${b}) order by revision`.execute(
        db,
      );
      expect(rows.rows.map((r) => r.revision)).toEqual([5, 10]);
    });

    it('rejects a decrease through INSERT ... ON CONFLICT DO UPDATE', async () => {
      const a = await user();
      await sql`insert into user_revisions (user_id, revision) values (${a}, 7)`.execute(db);
      const result = await code(
        sql`insert into user_revisions (user_id, revision) values (${a}, 3)
          on conflict (user_id) do update set revision = excluded.revision`.execute(db),
      );
      expect(result).toBe('23514');
      const same = await code(
        sql`insert into user_revisions (user_id, revision) values (${a}, 7)
          on conflict (user_id) do update set revision = excluded.revision`.execute(db),
      );
      expect(same).toBe('23514');
      const up = await code(
        sql`insert into user_revisions (user_id, revision) values (${a}, 8)
          on conflict (user_id) do update set revision = excluded.revision`.execute(db),
      );
      expect(up).toBe('ok');
    });

    it('supports the canonical atomic bump (revision = revision + 1) under concurrency without gaps', async () => {
      const a = await user();
      await sql`insert into user_revisions (user_id) values (${a})`.execute(db);
      // Twelve connections contend for the row at once; uncapped, the six pools would open sixty
      // and, with the other spec files running in parallel, exhaust PostgreSQL's 100 connections.
      const pools = Array.from({ length: 6 }, () => createDatabase(database.url, { poolMax: 2 }));
      try {
        const results = await Promise.all(
          pools.flatMap((p) =>
            Array.from({ length: 10 }, () =>
              sql<{ revision: number }>`update user_revisions set revision = revision + 1
                where user_id = ${a} returning revision`.execute(p),
            ),
          ),
        );
        const revs = results.map((r) => r.rows[0]?.revision ?? -1).sort((x, y) => x - y);
        expect(revs).toEqual(Array.from({ length: 60 }, (_, i) => i + 1));
      } finally {
        await Promise.all(pools.map((p) => p.destroy()));
      }
    });

    it('revision can be lowered by delete + insert (diagnostic: counter not protected from delete)', async () => {
      const a = await user();
      await sql`insert into user_revisions (user_id, revision) values (${a}, 50)`.execute(db);
      await sql`delete from user_revisions where user_id = ${a}`.execute(db);
      const result = await code(
        sql`insert into user_revisions (user_id, revision) values (${a}, 0)`.execute(db),
      );
      expect(result).toBe('ok');
    });

    it('rejects a revision past bigint cleanly', async () => {
      const a = await user();
      await sql`insert into user_revisions (user_id, revision) values (${a}, 9223372036854775807)`.execute(
        db,
      );
      expect(
        await code(
          sql`update user_revisions set revision = revision + 1 where user_id = ${a}`.execute(db),
        ),
      ).toBe('22003');
    });

    it('rejects a revision row for an unknown user', async () => {
      expect(
        await code(sql`insert into user_revisions (user_id) values (${randomUUID()})`.execute(db)),
      ).toBe('23503');
    });
  });

  describe('email tokens', () => {
    async function token(userId: string, purpose = 'verify_email', newEmail: string | null = null) {
      const id = randomUUID();
      await sql`insert into email_tokens (id, user_id, purpose, token_hash, new_email, expires_at)
        values (${id}, ${userId}, ${purpose}, ${hash()}, ${newEmail}, now() + interval '1 hour')`.execute(
        db,
      );
      return id;
    }

    it('a multi-row UPDATE cannot re-use any used token', async () => {
      const u = await user();
      const t1 = await token(u);
      const t2 = await token(u);
      await sql`update email_tokens set used_at = now() where id = ${t1}`.execute(db);
      // both rows in one statement: t1 already used (changing used_at), t2 fresh
      const result = await code(
        sql`update email_tokens set used_at = now() + interval '1 second' where id in (${t1}, ${t2})`.execute(
          db,
        ),
      );
      expect(result).toBe('23514');
      const rows = await sql<{
        used: boolean;
      }>`select used_at is not null as used from email_tokens where id = ${t2}`.execute(db);
      expect(rows.rows[0]?.used).toBe(false);
    });

    it('used_at cannot be reset to null even in a no-change style update of the other columns', async () => {
      const u = await user();
      const t = await token(u);
      await sql`update email_tokens set used_at = now() where id = ${t}`.execute(db);
      expect(
        await code(sql`update email_tokens set used_at = null where id = ${t}`.execute(db)),
      ).toBe('23514');
    });

    it('rejects hash lengths 0, 31, 33, 64 and null; accepts exactly 32', async () => {
      const u = await user();
      for (const len of [0, 31, 33, 64]) {
        expect(
          await code(
            sql`insert into email_tokens (id, user_id, purpose, token_hash, expires_at)
              values (${randomUUID()}, ${u}, 'verify_email', ${randomBytes(len)}, now())`.execute(
              db,
            ),
          ),
        ).toBe('23514');
      }
      expect(
        await code(
          sql`insert into email_tokens (id, user_id, purpose, token_hash, expires_at)
            values (${randomUUID()}, ${u}, 'verify_email', null, now())`.execute(db),
        ),
      ).toBe('23502');
      expect(await code(token(u))).toBe('ok');
    });

    it('a hex or base64 text hash is stored as bytea of the text length and so rejected', async () => {
      const u = await user();
      const hex = randomBytes(32).toString('hex'); // 64 chars
      expect(
        await code(
          sql`insert into email_tokens (id, user_id, purpose, token_hash, expires_at)
            values (${randomUUID()}, ${u}, 'verify_email', ${hex}::bytea, now())`.execute(db),
        ),
      ).toBe('23514');
    });

    it('cannot turn a verify token into a change-email token without a new email (UPDATE)', async () => {
      const u = await user();
      const t = await token(u);
      expect(
        await code(
          sql`update email_tokens set purpose = 'change_email' where id = ${t}`.execute(db),
        ),
      ).toBe('23514');
      expect(
        await code(sql`update email_tokens set new_email = 'x@y.test' where id = ${t}`.execute(db)),
      ).toBe('23514');
    });

    it('rejects a duplicate hash across users', async () => {
      const u1 = await user();
      const u2 = await user();
      const h = hash();
      await sql`insert into email_tokens (id, user_id, purpose, token_hash, expires_at)
        values (${randomUUID()}, ${u1}, 'verify_email', ${h}, now())`.execute(db);
      expect(
        await code(
          sql`insert into email_tokens (id, user_id, purpose, token_hash, expires_at)
            values (${randomUUID()}, ${u2}, 'reset_password', ${h}, now())`.execute(db),
        ),
      ).toBe('23505');
    });

    it('diagnostic: used token columns other than used_at can still be rewritten', async () => {
      const u = await user();
      const t = await token(u);
      await sql`update email_tokens set used_at = now() where id = ${t}`.execute(db);
      const result = await code(
        sql`update email_tokens set expires_at = now() + interval '10 years', token_hash = ${hash()} where id = ${t}`.execute(
          db,
        ),
      );
      expect(result).toBe('ok'); // gap recorded in the QA report
    });

    it('rejects a null/absent expires_at and unknown purpose', async () => {
      const u = await user();
      expect(
        await code(
          sql`insert into email_tokens (id, user_id, purpose, token_hash) values (${randomUUID()}, ${u}, 'verify_email', ${hash()})`.execute(
            db,
          ),
        ),
      ).toBe('23502');
      expect(await code(token(u, 'login'))).toBe('23514');
    });
  });

  describe('preferences', () => {
    it('second row for the same user rejected; second row via ON CONFLICT DO NOTHING is a no-op', async () => {
      const u = await user();
      await sql`insert into user_preferences (user_id) values (${u})`.execute(db);
      expect(
        await code(sql`insert into user_preferences (user_id) values (${u})`.execute(db)),
      ).toBe('23505');
      await sql`insert into user_preferences (user_id) values (${u}) on conflict do nothing`.execute(
        db,
      );
      const n = await sql<{
        n: number;
      }>`select count(*) n from user_preferences where user_id = ${u}`.execute(db);
      expect(n.rows[0]?.n).toBe(1);
    });

    it('rejects preferences for an unknown user and invalid enum values on update', async () => {
      expect(
        await code(
          sql`insert into user_preferences (user_id) values (${randomUUID()})`.execute(db),
        ),
      ).toBe('23503');
      const u = await user();
      await sql`insert into user_preferences (user_id) values (${u})`.execute(db);
      for (const set of [
        sql`week_start = 'Monday'`,
        sql`week_start = 'someday'`,
        sql`time_format = '13h'`,
        sql`theme = 'purple'`,
        sql`timezone = ''`,
        sql`notify_daily_goal = null`,
        sql`count_weekends = null`,
        sql`revision = -1`,
      ]) {
        expect(
          await code(sql`update user_preferences set ${set} where user_id = ${u}`.execute(db)),
        ).toMatch(/^235(02|14)$/);
      }
    });

    it('defaults', async () => {
      const u = await user();
      await sql`insert into user_preferences (user_id) values (${u})`.execute(db);
      const r = await sql<
        Record<string, unknown>
      >`select * from user_preferences where user_id = ${u}`.execute(db);
      expect(r.rows[0]).toMatchObject({
        timezone: null,
        week_start: 'monday',
        count_weekends: true,
        time_format: 'system',
        theme: 'system',
        onboarding_completed_at: null,
        notify_credit_low: true,
        notify_credit_zero: true,
        notify_credit_below_zero: true,
        notify_daily_goal: true,
        notify_weekly_monthly_goal: true,
        notify_game_suggestion: true,
      });
    });

    it('diagnostic: a non-IANA timezone string is accepted by the database', async () => {
      const u = await user();
      await sql`insert into user_preferences (user_id) values (${u})`.execute(db);
      const result = await code(
        sql`update user_preferences set timezone = 'Mars/Phobos' where user_id = ${u}`.execute(db),
      );
      expect(result).toBe('ok'); // gap recorded in the QA report
    });
  });

  describe('devices and credentials', () => {
    async function cred(userId: string, deviceId: string, family = randomUUID()) {
      const id = randomUUID();
      await sql`insert into credentials (id, device_id, user_id, token_hash, family_id, expires_at)
        values (${id}, ${deviceId}, ${userId}, ${hash()}, ${family}, now() + interval '30 days')`.execute(
        db,
      );
      return id;
    }

    it('deleting a device removes its credentials only', async () => {
      const u = await user();
      const d1 = await device(u);
      const d2 = await device(u);
      await cred(u, d1);
      await cred(u, d2);
      await sql`delete from devices where id = ${d1}`.execute(db);
      const r = await sql<{
        n: number;
      }>`select count(*) n from credentials where user_id = ${u}`.execute(db);
      expect(r.rows[0]?.n).toBe(1);
    });

    it('moving a device with credentials to another user is rejected; moving one without is allowed (diagnostic)', async () => {
      const u1 = await user();
      const u2 = await user();
      const d = await device(u1);
      await cred(u1, d);
      expect(await code(sql`update devices set user_id = ${u2} where id = ${d}`.execute(db))).toBe(
        '23503',
      );
      const free = await device(u1);
      // Gap: a credential-less device can be moved to another account by the database.
      expect(
        await code(sql`update devices set user_id = ${u2} where id = ${free}`.execute(db)),
      ).toBe('ok');
    });

    it('a duplicate device id for a different user is rejected', async () => {
      const u1 = await user();
      const u2 = await user();
      const d = await device(u1);
      expect(
        await code(
          sql`insert into devices (id, user_id, name, platform, app_version) values (${d}, ${u2}, 'x', 'android', '1')`.execute(
            db,
          ),
        ),
      ).toBe('23505');
    });

    it('device field boundaries', async () => {
      const u = await user();
      const ins = (name: string, platform: string, version: string, push: string | null) =>
        code(
          sql`insert into devices (id, user_id, name, platform, app_version, push_token)
            values (${randomUUID()}, ${u}, ${name}, ${platform}, ${version}, ${push})`.execute(db),
        );
      expect(await ins('n'.repeat(100), 'android', 'v'.repeat(32), 'p'.repeat(4096))).toBe('ok');
      expect(await ins('n'.repeat(101), 'android', '1', null)).toBe('23514');
      expect(await ins('', 'android', '1', null)).toBe('23514');
      expect(await ins('n', 'ios', '1', null)).toBe('23514');
      expect(await ins('n', 'Windows', '1', null)).toBe('23514');
      expect(await ins('n', 'windows', 'v'.repeat(33), null)).toBe('23514');
      expect(await ins('n', 'windows', '', null)).toBe('23514');
      expect(await ins('n', 'windows', '1', 'p'.repeat(4097))).toBe('23514');
      expect(await ins('n', 'windows', '1', '')).toBe('23514');
    });

    it('credential family revoke by family id touches only that family; reuse query works', async () => {
      const u = await user();
      const d = await device(u);
      const fam = randomUUID();
      const other = randomUUID();
      await cred(u, d, fam);
      await cred(u, d, fam);
      await cred(u, d, other);
      const updated =
        await sql`update credentials set revoked_at = now() where family_id = ${fam} and revoked_at is null`.execute(
          db,
        );
      expect(updated.numAffectedRows).toBe(2n);
      const left = await sql<{
        n: number;
      }>`select count(*) n from credentials where user_id = ${u} and revoked_at is null`.execute(
        db,
      );
      expect(left.rows[0]?.n).toBe(1);
      const plan = await sql<{
        'QUERY PLAN': string;
      }>`explain select 1 from credentials where family_id = ${fam}`.execute(db);
      expect(plan.rows.length).toBeGreaterThan(0);
    });

    it('credential hash lengths and uniqueness (also against email_tokens space is separate)', async () => {
      const u = await user();
      const d = await device(u);
      for (const len of [0, 16, 31, 33, 64]) {
        expect(
          await code(
            sql`insert into credentials (id, device_id, user_id, token_hash, family_id, expires_at)
              values (${randomUUID()}, ${d}, ${u}, ${randomBytes(len)}, ${randomUUID()}, now())`.execute(
              db,
            ),
          ),
        ).toBe('23514');
      }
    });

    it('diagnostic: credential with expires_at before issued_at and family spanning two devices are accepted', async () => {
      const u = await user();
      const d1 = await device(u);
      const d2 = await device(u);
      const fam = randomUUID();
      const past = await code(
        sql`insert into credentials (id, device_id, user_id, token_hash, family_id, issued_at, expires_at)
          values (${randomUUID()}, ${d1}, ${u}, ${hash()}, ${fam}, now(), now() - interval '1 day')`.execute(
          db,
        ),
      );
      const cross = await code(cred(u, d2, fam));
      // Gaps: no expires_at > issued_at check, no one-device-per-family check.
      expect([past, cross]).toEqual(['ok', 'ok']);
    });

    it('credential for unknown device or missing family is rejected', async () => {
      const u = await user();
      expect(
        await code(
          sql`insert into credentials (id, device_id, user_id, token_hash, expires_at)
            values (${randomUUID()}, ${randomUUID()}, ${u}, ${hash()}, now())`.execute(db),
        ),
      ).toBe('23502');
      expect(await code(cred(u, randomUUID()))).toBe('23503');
    });
  });

  describe('tags', () => {
    const addTag = (
      userId: string,
      o: {
        id?: string;
        name?: string;
        key?: string;
        cat?: string;
        cls?: string | null;
        deleted?: boolean;
        archived?: boolean;
        rev?: number;
      } = {},
    ) => {
      const id = o.id ?? randomUUID();
      return sql`insert into tags (id, user_id, name, name_key, category, distraction_class, archived, revision, deleted_at)
        values (${id}, ${userId}, ${o.name ?? 'Deep'}, ${o.key ?? 'deep'}, ${o.cat ?? 'productive'}, ${o.cls ?? null},
          ${o.archived ?? false}, ${o.rev ?? 1}, ${o.deleted === true ? sql`now()` : null})`
        .execute(db)
        .then(() => id);
    };

    it('un-deleting a tag whose name was reused is a unique violation; archived tags keep their name', async () => {
      const u = await user();
      const first = await addTag(u, { deleted: true });
      await addTag(u);
      expect(
        await code(sql`update tags set deleted_at = null where id = ${first}`.execute(db)),
      ).toBe('23505');
      const u2 = await user();
      await addTag(u2, { archived: true });
      expect(await code(addTag(u2))).toBe('23505');
    });

    it('two deleted tags with the same key coexist; same key for another user is fine', async () => {
      const u = await user();
      expect(await code(addTag(u, { deleted: true }))).toBe('ok');
      expect(await code(addTag(u, { deleted: true }))).toBe('ok');
      expect(await code(addTag(u))).toBe('ok');
      expect(await code(addTag(await user()))).toBe('ok');
    });

    it('rename into an existing key is rejected', async () => {
      const u = await user();
      await addTag(u, { key: 'a' });
      const b = await addTag(u, { key: 'b' });
      expect(await code(sql`update tags set name_key = 'a' where id = ${b}`.execute(db))).toBe(
        '23505',
      );
    });

    it('recategorising a tag that has a class away from leisure is rejected, including multi-row', async () => {
      const u = await user();
      const g = await addTag(u, { key: 'g', cat: 'leisure', cls: 'gaming' });
      const s = await addTag(u, { key: 's', cat: 'leisure', cls: 'social' });
      expect(
        await code(sql`update tags set category = 'neutral' where id in (${g}, ${s})`.execute(db)),
      ).toBe('23514');
      expect(
        await code(
          sql`update tags set category = 'neutral', distraction_class = null where id in (${g}, ${s})`.execute(
            db,
          ),
        ),
      ).toBe('ok');
    });

    it('name 40 chars with emoji ok, 41 rejected; revision 0 rejected; bad class rejected', async () => {
      const u = await user();
      expect(await code(addTag(u, { name: '😀'.repeat(40), key: 'e' }))).toBe('ok');
      expect(await code(addTag(u, { name: '😀'.repeat(41), key: 'e2' }))).toBe('23514');
      expect(await code(addTag(u, { key: 'r', rev: 0 }))).toBe('23514');
      expect(await code(addTag(u, { key: 'c', cat: 'leisure', cls: 'video' }))).toBe('23514');
      expect(await code(addTag(u, { key: 'c', cat: 'Productive' }))).toBe('23514');
    });

    it('diagnostic: name_key is not tied to name; whitespace-only name is accepted', async () => {
      const u = await user();
      // Gaps: name_key is app-supplied and unchecked; a blank name is allowed.
      expect(await code(addTag(u, { name: 'Deep', key: 'x1' }))).toBe('ok');
      expect(await code(addTag(u, { name: 'deep', key: 'x2' }))).toBe('ok');
      expect(await code(addTag(u, { name: '   ', key: 'x3' }))).toBe('ok');
    });
  });

  describe('processed commands', () => {
    it('same (user, command) twice rejected, ON CONFLICT DO NOTHING keeps the first result, null result rejected, unknown user rejected', async () => {
      const u = await user();
      const c = randomUUID();
      await sql`insert into processed_commands (user_id, command_id, result) values (${u}, ${c}, '{"a":1}')`.execute(
        db,
      );
      expect(
        await code(
          sql`insert into processed_commands (user_id, command_id, result) values (${u}, ${c}, '{"a":2}')`.execute(
            db,
          ),
        ),
      ).toBe('23505');
      await sql`insert into processed_commands (user_id, command_id, result) values (${u}, ${c}, '{"a":3}') on conflict do nothing`.execute(
        db,
      );
      const r = await sql<{
        result: { a: number };
      }>`select result from processed_commands where user_id = ${u} and command_id = ${c}`.execute(
        db,
      );
      expect(r.rows[0]?.result).toEqual({ a: 1 });
      expect(
        await code(
          sql`insert into processed_commands (user_id, command_id, result) values (${u}, ${randomUUID()}, null)`.execute(
            db,
          ),
        ),
      ).toBe('23502');
      expect(
        await code(
          sql`insert into processed_commands (user_id, command_id, result) values (${randomUUID()}, ${randomUUID()}, '{}')`.execute(
            db,
          ),
        ),
      ).toBe('23503');
    });
  });

  describe('account deletion cascade', () => {
    it('removes rows in every table for a fully populated user and nothing of another user', async () => {
      const u = await user();
      const other = await user();
      const d = await device(u);
      await sql`insert into user_revisions (user_id, revision) values (${u}, 3), (${other}, 3)`.execute(
        db,
      );
      await sql`insert into user_preferences (user_id) values (${u}), (${other})`.execute(db);
      await sql`insert into email_tokens (id, user_id, purpose, token_hash, expires_at) values (${randomUUID()}, ${u}, 'verify_email', ${hash()}, now())`.execute(
        db,
      );
      await sql`insert into credentials (id, device_id, user_id, token_hash, family_id, expires_at) values (${randomUUID()}, ${d}, ${u}, ${hash()}, ${randomUUID()}, now())`.execute(
        db,
      );
      await sql`insert into tags (id, user_id, name, name_key, category, revision) values (${randomUUID()}, ${u}, 'a', 'a', 'neutral', 1), (${randomUUID()}, ${other}, 'a', 'a', 'neutral', 1)`.execute(
        db,
      );
      await sql`insert into processed_commands (user_id, command_id, result) values (${u}, ${randomUUID()}, '{}'), (${other}, ${randomUUID()}, '{}')`.execute(
        db,
      );

      await sql`delete from users where id = ${u}`.execute(db);

      for (const table of [
        'user_revisions',
        'user_preferences',
        'email_tokens',
        'devices',
        'credentials',
        'tags',
        'processed_commands',
      ]) {
        const r = await sql<{
          n: number;
        }>`select count(*) n from ${sql.table(table)} where user_id = ${u}`.execute(db);
        expect(r.rows[0]?.n, table).toBe(0);
      }
      const o = await sql<{
        n: number;
      }>`select (select count(*) from tags where user_id = ${other}) + (select count(*) from user_preferences where user_id = ${other}) + (select count(*) from user_revisions where user_id = ${other}) + (select count(*) from processed_commands where user_id = ${other}) as n`.execute(
        db,
      );
      expect(o.rows[0]?.n).toBe(4);
    });

    it('every foreign key in the schema is ON DELETE CASCADE', async () => {
      const r = await sql<{ conname: string; confdeltype: string }>`
        select conname, confdeltype from pg_constraint where contype = 'f' and connamespace = 'public'::regnamespace`.execute(
        db,
      );
      expect(r.rows.length).toBe(7);
      for (const row of r.rows) expect(row.confdeltype, row.conname).toBe('c');
    });
  });

  describe('secrets (D-30)', () => {
    it('no column other than the documented hash columns can hold a token, and all of them are bounded', async () => {
      const r = await sql<{ table_name: string; column_name: string }>`
        select table_name, column_name from information_schema.columns
        where table_schema = 'public' and (column_name ilike '%token%' or column_name ilike '%secret%' or column_name ilike '%password%' or column_name ilike '%refresh%')
        order by 1, 2`.execute(db);
      expect(r.rows).toEqual([
        { table_name: 'credentials', column_name: 'token_hash' },
        { table_name: 'devices', column_name: 'push_token' },
        { table_name: 'email_tokens', column_name: 'token_hash' },
        { table_name: 'users', column_name: 'password_hash' },
      ]);
    });
  });
});

describe.skipIf(databaseTestsSkipped)('QA adversarial: migrator', () => {
  let database: TestDatabase;
  beforeAll(async () => {
    database = await createTestDatabase();
  });
  afterAll(async () => {
    await database.drop();
  });

  const objects = async (db: Kysely<Database>) =>
    (
      await sql<{ kind: string; name: string }>`
        select 'rel:' || c.relkind::text as kind, c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast')
        union all select 'proc', p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname not in ('pg_catalog', 'information_schema')
        union all select 'type', t.typname from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast') and t.typrelid = 0 and t.typelem = 0
        union all select 'trigger', tgname from pg_trigger where not tgisinternal
        union all select 'ext', extname from pg_extension where extname <> 'plpgsql'
        union all select 'schema', nspname from pg_namespace where nspname not like 'pg_%' and nspname not in ('information_schema', 'public')`.execute(
        db,
      )
    ).rows;

  it('shipped migration: down leaves zero relations, functions, types, triggers, indexes, sequences', async () => {
    await migrate(database.db, 'up');
    expect((await objects(database.db)).length).toBeGreaterThan(10);
    const down = await migrate(database.db, 'down');
    expect(down.ids).toEqual(['0001']);
    expect(await objects(database.db)).toEqual([]);
    // down, up, down, up again
    await migrate(database.db, 'up');
    await migrate(database.db, 'down');
    await migrate(database.db, 'up');
    await migrate(database.db, 'down');
    expect(await objects(database.db)).toEqual([]);
  });

  it('up then down with data present still reaches empty', async () => {
    await migrate(database.db, 'up');
    const id = randomUUID();
    await sql`insert into users (id, email, email_key, password_hash) values (${id}, 'a@b.test', 'a@b.test', 'h')`.execute(
      database.db,
    );
    await sql`insert into user_revisions (user_id, revision) values (${id}, 4)`.execute(
      database.db,
    );
    await migrate(database.db, 'down');
    expect(await objects(database.db)).toEqual([]);
  });

  it('concurrent up from 10 separate pools applies 0001 once and none fails', async () => {
    const pools = Array.from({ length: 10 }, () => createDatabase(database.url));
    try {
      const results = await Promise.all(pools.map((p) => migrate(p, 'up')));
      expect(results.flatMap((r) => r.ids)).toEqual(['0001']);
    } finally {
      await Promise.all(pools.map((p) => p.destroy()));
    }
    await migrate(database.db, 'down');
    expect(await objects(database.db)).toEqual([]);
  });

  it('concurrent up and down do not corrupt: end state is consistent (either empty or fully applied)', async () => {
    const pools = Array.from({ length: 6 }, () => createDatabase(database.url));
    try {
      await Promise.all(pools.map((p, i) => migrate(p, i % 2 === 0 ? 'up' : 'down')));
    } finally {
      await Promise.all(pools.map((p) => p.destroy()));
    }
    const rels = (await objects(database.db)).filter((o) => o.kind === 'rel:r').map((o) => o.name);
    if (rels.length > 0) {
      expect(rels).toContain('schema_migrations');
      expect(rels).toContain('users');
    }
    await migrate(database.db, 'down');
    expect(await objects(database.db)).toEqual([]);
  });

  it('a failing down script rolls back that step and leaves the bookkeeping intact', async () => {
    const ms: Migration[] = [
      { id: '0001', name: 'a', up: 'create table a (id int);', down: 'drop table a;' },
      {
        id: '0002',
        name: 'b',
        up: 'create table b (id int);',
        down: 'drop table b; drop table nope;',
      },
    ];
    await migrate(database.db, 'up', { migrations: ms });
    await expect(migrate(database.db, 'down', { migrations: ms })).rejects.toThrow(/nope/);
    const rels = (await objects(database.db))
      .filter((o) => o.kind === 'rel:r')
      .map((o) => o.name)
      .sort();
    expect(rels).toEqual(['a', 'b', 'schema_migrations']);
    const rows = await sql<{ id: string }>`select id from schema_migrations order by id`.execute(
      database.db,
    );
    expect(rows.rows.map((r) => r.id)).toEqual(['0001', '0002']);
    const fixed: Migration[] = [
      { id: '0001', name: 'a', up: 'create table a (id int);', down: 'drop table a;' },
      { id: '0002', name: 'b', up: 'create table b (id int);', down: 'drop table b;' },
    ];
    await migrate(database.db, 'down', { migrations: fixed });
    expect(await objects(database.db)).toEqual([]);
  });

  it('whitespace-only edit of an applied up script is refused (checksum is strict about content)', async () => {
    const ms: Migration[] = [
      { id: '0001', name: 'a', up: 'create table a (id int);', down: 'drop table a;' },
    ];
    await migrate(database.db, 'up', { migrations: ms });
    const edited: Migration[] = [
      { id: '0001', name: 'a', up: 'create table a (id int);\n-- comment', down: 'drop table a;' },
    ];
    await expect(migrate(database.db, 'up', { migrations: edited })).rejects.toThrow(
      /changed after it was applied/,
    );
    await migrate(database.db, 'down', { migrations: ms });
    expect(await objects(database.db)).toEqual([]);
  });

  it('a hole in the applied history (0002 applied without 0001) is refused', async () => {
    const ms: Migration[] = [
      { id: '0001', name: 'a', up: 'create table a (id int);', down: 'drop table a;' },
      { id: '0002', name: 'b', up: 'create table b (id int);', down: 'drop table b;' },
    ];
    await migrate(database.db, 'up', { migrations: ms });
    await sql`delete from schema_migrations where id = '0001'`.execute(database.db);
    await expect(migrate(database.db, 'up', { migrations: ms })).rejects.toThrow(/does not know/);
    await sql`insert into schema_migrations (id, name, checksum) select id, name, checksum from (values ('0001','a','x')) v(id,name,checksum)`
      .execute(database.db)
      .catch(() => undefined);
    await sql`drop table a; drop table b; drop table schema_migrations;`
      .execute(database.db)
      .catch(async () => {
        await sql`drop table if exists a`.execute(database.db);
        await sql`drop table if exists b`.execute(database.db);
        await sql`drop table if exists schema_migrations`.execute(database.db);
      });
  });

  it('a migration holding the lock makes a second starter wait, then skip (no double apply, no error)', async () => {
    await sql`drop table if exists a, b, schema_migrations`.execute(database.db);
    const ms: Migration[] = [
      {
        id: '0001',
        name: 'slow',
        up: 'select pg_sleep(1); create table slow (id int);',
        down: 'drop table slow;',
      },
    ];
    const p1 = createDatabase(database.url);
    const p2 = createDatabase(database.url);
    try {
      const started = Date.now();
      const [r1, r2] = await Promise.all([
        migrate(p1, 'up', { migrations: ms }),
        (async () => {
          await new Promise((r) => setTimeout(r, 200));
          return migrate(p2, 'up', { migrations: ms });
        })(),
      ]);
      expect(r1.ids.length + r2.ids.length).toBe(1);
      expect(Date.now() - started).toBeGreaterThanOrEqual(900);
    } finally {
      await p1.destroy();
      await p2.destroy();
    }
    await migrate(database.db, 'down', { migrations: ms });
    expect(await objects(database.db)).toEqual([]);
  });
});

describe.skipIf(databaseTestsSkipped)('QA adversarial: database locale', () => {
  // Email uniqueness is on users.email_key, which the application folds (emailKey), so it does
  // not depend on the cluster locale. An external PostgreSQL (supported by the deployment spec)
  // is often created with the C locale, where lower() folds only ASCII (QA T1.1 Bug 1).
  it('keeps non-ASCII emails unique regardless of case in a C-locale database', async () => {
    const adminUrl = new URL(
      process.env['PULSE_TEST_DATABASE_URL'] ?? 'postgres://pulse:pulse@localhost:5432/postgres',
    );
    const name = `pulse_test_qa_c_${randomBytes(4).toString('hex')}`;
    const admin = new pg.Client({ connectionString: adminUrl.href });
    await admin.connect();
    await admin.query(`create database ${name} template template0 encoding 'UTF8' locale 'C'`);
    const target = new URL(adminUrl.href);
    target.pathname = `/${name}`;
    const db = createDatabase(target.href);
    try {
      await migrate(db, 'up');
      const add = (email: string) =>
        sql`insert into users (id, email, email_key, password_hash) values (${randomUUID()}, ${email}, ${emailKey(email)}, 'h')`.execute(
          db,
        );
      await add('JÉRÔME@example.test');
      expect(await code(add('jérôme@example.test'))).toBe('23505');
      await add('ИВАН@example.test');
      expect(await code(add('иван@example.test'))).toBe('23505');
    } finally {
      await db.destroy();
      await admin.query(`drop database if exists ${name} with (force)`);
      await admin.end();
    }
  });
});
