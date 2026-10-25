// Sync, App updates and Health group operations (spec 7.2).
import { AppRelease } from '../entities.js';
import { ClientMessage, ServerMessage } from '../events.js';
import * as system from '../operations/system.js';
import { http } from '../operation.js';

export const systemOperations = {
  'sync.getSnapshot': http({
    group: 'sync',
    summary: 'The state snapshot at the current revision (SYNC-07).',
    method: 'GET',
    path: '/v1/sync/snapshot',
    auth: 'user',
    response: system.SyncSnapshot,
    errors: [],
  }),
  'sync.listChanges': http({
    group: 'sync',
    summary: 'Changes since a revision, tombstones included (R-35, spec 8.4).',
    method: 'GET',
    path: '/v1/sync/changes',
    auth: 'user',
    query: system.SyncChangesQuery,
    response: system.SyncChangesPage,
    errors: [],
  }),
  'sync.subscribe': {
    kind: 'realtime',
    group: 'sync',
    summary: 'WebSocket event stream: authenticate with an auth message, then receive events.',
    path: '/v1/sync/stream',
    auth: 'user',
    clientMessage: ClientMessage,
    serverMessage: ServerMessage,
  },
  'appUpdates.getLatest': http({
    group: 'appUpdates',
    summary: 'The latest release for a platform; NOT_FOUND when none is published.',
    method: 'GET',
    path: '/v1/app-updates/latest',
    auth: 'none',
    query: system.LatestReleaseQuery,
    response: AppRelease,
    errors: ['NOT_FOUND'],
  }),
  'health.get': http({
    group: 'health',
    summary: 'API and database status; 503 UNAVAILABLE when the database is down (OPS-01).',
    method: 'GET',
    path: '/health',
    auth: 'none',
    response: system.HealthReport,
    errors: [],
  }),
  'health.live': http({
    group: 'health',
    summary: 'Liveness: the process answers.',
    method: 'GET',
    path: '/health/live',
    auth: 'none',
    response: system.LivenessReport,
    errors: [],
  }),
} as const;
