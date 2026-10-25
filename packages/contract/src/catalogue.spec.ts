import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { errorCodesOf, httpOperations, operations, successStatusOf } from './catalogue.js';

const entries = Object.entries(operations);
const httpEntries = httpOperations().map(([name, op]) => ({ name, op }));

describe('operation catalogue (spec 7.2, D-29)', () => {
  it('names every spec 7.2 operation exactly once', () => {
    expect(Object.keys(operations).sort()).toEqual(
      [
        'auth.register',
        'auth.verifyEmail',
        'auth.resendVerification',
        'auth.login',
        'auth.signInWithGoogle',
        'auth.refresh',
        'auth.logout',
        'auth.listDevices',
        'auth.revokeDevice',
        'auth.changePassword',
        'auth.changeEmail',
        'auth.confirmEmailChange',
        'auth.requestPasswordReset',
        'auth.resetPassword',
        'auth.getMe',
        'auth.completeFirstSignIn',
        'auth.deleteAccount',
        'timer.get',
        'timer.start',
        'timer.pause',
        'timer.updateRunning',
        'timer.switch',
        'timer.discard',
        'sessions.list',
        'sessions.get',
        'sessions.create',
        'sessions.update',
        'sessions.delete',
        'tags.list',
        'tags.create',
        'tags.rename',
        'tags.recategorize',
        'tags.setDistractionClass',
        'tags.archive',
        'tags.unarchive',
        'tags.delete',
        'goals.get',
        'goals.set',
        'preferences.get',
        'preferences.update',
        'stats.today',
        'stats.period',
        'stats.dayTimeline',
        'usage.reportIncrements',
        'credits.getBalance',
        'credits.listLedger',
        'credits.getBalanceSeries',
        'credits.getRates',
        'credits.setRates',
        'achievements.list',
        'achievements.markNotified',
        'push.registerToken',
        'push.clearToken',
        'sync.getSnapshot',
        'sync.listChanges',
        'sync.subscribe',
        'data.exportAll',
        'data.exportPeriod',
        'data.import',
        'appUpdates.getLatest',
        'health.get',
        'health.live',
      ].sort(),
    );
  });

  it('prefixes each name with its group', () => {
    for (const [name, op] of entries) expect(name.split('.')[0]).toBe(op.group);
  });

  it('leaves Stats, Credits, Usage, Achievements, Data and the P1/P2 operations name-only (D-29)', () => {
    const nameOnly = entries.filter(([, op]) => op.kind === 'pending').map(([name]) => name);
    const nameOnlyGroups = ['stats', 'usage', 'credits', 'achievements', 'data'];
    for (const [name, op] of entries) {
      if (nameOnlyGroups.includes(op.group)) expect(nameOnly).toContain(name);
    }
    expect(nameOnly).toEqual(
      expect.arrayContaining(['timer.switch', 'timer.discard', 'data.import']),
    );
    const fullyNamedOnly = nameOnly.filter(
      (name) => !nameOnlyGroups.some((group) => name.startsWith(`${group}.`)),
    );
    expect(fullyNamedOnly.sort()).toEqual(['timer.discard', 'timer.switch']);
  });

  it('gives name-only operations no shapes, only the task or feature that defines them', () => {
    for (const [, op] of entries) {
      if (op.kind !== 'pending') continue;
      expect(Object.keys(op).sort()).toEqual(['definedBy', 'group', 'kind', 'priority', 'summary']);
      expect(op.definedBy).toMatch(/^(T\d+\.\d+|[A-Z]+-\d+)$/);
    }
  });

  it('uses unique method and path pairs, versioned under /v1 except health', () => {
    const routes = httpEntries.map(({ op }) => `${op.method} ${op.path}`);
    expect(new Set(routes).size).toBe(routes.length);
    for (const { op } of httpEntries) {
      expect(op.path).toMatch(op.group === 'health' ? /^\/health/ : /^\/v1\//);
    }
  });

  it('declares exactly the path parameters its path template names', () => {
    for (const { op } of httpEntries) {
      const placeholders = [...op.path.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
      const params = op.params ? Object.keys(op.params.shape).sort() : [];
      expect(params).toEqual(placeholders);
    }
  });

  it('reads with GET and no body; writes with POST and a body or none', () => {
    for (const { op } of httpEntries) {
      if (op.method === 'GET') expect(op.body).toBeUndefined();
      else expect(op.query).toBeUndefined();
    }
  });

  it('puts a command ID on every write outside the online-only Auth credential operations (R-34)', () => {
    for (const { name, op } of httpEntries) {
      if (op.method !== 'POST' || (op.group === 'auth' && name !== 'auth.completeFirstSignIn')) {
        continue;
      }
      expect(op.body?.shape, name).toHaveProperty('commandId');
      expect(op.body?.shape, name).toHaveProperty('occurredAt');
    }
  });

  it('returns the new revision from every command (spec 7.2)', () => {
    for (const { name, op } of httpEntries) {
      if (!op.body || !('commandId' in op.body.shape) || op.response === null) continue;
      expect(op.response, name).toBeInstanceOf(z.ZodObject);
      expect((op.response as z.ZodObject).shape, name).toHaveProperty('revision');
    }
  });

  it('never makes a request field both optional and nullable (ADR-0003: clearing is explicit)', () => {
    // Rust skips an absent Option when sending, so it could never send null for such a field.
    const optionalNullable = (object: z.ZodObject, path: string): string[] =>
      Object.entries(object.shape).flatMap(([key, field]: [string, z.ZodType]) => {
        const inner = field instanceof z.ZodOptional ? (field.unwrap() as z.ZodType) : field;
        if (field instanceof z.ZodOptional && inner instanceof z.ZodNullable) {
          return [`${path}.${key}`];
        }
        return inner instanceof z.ZodObject ? optionalNullable(inner, `${path}.${key}`) : [];
      });
    const found = httpEntries.flatMap(({ name, op }) =>
      [op.params, op.query, op.body].flatMap((part) => (part ? optionalNullable(part, name) : [])),
    );
    expect(found).toEqual([]);
  });

  it('patches session fields one by one: absent keeps, { value } sets, { value: null } clears', () => {
    const update = operations['sessions.update'].body;
    const command = { commandId: '0192f1a6-0000-7000-8000-000000000030' };
    expect(update.parse({ ...command, tagId: { value: null } })).toEqual({
      ...command,
      tagId: { value: null },
    });
    expect(update.parse({ ...command, title: { value: 'Deep work' } }).title).toEqual({
      value: 'Deep work',
    });
    expect(update.parse(command)).not.toHaveProperty('summary');
    expect(update.safeParse({ ...command, summary: null }).success).toBe(false);
    expect(update.safeParse({ ...command, summary: {} }).success).toBe(false);
    expect(update.safeParse({ ...command, title: { value: 'x'.repeat(201) } }).success).toBe(false);
    const running = operations['timer.updateRunning'].body;
    expect(running.safeParse({ ...command, tagId: { value: null } }).success).toBe(true);
  });

  it('creates and starts with plain optional fields: absent means none, null is rejected', () => {
    const start = operations['timer.start'].body;
    const command = {
      commandId: '0192f1a6-0000-7000-8000-000000000030',
      sessionId: '0192f1a6-0000-7000-8000-000000000021',
    };
    expect(start.safeParse(command).success).toBe(true);
    expect(start.safeParse({ ...command, tagId: null }).success).toBe(false);
  });

  it('re-authenticates with any Google sign-in form, as sign-in itself does (D-31, QA T0.4 bug 2)', () => {
    const deleteAccount = operations['auth.deleteAccount'].body;
    const google = (credential: unknown) =>
      deleteAccount.safeParse({
        confirmation: 'DELETE',
        reauthentication: { method: 'google', credential },
      }).success;
    // Windows: authorization code + PKCE through the loopback redirect.
    expect(
      google({
        kind: 'authorizationCode',
        code: 'c',
        codeVerifier: 'v'.repeat(43),
        redirectUri: 'http://127.0.0.1:5000/cb',
      }),
    ).toBe(true);
    // Android: an ID token from Credential Manager.
    expect(google({ kind: 'idToken', idToken: 'token' })).toBe(true);
    expect(google({ kind: 'password', password: 'x' })).toBe(false);
    // The same schema object, so T1.6 narrows sign-in and re-authentication together.
    const reauth = operations['auth.changeEmail'].body.shape.reauthentication;
    const googleOption = reauth.options.find((option) => option.shape.method.value === 'google');
    expect(googleOption?.shape).toHaveProperty(
      'credential',
      operations['auth.signInWithGoogle'].body.shape.credential,
    );
  });

  it('rejects unknown fields in every request (spec 9.1)', () => {
    for (const { name, op } of httpEntries) {
      for (const part of [op.params, op.query, op.body]) {
        if (!part) continue;
        expect(part.def.catchall?._zod.def.type, name).toBe('never');
      }
    }
  });

  it('lists the common error codes with each operation', () => {
    const start = operations['timer.start'];
    expect(errorCodesOf(start)).toEqual(
      expect.arrayContaining(['VALIDATION', 'UNAUTHENTICATED', 'CONFLICT', 'INTERNAL']),
    );
    expect(errorCodesOf(operations['health.live'])).not.toContain('UNAUTHENTICATED');
    expect(errorCodesOf(operations['health.live'])).not.toContain('VALIDATION');
  });

  it('answers 200 with a body, or 204 when there is nothing to return', () => {
    expect(successStatusOf(operations['timer.start'])).toBe(200);
    expect(successStatusOf(operations['auth.logout'])).toBe(204);
  });
});
