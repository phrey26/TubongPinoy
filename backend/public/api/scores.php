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
    $points = $body['points'] ?? null;
    $step = $game === 'tumbang-preso' ? 100 : 50;
    if (!is_int($points) || $points <= 0 || $points > 1000000000 || $points % $step !== 0) {
        respond(['message' => 'Invalid score for this game.'], 422);
    }
    // Identity comes exclusively from the session. Concurrent/lower submissions
    // can never overwrite this user's best score for this game.
    $query = $db->prepare('INSERT INTO game_high_scores (user_id, game, points) VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE points = GREATEST(points, VALUES(points))');
    $query->execute([$user['id'], $game, $points]);
}
$query = $db->prepare('SELECT s.user_id AS userId, u.username, s.points
    FROM game_high_scores s JOIN users u ON u.id = s.user_id
    WHERE s.game = ? ORDER BY s.points DESC, s.user_id ASC LIMIT 10');
$query->execute([$game]);
$scores = $query->fetchAll();
foreach ($scores as &$score) {
    $score['userId'] = (int) $score['userId'];
    $score['points'] = (int) $score['points'];
}
unset($score);
$query = $db->prepare('SELECT points FROM game_high_scores WHERE user_id = ? AND game = ?');
$query->execute([$user['id'], $game]);
$best = $query->fetchColumn();
respond(['game' => $game, 'highScores' => $scores, 'personalBest' => $best === false ? 0 : (int) $best]);
