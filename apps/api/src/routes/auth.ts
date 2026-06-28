import { Router, Request, Response, RequestHandler } from "express";
import { RegisterSchema } from "@repo/validation";
import { User } from "../models/User";
import { RefreshToken } from "../models/RefreshToken";
import {
  hashPassword,
  generateAccessToken,
  generateRefreshToken,
} from "../utils/auth";

const router: Router = Router();

const registerHandler: RequestHandler = async (req, res) => {
  try {
    const result = RegisterSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: result.error.format() });
      return;
    }

    const { email, password } = result.data;

    // Check if email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      res.status(400).json({ error: "Email is already registered" });
      return;
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user
    const user = new User({
      email,
      passwordHash,
    });
    await user.save();

    // Generate tokens
    const accessToken = generateAccessToken(user.id);
    const refreshTokenString = generateRefreshToken(user.id);

    // Save refresh token in database
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    const refreshTokenDoc = new RefreshToken({
      token: refreshTokenString,
      userId: user._id,
      expiresAt,
    });
    await refreshTokenDoc.save();

    res.status(201).json({
      accessToken,
      refreshToken: refreshTokenString,
      user: {
        id: user.id,
        email: user.email,
        dailyTargetMinutes: user.dailyTargetMinutes,
        timezone: user.timezone,
      },
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

router.post("/register", registerHandler);

export default router;
