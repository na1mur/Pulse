import { Schema, model, Document, Types } from "mongoose";

export interface IDailyStats extends Document {
  userId: Types.ObjectId;
  date: string; // YYYY-MM-DD
  workedMinutes: number;
  goalMinutes: number;
  createdAt: Date;
  updatedAt: Date;
}

const dailyStatsSchema = new Schema<IDailyStats>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    date: {
      type: String, // YYYY-MM-DD format
      required: true,
      trim: true,
    },
    workedMinutes: {
      type: Number,
      required: true,
      default: 0,
    },
    goalMinutes: {
      type: Number,
      required: true,
      default: 480, // default target is 8 hours
    },
  },
  {
    timestamps: true,
  },
);

// Enforce unique daily summary per user per date
dailyStatsSchema.index({ userId: 1, date: 1 }, { unique: true });

export const DailyStats = model<IDailyStats>("DailyStats", dailyStatsSchema);
