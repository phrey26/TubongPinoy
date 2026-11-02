<?php
declare(strict_types=1);
require dirname(__DIR__) . '/database.php';
require dirname(__DIR__) . '/customization.php';
require dirname(__DIR__) . '/economy.php';
require dirname(__DIR__) . '/catalog-rotation.php';

function check(bool $ok, string $message): void {
    if (!$ok) throw new RuntimeException($message);
    echo "PASS: $message\n";
}
$db = database();
try {
    rotate_skin_catalog($db, ['unregistered_future_id']);
    throw new RuntimeException('Unknown ID was accepted');
} catch (InvalidArgumentException) {
    echo "PASS: unknown replacement IDs are rejected before rotation\n";
}
$db->beginTransaction();
try {
    $name = 'rotation_' . bin2hex(random_bytes(6));
    $db->prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)')->execute([$name, 'test-only']);
    $userId = (int) $db->lastInsertId();
    $ids = array_column(collectible_game_skins(), 'id');
    foreach ($ids as $id) {
        $db->prepare('INSERT INTO user_skins (user_id, skin_id) VALUES (?, ?)')->execute([$userId, $id]);
    }
    $db->prepare('INSERT INTO user_profiles (user_id, display_name, tumbang_skin, jolens_skin) VALUES (?, ?, ?, ?)')
        ->execute([$userId, $name, 'skin_1', 'shooter_steel_ball']);
    // Rotation's availability change is uncommitted and rolled back below.
    $db->exec('UPDATE skins SET active = 0');
    check(shop_catalog()['skins'] === [], 'retired skins disappear from shop');
    $query = $db->prepare('SELECT skin_id FROM user_skins WHERE user_id = ?');
    $query->execute([$userId]);
    $owned = $query->fetchAll(PDO::FETCH_COLUMN);
    check(count($owned) === count($ids), 'all purchased IDs survive retirement');
    $items = owned_game_skins(['ownedSkins' => $owned]);
    check(count($items) === count($ids), 'all retired skins remain playable inventory items');
    foreach ($items as $item) {
        check(is_file(dirname(__DIR__, 2) . '/public/' . $item['imageUrl']), $item['id'] . ' keeps its artwork');
    }
    $profile = account_profile($db, $userId, $name);
    check($profile['equippedSkins'] === ['tumbang-preso' => 'skin_1', 'jolens-blast' => 'shooter_steel_ball'], 'retirement preserves equipped legendary IDs');
    $db->exec('UPDATE skins SET active = 1');
    check(count(owned_game_skins(['ownedSkins' => $owned])) === count($ids), 'relisting preserves the same inventory');
} finally {
    $db->rollBack();
}
echo "All rotation checks passed; test changes rolled back.\n";
