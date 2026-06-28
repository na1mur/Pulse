import express from "express";
import { RegisterSchema } from "@repo/validation";
import { config } from "./config";
import { connectDatabase } from "./db";

const app = express();
const port = config.PORT;

app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date() });
});

app.post("/register", (req, res) => {
  const result = RegisterSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.format() });
    return;
  }
  res.json({ message: "Registration mock successful", data: result.data });
});

async function startServer() {
  await connectDatabase();
  app.listen(port, () => {
    console.log(`API server listening on port ${port}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start API server:", err);
});
