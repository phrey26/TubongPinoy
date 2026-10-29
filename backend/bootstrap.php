<?php
declare(strict_types=1);
require_once __DIR__ . '/database.php';
require_once __DIR__ . '/juice.php';
require_once __DIR__ . '/customization.php';

ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

set_exception_handler(function (Throwable $error): void {
    // Log details on the server; never send SQL, credentials or traces to the browser.
    error_log('Tubong Pinoy API: ' . $error->getMessage());
    respond(['message' => 'The account service is unavailable. Please try again shortly.'], 503);
});

// Keep this app's sessions separate from phpMyAdmin and outside the public directory.
$sessionDirectory = __DIR__ . '/var/sessions';
if (!is_dir($sessionDirectory) && !mkdir($sessionDirectory, 0700, true) && !is_dir($sessionDirectory)) {
    throw new RuntimeException('Cannot create session storage.');
}
session_save_path($sessionDirectory);
ini_set('session.use_strict_mode', '1');
ini_set('session.use_only_cookies', '1');
ini_set('session.gc_maxlifetime', (string) (30 * 86400));
session_name('tubong_session');
session_set_cookie_params([
    'lifetime' => 0, 'path' => '/', 'httponly' => true,
    'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
    'samesite' => 'Lax',
]);
session_start();
if (isset($_SESSION['expires_at']) && $_SESSION['expires_at'] <= time()) {
    $_SESSION = [];
    session_regenerate_id(true);
}
$_SESSION['csrf'] ??= bin2hex(random_bytes(32));

function respond(array $body, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($body, JSON_THROW_ON_ERROR);
    exit;
}

function require_method(string $method): void
{
    if ($_SERVER['REQUEST_METHOD'] !== $method) {
        header('Allow: ' . $method);
        respond(['message' => 'Method not allowed.'], 405);
    }
}

function json_input(): array
{
    require_method('POST');
    $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (!hash_equals($_SESSION['csrf'], $token)) {
        respond(['message' => 'Your session changed. Please try again.'], 403);
    }
    if (strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0])) !== 'application/json') {
        respond(['message' => 'Send a JSON request.'], 415);
    }
    $raw = file_get_contents('php://input', false, null, 0, 8193);
    if ($raw === false || strlen($raw) > 8192) respond(['message' => 'Request is too large.'], 413);
    try {
        $body = json_decode($raw, false, 32, JSON_THROW_ON_ERROR);
    } catch (JsonException) {
        respond(['message' => 'Invalid JSON request.'], 400);
    }
    if (!$body instanceof stdClass) respond(['message' => 'Expected a JSON object.'], 400);
    return (array) $body;
}

function input_string(array $body, string $key): string
{
    if (!isset($body[$key]) || !is_string($body[$key])) {
        respond(['message' => 'Please complete all required fields.'], 422);
    }
    return $body[$key];
}

function public_user(array $row): array
{
    $db = database();
    $ownTransaction = !$db->inTransaction();
    if ($ownTransaction) $db->beginTransaction();
    $query = $db->prepare('SELECT id, username, email, tansans, juice FROM users WHERE id = ? FOR UPDATE');
    $query->execute([$row['id']]);
    [$row, $state] = recover_account_juice($db, $query->fetch());
    $query = $db->prepare('SELECT skin_id FROM user_skins WHERE user_id = ? ORDER BY skin_id');
    $query->execute([$row['id']]);
    $result = ['id' => (int) $row['id'], 'username' => $row['username'], 'email' => $row['email'],
        'tansans' => (int) $row['tansans'], 'juice' => (int) $row['juice'],
        'ownedSkins' => $query->fetchAll(PDO::FETCH_COLUMN),
        'unlimitedJuiceUntil' => (int) $state['unlimited_until'] * 1000,
        'permanentJuice' => (bool) $state['permanent_juice'],
        'walletVersion' => (int) $state['version'],
        'nextJuiceAt' => $row['juice'] < 100 ? ((int) $state['juice_refill_at'] + JUICE_REFILL_SECONDS) * 1000 : 0,
        'serverTime' => time() * 1000,
        ...account_profile($db, (int) $row['id'], $row['username'])];
    if ($ownTransaction) $db->commit();
    return $result;
}

function current_user(): ?array
{
    if (!isset($_SESSION['user_id'])) return null;
    $query = database()->prepare('SELECT id, username, email, tansans, juice FROM users WHERE id = ?');
    $query->execute([$_SESSION['user_id']]);
    $row = $query->fetch();
    if (!$row) {
        unset($_SESSION['user_id']);
        return null;
    }
    return public_user($row);
}

// Reuse this check on every future game, balance, score or purchase API endpoint.
function require_user(): array
{
    return current_user() ?? respond(['message' => 'Please log in to continue.'], 401);
}

function establish_session(int $userId, bool $remember = false): void
{
    session_regenerate_id(true);
    $_SESSION = ['user_id' => $userId, 'csrf' => bin2hex(random_bytes(32)),
        'expires_at' => time() + ($remember ? 30 * 86400 : 8 * 3600)];
    $cookie = session_get_cookie_params();
    unset($cookie['lifetime']);
    setcookie(session_name(), session_id(), $cookie + ['expires' => $remember ? $_SESSION['expires_at'] : 0]);
}

function rate_limit(string $key, int $limit): void
{
    $db = database();
    $now = time();
    $bucket = hash('sha256', $key);
    $db->prepare('DELETE FROM auth_rate_limits WHERE expires_at <= ?')->execute([$now]);
    $db->prepare('INSERT INTO auth_rate_limits (bucket, attempts, expires_at) VALUES (?, 1, ?)
        ON DUPLICATE KEY UPDATE attempts = attempts + 1')->execute([$bucket, $now + 900]);
    $query = $db->prepare('SELECT attempts, expires_at FROM auth_rate_limits WHERE bucket = ?');
    $query->execute([$bucket]);
    $row = $query->fetch();
    if ((int) $row['attempts'] > $limit) {
        header('Retry-After: ' . max(1, (int) $row['expires_at'] - $now));
        respond(['message' => 'Too many attempts. Please try again in 15 minutes.'], 429);
    }
}
