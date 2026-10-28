<?php
declare(strict_types=1);

const JUICE_REFILL_SECONDS = 144;

/** Keep partial intervals, but never bank refill time while the meter is full. */
function juice_recovery(int $juice, int $refillAt, int $now): array
{
    if ($juice >= 100) return ['juice' => 100, 'refill_at' => 0];
    if ($refillAt <= 0 || $refillAt > $now) $refillAt = $now;
    $earned = intdiv($now - $refillAt, JUICE_REFILL_SECONDS);
    $juice = min(100, $juice + $earned);
    return ['juice' => $juice, 'refill_at' => $juice >= 100 ? 0 : $refillAt + $earned * JUICE_REFILL_SECONDS];
}

/** The caller must hold the users row lock in its transaction. */
function recover_account_juice(PDO $db, array $user): array
{
    $db->prepare('INSERT IGNORE INTO account_state (user_id) VALUES (?)')->execute([$user['id']]);
    $query = $db->prepare('SELECT unlimited_until, permanent_juice, version, juice_refill_at
        FROM account_state WHERE user_id = ? FOR UPDATE');
    $query->execute([$user['id']]);
    $state = $query->fetch();
    $recovery = juice_recovery((int) $user['juice'], (int) $state['juice_refill_at'], time());
    if ($recovery['juice'] !== (int) $user['juice'] || $recovery['refill_at'] !== (int) $state['juice_refill_at']) {
        $db->prepare('UPDATE users SET juice = ? WHERE id = ?')->execute([$recovery['juice'], $user['id']]);
        $db->prepare('UPDATE account_state SET juice_refill_at = ?, version = version + 1 WHERE user_id = ?')
            ->execute([$recovery['refill_at'], $user['id']]);
        $state['version'] = (int) $state['version'] + 1;
    }
    $user['juice'] = $recovery['juice'];
    $state['juice_refill_at'] = $recovery['refill_at'];
    return [$user, $state];
}
