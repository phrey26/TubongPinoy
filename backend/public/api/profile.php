<?php
require dirname(__DIR__, 2) . '/bootstrap.php';
$body = json_input();
$user = require_user();
$name = trim(input_string($body, 'displayName'));
$avatar = input_string($body, 'avatarId');
if (strlen($name) > 120 || !preg_match("/\A[\p{L}\p{M}\p{N} ._'’\-]{2,30}\z/u", $name) ||
    !preg_match('/[\p{L}\p{N}]/u', $name)) {
    respond(['message' => 'Use 2–30 characters for your display name: letters, numbers, spaces, periods, apostrophes, underscores or hyphens.'], 422);
}
if (!in_array($avatar, PROFILE_AVATARS, true)) {
    respond(['message' => 'Choose one of the available profile icons.'], 422);
}
respond(['user' => save_customization($user['id'], ['display_name' => $name, 'avatar_id' => $avatar])]);
