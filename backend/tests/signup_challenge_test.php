<?php
declare(strict_types=1);
require dirname(__DIR__) . '/signup-challenge.php';
$passed = 0;
function check(bool $condition, string $message): void {
    global $passed;
    if (!$condition) throw new RuntimeException($message);
    $passed++;
}
function fixture(): array {
    $session = [];
    $challenge = create_signup_challenge($session, 1000);
    preg_match('/([0-9]+) ([+−]) ([0-9]+)/u', $challenge['question'], $parts);
    $answer = $parts[2] === '+' ? (int) $parts[1] + (int) $parts[3] : (int) $parts[1] - (int) $parts[3];
    return [$session, ['challengeId' => $challenge['id'], 'challengeAnswer' => (string) $answer, 'website' => ''], $challenge];
}
[$session, $body, $public] = fixture();
check(array_keys($public) === ['id', 'question', 'expiresAt'], 'Answers must not be exposed');
check(valid_signup_challenge($session, $body, 1002), 'Correct response should pass');
check(!valid_signup_challenge($session, $body, 1003), 'A response cannot be replayed');
foreach (['wrong', 'expired', 'too-fast', 'other-session', 'honeypot', 'array-answer', 'array-id', 'array-honeypot', 'missing'] as $case) {
    [$session, $body] = fixture(); $now = 1002;
    if ($case === 'wrong') $body['challengeAnswer'] = '99';
    if ($case === 'expired') $now = 1300;
    if ($case === 'too-fast') $now = 1001;
    if ($case === 'other-session') $session = [];
    if ($case === 'honeypot') $body['website'] = 'spam';
    if ($case === 'array-answer') $body['challengeAnswer'] = [];
    if ($case === 'array-id') $body['challengeId'] = [];
    if ($case === 'array-honeypot') $body['website'] = [];
    if ($case === 'missing') unset($body['challengeAnswer']);
    check(!valid_signup_challenge($session, $body, $now), "Reject $case");
    check(!isset($session['signup_challenge']), 'A failed attempt consumes the challenge');
}
[$session, $body] = fixture(); create_signup_challenge($session, 1001);
check(!valid_signup_challenge($session, $body, 1003), 'Refreshing invalidates the previous challenge');
echo "$passed signup challenge checks passed.\n";
