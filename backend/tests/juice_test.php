<?php
declare(strict_types=1);
require dirname(__DIR__) . '/juice.php';

$checks = [
    ['No refill before 144 seconds', 50, 1000, 1143, 50, 1000],
    ['Exactly one point at 144 seconds', 50, 1000, 1144, 51, 1144],
    ['Two offline intervals and a remainder', 50, 1000, 1300, 52, 1288],
    ['Existing partial meters start their timer without retroactive credit', 50, 0, 1000, 50, 1000],
    ['Offline recovery stops at 100', 99, 1000, 50000, 100, 0],
    ['Full meters bank no time', 100, 1, 50000, 100, 0],
    ['A new spend from full gets a fresh interval', 80, 0, 50000, 80, 50000],
    ['A future timestamp cannot create negative Juice', 50, 2000, 1000, 50, 1000],
];
foreach ($checks as [$description, $juice, $anchor, $now, $expectedJuice, $expectedAnchor]) {
    $actual = juice_recovery($juice, $anchor, $now);
    if ($actual !== ['juice' => $expectedJuice, 'refill_at' => $expectedAnchor]) {
        fwrite(STDERR, "FAIL: $description\n");
        exit(1);
    }
    echo "PASS: $description\n";
}
echo count($checks) . " Juice calculation checks passed.\n";
