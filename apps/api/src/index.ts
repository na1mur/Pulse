import express from "express";
import { createServer } from "http";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { config } from "./config";
import { connectDatabase } from "./db";
import authRouter from "./routes/auth";
import sessionRouter from "./routes/session";
import statsRouter from "./routes/stats";
import settingsRouter from "./routes/settings";
import { initSocket } from "./socket";

const app = express();
const port = config.PORT;

// Required when behind a reverse proxy (nginx, ALB, etc.) so rate limiting
// and client IPs use X-Forwarded-For correctly.
app.set("trust proxy", 1);

// Standard Security Headers
app.use(helmet());

// Cross-Origin Resource Sharing
app.use(cors());

app.use(express.json());

// General API rate limiter (500 requests per 15 minutes)
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});

// Stricter auth limiter (100 register/login requests per 15 minutes)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error:
      "Too many authentication attempts. Please try again after 15 minutes.",
  },
});

app.use(generalLimiter);

app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date() });
});

app.use("/auth", authLimiter, authRouter);
app.use("/sessions", sessionRouter);
app.use("/stats", statsRouter);
app.use("/settings", settingsRouter);

const server = createServer(app);
initSocket(server);

async function startServer() {
  await connectDatabase();
  server.listen(port, () => {
    console.log(`API server listening on port ${port}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start API server:", err);
});
