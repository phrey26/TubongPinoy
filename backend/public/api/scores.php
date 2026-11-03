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
    respond(['message' => 'Scores are calculated from verified game runs. Start a new game to earn points.'], 422);
}
$query = $db->prepare('SELECT s.user_id AS userId, u.username,
    COALESCE(p.display_name, u.username) AS displayName, COALESCE(p.avatar_id, \'sunny\') AS avatarId, s.points
    FROM verified_game_high_scores s JOIN users u ON u.id = s.user_id
    LEFT JOIN user_profiles p ON p.user_id = u.id
    WHERE s.game = ? ORDER BY s.points DESC, s.user_id ASC LIMIT 10');
$query->execute([$game]);
$scores = $query->fetchAll();
foreach ($scores as &$score) {
    $score['userId'] = (int) $score['userId'];
    $score['points'] = (int) $score['points'];
}
unset($score);
$query = $db->prepare('SELECT points FROM verified_game_high_scores WHERE user_id = ? AND game = ?');
$query->execute([$user['id'], $game]);
$best = $query->fetchColumn();
respond(['game' => $game, 'highScores' => $scores, 'personalBest' => $best === false ? 0 : (int) $best]);
