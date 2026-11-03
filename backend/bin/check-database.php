<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') exit;
require dirname(__DIR__) . '/database.php';

// Read-only deployment check. Uses the same configuration as every API endpoint.
try {
    $options = getopt('', ['expect-database:']);
    $pdo = database();
    $name = (string) $pdo->query('SELECT DATABASE()')->fetchColumn();
    if (isset($options['expect-database']) && $options['expect-database'] !== $name) {
        throw new RuntimeException('Connected database does not match --expect-database.');
    }
    $schema = file_get_contents(dirname(__DIR__) . '/schema.sql');
    // This reads our schema's CREATE TABLE blocks, not arbitrary SQL input.
    preg_match_all('/CREATE TABLE IF NOT EXISTS (\w+) \((.*?)\) ENGINE=/s', $schema, $tables, PREG_SET_ORDER);
    if (!$tables) throw new RuntimeException('Cannot read the expected schema.');
    $columns = $pdo->prepare('SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?');
    $engine = $pdo->prepare('SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?');
    $missing = [];
    foreach ($tables as $table) {
        preg_match_all('/^    (\w+) (?:INT|BIGINT|TINYINT|VARCHAR|CHAR|BOOLEAN|TIMESTAMP|JSON)\b/m', $table[2], $expected);
        $columns->execute([$table[1]]);
        $actual = $columns->fetchAll(PDO::FETCH_COLUMN);
        foreach (array_diff($expected[1], $actual) as $column) $missing[] = $table[1] . '.' . $column;
        $engine->execute([$table[1]]);
        if ($engine->fetchColumn() !== 'InnoDB') $missing[] = $table[1] . ' (requires InnoDB)';
    }
    if ($missing) throw new RuntimeException('Missing or incompatible schema: ' . implode(', ', $missing));
    echo 'Connected database: ' . $name . PHP_EOL;
    echo 'Environment: ' . app_config()['environment'] . PHP_EOL;
    echo count($tables) . " tables: required columns present and InnoDB enabled.\n";
    echo "Read-only check passed. No account data or credentials displayed.\n";
} catch (PDOException $error) {
    // PDO errors can contain connection details; do not print them.
    fwrite(STDERR, "Database check failed: cannot connect or inspect schema. Check private configuration, server availability, and database permissions.\n");
    exit(1);
} catch (Throwable $error) {
    fwrite(STDERR, 'Database check failed: ' . $error->getMessage() . PHP_EOL);
    exit(1);
}
