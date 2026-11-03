<?php
declare(strict_types=1);
require_once __DIR__ . '/game-physics.php';

class GameFailure extends RuntimeException
{
    public function __construct(string $message, public readonly int $status = 409) { parent::__construct($message); }
}

function ranked_obstacles(int $level): array
{
    static $layouts;
    $layouts ??= json_decode(file_get_contents(__DIR__ . '/game-data/tumbang-levels.json'), true, 64, JSON_THROW_ON_ERROR);
    $tier = $level >= 20 ? 20 : ($level >= 12 ? 12 : ($level >= 6 ? 6 : $level));
    $variants = $layouts[$tier];
    return $variants[random_int(0, count($variants) - 1)]['obstacles'];
}

function ranked_snapshot(array $row, array $state): array
{
    unset($state['at']);
    return ['id' => $row['run_id'], 'sequence' => (int) $row['sequence'], 'game' => $row['game'],
        'expiresAt' => (int) $row['expires_at'] * 1000, ...$state];
}

/** Called within the run's account transaction; retries cannot charge twice. */
function ranked_charge(PDO $db, array $user, array $run, string $reason): void
{
    [$user, $account] = recover_account_juice($db, $user);
    $cost = $account['permanent_juice'] || (int) $account['unlimited_until'] > time() ? 0 : 20;
    if ((int) $user['juice'] < $cost) throw new GameFailure('You need 20 Juice to continue.');
    $juice = (int) $user['juice'] - $cost;
    $db->prepare('UPDATE users SET juice = ? WHERE id = ?')->execute([$juice, $user['id']]);
    $refill = $juice >= 100 ? 0 : ((int) $account['juice_refill_at'] ?: time());
    $db->prepare('UPDATE account_state SET juice_refill_at = ?, version = version + 1 WHERE user_id = ?')->execute([$refill, $user['id']]);
    $id = 'run:' . substr(hash('sha256', $run['run_id'] . ':' . $run['sequence']), 0, 32);
    $db->prepare('INSERT INTO wallet_operations (user_id, request_id, request_hash, action, tansans_delta, juice_delta) VALUES (?, ?, ?, ?, 0, ?)')
        ->execute([$user['id'], $id, hash('sha256', $reason), 'consume_juice:' . $reason, -$cost]);
}

function ranked_score(PDO $db, int $id, string $game, int $points): void
{
    if ($points <= 0) return;
    $db->prepare('INSERT INTO verified_game_high_scores (user_id, game, points) VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE points = GREATEST(points, VALUES(points))')->execute([$id, $game, $points]);
}

function play_ranked(int $id, array $body): array
{
    $game = $body['game'] ?? null; $action = $body['action'] ?? null;
    if (!in_array($game, ['tumbang-preso', 'jolens-blast'], true) ||
        !in_array($action, ['start', 'shot', 'retry', 'next', 'round', 'finish'], true)) throw new GameFailure('Unknown game action.', 422);
    $allowed = ['game', 'action', 'requestId', ...($action === 'start' ? [] : ['runId', 'sequence']),
        ...($action === 'shot' ? ['vx', 'vy'] : []), ...($action === 'round' ? ['bet'] : [])];
    if (array_diff(array_keys($body), $allowed)) throw new GameFailure('Scores and game state cannot be supplied by the browser.', 422);
    if (!is_string($body['requestId'] ?? null) || !preg_match('/\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/', $body['requestId'])) throw new GameFailure('Invalid request ID.', 422);
    if ($action !== 'start' && (!is_int($body['sequence'] ?? null) || $body['sequence'] < 0 || !is_string($body['runId'] ?? null))) throw new GameFailure('Invalid game run.', 422);
    if ($action === 'shot') {
        foreach (['vx', 'vy'] as $key) if ((!is_int($body[$key] ?? null) && !is_float($body[$key] ?? null)) || !is_finite((float) $body[$key])) throw new GameFailure('Invalid shot.', 422);
        if ($game === 'jolens-blast' && hypot($body['vx'], $body['vy']) <= 1.5) throw new GameFailure('Pull farther before taking a shot.', 422);
        if (hypot($body['vx'], $body['vy']) > ($game === 'tumbang-preso' ? 17.6 : 22.5) + 1e-9) throw new GameFailure('Shot power exceeds the game limit.', 422);
    }
    // Fixed field order makes key ordering irrelevant to duplicate detection.
    $hash = hash('sha256', json_encode(array_map(fn($key) => $body[$key] ?? null, $allowed), JSON_THROW_ON_ERROR));
    $db = database(); $db->beginTransaction();
    try {
        $q = $db->prepare('SELECT * FROM users WHERE id = ? FOR UPDATE'); $q->execute([$id]); $user = $q->fetch();
        require_current_session($db, $id);
        $q = $db->prepare('SELECT * FROM game_runs WHERE user_id = ? AND game = ? FOR UPDATE'); $q->execute([$id, $game]); $run = $q->fetch();
        if ($action === 'start') {
            if (!$run || $run['start_id'] !== $body['requestId']) {
                $state = ['status' => $game === 'tumbang-preso' ? 'ready' : 'bet', 'score' => 0, 'level' => 1,
                    'inventory' => 10, 'completed' => false, 'targets' => [],
                    'obstacles' => $game === 'tumbang-preso' ? ranked_obstacles(1) : [], 'at' => microtime(true)];
                $run = ['run_id' => bin2hex(random_bytes(32)), 'start_id' => $body['requestId'], 'sequence' => 0,
                    'game' => $game, 'auth_version' => $_SESSION['auth_version'], 'expires_at' => time() + 7200];
                $db->prepare('INSERT INTO game_runs (user_id, game, run_id, start_id, auth_version, sequence, state, expires_at, last_hash)
                    VALUES (?, ?, ?, ?, ?, 0, ?, ?, \'\') ON DUPLICATE KEY UPDATE run_id = VALUES(run_id), start_id = VALUES(start_id),
                    auth_version = VALUES(auth_version), sequence = 0, state = VALUES(state), expires_at = VALUES(expires_at), last_hash = \'\'')
                    ->execute([$id, $game, $run['run_id'], $run['start_id'], $run['auth_version'], json_encode($state, JSON_THROW_ON_ERROR), $run['expires_at']]);
            } else {
                $state = json_decode($run['state'], true, 64, JSON_THROW_ON_ERROR);
            }
        } else {
            if (!$run || !hash_equals($run['run_id'], $body['runId'])) throw new GameFailure('This game was replaced or belongs to another account. Start a new game.');
            $state = json_decode($run['state'], true, 64, JSON_THROW_ON_ERROR);
        }
        if ((int) $run['expires_at'] <= time() || (int) $run['auth_version'] !== (int) $_SESSION['auth_version']) throw new GameFailure('This game expired. Start a new game.');
        if ($action !== 'start') {
            $duplicate = $body['sequence'] === (int) $run['sequence'] - 1 && hash_equals($run['last_hash'], $hash);
            if (!$duplicate) {
                if ($body['sequence'] !== (int) $run['sequence']) throw new GameFailure('The game changed in another request. Reload to start again.');
                if ($run['sequence'] >= 4000) throw new GameFailure('This game reached its action limit. Start a new game.');
                $status = $state['status'];
                if ($action === 'shot') {
                    if ($status !== ($game === 'tumbang-preso' ? 'ready' : 'playing')) throw new GameFailure('Start an attempt before taking a shot.');
                    $result = $game === 'tumbang-preso' ? replay_tumbang($body['vx'], $body['vy'], $state['obstacles']) : replay_jolens($body['vx'], $body['vy'], $state['targets']);
                    if (microtime(true) - $state['at'] + 0.1 < $result['frames'] / 60) throw new GameFailure('The shot has not finished. Please retry.', 425);
                    $state['completed'] = true;
                    if ($game === 'tumbang-preso') {
                        $state['status'] = $result['hit'] ? 'hit' : 'miss';
                        if ($result['hit']) { $state['score'] += 100; ranked_score($db, $id, $game, $state['score']); }
                    } else {
                        $state['inventory'] += $result['delta']; $state['targets'] = $result['targets'];
                        $state['status'] = count($state['targets']) ? 'playing' : 'won';
                    }
                } elseif ($action === 'next' && $game === 'tumbang-preso' && $status === 'hit') {
                    $state['level']++; $state['obstacles'] = ranked_obstacles($state['level']); $state['status'] = 'ready';
                } elseif ($action === 'retry' && $game === 'tumbang-preso' && $status === 'miss') {
                    ranked_charge($db, $user, $run, 'tumbang_retry'); $state['status'] = 'ready';
                } elseif ($action === 'round' && $game === 'jolens-blast' && in_array($status, ['bet', 'won'], true)) {
                    $bet = $body['bet'] ?? null;
                    if (!is_int($bet) || $bet < 1 || $bet > min(5, $state['inventory'] - 1)) throw new GameFailure('Invalid marble bet.', 422);
                    ranked_charge($db, $user, $run, 'jolens_round');
                    $state['inventory'] -= $bet; $state['targets'] = ranked_marble_positions($bet * 2); $state['status'] = 'playing';
                } elseif ($action === 'finish' && $game === 'jolens-blast' && $status !== 'finished') {
                    $state['score'] = $state['completed'] ? $state['inventory'] * 50 : 0; $state['status'] = 'finished';
                    ranked_score($db, $id, $game, $state['score']);
                } else throw new GameFailure('That action is not available in this game state.');
                if ($game === 'jolens-blast' && $state['inventory'] <= 0) { $state['status'] = 'finished'; $state['score'] = 0; }
                $state['at'] = microtime(true); $run['sequence']++;
                $db->prepare('UPDATE game_runs SET sequence = ?, state = ?, last_hash = ? WHERE user_id = ? AND game = ?')
                    ->execute([$run['sequence'], json_encode($state, JSON_THROW_ON_ERROR), $hash, $id, $game]);
            }
        }
        $response = ['run' => ranked_snapshot($run, $state), 'user' => public_user($user)];
        $db->commit(); return $response;
    } catch (Throwable $error) { if ($db->inTransaction()) $db->rollBack(); throw $error; }
}
