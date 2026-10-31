<?php
require dirname(__DIR__, 2) . '/bootstrap.php';
$body = json_input();
rate_limit('signup:' . ($_SERVER['REMOTE_ADDR'] ?? ''), 20);
$username = trim(input_string($body, 'username'));
$password = input_string($body, 'password');
if (!preg_match('/\A[A-Za-z0-9_]{3,50}\z/', $username)) {
    respond(['message' => 'Use 3–50 letters, numbers or underscores for your username.'], 422);
}
if (strlen($password) < 8 || strlen($password) > 72 || str_contains($password, "\0")) {
    respond(['message' => 'Use a password between 8 and 72 bytes long.'], 422);
}
if (($body['terms'] ?? false) !== true) {
    respond(['message' => 'Please agree to the Terms of Use and acknowledge the Privacy Policy.'], 422);
}
require __DIR__ . '/../../signup-challenge.php';
if (!valid_signup_challenge($_SESSION, $body, time())) {
    respond(['message' => 'Please try the new human check below.', 'code' => 'verification_failed'], 422);
}
try {
    $query = database()->prepare('INSERT INTO users (username, password_hash, tansans) VALUES (?, ?, 0)');
    $query->execute([$username, password_hash($password, PASSWORD_DEFAULT)]);
} catch (PDOException $error) {
    if (($error->errorInfo[1] ?? null) === 1062) {
        respond(['message' => 'Username is taken.'], 409);
    }
    throw $error;
}
establish_session((int) database()->lastInsertId());
respond(['user' => require_user(), 'csrfToken' => $_SESSION['csrf']], 201);
