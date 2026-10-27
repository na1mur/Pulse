import type { OperationResponse } from '@pulse/contract';
import { formatDateMillis } from '../../domain/time/index.js';
import type { PreferencesRow } from './preferences.repository.js';

type WirePreferences = OperationResponse<'auth.completeFirstSignIn'>['preferences'];

/** The wire `Preferences`. The enum columns are guarded by CHECK constraints (0001-accounts). */
export function toPreferences(row: PreferencesRow): WirePreferences {
  return {
    timezone: row.timezone,
    weekStart: row.week_start as WirePreferences['weekStart'],
    countWeekends: row.count_weekends,
    timeFormat: row.time_format as WirePreferences['timeFormat'],
    theme: row.theme as WirePreferences['theme'],
    notifications: {
      creditLow: row.notify_credit_low,
      creditZero: row.notify_credit_zero,
      creditBelowZero: row.notify_credit_below_zero,
      dailyGoal: row.notify_daily_goal,
      weeklyMonthlyGoal: row.notify_weekly_monthly_goal,
      gameSuggestion: row.notify_game_suggestion,
    },
    onboardingCompletedAt:
      row.onboarding_completed_at === null ? null : formatDateMillis(row.onboarding_completed_at),
  };
}
