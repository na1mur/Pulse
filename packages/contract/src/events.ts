// Spec 7.3 events (server to all of the user's devices) and the realtime message envelope.
// Every event carries the revision (R-35). The change feed (spec 8.4) returns the same data
// events, so a client applies a live event and a fetched change with one code path.
import { z } from 'zod';
import {
  Achievement,
  CreditBalanceSnapshot,
  Goals,
  Preferences,
  Session,
  Tag,
  TimerState,
} from './entities.js';
import { ErrorBody } from './errors.js';
import { Id, Instant, Revision } from './primitives.js';

function event<const Name extends string, Data extends z.ZodType>(name: Name, data: Data) {
  return z.object({ name: z.literal(name), revision: Revision, data });
}

export const TimerChangedEvent = event(
  'timer.changed',
  z.object({ change: z.enum(['started', 'paused', 'updated']), timer: TimerState }),
);
export const SessionUpsertedEvent = event('session.upserted', z.object({ session: Session }));
export const SessionDeletedEvent = event('session.deleted', z.object({ sessionId: Id }));
export const TagUpsertedEvent = event('tag.upserted', z.object({ tag: Tag }));
export const TagDeletedEvent = event(
  'tag.deleted',
  z.object({ tagId: Id, replacementTagId: Id.nullable() }),
);
export const GoalsChangedEvent = event('goals.changed', z.object({ goals: Goals }));
export const PreferencesChangedEvent = event(
  'preferences.changed',
  z.object({ preferences: Preferences }),
);
export const AchievementUnlockedEvent = event(
  'achievement.unlocked',
  z.object({ achievement: Achievement }),
);
// ADR-0003: {balance, rates} as spec 7.2 lists them; T5.1 may add an as-of instant (R-45).
export const CreditsChangedEvent = event(
  'credits.changed',
  z.object({ credits: CreditBalanceSnapshot }),
);
/** Forces sign-out on the named device; the server then closes that device's channel. */
export const CredentialsRevokedEvent = event('credentials.revoked', z.object({ deviceId: Id }));

/** Changes to synced data: live events and change-feed entries (tombstones included). */
export const DataEvent = z.discriminatedUnion('name', [
  TimerChangedEvent,
  SessionUpsertedEvent,
  SessionDeletedEvent,
  TagUpsertedEvent,
  TagDeletedEvent,
  GoalsChangedEvent,
  PreferencesChangedEvent,
  AchievementUnlockedEvent,
  CreditsChangedEvent,
]);
export type DataEvent = z.infer<typeof DataEvent>;

/** Every spec 7.3 event. */
export const Event = z.discriminatedUnion('name', [...DataEvent.options, CredentialsRevokedEvent]);
export type Event = z.infer<typeof Event>;
export type EventName = Event['name'];

/**
 * Client to server: connection-level messages only, never state (spec 7.3). `auth` is the first
 * message after connecting and is sent again when credentials rotate (spec 8.4); `ping` asks for
 * a `pong` carrying server time (heartbeat and clock sample, spec 8.2).
 */
export const ClientMessage = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('auth'), accessToken: z.string().min(1).max(4096) }),
  z.strictObject({ type: z.literal('ping') }),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

/** Server to client. Every message carries server time; `ready` answers a valid `auth`. */
export const ServerMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready'), serverTime: Instant, revision: Revision }),
  z.object({ type: z.literal('event'), serverTime: Instant, event: Event }),
  z.object({ type: z.literal('pong'), serverTime: Instant }),
  /** Sent before the server closes the channel (invalid message, failed auth, revocation). */
  z.object({ type: z.literal('error'), serverTime: Instant, error: ErrorBody }),
]);
export type ServerMessage = z.infer<typeof ServerMessage>;
