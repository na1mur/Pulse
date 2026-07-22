import mongoose from "mongoose";
import { config } from "../src/config";

async function dropDatabase() {
  await mongoose.connect(config.MONGODB_URI);
  const dbName = mongoose.connection.db?.databaseName ?? "unknown";

  await mongoose.connection.dropDatabase();
  console.log(`Dropped MongoDB database: ${dbName}`);

  await mongoose.disconnect();
}

dropDatabase().catch((error) => {
  console.error("Failed to drop database:", error);
  process.exit(1);
});
