<?php
declare(strict_types=1);

function demo_topups_enabled(): bool
{
    $env = getenv('TUBONG_ALLOW_DEMO_TOPUPS');
    if ($env !== false) return $env === '1';
    $local = is_file(__DIR__ . '/config.local.php') ? require __DIR__ . '/config.local.php' : [];
    return ($local['allow_demo_topups'] ?? false) === true;
}

function shop_catalog(): array
{
    $skins = database()->query('SELECT id, name, type, price, image_url AS imageUrl FROM skins WHERE active = 1 ORDER BY price DESC, id')->fetchAll();
    foreach ($skins as &$skin) $skin['price'] = (int) $skin['price'];
    return ['skins' => $skins, 'demoTopupsEnabled' => demo_topups_enabled()];
}

class WalletFailure extends RuntimeException
{
    public function __construct(string $message, public readonly int $status = 409)
    {
        parent::__construct($message);
    }
}

function update_wallet(int $userId, array $body): array
{
    $requestId = input_string($body, 'requestId');
    $action = input_string($body, 'action');
    if (!preg_match('/\A[0-9a-f-]{36}\z/', $requestId)) {
        throw new WalletFailure('Invalid request ID.', 422);
    }
    // Ignore client-supplied balances, prices and user IDs. Identity comes from the session.
    $item = isset($body['item']) && is_string($body['item']) ? $body['item'] : '';
    $requestHash = hash('sha256', json_encode([$action, $item], JSON_THROW_ON_ERROR));
    $db = database();
    $db->beginTransaction();
    try {
        // Serialize all changes to this account, including changes from other sessions.
        $query = $db->prepare('SELECT * FROM users WHERE id = ? FOR UPDATE');
        $query->execute([$userId]);
        $user = $query->fetch();
        if (!$user) throw new WalletFailure('Please log in again.', 401);
        $query = $db->prepare('SELECT request_hash FROM wallet_operations WHERE user_id = ? AND request_id = ?');
        $query->execute([$userId, $requestId]);
        $previous = $query->fetchColumn();
        if ($previous !== false) {
            if (!hash_equals($previous, $requestHash)) throw new WalletFailure('This request ID was already used for another action.');
            $result = public_user($user);
            $db->commit();
            return $result;
        }
        $db->prepare('INSERT IGNORE INTO account_state (user_id) VALUES (?)')->execute([$userId]);
        $query = $db->prepare('SELECT unlimited_until FROM account_state WHERE user_id = ? FOR UPDATE');
        $query->execute([$userId]);
        $unlimitedUntil = (int) $query->fetchColumn();
        $tansans = (int) $user['tansans'];
        $juice = (int) $user['juice'];
        if ($action === 'consume_juice') {
            if (!in_array($item, ['tumbang_retry', 'jolens_round'], true)) throw new WalletFailure('Unknown game action.', 422);
            if ($unlimitedUntil <= time()) {
                if ($juice < 20) throw new WalletFailure('You need 20 Juice to continue.');
                $juice -= 20;
            }
        } elseif ($action === 'purchase') {
            $energy = ['energy_small' => [50, 20], 'energy_med' => [100, 50], 'energy_unli' => [500, 0]];
            if (isset($energy[$item])) {
                [$price, $refill] = $energy[$item];
                if ($refill > 0 && $juice >= 100) throw new WalletFailure('Your Juice is already full.');
                if ($item === 'energy_unli' && $unlimitedUntil > time()) throw new WalletFailure('Your unlimited Juice is already active.');
                if ($tansans < $price) throw new WalletFailure('Not enough Tansans.');
                $tansans -= $price;
                $juice = min(100, $juice + $refill);
                if ($item === 'energy_unli') $unlimitedUntil = time() + 3600;
            } else {
                $query = $db->prepare('SELECT price FROM skins WHERE id = ? AND active = 1');
                $query->execute([$item]);
                $price = $query->fetchColumn();
                if ($price === false) throw new WalletFailure('This item is not available.', 422);
                $query = $db->prepare('SELECT 1 FROM user_skins WHERE user_id = ? AND skin_id = ?');
                $query->execute([$userId, $item]);
                if ($query->fetchColumn()) throw new WalletFailure('You already own this skin.');
                if ($tansans < (int) $price) throw new WalletFailure('Not enough Tansans.');
                $tansans -= (int) $price;
                $db->prepare('INSERT INTO user_skins (user_id, skin_id) VALUES (?, ?)')->execute([$userId, $item]);
            }
        } elseif ($action === 'demo_topup') {
            if (!demo_topups_enabled()) throw new WalletFailure('Simulated top-ups are disabled.', 403);
            $packages = ['starter' => 100, 'special' => 500, 'piyesta' => 1500];
            if (!isset($packages[$item])) throw new WalletFailure('Unknown top-up package.', 422);
            $tansans += $packages[$item];
            if ($tansans > 1000000000) throw new WalletFailure('The Tansan balance limit has been reached.');
        } else {
            throw new WalletFailure('Unknown account action.', 422);
        }
        $db->prepare('UPDATE users SET tansans = ?, juice = ? WHERE id = ?')->execute([$tansans, $juice, $userId]);
        $db->prepare('UPDATE account_state SET unlimited_until = ?, version = version + 1 WHERE user_id = ?')->execute([$unlimitedUntil, $userId]);
        $db->prepare('INSERT INTO wallet_operations (user_id, request_id, request_hash, action, tansans_delta, juice_delta) VALUES (?, ?, ?, ?, ?, ?)')
            ->execute([$userId, $requestId, $requestHash, $action . ':' . $item, $tansans - (int) $user['tansans'], $juice - (int) $user['juice']]);
        $result = public_user([...$user, 'tansans' => $tansans, 'juice' => $juice]);
        $db->commit();
        return $result;
    } catch (Throwable $error) {
        if ($db->inTransaction()) $db->rollBack();
        throw $error;
    }
}
