import { Router, Request, Response, RequestHandler } from "express";
import { DailyTargetSchema } from "@repo/validation";
import { requireAuth } from "../middleware/auth";
import { User } from "../models/User";
import { DailyStats } from "../models/DailyStats";

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

const updateDailyTargetHandler: RequestHandler = async (req, res) => {
  try {
    const result = DailyTargetSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: result.error.format() });
      return;
    }

    const { dailyTargetMinutes } = result.data;
    const userId = req.userId!;

    // Update user's target goal
    const user = await User.findByIdAndUpdate(
      userId,
      { dailyTargetMinutes },
      { new: true },
    );

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // Update goalMinutes inside today's cached DailyStats (if exists)
    const todayKey = getLocalDateString(new Date(), user.timezone);
    await DailyStats.findOneAndUpdate(
      { userId, date: todayKey },
      { goalMinutes: dailyTargetMinutes },
    );

    res.json({
      dailyTargetMinutes: user.dailyTargetMinutes,
      timezone: user.timezone,
    });
  } catch (error) {
    console.error("Update target goal error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

router.patch("/daily-target", requireAuth, updateDailyTargetHandler);

export default router;
