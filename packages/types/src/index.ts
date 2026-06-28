export interface User {
  id: string;
  email: string;
  dailyTargetMinutes: number;
  timezone: string;
}

export interface Session {
  id: string;
  userId: string;
  startTime: Date;
  endTime?: Date;
  deviceId: string;
  createdAt: Date;
}

export interface DailyStats {
  userId: string;
  date: string; // YYYY-MM-DD
  workedMinutes: number;
  goalMinutes: number;
  updatedAt: Date;
}

export interface TimerState {
  isRunning: boolean;
  startedAt?: number; // timestamp
  elapsedBeforeCurrentRun: number; // in milliseconds
}
