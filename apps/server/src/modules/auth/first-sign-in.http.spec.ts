// AUTH-12, TAG-07, US-6.1, US-4.1 (third AC), R-15, R-34, R-35: completing first sign-in confirms
// the timezone and creates the starter tags exactly once, idempotently, in one transaction.
import { randomUUID } from 'node:crypto';
import { CompleteFirstSignInResult } from '@pulse/contract';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { databaseTestsSkipped } from '../../platform/database/test-database.testing.js';
import { TagsRepository } from '../tags/tags.repository.js';
import {
  startAuthHarness,
  type ApiResponse,
  type AuthHarness,
  type SignedIn,
} from './auth.testing.js';

const STARTER = [
  ['Deep Work', 'productive', null],
  ['Learning', 'productive', null],
  ['Meeting', 'neutral', null],
  ['Admin', 'neutral', null],
  ['Break', 'neutral', null],
  ['Gaming', 'leisure', 'gaming'],
  ['Social Media', 'leisure', 'social'],
] as const;

describe.skipIf(databaseTestsSkipped)('auth.completeFirstSignIn (AUTH-12, TAG-07, US-6.1)', () => {
  let h: AuthHarness;

  beforeAll(async () => {
    h = await startAuthHarness();
  });
  afterAll(async () => {
    await h.close();
  });

  async function newUser(): Promise<SignedIn> {
    return h.signIn(await h.verifiedAccount());
  }
  const complete = (user: SignedIn, body: Record<string, unknown> = {}): Promise<ApiResponse> =>
    h.post(
      '/v1/me/first-sign-in',
      { commandId: randomUUID(), timezone: 'Asia/Dhaka', ...body },
      { token: user.accessToken },
    );
  const tagsOf = (userId: string) =>
    h.db
      .selectFrom('tags')
      .selectAll()
      .where('user_id', '=', userId)
      .orderBy('created_at')
      .orderBy('name')
      .execute();
  const revisionOf = async (userId: string): Promise<number> =>
    (
      await h.db
        .selectFrom('user_revisions')
        .select('revision')
        .where('user_id', '=', userId)
        .executeTakeFirstOrThrow()
    ).revision;
  const preferencesOf = (userId: string) =>
    h.db
      .selectFrom('user_preferences')
      .selectAll()
      .where('user_id', '=', userId)
      .executeTakeFirstOrThrow();

  it('confirms the timezone and gives the seven starter tags, in the result and in the database', async () => {
    const user = await newUser();
    expect(await revisionOf(user.userId)).toBe(0);
    const response = await complete(user, { timezone: 'Europe/Berlin' });
    expect(response.status).toBe(200);
    const result = CompleteFirstSignInResult.parse(response.body);

    expect(result.revision).toBe(1);
    expect(result.preferences).toMatchObject({
      timezone: 'Europe/Berlin',
      weekStart: 'monday',
      countWeekends: true,
      timeFormat: 'system',
      theme: 'system',
      notifications: {
        creditLow: true,
        creditZero: true,
        creditBelowZero: true,
        dailyGoal: true,
        weeklyMonthlyGoal: true,
        gameSuggestion: true,
      },
      onboardingCompletedAt: '2026-10-27T10:00:00.000Z',
    });
    expect(result.tags.map((tag) => [tag.name, tag.category, tag.distractionClass])).toEqual(
      STARTER.map((tag) => [...tag]),
    );
    expect(result.tags.every((tag) => !tag.archived)).toBe(true);

    const rows = await tagsOf(user.userId);
    expect(rows).toHaveLength(7);
    expect(rows.every((row) => row.revision === 1 && row.deleted_at === null)).toBe(true);
    expect(rows.find((row) => row.name === 'Social Media')?.name_key).toBe('social media');
    expect(new Set(rows.map((row) => row.id))).toEqual(new Set(result.tags.map((tag) => tag.id)));
    const preferences = await preferencesOf(user.userId);
    expect(preferences).toMatchObject({ timezone: 'Europe/Berlin', revision: 1 });
    expect(await revisionOf(user.userId)).toBe(1);
  });

  it('stores the timezone in its IANA spelling whatever case the device sent', async () => {
    const user = await newUser();
    const result = CompleteFirstSignInResult.parse(
      (await complete(user, { timezone: 'asia/dhaka' })).body,
    );
    expect(result.preferences.timezone).toBe('Asia/Dhaka');
    expect((await preferencesOf(user.userId)).timezone).toBe('Asia/Dhaka');
  });

  it.each(['Mars/Olympus_Mons', '+02:00', '', 'Asia/Dhaka ', 'GMT+2:00', 'x'.repeat(65)])(
    'refuses the timezone %j and changes nothing',
    async (timezone) => {
      const user = await newUser();
      const response = await complete(user, { timezone });
      expect(response.status).toBe(400);
      expect((await preferencesOf(user.userId)).timezone).toBeNull();
      expect(await tagsOf(user.userId)).toHaveLength(0);
      expect(await revisionOf(user.userId)).toBe(0);
    },
  );

  it('replays a command ID with the original result and creates nothing twice', async () => {
    const user = await newUser();
    const commandId = randomUUID();
    const first = await complete(user, { commandId });
    const second = await complete(user, { commandId });
    const third = await complete(user, { commandId, timezone: 'Asia/Tokyo' });
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    // Even a replay that carries other values answers what the first one did: the ID is the command.
    expect(third.body).toEqual(first.body);
    expect(await tagsOf(user.userId)).toHaveLength(7);
    expect(await revisionOf(user.userId)).toBe(1);
    const stored = await h.db
      .selectFrom('processed_commands')
      .selectAll()
      .where('user_id', '=', user.userId)
      .execute();
    expect(stored).toHaveLength(1);
  });

  it('answers a replay with the result of the time, not of today', async () => {
    const user = await newUser();
    const commandId = randomUUID();
    const first = await complete(user, { commandId });
    await h.db
      .updateTable('tags')
      .set({ archived: true })
      .where('user_id', '=', user.userId)
      .execute();
    await h.db
      .updateTable('user_preferences')
      .set({ theme: 'dark' })
      .where('user_id', '=', user.userId)
      .execute();
    expect((await complete(user, { commandId })).body).toEqual(first.body);
  });

  it('keeps one set of tags when the same command arrives many times at once', async () => {
    const user = await newUser();
    const commandId = randomUUID();
    const answers = await Promise.all(
      Array.from({ length: 8 }, () => complete(user, { commandId })),
    );
    expect(answers.map((answer) => answer.status)).toEqual(Array<number>(8).fill(200));
    // Equal as data (a stored result reads back with its JSON keys in the database's order).
    for (const answer of answers) expect(answer.body).toEqual(answers[0]?.body);
    expect(await tagsOf(user.userId)).toHaveLength(7);
    expect(await revisionOf(user.userId)).toBe(1);
  });

  it('keeps one set of tags when different commands race (two devices finishing setup together)', async () => {
    const user = await newUser();
    const answers = await Promise.all(Array.from({ length: 8 }, () => complete(user)));
    expect(answers.map((answer) => answer.status)).toEqual(Array<number>(8).fill(200));
    expect(await tagsOf(user.userId)).toHaveLength(7);
    expect(await revisionOf(user.userId)).toBe(1);
    const revisions = answers.map((answer) => (answer.body as { revision: number }).revision);
    expect(new Set(revisions)).toEqual(new Set([1]));
    // Every answer lists the same seven tags.
    const ids = answers.map((answer) =>
      (answer.body as { tags: { id: string }[] }).tags
        .map((tag) => tag.id)
        .sort()
        .join(),
    );
    expect(new Set(ids).size).toBe(1);
  });

  it('never changes a confirmed timezone silently (R-15): a later setup command answers the current state', async () => {
    const user = await newUser();
    await complete(user, { timezone: 'Asia/Dhaka' });
    const second = await complete(user, { timezone: 'America/New_York' });
    expect(second.status).toBe(200);
    const result = CompleteFirstSignInResult.parse(second.body);
    expect(result.preferences.timezone).toBe('Asia/Dhaka');
    expect(result.tags).toHaveLength(7);
    expect(result.revision).toBe(1);
    expect(await revisionOf(user.userId)).toBe(1);
    expect(await tagsOf(user.userId)).toHaveLength(7);
  });

  it('does not recreate a starter tag the user has deleted or renamed', async () => {
    const user = await newUser();
    await complete(user);
    await h.db
      .updateTable('tags')
      .set({ deleted_at: new Date(), revision: 2 })
      .where('user_id', '=', user.userId)
      .where('name', '=', 'Break')
      .execute();
    await complete(user);
    const rows = await tagsOf(user.userId);
    expect(rows).toHaveLength(7);
    expect(rows.filter((row) => row.deleted_at === null)).toHaveLength(6);
  });

  it('scopes everything to the signed-in user: another account with the same command ID gets its own', async () => {
    const alice = await newUser();
    const bob = await newUser();
    const commandId = randomUUID();
    const first = CompleteFirstSignInResult.parse(
      (await complete(alice, { commandId, timezone: 'Asia/Dhaka' })).body,
    );
    const second = CompleteFirstSignInResult.parse(
      (await complete(bob, { commandId, timezone: 'Europe/Paris' })).body,
    );
    expect(second.preferences.timezone).toBe('Europe/Paris');
    expect(second.tags.map((tag) => tag.id)).not.toEqual(
      expect.arrayContaining(first.tags.map((tag) => tag.id)),
    );
    expect(await tagsOf(alice.userId)).toHaveLength(7);
    expect(await tagsOf(bob.userId)).toHaveLength(7);
    expect((await preferencesOf(alice.userId)).timezone).toBe('Asia/Dhaka');
  });

  it('uses the occurred-at of a replayed command, clamped to what is possible (R-03)', async () => {
    /** Signs up a user, lets ten minutes pass (the access token lives 15), and completes setup claiming `occurredAt(created)`. */
    async function completedAt(
      occurredAt: (created: number) => string,
    ): Promise<{ completedAt: string | null; created: number; now: number }> {
      const user = await newUser();
      const row = await h.db
        .selectFrom('users')
        .select('created_at')
        .where('id', '=', user.userId)
        .executeTakeFirstOrThrow();
      const created = row.created_at.getTime();
      h.clock.advance({ minutes: 10 });
      const response = await complete(user, { occurredAt: occurredAt(created) });
      const result = CompleteFirstSignInResult.parse(response.body);
      return {
        completedAt: result.preferences.onboardingCompletedAt,
        created,
        now: h.clock.now().epochMilliseconds,
      };
    }
    const at = (milliseconds: number): string => new Date(milliseconds).toISOString();

    // Honoured: five minutes after the account existed, five minutes before now.
    const honoured = await completedAt((created) => at(created + 5 * 60_000));
    expect(honoured.completedAt).toBe(at(honoured.created + 5 * 60_000));
    // In the future (a device clock running ahead): server time.
    const future = await completedAt(() => '2099-01-01T00:00:00Z');
    expect(future.completedAt).toBe(at(future.now));
    // Before the account existed: the instant the account was created.
    const past = await completedAt(() => '2020-01-01T00:00:00Z');
    expect(past.completedAt).toBe(at(past.created));
  });

  it('is all or nothing: a failure while creating the tags leaves no timezone, no revision, no command', async () => {
    const user = await newUser();
    const commandId = randomUUID();
    const spy = vi
      .spyOn(TagsRepository.prototype, 'insertMany')
      .mockRejectedValueOnce(new Error('disk full'));
    const failed = await complete(user, { commandId });
    spy.mockRestore();
    expect(failed.status).toBe(500);
    expect((await preferencesOf(user.userId)).timezone).toBeNull();
    expect(await tagsOf(user.userId)).toHaveLength(0);
    expect(await revisionOf(user.userId)).toBe(0);
    const stored = await h.db
      .selectFrom('processed_commands')
      .select('command_id')
      .where('user_id', '=', user.userId)
      .execute();
    expect(stored).toHaveLength(0);
    // The same command, retried, now works.
    const retried = await complete(user, { commandId });
    expect(retried.status).toBe(200);
    expect(await tagsOf(user.userId)).toHaveLength(7);
  });

  it('needs a signed-in device and a valid command', async () => {
    const user = await newUser();
    expect(
      (await h.post('/v1/me/first-sign-in', { commandId: randomUUID(), timezone: 'Asia/Dhaka' }))
        .status,
    ).toBe(401);
    expect((await complete(user, { commandId: 'not-a-uuid' })).status).toBe(400);
    expect((await complete(user, { extra: true })).status).toBe(400);
    expect(
      (
        await h.post(
          '/v1/me/first-sign-in',
          { timezone: 'Asia/Dhaka' },
          { token: user.accessToken },
        )
      ).status,
    ).toBe(400);
    expect(await tagsOf(user.userId)).toHaveLength(0);
  });

  it('keeps no credential in the idempotency store', async () => {
    const user = await newUser();
    await complete(user);
    const stored = JSON.stringify(
      await h.db
        .selectFrom('processed_commands')
        .selectAll()
        .where('user_id', '=', user.userId)
        .execute(),
    );
    expect(stored).not.toContain(user.accessToken);
    expect(stored).not.toContain(user.refreshToken);
    expect(stored).not.toMatch(/token|password|hash/i);
  });
});
