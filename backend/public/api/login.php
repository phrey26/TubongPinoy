<?php
require dirname(__DIR__, 2) . '/bootstrap.php';
$body = json_input();
$identity = trim(input_string($body, 'identity'));
$password = input_string($body, 'password');
if ($identity === '' || strlen($identity) > 254 || $password === '' || strlen($password) > 72 || str_contains($password, "\0")) {
    respond(['message' => 'Enter your username or email and password.'], 422);
}
$ip = $_SERVER['REMOTE_ADDR'] ?? '';
rate_limit('login-ip:' . $ip, 60);
rate_limit('login-identity:' . strtolower($identity), 15);
$db = database();
// Verification and session version capture must agree with concurrent credential changes.
$db->beginTransaction();
$query = $db->prepare('SELECT * FROM users WHERE username = ? OR email = ? LIMIT 1 FOR UPDATE');
$query->execute([$identity, $identity]);
$row = $query->fetch();
// A valid dummy hash keeps an unknown account on the same password-verification path.
$hash = $row ? $row['password_hash'] : '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.';
if (!password_verify($password, $hash) || !$row) {
    $db->rollBack();
    respond(['message' => 'Incorrect username/email or password.'], 401);
}
if (password_needs_rehash($row['password_hash'], PASSWORD_DEFAULT)) {
    database()->prepare('UPDATE users SET password_hash = ? WHERE id = ?')
        ->execute([password_hash($password, PASSWORD_DEFAULT), $row['id']]);
}
database()->prepare('DELETE FROM auth_rate_limits WHERE bucket = ?')
    ->execute([hash('sha256', 'login-identity:' . strtolower($identity))]);
establish_session((int) $row['id'], ($body['rememberMe'] ?? false) === true);
$user = public_user($row);
$db->commit();
respond(['user' => $user, 'csrfToken' => $_SESSION['csrf']]);
