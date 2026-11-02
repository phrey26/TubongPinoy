<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') exit;
require dirname(__DIR__) . '/database.php';
require dirname(__DIR__) . '/customization.php';
require dirname(__DIR__) . '/catalog-rotation.php';
try {
    $ids = array_slice($argv, 1);
    if (!$ids) throw new InvalidArgumentException('Provide the full list of skin IDs to offer, or --empty to close all skin listings.');
    rotate_skin_catalog(database(), $ids === ['--empty'] ? [] : $ids);
    echo "Shop rotation applied. Purchased skins and equipment preserved.\n";
} catch (Throwable $error) {
    fwrite(STDERR, $error->getMessage() . "\n");
    exit(1);
}
