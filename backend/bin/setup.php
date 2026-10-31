<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') exit;
require dirname(__DIR__) . '/database.php';
try {
    $emailColumn = database()->query("SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'email'")->fetchColumn();
    if ((int) $emailColumn) {
        if (!in_array('--remove-legacy-emails', $argv, true)) {
            throw new RuntimeException('Existing account emails found. Review migrations/2026-10-31-remove-account-email.sql, then rerun setup with --remove-legacy-emails to permanently remove them.');
        }
        database()->exec('ALTER TABLE users DROP COLUMN email');
    }
    database()->exec(file_get_contents(dirname(__DIR__) . '/schema.sql'));
    $column = database()->query("SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'account_state' AND COLUMN_NAME = 'permanent_juice'")->fetchColumn();
    if (!(int) $column) {
        database()->exec('ALTER TABLE account_state ADD COLUMN permanent_juice BOOLEAN NOT NULL DEFAULT FALSE');
    }
    $column = database()->query("SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'account_state' AND COLUMN_NAME = 'juice_refill_at'")->fetchColumn();
    if (!(int) $column) {
        database()->exec('ALTER TABLE account_state ADD COLUMN juice_refill_at BIGINT UNSIGNED NOT NULL DEFAULT 0');
    }
    echo "Database tables are ready. Existing accounts were preserved.\n";
} catch (Throwable $error) {
    fwrite(STDERR, "Setup failed: " . $error->getMessage() . "\n");
    exit(1);
}
