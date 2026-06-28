import { Router, Request, Response, RequestHandler } from "express";
import { requireAuth } from "../middleware/auth";
import { DailyStats } from "../models/DailyStats";
import { User } from "../models/User";

const router: Router = Router();

// Helper to format Date to YYYY-MM-DD in a specific timezone
function getLocalDateString(date: Date, timeZone: string): string {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = formatter.formatToParts(date);
    const year = parts.find((p) => p.type === "year")?.value || "1970";
    const month = parts.find((p) => p.type === "month")?.value || "01";
    const day = parts.find((p) => p.type === "day")?.value || "01";
    return `${year}-${month}-${day}`;
  } catch (error) {
    console.error("Error formatting date for timezone:", timeZone, error);
    return date.toISOString().split("T")[0] || "";
  }
}

// Generate calendar date keys YYYY-MM-DD going back N days from the local date key
function getPastLocalDateKeys(dateKey: string, count: number): string[] {
  const dateKeys: string[] = [];
  try {
    const date = new Date(`${dateKey}T00:00:00Z`);
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(date.getTime());
      d.setUTCDate(d.getUTCDate() - i);
      const iso = d.toISOString().split("T")[0];
      if (iso) dateKeys.push(iso);
    }
  } catch (err) {
    console.error("Error generating local date keys:", err);
  }
  return dateKeys;
}

const getTodayStatsHandler: RequestHandler = async (req, res) => {
  try {
    const userId = req.userId!;
    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const dateKey = getLocalDateString(new Date(), user.timezone);
    const stats = await DailyStats.findOne({ userId, date: dateKey });

    const workedMinutes = stats ? stats.workedMinutes : 0;
    const goalMinutes = stats ? stats.goalMinutes : user.dailyTargetMinutes;
    const percentage =
      goalMinutes > 0 ? Math.round((workedMinutes / goalMinutes) * 100) : 0;

    res.json({
      workedMinutes,
      goalMinutes,
      percentage,
      date: dateKey,
    });
  } catch (error) {
    console.error("Get today stats error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const getStatsRange = async (
  userId: string,
  count: number,
  res: Response,
): Promise<void> => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const todayKey = getLocalDateString(new Date(), user.timezone);
    const dateKeys = getPastLocalDateKeys(todayKey, count);

    // Retrieve stats matching generated keys
    const statsList = await DailyStats.find({
      userId,
      date: { $in: dateKeys },
    });

    const statsMap = new Map<string, { worked: number; goal: number }>();
    statsList.forEach((s) => {
      statsMap.set(s.date, { worked: s.workedMinutes, goal: s.goalMinutes });
    });

    // Construct full sequential series, filling in missing dates with zero
    const result = dateKeys.map((date) => {
      const entry = statsMap.get(date);
      return {
        date,
        workedMinutes: entry ? entry.worked : 0,
        goalMinutes: entry ? entry.goal : user.dailyTargetMinutes,
      };
    });

    res.json(result);
  } catch (error) {
    console.error("Get stats range error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const getWeekStatsHandler: RequestHandler = async (req, res) => {
  await getStatsRange(req.userId!, 7, res);
};

const getMonthStatsHandler: RequestHandler = async (req, res) => {
  await getStatsRange(req.userId!, 30, res);
};

const getHistoryStatsHandler: RequestHandler = async (req, res) => {
  try {
    const userId = req.userId!;
    const history = await DailyStats.find({ userId }).sort({ date: 1 });
    res.json(history);
  } catch (error) {
    console.error("Get history stats error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

router.get("/today", requireAuth, getTodayStatsHandler);
router.get("/week", requireAuth, getWeekStatsHandler);
router.get("/month", requireAuth, getMonthStatsHandler);
router.get("/history", requireAuth, getHistoryStatsHandler);

export default router;
