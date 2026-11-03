<?php
declare(strict_types=1);
require_once __DIR__ . '/configuration.php';

function database(): PDO
{
    static $connection = null;
    if ($connection instanceof PDO) return $connection;
    $config = app_config();
    foreach (['host', 'port', 'database', 'username', 'password'] as $key) {
        if (!isset($config[$key])) throw new RuntimeException('Database configuration is missing. See backend/README.md.');
    }
    if (!is_string($config['database']) || !preg_match('/\A[A-Za-z0-9_]{1,64}\z/', $config['database']) ||
        !is_string($config['host']) || !preg_match('/\A[A-Za-z0-9.\-:]+\z/', $config['host']) ||
        filter_var($config['port'], FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 65535]]) === false) {
        throw new RuntimeException('Invalid database host, port or database name.');
    }
    if ($config['environment'] === 'production' && ($config['username'] === 'root' || $config['password'] === '')) {
        throw new RuntimeException('Production requires a dedicated database account and password.');
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
