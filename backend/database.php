<?php
declare(strict_types=1);

function database(): PDO
{
    static $connection = null;
    if ($connection instanceof PDO) return $connection;
    $local = is_file(__DIR__ . '/config.local.php') ? require __DIR__ . '/config.local.php' : [];
    $config = [];
    foreach (['host', 'port', 'database', 'username', 'password'] as $key) {
        $value = getenv('TUBONG_DB_' . strtoupper($key));
        $config[$key] = $value !== false ? $value : ($local[$key] ?? null);
    }
    if (in_array(null, $config, true)) {
        throw new RuntimeException('Database configuration is missing. See backend/README.md.');
    }
    $connection = new PDO(
        sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
            $config['host'], (int) $config['port'], $config['database']),
        $config['username'], $config['password'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
         PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
         PDO::ATTR_EMULATE_PREPARES => false]
    );
    return $connection;
}
