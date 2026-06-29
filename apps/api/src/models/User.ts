import { Schema, model, Document } from "mongoose";

export interface IUser extends Document {
  email: string;
  passwordHash: string;
  dailyTargetMinutes: number;
  weeklyTargetMinutes: number;
  monthlyTargetMinutes: number;
  timezone: string;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    dailyTargetMinutes: {
      type: Number,
      required: true,
      default: 480, // 8 hours
    },
    weeklyTargetMinutes: {
      type: Number,
      required: true,
      default: 2400, // 40 hours
    },
    monthlyTargetMinutes: {
      type: Number,
      required: true,
      default: 9600, // 160 hours
    },
    timezone: {
      type: String,
      required: true,
      default: "UTC",
    },
  },
  {
    timestamps: true,
  },
);

export const User = model<IUser>("User", userSchema);
