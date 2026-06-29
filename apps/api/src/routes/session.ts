import { Router, RequestHandler } from "express";
import { SessionSchema, SessionRangeSchema } from "@repo/validation";
import { requireAuth } from "../middleware/auth";
import { WorkSession } from "../models/WorkSession";
import { DailyStats } from "../models/DailyStats";
import { User } from "../models/User";
import { broadcastToUser } from "../socket";
import {
  getLocalDateString,
  getLocalDayRange,
  getPastLocalDateKeys,
} from "../utils/dates";

const router: Router = Router();

const createSessionHandler: RequestHandler = async (req, res) => {
  try {
    const result = SessionSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: result.error.format() });
      return;
    }

    const { startTime: startStr, endTime: endStr, deviceId } = result.data;
    const startTime = new Date(startStr);
    const endTime = endStr ? new Date(endStr) : new Date();

    const durationMs = endTime.getTime() - startTime.getTime();
    const durationMinutes = Math.max(
      0,
      Math.round((durationMs / 60000) * 100) / 100,
    );

    const userId = req.userId!;

    const session = new WorkSession({
      userId,
      deviceId,
      startTime,
      endTime,
      durationMinutes,
    });
    await session.save();

    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const dateKey = getLocalDateString(startTime, user.timezone);

    await DailyStats.findOneAndUpdate(
      { userId, date: dateKey },
      {
        $inc: { workedMinutes: durationMinutes },
        $setOnInsert: { goalMinutes: user.dailyTargetMinutes },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    broadcastToUser(userId, "session_created", session);

    res.status(201).json(session);
  } catch (error) {
    console.error("Create session error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

function getRangeStartDate(
  range: "today" | "week" | "month" | "year",
  todayKey: string,
): Date {
  const days =
    range === "today" ? 0 : range === "week" ? 6 : range === "month" ? 29 : 364;
  const keys = getPastLocalDateKeys(todayKey, days + 1);
  const firstKey = keys[0] ?? todayKey;
  return new Date(`${firstKey}T00:00:00.000Z`);
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
        const startDate = getRangeStartDate(parsed.data, todayKey);
        const { end } = getLocalDayRange(todayKey, user.timezone);
        query = { ...query, startTime: { $gte: startDate, $lte: end } };
      }
    }

    const sessions = await WorkSession.find(query).sort({ startTime: -1 });
    res.json(sessions);
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
