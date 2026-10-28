<?php
require dirname(__DIR__, 2) . '/bootstrap.php';

$method = $_SERVER['REQUEST_METHOD'];
if (!in_array($method, ['GET', 'POST'], true)) {
    header('Allow: GET, POST');
    respond(['message' => 'Method not allowed.'], 405);
}
$body = $method === 'POST' ? json_input() : $_GET;
$user = require_user();
$game = $body['game'] ?? null;
if (!is_string($game) || !in_array($game, ['tumbang-preso', 'jolens-blast'], true)) {
    respond(['message' => 'Unknown game.'], 422);
}
$db = database();
if ($method === 'POST') {
    // Dismissing a tutorial records it for the authenticated account only.
    $query = $db->prepare('INSERT IGNORE INTO game_tutorials (user_id, game) VALUES (?, ?)');
    $query->execute([$user['id'], $game]);
}
$query = $db->prepare('SELECT 1 FROM game_tutorials WHERE user_id = ? AND game = ?');
$query->execute([$user['id'], $game]);
respond(['game' => $game, 'seen' => $query->fetchColumn() !== false]);
