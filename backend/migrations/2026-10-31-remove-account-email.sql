-- Run once against an EXISTING installation before deploying username-only APIs.
-- Permanently removes previously collected account email addresses.
-- User IDs, usernames, password hashes, profiles, balances, and scores are kept.
-- Fresh installations created from schema.sql do not need this migration.
ALTER TABLE users DROP COLUMN email;
