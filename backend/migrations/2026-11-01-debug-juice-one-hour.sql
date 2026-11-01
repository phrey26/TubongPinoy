-- Convert only the designated debugging account's lifetime entitlement.
-- Reapplying this migration never restarts or extends the one-hour pass.
UPDATE account_state AS s
JOIN users AS u ON u.id = s.user_id
SET s.permanent_juice = FALSE,
    s.unlimited_until = UNIX_TIMESTAMP() + 3600,
    s.version = s.version + 1
WHERE u.username = 'admintest0001' AND s.permanent_juice = TRUE;
