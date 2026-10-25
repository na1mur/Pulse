// Tags, Goals, Preferences and Push groups (spec 7.2; R-19, R-20, R-29, R-30, R-50, R-52).
import { z } from 'zod';
import {
  Category,
  DistractionClass,
  GoalKind,
  Goals,
  NotificationToggles,
  Preferences,
  Tag,
  TimeFormat,
  Theme,
  Weekday,
} from '../entities.js';
import { GoalMinutes, Id, Revision, TagName, TimeZoneName, commandFields } from '../primitives.js';

export const TagList = z.object({ tags: z.array(Tag) });
export const TagParams = z.strictObject({ tagId: Id });

/** TAG-01, R-29: a taken name is CONFLICT with the existing tag in the error details. */
export const CreateTagRequest = z.strictObject({
  ...commandFields,
  tagId: Id,
  name: TagName,
  category: Category,
});
export const RenameTagRequest = z.strictObject({ ...commandFields, name: TagName });
/** TAG-06, R-50: recategorizing changes every past session of the tag. */
export const RecategorizeTagRequest = z.strictObject({ ...commandFields, category: Category });
/** TAG-08: null unlinks. */
export const SetDistractionClassRequest = z.strictObject({
  ...commandFields,
  distractionClass: DistractionClass.nullable(),
});
/** TAG-05: archive and unarchive take no fields beyond the command. */
export const TagCommandRequest = z.strictObject({ ...commandFields });
export const TagResult = z.object({ revision: Revision, tag: Tag });

/** R-30: sessions move to the replacement tag, or to Untagged when it is null. */
export const DeleteTagRequest = z.strictObject({
  ...commandFields,
  replacementTagId: Id.nullable(),
});
export const DeleteTagResult = z.object({
  revision: Revision,
  tagId: Id,
  replacementTagId: Id.nullable(),
});

/** R-19: set a goal in minutes, or unset it with null. */
export const SetGoalRequest = z.strictObject({
  ...commandFields,
  kind: GoalKind,
  minutes: GoalMinutes.nullable(),
});
export const GoalsResult = z.object({ revision: Revision, goals: Goals });

/** SET-01..SET-03, NOTIF-03: absent fields stay unchanged. R-15: timezone only by user action. */
export const UpdatePreferencesRequest = z.strictObject({
  ...commandFields,
  timezone: TimeZoneName.optional(),
  weekStart: Weekday.optional(),
  countWeekends: z.boolean().optional(),
  timeFormat: TimeFormat.optional(),
  theme: Theme.optional(),
  notifications: z.strictObject(NotificationToggles.partial().shape).optional(),
});
export const PreferencesResult = z.object({ revision: Revision, preferences: Preferences });

/** NOTIF-04, D-23: this device's FCM token (the device comes from the credentials). */
export const RegisterPushTokenRequest = z.strictObject({
  ...commandFields,
  token: z.string().min(1).max(4096),
});
export const ClearPushTokenRequest = z.strictObject({ ...commandFields });
