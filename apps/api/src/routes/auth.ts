import { Router, Request, Response, RequestHandler } from "express";
import { RegisterSchema, LoginSchema } from "@repo/validation";
import { User } from "../models/User";
import { RefreshToken } from "../models/RefreshToken";
import {
  hashPassword,
  comparePassword,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
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

const loginHandler: RequestHandler = async (req, res) => {
  try {
    const result = LoginSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: result.error.format() });
      return;
    }

    const { email, password } = result.data;

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    // Verify password
    const isMatch = await comparePassword(password, user.passwordHash);
    if (!isMatch) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

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

    res.json({
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
    console.error("Login error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const refreshHandler: RequestHandler = async (req, res) => {
  try {
    const { refreshToken: oldToken } = req.body;
    if (!oldToken) {
      res.status(400).json({ error: "Refresh token is required" });
      return;
    }

    // Verify token structure & expiry
    let payload;
    try {
      payload = verifyRefreshToken(oldToken);
    } catch {
      res.status(401).json({ error: "Invalid or expired refresh token" });
      return;
    }

    // Check if token exists in DB (not logged out / blacklisted)
    const storedToken = await RefreshToken.findOne({ token: oldToken });
    if (!storedToken) {
      res.status(401).json({ error: "Invalid or expired refresh token" });
      return;
    }

    // Delete old refresh token
    await RefreshToken.deleteOne({ _id: storedToken._id });

    // Generate new tokens (token rotation)
    const newAccessToken = generateAccessToken(payload.userId);
    const newRefreshTokenString = generateRefreshToken(payload.userId);

    // Save new refresh token
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    const newRefreshTokenDoc = new RefreshToken({
      token: newRefreshTokenString,
      userId: storedToken.userId,
      expiresAt,
    });
    await newRefreshTokenDoc.save();

    res.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshTokenString,
    });
  } catch (error) {
    console.error("Token refresh error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const logoutHandler: RequestHandler = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      res.status(400).json({ error: "Refresh token is required" });
      return;
    }

    // Delete the refresh token from database to invalidate it
    await RefreshToken.deleteOne({ token: refreshToken });

    res.json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

router.post("/register", registerHandler);
router.post("/login", loginHandler);
router.post("/refresh", refreshHandler);
router.post("/logout", logoutHandler);

export default router;
