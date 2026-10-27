import type { ColumnType, Generated } from 'kysely';

// Table interfaces for Kysely, written by hand next to migrations/. Names are snake_case like the
// columns. `Instant` columns are read as Date and written as Date or an ISO string; ones with a
// database default are optional on insert (Generated). Contract enums are repeated here as plain
// string unions only where the database stores them; the CHECK constraints are the authority.

type Instant = ColumnType<Date, Date | string, Date | string>;
type InstantDefaultNow = ColumnType<Date, Date | string | undefined, Date | string>;
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export interface UsersTable {
  id: string;
  email: string;
  /** emailKey(email): what the address is unique by (src/domain/email-key.ts). */
  email_key: string;
  email_verified_at: ColumnType<
    Date | null,
    Date | string | null | undefined,
    Date | string | null
  >;
  password_hash: ColumnType<string | null, string | null | undefined, string | null>;
  google_subject: ColumnType<string | null, string | null | undefined, string | null>;
  created_at: InstantDefaultNow;
  updated_at: InstantDefaultNow;
}

export interface UserRevisionsTable {
  user_id: string;
  revision: Generated<number>;
}

export type EmailTokenPurpose = 'verify_email' | 'reset_password' | 'change_email';

export interface EmailTokensTable {
  id: string;
  user_id: string;
  purpose: EmailTokenPurpose;
  /** SHA-256 of the token (32 bytes); the token itself is never stored. */
  token_hash: Buffer;
  new_email: ColumnType<string | null, string | null | undefined, string | null>;
  expires_at: Instant;
  used_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
  created_at: InstantDefaultNow;
}

export interface UserPreferencesTable {
  user_id: string;
  timezone: ColumnType<string | null, string | null | undefined, string | null>;
  week_start: Generated<string>;
  count_weekends: Generated<boolean>;
  time_format: Generated<string>;
  theme: Generated<string>;
  notify_credit_low: Generated<boolean>;
  notify_credit_zero: Generated<boolean>;
  notify_credit_below_zero: Generated<boolean>;
  notify_daily_goal: Generated<boolean>;
  notify_weekly_monthly_goal: Generated<boolean>;
  notify_game_suggestion: Generated<boolean>;
  onboarding_completed_at: ColumnType<
    Date | null,
    Date | string | null | undefined,
    Date | string | null
  >;
  revision: Generated<number>;
  updated_at: InstantDefaultNow;
}

export interface DevicesTable {
  id: string;
  user_id: string;
  name: string;
  platform: 'windows' | 'android';
  app_version: string;
  push_token: ColumnType<string | null, string | null | undefined, string | null>;
  created_at: InstantDefaultNow;
  last_seen_at: InstantDefaultNow;
}

export interface CredentialsTable {
  id: string;
  device_id: string;
  user_id: string;
  /** SHA-256 of the refresh token (32 bytes). */
  token_hash: Buffer;
  family_id: string;
  issued_at: InstantDefaultNow;
  expires_at: Instant;
  revoked_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
}

export interface TagsTable {
  id: string;
  user_id: string;
  name: string;
  name_key: string;
  category: 'productive' | 'leisure' | 'neutral';
  distraction_class: ColumnType<
    'gaming' | 'social' | null,
    'gaming' | 'social' | null | undefined,
    'gaming' | 'social' | null
  >;
  archived: Generated<boolean>;
  revision: number;
  created_at: InstantDefaultNow;
  updated_at: InstantDefaultNow;
  deleted_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
}

export interface ProcessedCommandsTable {
  user_id: string;
  command_id: string;
  result: ColumnType<Json, string, string>;
  created_at: InstantDefaultNow;
}

export interface Database {
  users: UsersTable;
  user_revisions: UserRevisionsTable;
  email_tokens: EmailTokensTable;
  user_preferences: UserPreferencesTable;
  devices: DevicesTable;
  credentials: CredentialsTable;
  tags: TagsTable;
  processed_commands: ProcessedCommandsTable;
}
