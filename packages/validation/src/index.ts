import { z } from "zod";

export const RegisterSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const LoginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export const SessionSchema = z.object({
  startTime: z.string().datetime(),
  endTime: z.string().datetime().optional(),
  deviceId: z.string().min(1, "Device ID is required"),
});

export const DailyTargetSchema = z.object({
  dailyTargetMinutes: z.number().nonnegative("Target must be 0 or greater"),
});

export const WeeklyTargetSchema = z.object({
  weeklyTargetMinutes: z.number().nonnegative("Target must be 0 or greater"),
});

export const MonthlyTargetSchema = z.object({
  monthlyTargetMinutes: z.number().nonnegative("Target must be 0 or greater"),
});

export const TimezoneSchema = z.object({
  timezone: z.string().min(1, "Timezone is required"),
});

export const SessionRangeSchema = z.enum(["today", "week", "month", "year"]);
