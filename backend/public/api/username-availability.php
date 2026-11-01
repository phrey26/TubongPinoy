<?php
require dirname(__DIR__, 2) . '/bootstrap.php';
require_method('GET');
rate_limit('username-availability:' . ($_SERVER['REMOTE_ADDR'] ?? ''), 60);
$username = trim(input_string($_GET, 'username'));
if (!preg_match('/\A[A-Za-z0-9_]{3,50}\z/', $username)) {
    respond(['message' => 'Use 3–50 letters, numbers or underscores for your username.'], 422);
}
// Use the same database collation as the unique username constraint.
$query = database()->prepare('SELECT 1 FROM users WHERE username = ? LIMIT 1');
$query->execute([$username]);
respond(['username' => $username, 'available' => $query->fetchColumn() === false]);
