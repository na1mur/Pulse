import { Router, RequestHandler } from "express";
import { DailyTargetSchema, TimezoneSchema } from "@repo/validation";
import { requireAuth } from "../middleware/auth";
import { User } from "../models/User";
import { DailyStats } from "../models/DailyStats";
import { broadcastToUser } from "../socket";
import { getLocalDateString } from "../utils/dates";

const router: Router = Router();

const getSettingsHandler: RequestHandler = async (req, res) => {
  try {
    const user = await User.findById(req.userId!);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({
      email: user.email,
      timezone: user.timezone,
      dailyTargetMinutes: user.dailyTargetMinutes,
    });
  } catch (error) {
    console.error("Get settings error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const updateDailyTargetHandler: RequestHandler = async (req, res) => {
  try {
    const result = DailyTargetSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: result.error.format() });
      return;
    }

    const { dailyTargetMinutes } = result.data;
    const userId = req.userId!;

    const user = await User.findByIdAndUpdate(
      userId,
      { dailyTargetMinutes },
      { new: true },
    );

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const todayKey = getLocalDateString(new Date(), user.timezone);
    await DailyStats.findOneAndUpdate(
      { userId, date: todayKey },
      { goalMinutes: dailyTargetMinutes },
    );

    broadcastToUser(userId, "goal_updated", {
      dailyTargetMinutes: user.dailyTargetMinutes,
    });

    res.json({
      email: user.email,
      timezone: user.timezone,
      dailyTargetMinutes: user.dailyTargetMinutes,
    });
  } catch (error) {
    console.error("Update target goal error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const updateTimezoneHandler: RequestHandler = async (req, res) => {
  try {
    const result = TimezoneSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: result.error.format() });
      return;
    }

    const { timezone } = result.data;

    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
    } catch {
      res.status(400).json({ error: "Invalid timezone" });
      return;
    }

    const user = await User.findByIdAndUpdate(
      req.userId!,
      { timezone },
      { new: true },
    );

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({
      email: user.email,
      timezone: user.timezone,
      dailyTargetMinutes: user.dailyTargetMinutes,
    });
  } catch (error) {
    console.error("Update timezone error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

router.get("/", requireAuth, getSettingsHandler);
router.patch("/daily-target", requireAuth, updateDailyTargetHandler);
router.patch("/timezone", requireAuth, updateTimezoneHandler);

export default router;
