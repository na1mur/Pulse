import { Router, RequestHandler } from "express";
import { SessionSchema, SessionRangeSchema } from "@repo/validation";
import { requireAuth } from "../middleware/auth";
import { WorkSession } from "../models/WorkSession";
import { DailyStats } from "../models/DailyStats";
import { User } from "../models/User";
import { broadcastToUser } from "../socket";
import { detectGoalAchievements } from "../utils/goals";
import {
  getLocalDateString,
  getLocalDayRange,
  getPastLocalDateKeys,
} from "../utils/dates";

const router: Router = Router();

const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 100;

function parsePagination(query: Record<string, unknown>) {
  const page = Math.max(1, parseInt(String(query.page ?? "1"), 10) || 1);
  const limit = Math.min(
    MAX_PAGE_LIMIT,
    Math.max(1, parseInt(String(query.limit ?? DEFAULT_PAGE_LIMIT), 10) || DEFAULT_PAGE_LIMIT),
  );
  return { page, limit, skip: (page - 1) * limit };
}

const createSessionHandler: RequestHandler = async (req, res) => {
  try {
    const result = SessionSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: result.error.format() });
      return;
    }

    const {
      startTime: startStr,
      endTime: endStr,
      deviceId,
      title,
      summary,
    } = result.data;
    const startTime = new Date(startStr);
    const endTime = endStr ? new Date(endStr) : new Date();

    const durationMs = endTime.getTime() - startTime.getTime();
    const durationSeconds = Math.max(0, Math.round(durationMs / 1000));
    const durationMinutes = Math.round((durationSeconds / 60) * 100) / 100;

    const userId = req.userId!;

    const session = new WorkSession({
      userId,
      deviceId,
      startTime,
      endTime,
      durationMinutes,
      durationSeconds,
      ...(title ? { title } : {}),
      ...(summary ? { summary } : {}),
    });
    await session.save();

    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const dateKey = getLocalDateString(startTime, user.timezone);

    const previousStats = await DailyStats.findOne({ userId, date: dateKey });
    const previousDailyWorked = previousStats?.workedMinutes ?? 0;

    const updatedStats = await DailyStats.findOneAndUpdate(
      { userId, date: dateKey },
      {
        $inc: { workedMinutes: durationMinutes },
        $setOnInsert: { goalMinutes: user.dailyTargetMinutes },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    const achievements = await detectGoalAchievements({
      userId,
      user,
      dateKey,
      previousDailyWorked,
      newDailyWorked:
        updatedStats?.workedMinutes ?? previousDailyWorked + durationMinutes,
      durationMinutes,
    });

    broadcastToUser(userId, "session_created", session);

    for (const achievement of achievements) {
      broadcastToUser(userId, "goal_achieved", achievement);
    }

    res.status(201).json(session);
  } catch (error) {
    console.error("Create session error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

function getRangeStartDate(
  range: "today" | "week" | "month" | "year",
  todayKey: string,
  timeZone: string,
): Date {
  const days =
    range === "today" ? 0 : range === "week" ? 6 : range === "month" ? 29 : 364;
  const keys = getPastLocalDateKeys(todayKey, days + 1);
  const firstKey = keys[0] ?? todayKey;
  const { start } = getLocalDayRange(firstKey, timeZone);
  return start;
}

const getSessionsHandler: RequestHandler = async (req, res) => {
  try {
    const userId = req.userId!;
    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const todayKey = getLocalDateString(new Date(), user.timezone);
    const { from, to, range } = req.query;
    const { page, limit, skip } = parsePagination(req.query);

    let query: Record<string, unknown> = { userId };

    if (from && to && typeof from === "string" && typeof to === "string") {
      query = {
        ...query,
        startTime: {
          $gte: new Date(from),
          $lte: new Date(to),
        },
      };
    } else if (range && typeof range === "string") {
      const parsed = SessionRangeSchema.safeParse(range);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid range parameter" });
        return;
      }

      if (parsed.data === "today") {
        const { start, end } = getLocalDayRange(todayKey, user.timezone);
        query = { ...query, startTime: { $gte: start, $lte: end } };
      } else {
        const startDate = getRangeStartDate(parsed.data, todayKey, user.timezone);
        const { end } = getLocalDayRange(todayKey, user.timezone);
        query = { ...query, startTime: { $gte: startDate, $lte: end } };
      }
    }

    const [sessions, total] = await Promise.all([
      WorkSession.find(query).sort({ startTime: -1 }).skip(skip).limit(limit),
      WorkSession.countDocuments(query),
    ]);

    res.json({
      sessions,
      total,
      page,
      limit,
      hasMore: skip + sessions.length < total,
    });
  } catch (error) {
    console.error("Get sessions error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const getSessionsTodayHandler: RequestHandler = async (req, res) => {
  try {
    const userId = req.userId!;
    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const dateKey = getLocalDateString(new Date(), user.timezone);
    const { start, end } = getLocalDayRange(dateKey, user.timezone);

    const sessions = await WorkSession.find({
      userId,
      startTime: { $gte: start, $lte: end },
    }).sort({ startTime: -1 });

    res.json(sessions);
  } catch (error) {
    console.error("Get today's sessions error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

router.post("/", requireAuth, createSessionHandler);
router.get("/", requireAuth, getSessionsHandler);
router.get("/today", requireAuth, getSessionsTodayHandler);

export default router;
