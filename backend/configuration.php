<?php
declare(strict_types=1);

/** Environment values override the private local file; never log this array. */
function app_config(): array
{
    static $config;
    if (isset($config)) return $config;
    $local = is_file(__DIR__ . '/config.local.php') ? require __DIR__ . '/config.local.php' : [];
    if (!is_array($local)) throw new RuntimeException('Invalid local configuration.');
    $config = $local;
    foreach (['host', 'port', 'database', 'username', 'password'] as $key) {
        $value = getenv('TUBONG_DB_' . strtoupper($key));
        if ($value !== false) $config[$key] = $value;
    }
    $environment = getenv('TUBONG_ENV');
    $config['environment'] = $environment !== false ? $environment : ($local['environment'] ?? 'development');
    if (!in_array($config['environment'], ['development', 'production'], true)) {
        throw new RuntimeException('TUBONG_ENV must be development or production.');
    }
    foreach (['allow_demo_topups', 'secure_cookies'] as $key) {
        $value = getenv('TUBONG_' . strtoupper($key));
        if ($value !== false && !in_array($value, ['0', '1'], true)) {
            throw new RuntimeException('Invalid boolean environment setting: ' . $key);
        }
        $config[$key] = $value !== false ? $value === '1' : ($local[$key] ?? false) === true;
    }
    if ($config['environment'] === 'production') {
        $config['allow_demo_topups'] = false;
        $config['secure_cookies'] = true;
    }
    return $config;
}
