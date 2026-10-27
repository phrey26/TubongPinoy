<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') exit;
require dirname(__DIR__) . '/database.php';
try {
    database()->exec(file_get_contents(dirname(__DIR__) . '/schema.sql'));
    echo "Database tables are ready. Existing accounts were preserved.\n";
} catch (Throwable $error) {
    fwrite(STDERR, "Setup failed: " . $error->getMessage() . "\n");
    exit(1);
}
