<?php
require dirname(__DIR__, 2) . '/bootstrap.php';
require dirname(__DIR__, 2) . '/game-runs.php';
$body = json_input();
$user = require_user();
rate_limit('game-actions:' . $user['id'], 900);
if (($body['action'] ?? null) === 'start') rate_limit('game-starts:' . $user['id'], 60);
try { respond(play_ranked($user['id'], $body)); }
catch (GameFailure $error) { respond(['message' => $error->getMessage()], $error->status); }
