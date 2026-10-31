<?php
declare(strict_types=1);

// A basic, accessible abuse check; combine with request limits, not a claim that
// sophisticated automation is impossible. Answers are never returned to clients.
function create_signup_challenge(array &$session, int $now): array
{
    $a = random_int(2, 9);
    $b = random_int(2, 9);
    $subtract = random_int(0, 1) === 1;
    if ($subtract && $a < $b) [$a, $b] = [$b, $a];
    $answer = $subtract ? $a - $b : $a + $b;
    $id = bin2hex(random_bytes(16));
    $session['signup_challenge'] = ['id' => $id, 'answerHash' => hash_hmac('sha256', (string) $answer, $id),
        'issuedAt' => $now, 'expiresAt' => $now + 300];
    return ['id' => $id, 'question' => "What is $a " . ($subtract ? '−' : '+') . " $b?",
        'expiresAt' => ($now + 300) * 1000];
}

function valid_signup_challenge(array &$session, array $body, int $now): bool
{
    $challenge = $session['signup_challenge'] ?? null;
    unset($session['signup_challenge']); // Every verification attempt consumes it.
    if (!is_array($challenge) || !is_string($body['challengeId'] ?? null) ||
        !is_string($body['challengeAnswer'] ?? null) || !is_string($body['website'] ?? '') ||
        trim($body['website'] ?? '') !== '') return false;
    $answer = trim($body['challengeAnswer']);
    if (!preg_match('/\A[0-9]{1,2}\z/', $answer) || $now < $challenge['issuedAt'] + 2 ||
        $now >= $challenge['expiresAt'] || !hash_equals($challenge['id'], $body['challengeId'])) return false;
    return hash_equals($challenge['answerHash'], hash_hmac('sha256', (string) (int) $answer, $challenge['id']));
}
