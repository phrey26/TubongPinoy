<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') exit;
require dirname(__DIR__) . '/database.php';
try {
    database()->exec(file_get_contents(dirname(__DIR__) . '/schema.sql'));
    $column = database()->query("SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'account_state' AND COLUMN_NAME = 'permanent_juice'")->fetchColumn();
    if (!(int) $column) {
        database()->exec('ALTER TABLE account_state ADD COLUMN permanent_juice BOOLEAN NOT NULL DEFAULT FALSE');
    }
    echo "Database tables are ready. Existing accounts were preserved.\n";
} catch (Throwable $error) {
    fwrite(STDERR, "Setup failed: " . $error->getMessage() . "\n");
    exit(1);
}
