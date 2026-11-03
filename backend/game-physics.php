<?php
declare(strict_types=1);

/** Physics version 1. Keep in sync with shot-physics.ts and marble-physics.ts. */
function replay_tumbang(float $vx, float $vy, array $obstacles): array
{
    $x = 225.0; $y = 680.0; $angle = 0.0;
    $spin = ($vx < 0 ? -1 : 1) * min(0.45, hypot($vx, $vy) * 0.025);
    for ($frame = 1; $frame <= 600; $frame++) {
        $px = $x; $py = $y;
        $angle = fmod($angle + $spin, M_PI * 2); $spin *= 0.985;
        $x += $vx; $y += $vy; $vx *= 0.985; $vy *= 0.985;
        $half = abs(cos($angle)) * 12 + abs(sin($angle)) * 21;
        $left = ceil(34 + $half); $right = floor(416 - $half);
        $bounce = false;
        if ($x <= $left) { $x = $left; $bounce = $vx < 0; }
        elseif ($x >= $right) { $x = $right; $bounce = $vx > 0; }
        if ($bounce) { $vx *= -0.7; $spin *= -0.7; }
        foreach ($obstacles as $o) {
            $c = cos($o['rotation'] ?? 0); $s = sin($o['rotation'] ?? 0);
            $cx = $o['x'] + $o['width'] / 2; $cy = $o['y'] + $o['height'] / 2;
            $sx = ($px - $cx) * $c + ($py - $cy) * $s;
            $sy = -($px - $cx) * $s + ($py - $cy) * $c;
            $ex = ($x - $cx) * $c + ($y - $cy) * $s;
            $ey = -($x - $cx) * $s + ($y - $cy) * $c;
            $entry = -INF; $exit = INF; $nx = 0; $ny = 0; $intersects = true;
            foreach ([[$sx, $ex - $sx, $o['width'] / 2, 0], [$sy, $ey - $sy, $o['height'] / 2, 1]] as [$start, $delta, $half, $axis]) {
                if (abs($delta) < 1e-9) { if (abs($start) > $half) $intersects = false; continue; }
                $first = (-$half - $start) / $delta; $last = ($half - $start) / $delta;
                $near = min($first, $last); $far = max($first, $last);
                if ($near > $entry) {
                    $entry = $near;
                    $nx = $axis === 0 ? -($delta <=> 0) : 0;
                    $ny = $axis === 1 ? -($delta <=> 0) : 0;
                }
                $exit = min($exit, $far);
            }
            if (!$intersects || $entry < 0 || $entry > 1 || $entry > $exit) continue;
            $normalX = $nx * $c - $ny * $s; $normalY = $nx * $s + $ny * $c;
            $dot = $vx * $normalX + $vy * $normalY;
            if ($dot >= 0) continue;
            $hitX = $px + ($x - $px) * $entry; $hitY = $py + ($y - $py) * $entry;
            $vx = ($vx - 2 * $dot * $normalX) * 0.98;
            $vy = ($vy - 2 * $dot * $normalY) * 0.98; $spin *= -0.8;
            $x = $hitX + $normalX * 0.5 + $vx * (1 - $entry);
            $y = $hitY + $normalY * 0.5 + $vy * (1 - $entry);
            break;
        }
        if (hypot($x - 225, $y - 120) < 35) return ['hit' => true, 'frames' => $frame];
        if ((abs($vx) < 0.2 && abs($vy) < 0.2) || $y < 0 || $y > 800) break;
    }
    return ['hit' => false, 'frames' => min($frame, 600)];
}

function marble(float $x, float $y): array
{
    return ['x' => $x, 'y' => $y, 'radius' => 20, 'dx' => 0.0, 'dy' => 0.0];
}

function ranked_marble_positions(int $count): array
{
    $positions = [];
    for ($attempt = 0; $attempt < 1000 && count($positions) < $count; $attempt++) {
        $angle = random_int(0, 1000000000) / 1000000001 * M_PI * 2;
        $radius = sqrt(random_int(0, 1000000000) / 1000000001) * 126;
        $candidate = marble(225 + cos($angle) * $radius, 300 + sin($angle) * $radius);
        foreach ($positions as $other) if (hypot($other['x'] - $candidate['x'], $other['y'] - $candidate['y']) < 44) continue 2;
        $positions[] = $candidate;
    }
    if (count($positions) !== $count) throw new RuntimeException('Cannot generate marble layout.');
    return $positions;
}

function marble_outside(array $ball): bool { return hypot($ball['x'] - 225, $ball['y'] - 300) - 20 > 150; }

/** Preserve target order, including provisional exits that later reenter the ring. */
function replay_jolens(float $vx, float $vy, array $targets): array
{
    $balls = [marble(225, 600), ...$targets]; $balls[0]['dx'] = $vx; $balls[0]['dy'] = $vy;
    $inside = range(1, count($targets)); $pending = [];
    for ($frame = 1; $frame <= 600; $frame++) {
        $order = [0, ...$inside, ...$pending]; $speed = 0.0;
        foreach ($balls as $ball) $speed = max($speed, hypot($ball['dx'], $ball['dy']));
        $steps = max(1, (int) ceil($speed / 5)); $out = [];
        for ($step = 0; $step < $steps; $step++) {
            foreach ($balls as &$ball) { $ball['x'] += $ball['dx'] / $steps; $ball['y'] += $ball['dy'] / $steps; } unset($ball);
            for ($pass = 0; $pass < 4; $pass++) {
                for ($i = 0; $i < count($order); $i++) for ($j = $i + 1; $j < count($order); $j++) {
                    $a = &$balls[$order[$i]]; $b = &$balls[$order[$j]];
                    $dx = $b['x'] - $a['x']; $dy = $b['y'] - $a['y']; $distance = hypot($dx, $dy);
                    if ($distance >= 40) continue;
                    $nx = $distance > 0 ? $dx / $distance : 1; $ny = $distance > 0 ? $dy / $distance : 0;
                    $separation = (40 - $distance + 0.001) / 2;
                    $a['x'] -= $nx * $separation; $a['y'] -= $ny * $separation;
                    $b['x'] += $nx * $separation; $b['y'] += $ny * $separation;
                    $approaching = ($a['dx'] - $b['dx']) * $nx + ($a['dy'] - $b['dy']) * $ny;
                    if ($approaching <= 0) continue;
                    $impulse = $approaching * 0.95;
                    $a['dx'] -= $impulse * $nx; $a['dy'] -= $impulse * $ny;
                    $b['dx'] += $impulse * $nx; $b['dy'] += $impulse * $ny;
                }
                unset($a, $b);
            }
            foreach ($inside as $id) if (marble_outside($balls[$id])) $out[$id] = true;
            foreach ($balls as &$ball) {
                if ($ball['x'] < -20 || $ball['x'] > 470 || $ball['y'] < -20 || $ball['y'] > 820) $ball['dx'] = $ball['dy'] = 0;
            } unset($ball);
        }
        $moving = false;
        foreach ($balls as &$ball) {
            $ball['dx'] *= 0.985; $ball['dy'] *= 0.985;
            if (hypot($ball['dx'], $ball['dy']) < 0.08) $ball['dx'] = $ball['dy'] = 0;
            if ($ball['dx'] != 0 || $ball['dy'] != 0) $moving = true;
        } unset($ball);
        foreach ($inside as $id) if (isset($out[$id])) $pending[] = $id;
        $inside = array_values(array_filter($inside, fn($id) => !isset($out[$id])));
        if (!$moving) break;
    }
    $reentered = array_values(array_filter($pending, fn($id) => !marble_outside($balls[$id])));
    $inside = [...$inside, ...$reentered];
    $pending = array_values(array_diff($pending, $reentered));
    $outside = marble_outside($balls[0]); $collected = $outside ? count($pending) : 0;
    if (!$outside) {
        $spots = [];
        for ($row = -3; $row <= 3; $row++) for ($column = -3; $column <= 3; $column++) {
            if (hypot($column * 42, $row * 42) <= 130) $spots[] = ['x' => 225 + $column * 42, 'y' => 300 + $row * 42];
        }
        usort($spots, fn($a, $b) => hypot($a['x'] - 225, $a['y'] - 300) <=> hypot($b['x'] - 225, $b['y'] - 300));
        foreach ($pending as $id) {
            $spot = null;
            foreach ($spots as $candidate) {
                foreach ($inside as $other) if (hypot($candidate['x'] - $balls[$other]['x'], $candidate['y'] - $balls[$other]['y']) < 40) continue 2;
                $spot = $candidate; break;
            }
            if ($spot === null) {
                $inside = [...$pending, ...array_values(array_diff($inside, $pending))];
                foreach ($inside as $index => $other) $balls[$other] = marble($spots[$index]['x'], $spots[$index]['y']);
                break;
            }
            $balls[$id] = marble($spot['x'], $spot['y']); $inside[] = $id;
        }
    }
    return ['frames' => min($frame, 600), 'delta' => $outside ? $collected : -1,
        'targets' => array_map(fn($id) => marble($balls[$id]['x'], $balls[$id]['y']), $inside)];
}
