<?php
declare(strict_types=1);

// Only these local assets may be selected. Clients never supply image URLs.
const PROFILE_AVATARS = ['sunny', 'lila', 'miko', 'maya'];
const DEFAULT_GAME_SKINS = ['tumbang-preso' => 'slipper_pink', 'jolens-blast' => 'shooter_chrome'];

// Permanent archive, including retired shop items. Append IDs; never repurpose or remove them.
function collectible_game_skins(): array
{
    return [
        ['id' => 'skin_4', 'name' => 'Guyabanos', 'rarity' => 'Common', 'game' => 'tumbang-preso',
            'imageUrl' => 'assets/tumbang-preso-skins-assets/slipper_guyabanos.webp'],
        ['id' => 'skin_3', 'name' => 'Sike!', 'rarity' => 'Rare', 'game' => 'tumbang-preso',
            'imageUrl' => 'assets/tumbang-preso-skins-assets/slipper_sike.webp'],
        ['id' => 'skin_2', 'name' => 'Gatorz', 'rarity' => 'Epic', 'game' => 'tumbang-preso',
            'imageUrl' => 'assets/tumbang-preso-skins-assets/slipper_gatorz.webp'],
        ['id' => 'skin_1', 'name' => 'Aldugo', 'rarity' => 'Legendary', 'game' => 'tumbang-preso',
            'imageUrl' => 'assets/tumbang-preso-skins-assets/slipper_aldugo.webp'],
        ['id' => 'shooter_8ball', 'name' => '8ball', 'rarity' => 'Common', 'game' => 'jolens-blast',
            'imageUrl' => 'assets/jolens-blast-skin-assets/marble_skin_8ball.webp'],
        ['id' => 'shooter_golf', 'name' => 'Golf', 'rarity' => 'Rare', 'game' => 'jolens-blast',
            'imageUrl' => 'assets/jolens-blast-skin-assets/marble_skin_golf.webp'],
        ['id' => 'shooter_jupiter', 'name' => 'Jupiter', 'rarity' => 'Epic', 'game' => 'jolens-blast',
            'imageUrl' => 'assets/jolens-blast-skin-assets/marble_skin_jupiter.webp'],
        ['id' => 'shooter_steel_ball', 'name' => 'Steel Ball', 'rarity' => 'Legendary', 'game' => 'jolens-blast',
            'imageUrl' => 'assets/jolens-blast-skin-assets/marble_skin_steel_ball.webp'],
    ];
}

function owned_game_skins(array $user): array
{
    return array_values(array_filter(collectible_game_skins(),
        fn(array $skin): bool => in_array($skin['id'], $user['ownedSkins'], true)));
}

function starter_skins(): array
{
    // Permanent free IDs; independent of shop rotation and display names.
    return [
        ['id' => 'slipper_pink', 'name' => 'Pink Slipper', 'game' => 'tumbang-preso',
            'imageUrl' => 'assets/tumbang-preso-assets/slippers/slipper_pink.png'],
        ['id' => 'slipper_blue', 'name' => 'Blue Slipper', 'game' => 'tumbang-preso',
            'imageUrl' => 'assets/tumbang-preso-assets/slippers/slipper_blue.png'],
        ['id' => 'slipper_green', 'name' => 'Green Slipper', 'game' => 'tumbang-preso',
            'imageUrl' => 'assets/tumbang-preso-assets/slippers/slipper_green.png'],
        ['id' => 'slipper_orange', 'name' => 'Orange Slipper', 'game' => 'tumbang-preso',
            'imageUrl' => 'assets/tumbang-preso-assets/slippers/slipper_orange.png'],
        ['id' => 'slipper_red', 'name' => 'Red Slipper', 'game' => 'tumbang-preso',
            'imageUrl' => 'assets/tumbang-preso-assets/slippers/slipper_red.png'],
        ['id' => 'slipper_yellow', 'name' => 'Yellow Slipper', 'game' => 'tumbang-preso',
            'imageUrl' => 'assets/tumbang-preso-assets/slippers/slipper_yellow.png'],
        ['id' => 'shooter_chrome', 'name' => 'Classic Chrome', 'game' => 'jolens-blast',
            'imageUrl' => 'assets/jolens-blast-assets/shooters/shooter_chrome.png'],
        ['id' => 'shooter_gold', 'name' => 'Golden Jolens', 'game' => 'jolens-blast',
            'imageUrl' => 'assets/jolens-blast-assets/shooters/shooter_gold.png'],
        ['id' => 'shooter_blue_swirl', 'name' => 'Blue Swirl', 'game' => 'jolens-blast',
            'imageUrl' => 'assets/jolens-blast-assets/shooters/shooter_blue_swirl.png'],
    ];
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
        require_current_session($db, $userId);
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
