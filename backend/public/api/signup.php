<?php
require dirname(__DIR__, 2) . '/bootstrap.php';
$body = json_input();
$username = trim(input_string($body, 'username'));
$email = strtolower(trim(input_string($body, 'email')));
$password = input_string($body, 'password');
if (!preg_match('/\A[A-Za-z0-9_]{3,50}\z/', $username)) {
    respond(['message' => 'Use 3–50 letters, numbers or underscores for your username.'], 422);
}
if (strlen($email) > 254 || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    respond(['message' => 'Enter a valid email address.'], 422);
}
if (strlen($password) < 8 || strlen($password) > 72 || str_contains($password, "\0")) {
    respond(['message' => 'Use a password between 8 and 72 bytes long.'], 422);
}
if (($body['terms'] ?? false) !== true) {
    respond(['message' => 'Please agree to the Terms of Use and acknowledge the Privacy Policy.'], 422);
}
rate_limit('signup:' . ($_SERVER['REMOTE_ADDR'] ?? ''), 20);
try {
    $query = database()->prepare('INSERT INTO users (username, email, password_hash, tansans) VALUES (?, ?, ?, 0)');
    $query->execute([$username, $email, password_hash($password, PASSWORD_DEFAULT)]);
} catch (PDOException $error) {
    if (($error->errorInfo[1] ?? null) === 1062) {
        respond(['message' => 'That username or email is already registered.'], 409);
    }
    throw $error;
}
establish_session((int) database()->lastInsertId());
respond(['user' => require_user(), 'csrfToken' => $_SESSION['csrf']], 201);
