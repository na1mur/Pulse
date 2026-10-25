// Example payloads: the mock server answers with them, generate writes them to
// generated/examples.json for the Rust conformance test, and examples.spec.ts validates them.
import type { ErrorBody } from '../errors.js';
import type { ClientMessage, Event, EventName, ServerMessage } from '../events.js';
import * as sample from './samples.js';

export { operationExamples, type OperationExample } from './operations.js';

export const eventExamples: { [Name in EventName]: Extract<Event, { name: Name }> } = {
  'timer.changed': {
    name: 'timer.changed',
    revision: 13,
    data: { change: 'started', timer: { running: sample.runningSession } },
  },
  'session.upserted': { name: 'session.upserted', revision: 14, data: { session: sample.session } },
  'session.deleted': {
    name: 'session.deleted',
    revision: 15,
    data: { sessionId: sample.ids.session },
  },
  'tag.upserted': { name: 'tag.upserted', revision: 16, data: { tag: sample.tag } },
  'tag.deleted': {
    name: 'tag.deleted',
    revision: 17,
    data: { tagId: sample.ids.otherTag, replacementTagId: sample.ids.tag },
  },
  'goals.changed': { name: 'goals.changed', revision: 18, data: { goals: sample.goals } },
  'preferences.changed': {
    name: 'preferences.changed',
    revision: 19,
    data: { preferences: sample.preferences },
  },
  'achievement.unlocked': {
    name: 'achievement.unlocked',
    revision: 20,
    data: {
      achievement: {
        kind: 'weekly',
        periodId: 'W2026-10-19',
        achievedAt: '2026-10-25T09:00:00Z',
        productiveMinutes: 1200,
        targetMinutes: 1200,
      },
    },
  },
  'credits.changed': { name: 'credits.changed', revision: 21, data: { credits: sample.credits } },
  'credentials.revoked': {
    name: 'credentials.revoked',
    revision: 22,
    data: { deviceId: sample.ids.otherDevice },
  },
};

export const clientMessageExamples: ClientMessage[] = [
  { type: 'auth', accessToken: 'example-access-token' },
  { type: 'ping' },
];

export const errorExamples: ErrorBody[] = [
  {
    code: 'VALIDATION',
    message: 'The request is invalid.',
    requestId: 'example-request-1',
    details: {
      fields: [{ path: 'body.title', message: 'Too big: expected at most 200 characters' }],
    },
  },
  { code: 'UNAUTHENTICATED', message: 'Sign in again.', requestId: 'example-request-2' },
  { code: 'FORBIDDEN', message: 'Not allowed.', requestId: 'example-request-3' },
  { code: 'NOT_FOUND', message: 'Not found.', requestId: 'example-request-4' },
  {
    code: 'CONFLICT',
    message: 'The session overlaps another session.',
    requestId: 'example-request-5',
    details: { conflictingSessionId: sample.ids.session },
  },
  { code: 'RATE_LIMITED', message: 'Try again in a minute.', requestId: 'example-request-6' },
  { code: 'UNAVAILABLE', message: 'The database is unavailable.', requestId: 'example-request-7' },
  { code: 'INTERNAL', message: 'Something went wrong.', requestId: 'example-request-8' },
];

export const serverMessageExamples: ServerMessage[] = [
  { type: 'ready', serverTime: '2026-10-25T08:00:00.123Z', revision: 12 },
  { type: 'event', serverTime: '2026-10-25T08:00:01.000Z', event: eventExamples['timer.changed'] },
  { type: 'pong', serverTime: '2026-10-25T08:00:30.000Z' },
  {
    type: 'error',
    serverTime: '2026-10-25T08:00:31.000Z',
    error: { code: 'UNAUTHENTICATED', message: 'Sign in again.', requestId: 'example-request-9' },
  },
];
