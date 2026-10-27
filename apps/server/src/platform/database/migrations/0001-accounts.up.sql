-- T1.1: accounts, email tokens, preferences, devices, credentials, tags, revisions and the
-- idempotency store (spec section 6). Ids are uuids: clients generate device, tag and command ids
-- (spec section 6), the server generates the rest. Instants are timestamptz (UTC). Every
-- child table cascades from users, so deleting an account removes all of its rows (spec 9.1).

create table users (
  id uuid primary key,
  -- The address as the user typed it (display, mail).
  email text not null check (char_length(email) between 1 and 254),
  -- What the address is unique by: trim + Unicode NFKC + lower-case, computed by the application
  -- (src/domain/email-key.ts, emailKey()). Not lower(email) in SQL: that folds only ASCII on a
  -- cluster created with the C locale, and an external database may be. The upper bound allows
  -- the 18-fold NFKC expansion of a 254-character address (U+FDFA is the extreme case).
  -- Every service that inserts or looks up a user must set and use it.
  email_key text not null check (char_length(email_key) between 1 and 4572),
  email_verified_at timestamptz,
  -- A password hash (argon2 or similar, with its parameters) or the Google subject, or both.
  password_hash text check (char_length(password_hash) between 1 and 512),
  google_subject text check (char_length(google_subject) between 1 and 255),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_email_key unique (email_key),
  constraint users_google_subject_key unique (google_subject),
  constraint users_has_sign_in_method check (password_hash is not null or google_subject is not null)
);

-- R-35: one counter per user; the server bumps it in the transaction of every change.
create table user_revisions (
  user_id uuid primary key references users (id) on delete cascade,
  revision bigint not null default 0 check (revision >= 0)
);

create function user_revisions_only_increase() returns trigger
language plpgsql as $$
begin
  if new.revision <= old.revision then
    raise exception 'revision of user % must increase (% -> %)', old.user_id, old.revision, new.revision
      using errcode = 'check_violation', constraint = 'user_revisions_only_increase';
  end if;
  return new;
end;
$$;

create trigger user_revisions_only_increase
  before update on user_revisions
  for each row execute function user_revisions_only_increase();

-- Only the SHA-256 of a token is stored (32 bytes), never the token (spec 9.1).
create table email_tokens (
  id uuid primary key,
  user_id uuid not null references users (id) on delete cascade,
  purpose text not null check (purpose in ('verify_email', 'reset_password', 'change_email')),
  token_hash bytea not null check (octet_length(token_hash) = 32),
  new_email text check (char_length(new_email) between 1 and 254),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint email_tokens_token_hash_key unique (token_hash),
  constraint email_tokens_new_email_only_for_change check ((purpose = 'change_email') = (new_email is not null))
);

create index email_tokens_user_id_purpose_idx on email_tokens (user_id, purpose);
create index email_tokens_expires_at_idx on email_tokens (expires_at);

-- Single use: once used_at is set it never changes or clears.
create function email_tokens_single_use() returns trigger
language plpgsql as $$
begin
  if old.used_at is not null and new.used_at is distinct from old.used_at then
    raise exception 'email token % was already used', old.id
      using errcode = 'check_violation', constraint = 'email_tokens_single_use';
  end if;
  return new;
end;
$$;

create trigger email_tokens_single_use
  before update on email_tokens
  for each row execute function email_tokens_single_use();

-- One row per user (the primary key). Defaults follow Appendix A; the timezone stays null until
-- the user confirms it (R-15). Preferences are a change record, so they carry their revision.
create table user_preferences (
  user_id uuid primary key references users (id) on delete cascade,
  timezone text check (char_length(timezone) between 1 and 100),
  week_start text not null default 'monday'
    check (week_start in ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')),
  count_weekends boolean not null default true,
  time_format text not null default 'system' check (time_format in ('system', '12h', '24h')),
  theme text not null default 'system' check (theme in ('system', 'light', 'dark')),
  notify_credit_low boolean not null default true,
  notify_credit_zero boolean not null default true,
  notify_credit_below_zero boolean not null default true,
  notify_daily_goal boolean not null default true,
  notify_weekly_monthly_goal boolean not null default true,
  notify_game_suggestion boolean not null default true,
  onboarding_completed_at timestamptz,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);

-- The id is generated by the app on install, so the same id can only ever belong to one account.
create table devices (
  id uuid primary key,
  user_id uuid not null references users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  platform text not null check (platform in ('windows', 'android')),
  app_version text not null check (char_length(app_version) between 1 and 32),
  push_token text check (char_length(push_token) between 1 and 4096),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  -- Target of credentials' composite foreign key: a credential's user is its device's user.
  constraint devices_id_user_id_key unique (id, user_id)
);

create index devices_user_id_idx on devices (user_id);

-- Refresh tokens. Rotation sets revoked_at on the old row; presenting a revoked row again is
-- reuse and revokes the whole family (one update by family_id).
create table credentials (
  id uuid primary key,
  device_id uuid not null,
  user_id uuid not null,
  token_hash bytea not null check (octet_length(token_hash) = 32),
  family_id uuid not null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  constraint credentials_token_hash_key unique (token_hash),
  constraint credentials_device_fkey foreign key (device_id, user_id)
    references devices (id, user_id) on delete cascade
);

create index credentials_family_id_idx on credentials (family_id);
-- Led by both columns of the composite foreign key to devices (also serves device_id alone).
create index credentials_device_id_idx on credentials (device_id, user_id);
create index credentials_user_id_idx on credentials (user_id);
create index credentials_expires_at_idx on credentials (expires_at);

create table tags (
  id uuid primary key,
  user_id uuid not null references users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  -- Normalised name used for uniqueness (folded by the app, NFKC and lower-case like users.email_key);
  -- never shown. The upper bound is the 40-character name limit times the 18-fold NFKC
  -- expansion of one character (U+FDFA is the extreme case), so every valid name has a valid key.
  name_key text not null check (char_length(name_key) between 1 and 720),
  category text not null check (category in ('productive', 'leisure', 'neutral')),
  -- TAG-08: a distraction class can only link a Leisure tag.
  distraction_class text check (distraction_class in ('gaming', 'social')),
  archived boolean not null default false,
  revision bigint not null check (revision >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint tags_distraction_class_leisure_only check (distraction_class is null or category = 'leisure')
);

-- Unique (user, name key) among tags that are not deleted; a deleted name can be reused.
create unique index tags_user_id_name_key_key on tags (user_id, name_key) where deleted_at is null;

-- The unique index above is partial, so it cannot serve the ON DELETE CASCADE lookup of deleted
-- tags (nor listing a user's tags including deleted ones, which the change feed needs).
create index tags_user_id_idx on tags (user_id);

-- R-34: the stored result of every processed command, kept at least 30 days. Credential
-- operations are not commands (D-30), so no token ever lands here.
create table processed_commands (
  user_id uuid not null references users (id) on delete cascade,
  command_id uuid not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, command_id)
);

create index processed_commands_created_at_idx on processed_commands (created_at);
