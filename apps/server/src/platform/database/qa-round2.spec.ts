import { randomBytes, randomUUID } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { emailKey } from '../../domain/email-key.js';
import { describeConnectionFailure } from './connection-failure.js';
import { createDatabase } from './database.factory.js';
import type { Database } from './database.types.js';
import { migrate } from './migrator.js';
import { databaseTestsSkipped } from './test-database.testing.js';

// QA round 2 (T1.1): re-check of the email_key fix, the pool error listener and the connection
// failure message. Spec section 6 (User.email unique, case-insensitive), Appendix A (email 254).

const codePoints = (value: string): number => Array.from(value).length;

describe('QA round 2: emailKey()', () => {
  it('never grows one character past 18 code points (the key length check allows 254 x 18)', () => {
    let max = 0;
    for (let cp = 0; cp <= 0x10ffff; cp++) {
      if (cp >= 0xd800 && cp <= 0xdfff) continue;
      max = Math.max(max, codePoints(emailKey(String.fromCodePoint(cp))));
    }
    expect(max).toBe(18);
  });

  it('always yields a key that is NFKC-stable (case variants cannot split on normalisation)', () => {
    for (let cp = 0; cp <= 0x10ffff; cp++) {
      if (cp >= 0xd800 && cp <= 0xdfff) continue;
      const key = emailKey(`a${String.fromCodePoint(cp)}@x.test`);
      expect(key.normalize('NFKC')).toBe(key);
    }
  });

  it('expands U+FDFA to 18 code points and 254 of them to the 4572 the column allows', () => {
    expect(codePoints(emailKey('ﷺ'))).toBe(18);
    expect(codePoints(emailKey('ﷺ'.repeat(254)))).toBe(4572);
  });

  it('trims every JavaScript whitespace character, including NBSP, ideographic space and BOM', () => {
    expect(emailKey(' 　﻿ a@x.test \t')).toBe('a@x.test');
    expect(emailKey(' \t\n ')).toBe('');
  });

  it('does not depend on the process locale: dotted capital I keeps its combining dot, I lowers to i', () => {
    expect(emailKey('İSTANBUL@x.test')).toBe('i̇stanbul@x.test');
    expect(emailKey('ISTANBUL@x.test')).toBe('istanbul@x.test');
    expect(emailKey('ıstanbul@x.test')).toBe('ıstanbul@x.test');
    expect(emailKey('İ@x.test')).not.toBe(emailKey('i@x.test'));
    expect(emailKey('I@x.test')).not.toBe(emailKey('ı@x.test'));
  });

  it('keeps ß distinct from ss (lower-casing, not case folding) and folds ẞ to ß', () => {
    expect(emailKey('STRAẞE@x.test')).toBe(emailKey('straße@x.test'));
    expect(emailKey('STRASSE@x.test')).not.toBe(emailKey('straße@x.test'));
  });

  it('notes: trim runs before NFKC, so 50 spacing marks yield a key that is not a fixed point', () => {
    // Harmless while emailKey() is only applied to the typed address; applied to a stored key it
    // would drift. Recorded as a Low note, not a bug.
    expect(emailKey('¨')).toBe(' ̈');
    expect(emailKey(emailKey('¨'))).toBe('̈');
  });
});

describe('QA round 2: describeConnectionFailure()', () => {
  const refused = Object.assign(new Error(''), { code: 'ECONNREFUSED' });
  const wrapped = new AggregateError([refused, refused], '');

  it.each([
    ['postgres://u:secret@localhost:1/pulse', 'localhost:1'],
    ['postgres://u:secret@localhost/pulse', 'localhost:5432'],
    ['postgres://u:secret@[::1]:15432/pulse', '[::1]:15432'],
    ['postgres://u:secret@[2001:db8::1]/pulse', '[2001:db8::1]:5432'],
    ['postgres://u:p%40ss%2Fw%3Ard%23@db.internal:6543/pulse', 'db.internal:6543'],
    ['postgres://u:p@ss/w:rd#?@db.internal:6543/pulse', 'ss'],
  ])('names host and port for %s and never the credentials', (url, target) => {
    const message = describeConnectionFailure(wrapped, url)?.message ?? '';
    expect(message).toContain(`at ${target}`);
    for (const secret of ['secret', 'p%40ss', 'p@ss', 'w:rd', 'u:']) {
      expect(message).not.toContain(secret);
    }
  });

  it('falls back to generic wording for an unparseable URL, still without the URL', () => {
    const message = describeConnectionFailure(wrapped, 'not a url with password hunter2')?.message;
    expect(message).toContain('the configured host');
    expect(message).not.toContain('hunter2');
  });

  it('passes other errors through (wrong password, missing database)', () => {
    expect(describeConnectionFailure(new Error('password authentication failed'), 'x')).toBe(
      undefined,
    );
    expect(describeConnectionFailure('boom', 'x')).toBe(undefined);
    expect(describeConnectionFailure(null, 'x')).toBe(undefined);
  });
});

interface Cluster {
  readonly label: string;
  readonly locale: string | undefined;
}

describe.skipIf(databaseTestsSkipped).each<Cluster>([
  { label: 'default locale', locale: undefined },
  { label: 'C locale', locale: 'C' },
])('QA round 2: email_key on a $label database', ({ locale }) => {
  const adminUrl = new URL(
    process.env['PULSE_TEST_DATABASE_URL'] ?? 'postgres://pulse:pulse@localhost:5432/postgres',
  );
  const name = `pulse_test_qa2_${randomBytes(4).toString('hex')}`;
  let db: Kysely<Database>;

  async function admin(statement: string): Promise<void> {
    const client = new pg.Client({ connectionString: adminUrl.href });
    await client.connect();
    try {
      await client.query(statement);
    } finally {
      await client.end();
    }
  }

  async function code(work: PromiseLike<unknown>): Promise<string> {
    try {
      await work;
    } catch (error) {
      return (error as { code?: string }).code ?? 'unknown';
    }
    return 'ok';
  }

  const add = (email: string, key = emailKey(email)) =>
    sql`insert into users (id, email, email_key, password_hash)
      values (${randomUUID()}, ${email}, ${key}, 'h')`.execute(db);

  beforeAll(async () => {
    await admin(
      locale === undefined
        ? `create database ${name}`
        : `create database ${name} template template0 encoding 'UTF8' locale '${locale}'`,
    );
    const target = new URL(adminUrl.href);
    target.pathname = `/${name}`;
    db = createDatabase(target.href);
    await migrate(db, 'up');
  });
  afterAll(async () => {
    await db.destroy();
    await admin(`drop database if exists ${name} with (force)`);
  });

  it.each([
    ['JÉRÔME@x.test', 'jérôme@x.test'],
    ['ИВАН@x.test', 'иван@x.test'],
    ['ΣΟΦΊΑ@x.test', 'σοφία@x.test'],
    ['STRAẞE@x.test', 'straße@x.test'],
    ['ＡＤＡ@x.test', 'ada@x.test'],
    ['Kate@x.test', 'kate@x.test'],
    ['café@x.test', 'café@x.test'],
    ['  white@x.test  ', 'WHITE@x.test'],
    [' nbsp@x.test', 'NBSP@x.test'],
    ['İSTANBUL@x.test', 'i̇stanbul@x.test'],
    ['ISTANBUL@x.test', 'istanbul@x.test'],
    ['ıSPARTA@x.test', 'ıSparta@x.test'],
  ])('rejects %j then %j as one account (unique violation on users_email_key)', async (a, b) => {
    await add(a);
    const result = await sql`insert into users (id, email, email_key, password_hash)
      values (${randomUUID()}, ${b}, ${emailKey(b)}, 'h')`
      .execute(db)
      .then(
        () => 'ok',
        (error: unknown) => {
          const { code: errorCode, constraint } = error as { code?: string; constraint?: string };
          return `${errorCode} ${constraint}`;
        },
      );
    expect(result).toBe('23505 users_email_key');
  });

  it('keeps Turkish dotted capital I, dotless i, ß vs ss as different accounts', async () => {
    expect(await code(add('turk-İ@x.test'))).toBe('ok');
    expect(await code(add('turk-i@x.test'))).toBe('ok');
    expect(await code(add('turk-ı@x.test'))).toBe('ok');
    expect(await code(add('grüss@x.test'))).toBe('ok');
    expect(await code(add('grüß@x.test'))).toBe('ok');
  });

  it('finds the account by the key of whatever the user types', async () => {
    await add('Jérôme.Lookup@Example.TEST');
    const found = await sql<{ email: string }>`select email from users
      where email_key = ${emailKey('  JÉRÔME.LOOKUP@example.test ')}`.execute(db);
    expect(found.rows).toEqual([{ email: 'Jérôme.Lookup@Example.TEST' }]);
  });

  it('accepts a 254-character email whose key is 4572 characters (U+FDFA x 254)', async () => {
    const email = 'ﷺ'.repeat(254);
    expect(codePoints(email)).toBe(254);
    expect(codePoints(emailKey(email))).toBe(4572);
    expect(await code(add(email))).toBe('ok');
    const stored = await sql<{ e: number; k: number }>`select char_length(email) as e,
      char_length(email_key) as k from users where email_key = ${emailKey(email)}`.execute(db);
    expect(stored.rows).toEqual([{ e: 254, k: 4572 }]);
  });

  it('accepts 254 astral characters and rejects 255 (check counts code points, not UTF-16 units)', async () => {
    expect(await code(add('😀'.repeat(254)))).toBe('ok');
    expect(await code(add('😀'.repeat(255)))).toBe('23514');
  });

  it('rejects a 255-character email even when the key is short, and a 4573-character key', async () => {
    expect(await code(add('a'.repeat(255)))).toBe('23514');
    expect(await code(add('ok-address@x.test', 'k'.repeat(4573)))).toBe('23514');
    expect(await code(add('ok-address2@x.test', 'k'.repeat(4572)))).toBe('ok');
  });

  it('rejects blank and whitespace-only emails (empty key) and a null key', async () => {
    for (const blank of ['', ' ', '   ', '\t\n', ' ', '　', '﻿']) {
      expect(await code(add(blank, emailKey(blank))), JSON.stringify(blank)).toBe('23514');
    }
    expect(
      await code(
        sql`insert into users (id, email, email_key, password_hash)
      values (${randomUUID()}, 'n@x.test', null, 'h')`.execute(db),
      ),
    ).toBe('23502');
  });

  it('an UPDATE that moves the key onto another account is refused', async () => {
    await add('upd-a@x.test');
    await add('upd-b@x.test');
    expect(
      await code(
        sql`update users set email = 'UPD-A@x.test', email_key = ${emailKey('upd-a@x.test')}
        where email_key = ${emailKey('upd-b@x.test')}`.execute(db),
      ),
    ).toBe('23505');
  });

  it('has no lower(email) index left and exactly one unique constraint on the key', async () => {
    const indexes = await sql<{ indexdef: string }>`select indexdef from pg_indexes
      where tablename = 'users'`.execute(db);
    const defs = indexes.rows.map((row) => row.indexdef);
    expect(defs.some((def) => /lower\(/i.test(def))).toBe(false);
    expect(defs.filter((def) => def.includes('(email_key)'))).toHaveLength(1);
  });

  it('rolls back to zero objects and re-applies, twice, with data present', async () => {
    await migrate(db, 'down');
    const left = await sql<{ n: number }>`select count(*) as n from pg_class c
      join pg_namespace s on s.oid = c.relnamespace
      where s.nspname = 'public'`.execute(db);
    expect(left.rows[0]?.n).toBe(0);
    for (let round = 0; round < 2; round++) {
      expect((await migrate(db, 'up')).ids).toEqual(['0001']);
      await add(`round-${round}@x.test`);
      await migrate(db, 'down');
    }
    const procs = await sql<{ n: number }>`select count(*) as n from pg_proc p
      join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public'`.execute(db);
    expect(procs.rows[0]?.n).toBe(0);
    await migrate(db, 'up');
    const column = await sql<{
      is_nullable: string;
    }>`select is_nullable from information_schema.columns
      where table_name = 'users' and column_name = 'email_key'`.execute(db);
    expect(column.rows).toEqual([{ is_nullable: 'NO' }]);
  });
});
