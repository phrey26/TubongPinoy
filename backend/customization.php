<?php
declare(strict_types=1);

// Only these local assets may be selected. Clients never supply image URLs.
const PROFILE_AVATARS = ['sunny', 'lila', 'miko', 'maya'];
const DEFAULT_GAME_SKINS = ['tumbang-preso' => 'slipper_pink', 'jolens-blast' => 'shooter_chrome'];

function starter_skins(): array
{
    $items = [];
    foreach (['pink', 'blue', 'green', 'orange', 'red', 'yellow'] as $color) {
        $items[] = ['id' => 'slipper_' . $color, 'name' => ucfirst($color) . ' Slipper',
            'game' => 'tumbang-preso', 'imageUrl' => 'assets/tumbang-preso-assets/slippers/slipper_' . $color . '.png'];
    }
    foreach (['chrome' => 'Classic Chrome', 'gold' => 'Golden Jolens', 'blue_swirl' => 'Blue Swirl'] as $key => $name) {
        $items[] = ['id' => 'shooter_' . $key, 'name' => $name,
            'game' => 'jolens-blast', 'imageUrl' => 'assets/jolens-blast-assets/shooters/shooter_' . $key . '.png'];
    }
    return $items;
}

function account_profile(PDO $db, int $userId, string $username): array
{
    $query = $db->prepare('SELECT display_name, avatar_id, tumbang_skin, jolens_skin FROM user_profiles WHERE user_id = ?');
    $query->execute([$userId]);
    $profile = $query->fetch() ?: [];
    return ['displayName' => $profile['display_name'] ?? $username,
        'avatarId' => $profile['avatar_id'] ?? 'sunny',
        'equippedSkins' => ['tumbang-preso' => $profile['tumbang_skin'] ?? DEFAULT_GAME_SKINS['tumbang-preso'],
            'jolens-blast' => $profile['jolens_skin'] ?? DEFAULT_GAME_SKINS['jolens-blast']]];
}

/** Serialize profile/equipment changes with wallet snapshots and bump their shared version. */
function save_customization(int $userId, array $values): array
{
    $db = database();
    $db->beginTransaction();
    try {
        $query = $db->prepare('SELECT id, username FROM users WHERE id = ? FOR UPDATE');
        $query->execute([$userId]);
        $user = $query->fetch();
        if (!$user) throw new RuntimeException('Account no longer exists.');
        $db->prepare('INSERT IGNORE INTO user_profiles (user_id, display_name) VALUES (?, ?)')
            ->execute([$userId, $user['username']]);
        // Column names are fixed here, never taken from request data.
        foreach (['display_name', 'avatar_id', 'tumbang_skin', 'jolens_skin'] as $column) {
            if (array_key_exists($column, $values)) {
                $db->prepare("UPDATE user_profiles SET $column = ? WHERE user_id = ?")->execute([$values[$column], $userId]);
            }
        }
        $db->prepare('UPDATE account_state SET version = version + 1 WHERE user_id = ?')->execute([$userId]);
        $result = public_user($user);
        $db->commit();
        return $result;
    } catch (Throwable $error) {
        if ($db->inTransaction()) $db->rollBack();
        throw $error;
    }
}
