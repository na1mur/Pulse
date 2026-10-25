import { describe, expect, it } from 'vitest';
import { ClientMessage, DataEvent, Event, ServerMessage } from './events.js';

describe('events and realtime messages (spec 7.3, 8.4)', () => {
  it('defines every spec 7.3 event', () => {
    expect(Event.options.map((option) => option.shape.name.value)).toEqual([
      'timer.changed',
      'session.upserted',
      'session.deleted',
      'tag.upserted',
      'tag.deleted',
      'goals.changed',
      'preferences.changed',
      'achievement.unlocked',
      'credits.changed',
      'credentials.revoked',
    ]);
  });

  it('gives every event a revision (R-35)', () => {
    for (const option of Event.options) expect(option.shape).toHaveProperty('revision');
    expect(
      Event.safeParse({ name: 'session.deleted', data: { sessionId: crypto.randomUUID() } })
        .success,
    ).toBe(false);
  });

  it('keeps credential revocation out of the change feed', () => {
    expect(DataEvent.options.map((option) => option.shape.name.value)).not.toContain(
      'credentials.revoked',
    );
  });

  it('lets clients send only connection-level messages, never state', () => {
    const types = ClientMessage.options.map((option) => option.shape.type.value);
    expect(types).toEqual(['auth', 'ping']);
    expect(ClientMessage.safeParse({ type: 'ping', state: { running: null } }).success).toBe(false);
    expect(
      ClientMessage.safeParse({ type: 'event', event: { name: 'timer.changed' } }).success,
    ).toBe(false);
  });

  it('puts server time on every server message (spec 7.1, 8.2)', () => {
    for (const option of ServerMessage.options) expect(option.shape).toHaveProperty('serverTime');
  });
});
