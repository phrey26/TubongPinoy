<?php
require dirname(__DIR__, 2) . '/bootstrap.php';
$body = json_input();
$user = require_user();
$action = input_string($body, 'action');
$currentPassword = input_string($body, 'currentPassword');
if (!in_array($action, ['username', 'email', 'password'], true)) {
    respond(['message' => 'Choose a supported account setting.'], 422);
}
if ($currentPassword === '' || strlen($currentPassword) > 72 || str_contains($currentPassword, "\0")) {
    respond(['message' => 'Enter your current password to save this change.'], 422);
}
if ($action === 'username') {
    $value = trim(input_string($body, 'username'));
    if (!preg_match('/\A[A-Za-z0-9_]{3,50}\z/', $value)) {
        respond(['message' => 'Use 3–50 letters, numbers or underscores for your username.'], 422);
    }
} elseif ($action === 'email') {
    $value = strtolower(trim(input_string($body, 'email')));
    if (strlen($value) > 254 || !filter_var($value, FILTER_VALIDATE_EMAIL)) {
        respond(['message' => 'Enter a valid email address.'], 422);
    }
} else {
    $value = input_string($body, 'newPassword');
    if (strlen($value) < 8 || strlen($value) > 72 || str_contains($value, "\0")) {
        respond(['message' => 'Use a password between 8 and 72 bytes long.'], 422);
    }
    if ($value !== input_string($body, 'confirmPassword')) {
        respond(['message' => 'The new passwords do not match.'], 422);
    }
}
rate_limit('settings:' . $user['id'], 15);
$db = database();
$db->beginTransaction();
try {
    $query = $db->prepare('SELECT * FROM users WHERE id = ? FOR UPDATE');
    $query->execute([$user['id']]);
    $row = $query->fetch();
    $query = $db->prepare('SELECT version FROM account_security WHERE user_id = ?');
    $query->execute([$user['id']]);
    $version = (int) $query->fetchColumn();
    if (!$row || $version !== (int) ($_SESSION['auth_version'] ?? 0)) {
        $db->rollBack();
        respond(['message' => 'Your sign-in details changed. Please log in again.'], 401);
    }
    if (!password_verify($currentPassword, $row['password_hash'])) {
        $db->rollBack();
        // A wrong confirmation password must not log the current user out.
        respond(['message' => 'Your current password is incorrect.'], 422);
    }
    if (($action !== 'password' && $value === $row[$action]) ||
        ($action === 'password' && password_verify($value, $row['password_hash']))) {
        $db->rollBack();
        respond(['message' => 'Choose a different ' . $action . ' before saving.'], 422);
    }
    // Freeze the existing display name before changing a login username.
    $db->prepare('INSERT IGNORE INTO user_profiles (user_id, display_name) VALUES (?, ?)')
        ->execute([$user['id'], $row['username']]);
    $column = ['username' => 'username', 'email' => 'email', 'password' => 'password_hash'][$action];
    $stored = $action === 'password' ? password_hash($value, PASSWORD_DEFAULT) : $value;
    $db->prepare("UPDATE users SET $column = ? WHERE id = ?")->execute([$stored, $user['id']]);
    $db->prepare('INSERT INTO account_security (user_id, version) VALUES (?, 1)
        ON DUPLICATE KEY UPDATE version = version + 1')->execute([$user['id']]);
    $db->prepare('UPDATE account_state SET version = version + 1 WHERE user_id = ?')->execute([$user['id']]);
    $result = public_user($row);
    $db->commit();
    rotate_account_session($version + 1);
    respond(['user' => $result, 'csrfToken' => $_SESSION['csrf']]);
} catch (Throwable $error) {
    if ($db->inTransaction()) $db->rollBack();
    if ($error instanceof PDOException && ($error->errorInfo[1] ?? null) === 1062) {
        respond(['message' => 'That username or email is already registered.'], 409);
    }
    throw $error;
}
