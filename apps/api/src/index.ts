import express from "express";
import { createServer } from "http";
import { config } from "./config";
import { connectDatabase } from "./db";
import authRouter from "./routes/auth";
import sessionRouter from "./routes/session";
import statsRouter from "./routes/stats";
import settingsRouter from "./routes/settings";
import { initSocket } from "./socket";

const app = express();
const port = config.PORT;

app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date() });
});

app.use("/auth", authRouter);
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
