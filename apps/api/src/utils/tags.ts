import { Types } from "mongoose";
import type { Tag as TagDto, WorkSession as WorkSessionDto } from "@repo/types";
import { ObjectIdSchema } from "@repo/validation";
import { Tag, type ITag } from "../models/Tag";
import type { IWorkSession } from "../models/WorkSession";

export function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: number }).code === 11000
  );
}

export function serializeTag(tag: ITag): TagDto {
  return {
    id: tag._id.toString(),
    name: tag.name,
    createdAt: tag.createdAt.toISOString(),
    updatedAt: tag.updatedAt.toISOString(),
  };
}

export async function findTagForUser(
  userId: string,
  tagId: string,
): Promise<ITag | null> {
  if (!ObjectIdSchema.safeParse(tagId).success) {
    return null;
  }
  return Tag.findOne({ _id: tagId, userId });
}

export async function resolveOwnedTagId(
  userId: string,
  tagId?: string,
): Promise<string | undefined> {
  if (!tagId) return undefined;
  const tag = await findTagForUser(userId, tagId);
  return tag ? tag._id.toString() : undefined;
}

export async function parseOwnedTagQuery(
  userId: string,
  raw: unknown,
): Promise<
  | { tagId?: undefined }
  | { tagId: string }
  | { error: { status: number; message: string } }
> {
  if (raw == null || raw === "") {
    return {};
  }
  if (typeof raw !== "string" || !ObjectIdSchema.safeParse(raw).success) {
    return { error: { status: 400, message: "Invalid tagId" } };
  }
  const tag = await findTagForUser(userId, raw);
  if (!tag) {
    return { error: { status: 404, message: "Tag not found" } };
  }
  return { tagId: raw };
}

export async function withTagNames(
  sessions: IWorkSession[],
): Promise<WorkSessionDto[]> {
  const tagIds = [
    ...new Set(
      sessions
        .map((session) => session.tagId?.toString())
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const tags =
    tagIds.length > 0
      ? await Tag.find({ _id: { $in: tagIds.map((id) => new Types.ObjectId(id)) } })
      : [];
  const nameById = new Map(tags.map((tag) => [tag._id.toString(), tag.name]));

  return sessions.map((session) => {
    const obj = session.toObject();
    const tagId = session.tagId?.toString();
    return {
      ...obj,
      id: session._id.toString(),
      userId: session.userId.toString(),
      startTime:
        session.startTime instanceof Date
          ? session.startTime.toISOString()
          : String(session.startTime),
      endTime:
        session.endTime instanceof Date
          ? session.endTime.toISOString()
          : session.endTime
            ? String(session.endTime)
            : "",
      createdAt:
        session.createdAt instanceof Date
          ? session.createdAt.toISOString()
          : String(session.createdAt),
      updatedAt:
        session.updatedAt instanceof Date
          ? session.updatedAt.toISOString()
          : obj.updatedAt
            ? String(obj.updatedAt)
            : undefined,
      tagId,
      tagName: tagId ? nameById.get(tagId) : undefined,
    } as WorkSessionDto;
  });
}
