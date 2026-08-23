import { describe, expect, it } from "vitest";
import { getLocalDayString } from "./timer-day";
import { applyIncomingTimerState, type TimerStateWithStamp } from "./timer-sync";

const today = getLocalDayString();
const yesterday = getLocalDayString(new Date(Date.now() - 24 * 60 * 60 * 1000));

const pausedToday: TimerStateWithStamp = {
  isRunning: false,
  elapsedBeforeCurrentRun: 12_000,
  lastActiveDate: today,
  remoteUpdatedAt: 1_000,
};

const runningToday: TimerStateWithStamp = {
  isRunning: true,
  startedAt: 5_000,
  elapsedBeforeCurrentRun: 12_000,
  lastActiveDate: today,
  sessionTitle: "Focus",
  remoteUpdatedAt: 1_000,
};

describe("applyIncomingTimerState", () => {
  it("applies a live pause onto a running timer", () => {
    const next = applyIncomingTimerState(
      runningToday,
      {
        isRunning: false,
        elapsedBeforeCurrentRun: 20_000,
        sessionTitle: "Focus",
        lastActiveDate: today,
      },
      2_000,
      "live",
    );

    expect(next.isRunning).toBe(false);
    expect(next.startedAt).toBeUndefined();
    expect(next.elapsedBeforeCurrentRun).toBe(20_000);
  });

  it("applies a live start onto a paused timer", () => {
    const next = applyIncomingTimerState(
      pausedToday,
      {
        isRunning: true,
        startedAt: 9_000,
        elapsedBeforeCurrentRun: 12_000,
        lastActiveDate: today,
      },
      2_000,
      "live",
    );

    expect(next.isRunning).toBe(true);
    expect(next.startedAt).toBe(9_000);
  });

  it("applies live start even when the client clock is ahead of the server", () => {
    const next = applyIncomingTimerState(
      {
        ...pausedToday,
        remoteUpdatedAt: Date.now(),
      },
      {
        isRunning: true,
        startedAt: 9_000,
        elapsedBeforeCurrentRun: 12_000,
        lastActiveDate: today,
      },
      Date.now() - 3_000,
      "live",
    );

    expect(next.isRunning).toBe(true);
    expect(next.startedAt).toBe(9_000);
  });

  it("applies live pause even when the client clock is ahead of the server", () => {
    const next = applyIncomingTimerState(
      {
        ...runningToday,
        remoteUpdatedAt: Date.now(),
      },
      {
        isRunning: false,
        elapsedBeforeCurrentRun: 20_000,
        sessionTitle: "Focus",
        lastActiveDate: today,
      },
      Date.now() - 3_000,
      "live",
    );

    expect(next.isRunning).toBe(false);
    expect(next.elapsedBeforeCurrentRun).toBe(20_000);
  });

  it("keeps today's elapsed when reconciling a yesterday snapshot", () => {
    const next = applyIncomingTimerState(
      pausedToday,
      {
        isRunning: false,
        elapsedBeforeCurrentRun: 3_600_000,
        lastActiveDate: yesterday,
      },
      2_000,
      "reconcile",
    );

    expect(next.isRunning).toBe(false);
    expect(next.elapsedBeforeCurrentRun).toBe(12_000);
  });

  it("still applies play/pause when reconcile isRunning differs across days", () => {
    const next = applyIncomingTimerState(
      pausedToday,
      {
        isRunning: true,
        startedAt: 9_000,
        elapsedBeforeCurrentRun: 0,
        lastActiveDate: yesterday,
      },
      2_000,
      "reconcile",
    );

    expect(next.isRunning).toBe(true);
    expect(next.startedAt).toBe(9_000);
  });

  it("ignores older reconcile snapshots", () => {
    const next = applyIncomingTimerState(
      runningToday,
      {
        isRunning: false,
        elapsedBeforeCurrentRun: 0,
        lastActiveDate: today,
      },
      500,
      "reconcile",
    );

    expect(next.isRunning).toBe(true);
    expect(next.remoteUpdatedAt).toBe(1_000);
  });
});
