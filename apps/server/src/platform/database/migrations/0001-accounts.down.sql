-- Reverses 0001-accounts.up.sql: children first, then users, then the trigger functions.
drop table processed_commands;
drop table tags;
drop table credentials;
drop table devices;
drop table user_preferences;
drop table email_tokens;
drop function email_tokens_single_use();
drop table user_revisions;
drop function user_revisions_only_increase();
drop table users;
