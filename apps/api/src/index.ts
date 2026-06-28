import express from "express";
import { config } from "./config";
import { connectDatabase } from "./db";
import authRouter from "./routes/auth";
import sessionRouter from "./routes/session";
import statsRouter from "./routes/stats";

const app = express();
const port = config.PORT;

app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date() });
});

app.use("/auth", authRouter);
app.use("/sessions", sessionRouter);
app.use("/stats", statsRouter);

async function startServer() {
  await connectDatabase();
  app.listen(port, () => {
    console.log(`API server listening on port ${port}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start API server:", err);
});
