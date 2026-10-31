<?php
declare(strict_types=1);
// Credentials are read from stdin, never from command-line arguments or a public API.
if (PHP_SAPI !== 'cli') exit;
require dirname(__DIR__) . '/database.php';
try {
    $input = json_decode(stream_get_contents(STDIN), true, 32, JSON_THROW_ON_ERROR);
    $username = $input['username'] ?? '';
    $password = $input['password'] ?? '';
    if (!is_string($username) || !preg_match('/\A[A-Za-z0-9_]{3,50}\z/', $username) ||
        !is_string($password) || strlen($password) < 8 || strlen($password) > 72 || str_contains($password, "\0")) {
        throw new RuntimeException('Provide a valid username and password as a JSON object on stdin.');
    }
    $db = database();
    $db->beginTransaction();
    $query = $db->prepare('SELECT id FROM users WHERE username = ? FOR UPDATE');
    $query->execute([$username]);
    $userId = $query->fetchColumn();
    $hash = password_hash($password, PASSWORD_DEFAULT);
    if ($userId === false) {
        $db->prepare('INSERT INTO users (username, password_hash, tansans, juice) VALUES (?, ?, 999999, 100)')
            ->execute([$username, $hash]);
        $userId = (int) $db->lastInsertId();
    } else {
        $db->prepare('UPDATE users SET password_hash = ?, tansans = 999999, juice = 100 WHERE id = ?')
            ->execute([$hash, $userId]);
    }
    $db->prepare('INSERT INTO account_state (user_id, permanent_juice, version) VALUES (?, TRUE, 1)
        ON DUPLICATE KEY UPDATE permanent_juice = TRUE, version = version + 1')->execute([$userId]);
    $db->commit();
    echo "Debug account ready: $username; 999999 Tansans; permanent unlimited Juice.\n";
} catch (Throwable $error) {
    if (isset($db) && $db->inTransaction()) $db->rollBack();
    fwrite(STDERR, 'Debug account setup failed: ' . $error->getMessage() . "\n");
    exit(1);
}
