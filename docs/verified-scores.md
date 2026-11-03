# Server-verified scores

Implemented November 3, 2026. Apply
`backend/migrations/2026-11-03-verified-game-runs.sql` before deploying this version,
or run `backend/bin/setup.php`. The migration is additive and has been applied to
local MAMP. Deploy frontend and backend together.

## Trust boundary

The browser submits aiming velocity and game actions, never a score, hit flag,
marble balance, target position, obstacle list, or clock value. PHP owns the board,
run progression, remaining marbles, and score. It replays each shot with the same
60 Hz rules used to animate the browser and persists only its calculated outcome.
This follows the [OWASP business-logic guidance](https://cheatsheetseries.owasp.org/cheatsheets/Business_Logic_Security_Cheat_Sheet.html)
to keep authoritative state and workflow validation on the server.

`POST /api/scores.php` rejects all claimed totals, including plausible multiples
of 50/100. `GET` reads `verified_game_high_scores`. The old `game_high_scores` table
is retained as unverified history and is not copied into the verified leaderboard.
Existing personal bests on the verified board therefore begin at zero; no old
account, purchase, wallet balance, or historical score is deleted.

## Run protocol

`POST /api/game-run.php` requires the authenticated session, JSON, and CSRF token.

- Start with `{ game, action: "start", requestId }`, where requestId is a UUID.
- The server returns `{ run, user }`. `run` includes an opaque ID, action sequence,
  board, status, score, expiry, and game-specific state. The user snapshot includes
  current wallet balances.
- Continue with `{ game, action, runId, sequence, requestId }`. Only `shot` accepts
  `vx`/`vy`; only `round` accepts `bet`. Extra fields are rejected.
- Tumbang allows `shot`, `next` after a verified hit, and `retry` after a miss.
  First attempts and next levels are free; retries atomically cost 20 Juice unless
  the account has an active unlimited entitlement.
- Jolens starts with 10 marbles. `round` stakes 1–5, reserves at least one shooter,
  charges 20 Juice, and generates twice the stake as targets. `shot` computes ring
  exits, reentries, shooter loss, and collection. `finish` saves inventory × 50 only
  after a completed valid shot. Finishing without a shot saves zero.
- Paid round/retry actions include the wallet mutation and operation ledger entry
  in the same transaction as run progression. Calling the legacy wallet consumption
  endpoint does not authorize or progress a verified game run.

Runs expire after two hours and after credential revocation. Only one current run
per account/game is stored; starting another invalidates the earlier run. There are
at most 4,000 accepted actions per run, 900 run requests and 60 starts per account
per 15-minute rate-limit window. Runs are bound to the account and credential
version, not to an individual browser tab. Another tab may continue the same run
only if it possesses its ID and current sequence; conflicting actions cannot both
advance it.

All mutations lock the account and run. A duplicate of the most recently accepted
request returns the saved outcome without charging or awarding twice. Reusing its
sequence with different content, skipping sequences, or replaying older actions
is rejected. The client retains the original request ID and sequence during
network retries and offers Retry game sync after failures. Gameplay waits for
verification before advancing; errors never fall back to trusting local totals.

Velocities must be finite and within the actual pull limits (17.6 for Tumbang,
22.5 for Jolens; Jolens also enforces its minimum pull). Replay is bounded to 600
physics ticks. Accepted shots must take at least their simulated duration since
the preceding accepted action, with a 100 ms scheduling allowance. Tumbang now
uses a fixed 60 Hz accumulator so 120/144 Hz screens do not speed up the game.
The server result reconciles browser state at the end of each shot.

## Layouts and maintenance

PHP generates Jolens positions using server randomness. Tumbang uses 64 verified
layouts generated from the existing puzzle solver, grouped by the existing level
1–5 and 2/3/4-ricochet difficulty tiers. The private layout corpus includes solutions
for regression checking; the API sends only obstacles. Keep `backend/game-data`
outside the public document root, just like all other private backend files.

When physics or puzzle generation changes, review both implementations and run:

```sh
node scripts/generate-ranked-levels.mjs
node scripts/check-ranked-physics.mjs
npm test -- --watch=false
npm run build
python3 backend/tests/run_smoke.py
```

The generator uses the installed build tooling; the production PHP host does not
need Node. The parity check compares 64 winning Tumbang trajectories and 40 Jolens
fixtures between TypeScript and PHP. If rules change incompatibly, invalidate
active runs during that deployment instead of replaying an old board under new rules.

## Verification and limits

Validation passed: 303 frontend tests, 104 TypeScript/PHP physics parity fixtures,
35 verified-score API checks, the full backend smoke suites, 32 PHP syntax checks,
and a production build within the existing budgets.

The verified-score smoke suite checks direct-score rejection, legacy-score
exclusion, CSRF, stolen runs, skipped levels, forged state/power/types/sequences,
impossible timing, real hits/misses, concurrent duplicates, atomic Juice charges,
invalid bets, zero-power Jolens abuse, final inventory scoring, expired/replaced
runs, credential revocation, and account/game isolation. The full backend suites
run in a disposable MySQL database that is removed afterward.

A live Chrome run against local PHP verified Tumbang hits, misses and paid retries,
Jolens staking, shots and finishing, and leaderboard persistence. Its temporary
account was removed. Unit regressions check pending verification, server correction
of local hits/inventory, and request ID reuse after a lost response.

This prevents arbitrary score fabrication and invalid game transitions. It does
not establish that a human played: a bot can calculate valid shots, automate the
client, and wait out timing limits. Public prizes or other valuable rewards still
need bot-abuse monitoring and a separate competitive-integrity policy. No points
are converted into Tansans or real money by this implementation.
