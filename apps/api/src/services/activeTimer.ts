import type { ActiveTimerState } from "@repo/types";
import { User, type IUser } from "../models/User";
import { resolveOwnedTagId } from "../utils/tags";

const DEFAULT_ACTIVE_TIMER: ActiveTimerState = {
  isRunning: false,
  elapsedBeforeCurrentRun: 0,
};

export function serializeActiveTimer(user: IUser): ActiveTimerState {
  const timer = user.activeTimer;
  if (!timer) {
    return { ...DEFAULT_ACTIVE_TIMER };
  }

  return {
    isRunning: timer.isRunning,
    startedAt: timer.startedAt ?? undefined,
    elapsedBeforeCurrentRun: timer.elapsedBeforeCurrentRun ?? 0,
    sessionTitle: timer.sessionTitle ?? undefined,
    tagId: timer.tagId || undefined,
    updatedAt: timer.updatedAt?.toISOString(),
    updatedByDeviceId: timer.updatedByDeviceId ?? undefined,
  };
}

export async function getActiveTimerForUser(
  userId: string,
): Promise<ActiveTimerState | null> {
  const user = await User.findById(userId);
  if (!user) return null;
  return serializeActiveTimer(user);
}

interface TimerStartPayload {
  startedAt: number;
  elapsedBeforeCurrentRun: number;
  sessionTitle?: string;
  tagId?: string;
  deviceId?: string;
}

interface TimerPausePayload {
  elapsedBeforeCurrentRun: number;
  sessionTitle?: string;
  tagId?: string;
  deviceId?: string;
}

export async function persistTimerStart(
  userId: string,
  data: TimerStartPayload,
): Promise<ActiveTimerState | null> {
  const tagId = await resolveOwnedTagId(userId, data.tagId);
  const user = await User.findByIdAndUpdate(
    userId,
    {
      activeTimer: {
        isRunning: true,
        startedAt: data.startedAt,
        elapsedBeforeCurrentRun: data.elapsedBeforeCurrentRun,
        sessionTitle: data.sessionTitle,
        tagId,
        updatedAt: new Date(),
        updatedByDeviceId: data.deviceId,
      },
    },
    { new: true },
  );
  return user ? serializeActiveTimer(user) : null;
}

export async function persistTimerPause(
  userId: string,
  data: TimerPausePayload,
): Promise<ActiveTimerState | null> {
  const existing = await User.findById(userId).select("activeTimer");
  if (!existing) return null;

  const tagId =
    data.tagId !== undefined
      ? await resolveOwnedTagId(userId, data.tagId)
      : existing.activeTimer?.tagId;

  const user = await User.findByIdAndUpdate(
    userId,
    {
      activeTimer: {
        isRunning: false,
        elapsedBeforeCurrentRun: data.elapsedBeforeCurrentRun,
        sessionTitle: data.sessionTitle ?? existing.activeTimer?.sessionTitle,
        tagId,
        updatedAt: new Date(),
        updatedByDeviceId: data.deviceId,
      },
    },
    { new: true },
  );
  return user ? serializeActiveTimer(user) : null;
}

export async function persistTimerReset(
  userId: string,
  deviceId?: string,
): Promise<ActiveTimerState | null> {
  const user = await User.findByIdAndUpdate(
    userId,
    {
      activeTimer: {
        isRunning: false,
        elapsedBeforeCurrentRun: 0,
        sessionTitle: undefined,
        tagId: undefined,
        updatedAt: new Date(),
        updatedByDeviceId: deviceId,
      },
    },
    { new: true },
  );
  return user ? serializeActiveTimer(user) : null;
}
