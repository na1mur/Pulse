// Tags, Goals, Preferences and Push group operations (spec 7.2).
import type { z } from 'zod';
import { Goals, Preferences } from '../entities.js';
import * as settings from '../operations/settings.js';
import { http, type HttpOperation } from '../operation.js';

const tagOperation = (
  name: string,
  summary: string,
  body: z.ZodObject,
  errors: HttpOperation['errors'] = ['NOT_FOUND'],
) =>
  http({
    group: 'tags',
    summary,
    method: 'POST',
    path: `/v1/tags/{tagId}/${name}`,
    auth: 'user',
    params: settings.TagParams,
    body,
    response: settings.TagResult,
    errors,
  });

export const settingsOperations = {
  'tags.list': http({
    group: 'tags',
    summary: 'All tags, archived included.',
    method: 'GET',
    path: '/v1/tags',
    auth: 'user',
    response: settings.TagList,
    errors: [],
  }),
  'tags.create': http({
    group: 'tags',
    summary: 'Create a tag; a taken name is CONFLICT naming the existing tag (TAG-01, R-29).',
    method: 'POST',
    path: '/v1/tags',
    auth: 'user',
    body: settings.CreateTagRequest,
    response: settings.TagResult,
    errors: ['CONFLICT'],
  }),
  'tags.rename': tagOperation('rename', 'Rename a tag (R-30).', settings.RenameTagRequest, [
    'NOT_FOUND',
    'CONFLICT',
  ]),
  'tags.recategorize': tagOperation(
    'recategorize',
    "Change a tag's category for all its sessions (TAG-06, R-50).",
    settings.RecategorizeTagRequest,
  ),
  'tags.setDistractionClass': tagOperation(
    'distraction-class',
    'Link a Leisure tag to Gaming or Social Media, or unlink it (TAG-08).',
    settings.SetDistractionClassRequest,
  ),
  'tags.archive': tagOperation(
    'archive',
    'Archive a tag (TAG-05, R-52).',
    settings.TagCommandRequest,
  ),
  'tags.unarchive': tagOperation(
    'unarchive',
    'Unarchive a tag (TAG-05).',
    settings.TagCommandRequest,
  ),
  'tags.delete': http({
    group: 'tags',
    summary: 'Delete a tag, moving its sessions to a replacement or Untagged (TAG-03, R-30).',
    method: 'POST',
    path: '/v1/tags/{tagId}/delete',
    auth: 'user',
    params: settings.TagParams,
    body: settings.DeleteTagRequest,
    response: settings.DeleteTagResult,
    errors: ['NOT_FOUND'],
  }),
  'goals.get': http({
    group: 'goals',
    summary: 'Current goals and their effective-dated history (R-19, R-20).',
    method: 'GET',
    path: '/v1/goals',
    auth: 'user',
    response: Goals,
    errors: [],
  }),
  'goals.set': http({
    group: 'goals',
    summary: 'Set or unset one goal from the current period on (GOAL-01, R-20).',
    method: 'POST',
    path: '/v1/goals/set',
    auth: 'user',
    body: settings.SetGoalRequest,
    response: settings.GoalsResult,
    errors: [],
  }),
  'preferences.get': http({
    group: 'preferences',
    summary: 'Account preferences.',
    method: 'GET',
    path: '/v1/preferences',
    auth: 'user',
    response: Preferences,
    errors: [],
  }),
  'preferences.update': http({
    group: 'preferences',
    summary: 'Change account preferences (SET-01..SET-03, NOTIF-03).',
    method: 'POST',
    path: '/v1/preferences/update',
    auth: 'user',
    body: settings.UpdatePreferencesRequest,
    response: settings.PreferencesResult,
    errors: [],
  }),
  'push.registerToken': http({
    group: 'push',
    summary: "Register this device's FCM token (NOTIF-04).",
    method: 'POST',
    path: '/v1/push/register',
    auth: 'user',
    body: settings.RegisterPushTokenRequest,
    response: null,
    errors: [],
  }),
  'push.clearToken': http({
    group: 'push',
    summary: "Clear this device's FCM token (NOTIF-04).",
    method: 'POST',
    path: '/v1/push/clear',
    auth: 'user',
    body: settings.ClearPushTokenRequest,
    response: null,
    errors: [],
  }),
} as const;
