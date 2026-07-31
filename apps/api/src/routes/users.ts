import { Router, RequestHandler } from "express";
import { requireAuth } from "../middleware/auth";
import { getActiveTimerForUser } from "../services/activeTimer";

const router: Router = Router();

const getActiveTimerHandler: RequestHandler = async (req, res) => {
  try {
    const activeTimer = await getActiveTimerForUser(req.userId!);
    if (!activeTimer) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json(activeTimer);
  } catch (error) {
    console.error("Get active timer error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

router.get("/me/active-timer", requireAuth, getActiveTimerHandler);

export default router;
