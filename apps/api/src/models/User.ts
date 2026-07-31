import { Schema, model, Document } from "mongoose";

export interface IActiveTimer {
  isRunning: boolean;
  startedAt?: number;
  elapsedBeforeCurrentRun: number;
  sessionTitle?: string;
  updatedAt?: Date;
  updatedByDeviceId?: string;
}

export interface IUser extends Document {
  email: string;
  name: string;
  passwordHash: string;
  dailyTargetMinutes: number;
  weeklyTargetMinutes: number;
  monthlyTargetMinutes: number;
  timezone: string;
  activeTimer?: IActiveTimer;
  createdAt: Date;
  updatedAt: Date;
}

const activeTimerSchema = new Schema<IActiveTimer>(
  {
    isRunning: { type: Boolean, required: true, default: false },
    startedAt: { type: Number },
    elapsedBeforeCurrentRun: { type: Number, required: true, default: 0 },
    sessionTitle: { type: String },
    updatedAt: { type: Date, default: Date.now },
    updatedByDeviceId: { type: String },
  },
  { _id: false },
);

const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      default: "",
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
    activeTimer: {
      type: activeTimerSchema,
      default: () => ({
        isRunning: false,
        elapsedBeforeCurrentRun: 0,
        updatedAt: new Date(),
      }),
    },
  },
  {
    timestamps: true,
  },
);

export const User = model<IUser>("User", userSchema);
