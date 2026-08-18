import { Router, Response, RequestHandler } from "express";
import { requireAuth } from "../middleware/auth";
import { DailyStats } from "../models/DailyStats";
import { User } from "../models/User";
import {
  getCurrentWeekDateKeys,
  getLocalDateString,
  getMonthDateKeys,
  getPastLocalDateKeys,
  getWeekdayLabel,
} from "../utils/dates";

const router: Router = Router();

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
  dateKeys: string[],
  res: Response,
): Promise<void> => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const statsList = await DailyStats.find({
      userId,
      date: { $in: dateKeys },
    });

    const statsMap = new Map<string, { worked: number; goal: number }>();
    statsList.forEach((s) => {
      statsMap.set(s.date, { worked: s.workedMinutes, goal: s.goalMinutes });
    });

    const result = dateKeys.map((date) => {
      const entry = statsMap.get(date);
      return {
        date,
        day: getWeekdayLabel(date),
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
  try {
    const user = await User.findById(req.userId!);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const todayKey = getLocalDateString(new Date(), user.timezone);
    const dateKeys = getCurrentWeekDateKeys(todayKey);
    await getStatsRange(req.userId!, dateKeys, res);
  } catch (error) {
    console.error("Get week stats error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const getMonthStatsHandler: RequestHandler = async (req, res) => {
  try {
    const user = await User.findById(req.userId!);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const todayKey = getLocalDateString(new Date(), user.timezone);
    const dateKeys = getPastLocalDateKeys(todayKey, 30);
    await getStatsRange(req.userId!, dateKeys, res);
  } catch (error) {
    console.error("Get month stats error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
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

const getSummaryStatsHandler: RequestHandler = async (req, res) => {
  try {
    const userId = req.userId!;
    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const todayKey = getLocalDateString(new Date(), user.timezone);
    const weekKeys = getPastLocalDateKeys(todayKey, 7);
    const monthKeys = getMonthDateKeys(todayKey);

    const allStats = await DailyStats.find({ userId });
    const statsByDate = new Map(allStats.map((s) => [s.date, s]));

    const sumMinutes = (keys: string[]) =>
      keys.reduce(
        (sum, key) => sum + (statsByDate.get(key)?.workedMinutes ?? 0),
        0,
      );

    const totalWorkedMinutes = allStats.reduce(
      (sum, s) => sum + s.workedMinutes,
      0,
    );
    const weeklyWorkedMinutes = sumMinutes(weekKeys);
    const monthlyWorkedMinutes = sumMinutes(monthKeys);
    const weeklyTargetMinutes = user.weeklyTargetMinutes ?? 0;
    const monthlyTargetMinutes = user.monthlyTargetMinutes ?? 0;
    const weeklyPercentage =
      weeklyTargetMinutes > 0
        ? Math.round((weeklyWorkedMinutes / weeklyTargetMinutes) * 100)
        : 0;
    const monthlyPercentage =
      monthlyTargetMinutes > 0
        ? Math.round((monthlyWorkedMinutes / monthlyTargetMinutes) * 100)
        : 0;

    const daysWithData = allStats.filter((s) => s.workedMinutes > 0);
    const averageDailyMinutes =
      daysWithData.length > 0
        ? Math.round(totalWorkedMinutes / daysWithData.length)
        : 0;

    let bestDayMinutes = 0;
    let bestDayDate: string | null = null;
    for (const stat of allStats) {
      if (stat.workedMinutes > bestDayMinutes) {
        bestDayMinutes = stat.workedMinutes;
        bestDayDate = stat.date;
      }
    }

    let currentStreakDays = 0;
    const streakKeys = getPastLocalDateKeys(todayKey, 365).reverse();
    for (const key of streakKeys) {
      const stat = statsByDate.get(key);
      if (stat && stat.workedMinutes > 0) {
        currentStreakDays++;
      } else if (key !== todayKey) {
        break;
      } else if (!stat || stat.workedMinutes === 0) {
        break;
      }
    }

    const monthStats = allStats.filter((s) => monthKeys.includes(s.date));
    const daysWithMonthData = monthStats.filter((s) => s.workedMinutes > 0);
    const daysMeetingGoal = monthStats.filter(
      (s) => s.goalMinutes > 0 && s.workedMinutes >= s.goalMinutes,
    ).length;
    const goalAchievementPercent =
      daysWithMonthData.length > 0
        ? Math.round((daysMeetingGoal / daysWithMonthData.length) * 1000) / 10
        : 0;

    res.json({
      totalWorkedMinutes,
      weeklyWorkedMinutes,
      monthlyWorkedMinutes,
      weeklyTargetMinutes,
      monthlyTargetMinutes,
      weeklyPercentage,
      monthlyPercentage,
      averageDailyMinutes,
      bestDayMinutes,
      bestDayDate,
      currentStreakDays,
      goalAchievementPercent,
    });
  } catch (error) {
    console.error("Get summary stats error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const getWeeklyTrendHandler: RequestHandler = async (req, res) => {
  try {
    const userId = req.userId!;
    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const count = Math.min(parseInt(String(req.query.count ?? "4"), 10) || 4, 12);
    const todayKey = getLocalDateString(new Date(), user.timezone);
    const allKeys = getPastLocalDateKeys(todayKey, count * 7);

    const statsList = await DailyStats.find({
      userId,
      date: { $in: allKeys },
    });
    const statsMap = new Map(statsList.map((s) => [s.date, s.workedMinutes]));

    const weeks: { week: string; hours: number; workedMinutes: number }[] = [];
    for (let w = 0; w < count; w++) {
      const weekKeys = allKeys.slice(w * 7, (w + 1) * 7);
      const workedMinutes = weekKeys.reduce(
        (sum, key) => sum + (statsMap.get(key) ?? 0),
        0,
      );
      weeks.push({
        week: `Week ${count - w}`,
        hours: Math.round((workedMinutes / 60) * 10) / 10,
        workedMinutes,
      });
    }

    res.json(weeks.reverse());
  } catch (error) {
    console.error("Get weekly trend error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

router.get("/today", requireAuth, getTodayStatsHandler);
router.get("/week", requireAuth, getWeekStatsHandler);
router.get("/month", requireAuth, getMonthStatsHandler);
router.get("/history", requireAuth, getHistoryStatsHandler);
router.get("/summary", requireAuth, getSummaryStatsHandler);
router.get("/weeks", requireAuth, getWeeklyTrendHandler);

export default router;
