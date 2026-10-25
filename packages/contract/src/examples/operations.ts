// One example per fully specified operation. The mapped type below makes a missing operation or a
// wrong shape a type error; examples.spec.ts also parses each one with its schema.
import type {
  HttpOperationName,
  OperationBody,
  OperationParams,
  OperationQuery,
  OperationResponse,
  Present,
} from '../catalogue.js';
import * as sample from './samples.js';

/** Query values are examples of the URL text, not of the parsed values. */
type QueryText<Name extends HttpOperationName> = [OperationQuery<Name>] extends [undefined]
  ? undefined
  : { [Key in keyof OperationQuery<Name>]?: string };

export type OperationExample<Name extends HttpOperationName> = Present<
  'params',
  OperationParams<Name>
> &
  Present<'query', QueryText<Name>> &
  Present<'body', OperationBody<Name>> &
  Present<'response', OperationResponse<Name>>;

const command = { commandId: sample.ids.command };
const replayed = { ...command, occurredAt: '2026-10-25T08:00:00Z' };
const authSession = {
  accessToken: 'example-access-token',
  accessTokenExpiresAt: '2026-10-25T08:15:00Z',
  refreshToken: 'example-refresh-token',
  refreshTokenExpiresAt: '2026-11-24T08:00:00Z',
  user: sample.user,
};
const deviceInfo = {
  id: sample.ids.device,
  name: 'Ada desktop',
  platform: 'windows',
  appVersion: '1.0.0',
} as const;
const password = { method: 'password', password: 'correct horse battery' } as const;
const running = { running: sample.runningSession };
const tagResult = { revision: 12, tag: sample.tag };

export const operationExamples: { [Name in HttpOperationName]: OperationExample<Name> } = {
  'auth.register': { body: { email: 'ada@example.com', password: 'correct horse battery' } },
  'auth.verifyEmail': { body: { token: 'example-verification-token' } },
  'auth.resendVerification': { body: { email: 'ada@example.com' } },
  'auth.login': {
    body: { email: 'ada@example.com', password: 'correct horse battery', device: deviceInfo },
    response: authSession,
  },
  'auth.signInWithGoogle': {
    body: {
      credential: {
        kind: 'authorizationCode',
        code: 'example-code',
        codeVerifier: 'v'.repeat(43),
        redirectUri: 'http://127.0.0.1:53682/callback',
      },
      device: deviceInfo,
    },
    response: authSession,
  },
  'auth.refresh': { body: { refreshToken: 'example-refresh-token' }, response: authSession },
  'auth.logout': {},
  'auth.listDevices': { response: { devices: [sample.device] } },
  'auth.revokeDevice': { params: { deviceId: sample.ids.otherDevice } },
  'auth.changePassword': {
    body: { currentPassword: 'correct horse battery', newPassword: 'another long password' },
  },
  'auth.changeEmail': { body: { newEmail: 'ada@example.org', reauthentication: password } },
  'auth.confirmEmailChange': { body: { token: 'example-email-change-token' } },
  'auth.requestPasswordReset': { body: { email: 'ada@example.com' } },
  'auth.resetPassword': {
    body: { token: 'example-reset-token', newPassword: 'another long password' },
  },
  'auth.getMe': { response: sample.user },
  'auth.completeFirstSignIn': {
    body: { ...command, timezone: 'Asia/Dhaka' },
    response: {
      revision: 3,
      preferences: sample.preferences,
      tags: [sample.tag, sample.gamingTag],
    },
  },
  'auth.deleteAccount': { body: { confirmation: 'DELETE', reauthentication: password } },
  'timer.get': { response: running },
  'timer.start': {
    body: {
      ...replayed,
      sessionId: sample.ids.runningSession,
      title: 'Contract package',
      tagId: sample.ids.tag,
      startedAt: '2026-10-25T08:00:00Z',
    },
    response: { revision: 13, timer: running, warnings: [] },
  },
  'timer.pause': {
    body: { ...command },
    response: { revision: 14, timer: { running: null }, endedSession: sample.session },
  },
  // Sets the title and clears the tag (Untagged).
  'timer.updateRunning': {
    body: { ...command, title: { value: 'Contract package' }, tagId: { value: null } },
    response: {
      revision: 15,
      timer: { running: { ...sample.runningSession, tagId: null } },
      warnings: [],
    },
  },
  'sessions.list': {
    query: { from: '2026-10-19', to: '2026-10-25', category: 'productive', text: 'contract' },
    response: { items: [sample.session], nextCursor: 'example-cursor' },
  },
  'sessions.get': { params: { sessionId: sample.ids.session }, response: sample.session },
  'sessions.create': {
    body: {
      ...replayed,
      sessionId: sample.ids.session,
      startedAt: '2026-10-24T17:30:00Z',
      endedAt: '2026-10-24T18:45:00Z',
      title: 'Contract package',
      tagId: sample.ids.tag,
    },
    response: { revision: 16, session: sample.session, warnings: [] },
  },
  'sessions.update': {
    params: { sessionId: sample.ids.session },
    // Clears the summary and names a tag deleted elsewhere: its replacement is applied (spec 8.5).
    body: { ...command, summary: { value: null }, tagId: { value: sample.ids.otherTag } },
    response: {
      revision: 17,
      session: { ...sample.session, summary: null, tagId: sample.ids.tag },
      warnings: [
        {
          code: 'TAG_REPLACED',
          message: 'The tag was deleted on another device; its replacement was used.',
          tagId: sample.ids.otherTag,
          replacementTagId: sample.ids.tag,
        },
      ],
    },
  },
  'sessions.delete': {
    params: { sessionId: sample.ids.session },
    body: { ...command },
    response: { revision: 18, sessionId: sample.ids.session },
  },
  'tags.list': { response: { tags: [sample.tag, sample.gamingTag] } },
  'tags.create': {
    body: { ...command, tagId: sample.ids.tag, name: 'Deep Work', category: 'productive' },
    response: tagResult,
  },
  'tags.rename': {
    params: { tagId: sample.ids.tag },
    body: { ...command, name: 'Deep Work' },
    response: tagResult,
  },
  'tags.recategorize': {
    params: { tagId: sample.ids.tag },
    body: { ...command, category: 'productive' },
    response: tagResult,
  },
  'tags.setDistractionClass': {
    params: { tagId: sample.ids.otherTag },
    body: { ...command, distractionClass: 'gaming' },
    response: { revision: 12, tag: sample.gamingTag },
  },
  'tags.archive': { params: { tagId: sample.ids.tag }, body: { ...command }, response: tagResult },
  'tags.unarchive': {
    params: { tagId: sample.ids.tag },
    body: { ...command },
    response: tagResult,
  },
  'tags.delete': {
    params: { tagId: sample.ids.otherTag },
    body: { ...command, replacementTagId: null },
    response: { revision: 19, tagId: sample.ids.otherTag, replacementTagId: null },
  },
  'goals.get': { response: sample.goals },
  'goals.set': {
    body: { ...command, kind: 'daily', minutes: 240 },
    response: { revision: 20, goals: sample.goals },
  },
  'preferences.get': { response: sample.preferences },
  'preferences.update': {
    body: { ...command, weekStart: 'sunday', notifications: { gameSuggestion: false } },
    response: { revision: 21, preferences: sample.preferences },
  },
  'push.registerToken': { body: { ...command, token: 'example-fcm-token' } },
  'push.clearToken': { body: { ...command } },
  'sync.getSnapshot': {
    response: {
      revision: 21,
      timer: running,
      preferences: sample.preferences,
      tags: [sample.tag, sample.gamingTag],
      goals: sample.goals,
    },
  },
  'sync.listChanges': {
    query: { since: '19' },
    response: {
      items: [
        { name: 'session.deleted', revision: 20, data: { sessionId: sample.ids.session } },
        { name: 'goals.changed', revision: 21, data: { goals: sample.goals } },
      ],
      nextCursor: null,
      revision: 21,
    },
  },
  'appUpdates.getLatest': { query: { platform: 'android' }, response: sample.release },
  'health.get': { response: { status: 'ok', database: 'up' } },
  'health.live': { response: { status: 'ok' } },
};
