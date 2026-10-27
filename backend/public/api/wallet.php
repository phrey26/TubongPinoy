<?php
require dirname(__DIR__, 2) . '/bootstrap.php';
require dirname(__DIR__, 2) . '/economy.php';
$body = json_input();
$user = require_user();
try {
    respond(['user' => update_wallet($user['id'], $body)]);
} catch (WalletFailure $error) {
    respond(['message' => $error->getMessage(), 'user' => current_user()], $error->status);
}
