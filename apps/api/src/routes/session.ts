import { Router, Request, Response, RequestHandler } from "express";
import { SessionSchema } from "@repo/validation";
import { requireAuth } from "../middleware/auth";
import { WorkSession } from "../models/WorkSession";
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
    // Fallback to UTC
    return date.toISOString().split("T")[0] || "";
  }
}

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

    // Calculate duration in minutes (precise to 2 decimal places)
    const durationMs = endTime.getTime() - startTime.getTime();
    const durationMinutes = Math.max(
      0,
      Math.round((durationMs / 60000) * 100) / 100,
    );

    const userId = req.userId!;

    // Create and save work session
    const session = new WorkSession({
      userId,
      deviceId,
      startTime,
      endTime,
      durationMinutes,
    });
    await session.save();

    // Fetch user for timezone and current goal minutes
    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // Determine local date string in user timezone
    const dateKey = getLocalDateString(startTime, user.timezone);

    // Upsert DailyStats cache
    await DailyStats.findOneAndUpdate(
      { userId, date: dateKey },
      {
        $inc: { workedMinutes: durationMinutes },
        $setOnInsert: { goalMinutes: user.dailyTargetMinutes },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    res.status(201).json(session);
  } catch (error) {
    console.error("Create session error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

router.post("/", requireAuth, createSessionHandler);

export default router;
