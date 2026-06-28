import { Request, Response, NextFunction, RequestHandler } from "express";
import { verifyAccessToken } from "../utils/auth";

export const requireAuth: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ error: "Access token required" });
      return;
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      res.status(401).json({ error: "Access token required" });
      return;
    }

    const payload = verifyAccessToken(token);
    req.userId = payload.userId;

    next();
  } catch (error) {
    res.status(401).json({ error: "Invalid or expired access token" });
    return;
  }
};
