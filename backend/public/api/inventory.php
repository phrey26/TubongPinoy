<?php
require dirname(__DIR__, 2) . '/bootstrap.php';
$method = $_SERVER['REQUEST_METHOD'];
if (!in_array($method, ['GET', 'POST'], true)) {
    header('Allow: GET, POST');
    respond(['message' => 'Method not allowed.'], 405);
}
$body = $method === 'POST' ? json_input() : [];
$user = require_user();
$items = starter_skins();
if ($method === 'GET') {
    $query = database()->prepare('SELECT s.id, s.name, s.image_url AS imageUrl
        FROM skins s JOIN user_skins owned ON owned.skin_id = s.id WHERE owned.user_id = ? ORDER BY s.id');
    $query->execute([$user['id']]);
    respond(['items' => $items, 'collectibles' => $query->fetchAll(), 'user' => $user]);
}
$game = input_string($body, 'game');
$skin = input_string($body, 'skinId');
$available = array_filter($items, fn(array $item): bool => $item['id'] === $skin && $item['game'] === $game);
if (!$available) respond(['message' => 'This skin is not available for that game.'], 422);
$column = $game === 'tumbang-preso' ? 'tumbang_skin' : 'jolens_skin';
respond(['user' => save_customization($user['id'], [$column => $skin])]);
