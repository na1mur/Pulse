import { WorkSession } from "../models/WorkSession";
import { Tag } from "../models/Tag";
import {
  getCurrentWeekDateKeys,
  getLocalDateString,
  getLocalDayRange,
  getPastLocalDateKeys,
} from "./dates";

export function dateKeysForStatsRange(
  range: "today" | "week" | "month",
  todayKey: string,
): string[] {
  if (range === "today") return [todayKey];
  if (range === "week") return getCurrentWeekDateKeys(todayKey);
  return getPastLocalDateKeys(todayKey, 30);
}

export function boundsForDateKeys(
  dateKeys: string[],
  timeZone: string,
): { start: Date; end: Date } {
  const firstKey = dateKeys[0]!;
  const lastKey = dateKeys[dateKeys.length - 1]!;
  const { start } = getLocalDayRange(firstKey, timeZone);
  const { end } = getLocalDayRange(lastKey, timeZone);
  return { start, end };
}

export async function minutesByDateForTag(
  userId: string,
  timeZone: string,
  tagId: string,
  dateKeys?: string[],
): Promise<Map<string, number>> {
  const query: Record<string, unknown> = { userId, tagId };
  if (dateKeys && dateKeys.length > 0) {
    const { start, end } = boundsForDateKeys(dateKeys, timeZone);
    query.startTime = { $gte: start, $lte: end };
  }

  const sessions = await WorkSession.find(query).select(
    "startTime durationMinutes",
  );
  const map = new Map<string, number>();
  if (dateKeys) {
    for (const key of dateKeys) {
      map.set(key, 0);
    }
  }

  for (const session of sessions) {
    const key = getLocalDateString(session.startTime, timeZone);
    if (dateKeys && !map.has(key)) continue;
    map.set(key, (map.get(key) ?? 0) + session.durationMinutes);
  }
  return map;
}

export async function tagBreakdownForRange(
  userId: string,
  timeZone: string,
  dateKeys: string[],
): Promise<
  { tagId: string | null; tagName: string; workedMinutes: number }[]
> {
  if (dateKeys.length === 0) return [];

  const { start, end } = boundsForDateKeys(dateKeys, timeZone);
  const sessions = await WorkSession.find({
    userId,
    startTime: { $gte: start, $lte: end },
  }).select("tagId durationMinutes startTime");

  const allowed = new Set(dateKeys);
  const minutesByTag = new Map<string, number>();
  let untaggedMinutes = 0;

  for (const session of sessions) {
    const key = getLocalDateString(session.startTime, timeZone);
    if (!allowed.has(key)) continue;
    const tagId = session.tagId?.toString();
    if (!tagId) {
      untaggedMinutes += session.durationMinutes;
      continue;
    }
    minutesByTag.set(tagId, (minutesByTag.get(tagId) ?? 0) + session.durationMinutes);
  }

  const tagIds = [...minutesByTag.keys()];
  const tags = tagIds.length
    ? await Tag.find({ _id: { $in: tagIds }, userId })
    : [];
  const nameById = new Map(tags.map((tag) => [tag._id.toString(), tag.name]));

  const buckets: {
    tagId: string | null;
    tagName: string;
    workedMinutes: number;
  }[] = [];

  for (const [tagId, workedMinutes] of minutesByTag) {
    const tagName = nameById.get(tagId);
    if (!tagName) {
      untaggedMinutes += workedMinutes;
      continue;
    }
    buckets.push({ tagId, tagName, workedMinutes });
  }

  if (untaggedMinutes > 0) {
    buckets.push({
      tagId: null,
      tagName: "Untagged",
      workedMinutes: untaggedMinutes,
    });
  }

  buckets.sort((a, b) => b.workedMinutes - a.workedMinutes);
  return buckets;
}
