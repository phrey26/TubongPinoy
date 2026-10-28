# PHP authentication backend

Local setup: PHP 8.3+, PDO MySQL, Apache on port 8888, MySQL on port 8889,
database `tubongpinoy_db`. No Composer dependencies are needed.

## Setup

1. Create `tubongpinoy_db` in phpMyAdmin if it does not exist.
2. Copy `config.example.php` to `config.local.php` and set your MySQL credentials.
   The local file is ignored by Git and stays outside the web document root.
   Environment variables `TUBONG_DB_HOST`, `TUBONG_DB_PORT`, `TUBONG_DB_DATABASE`,
   `TUBONG_DB_USERNAME`, and `TUBONG_DB_PASSWORD` override the local settings.
3. Run `schema.sql` in phpMyAdmin's SQL tab with `tubongpinoy_db` selected, or run:

   ```sh
   /Applications/MAMP/bin/php/php8.3.30/bin/php backend/bin/setup.php
   ```

   This creates missing tables without dropping existing accounts. If you already
   created the users table from our earlier SQL, only the rate-limit table is new.
4. Link **only `backend/public`** to MAMP's document root:

   ```sh
   ln -s "/Users/humphreyhuet/Web projects/TubongPinoy/backend/public" /Applications/MAMP/htdocs/tubongpinoy-api
   ```

   PHP must be able to write `backend/var/sessions`. MAMP currently runs Apache
   as your Mac user, so this directory is created automatically. Do not expose
   the whole repository or the backend's configuration/session files via Apache.
5. Keep MAMP running. Start or restart Angular using `npm start`, then visit
   `http://localhost:4200`. `proxy.conf.json` sends `/api/**` requests to MAMP.
   The browser uses one origin, so no wildcard CORS permissions are needed.

## API

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/api/session.php` | Current user (or null) and a CSRF token |
| POST | `/api/signup.php` | Create an account and sign in |
| POST | `/api/login.php` | Sign in with username/email and password |
| POST | `/api/logout.php` | Destroy the session and expire its cookie |
| GET | `/api/me.php` | Authenticated profile; returns 401 to guests |
| GET | `/api/catalog.php` | Available skins and whether simulated top-ups are enabled |
| POST | `/api/wallet.php` | Authenticated Juice consumption, shop purchases, or demo top-ups |

POST requests require JSON and the `X-CSRF-Token` from the session endpoint.
Signup accepts `username`, `email`, `password`, and `terms: true`.
Login accepts `identity`, `password`, and optional `rememberMe`.
Passwords use PHP password hashing and are never returned in JSON. PDO prepared
statements handle user input. Login and signup have database-backed request limits.

Sessions use HttpOnly, SameSite=Lax cookies and rotate their IDs after login/signup.
Normal login lasts up to eight hours, with a browser-session cookie. Remember Me
uses a 30-day expiry. HTTPS enables Secure cookies. Sessions survive page refreshes;
localStorage is not an authentication source.

Home, the game catalog, Contact, Login, and Signup remain public. All playable
games under the guarded child route, Shop, and Top Up require a server-verified
login. New games should be added inside the guarded group in `app.routes.ts`.
New protected API handlers must call `require_user()` before reading/writing
account data. Angular guards control navigation, not database authorization.

## Scope

Accounts own their Tansans, Juice, purchased skins, and unlimited-Juice entitlement.
They are returned by login/session/profile endpoints, cleared from frontend state
on logout, and restored on a new login. Existing balances are preserved by setup.
Each newly created account starts with 0 Tansans, 100 Juice, and no purchased skins.
Setup updates the database default without changing existing account balances.

`wallet.php` accepts `action`, `item`, and a UUID `requestId`. Supported actions:

- `consume_juice`: `tumbang_retry` or `jolens_round`, each costing 20 Juice unless
  the account has an active unlimited pass. A paid attempt can finish at zero Juice.
- `purchase`: `energy_small` (50 Tansans, up to 20 Juice), `energy_med` (100 Tansans,
  up to 50 Juice), `energy_unli` (500 Tansans, one hour), or an active skin ID.
  Full refills, duplicate skins, and duplicate active unlimited passes are rejected.
- `demo_topup`: `starter` (100 Tansans), `special` (500), or `piyesta` (1,500).
  This is a development simulation, not a verified real-money payment. It is
  disabled by default. Set `allow_demo_topups => true` in local config or
  `TUBONG_ALLOW_DEMO_TOPUPS=1` to enable the existing demo flow. This Mac's local
  config enables it; deployment must leave it disabled until real payment
  verification is implemented.

Identity always comes from the server session. Client-supplied account IDs, prices,
and balances are ignored. Transactions lock the account row, so purchases from
multiple sessions cannot overspend. `wallet_operations` records balance deltas
and deduplicates retried requests. `account_state.version` prevents older responses
from overwriting newer frontend balances. `user_skins` has one row per account and
skin, with a unique composite key to prevent double purchases.

Future skins can be added to the `skins` table (`id`, `name`, `type`, `price`,
`image_url`, `active`); the shop reads that catalog automatically. The current
skin catalog uses placeholder artwork. Ownership is implemented; applying a skin
to a game's visuals is a separate feature. Game high scores are documented below. Email verification and password recovery
are not implemented in this backend.

For local debugging, `backend/bin/create-debug-account.php` reads a JSON object
with `username` and `password` from standard input. It creates or resets that
named account to 999,999 Tansans, 100 Juice, and `account_state.permanent_juice`.
The password is hashed. This entitlement has no expiry and is never assignable
through signup, top-ups or shop requests. Normal accounts default to no permanent
entitlement. The CLI command is outside the public web directory.

## Verification

Run `npm test -- --watch=false` and `npm run build` from the project root.
The API smoke test creates one uniquely named test account and deletes only that
account in its cleanup step. It checks CSRF, validation, duplicate registration,
password verification, session rotation, Remember Me, and logout:

```sh
python3 backend/tests/auth_smoke.py
python3 backend/tests/wallet_smoke.py
```

The test uses MAMP directly by default. Set `TUBONG_TEST_API_URL` to
`http://localhost:4200/api` to exercise the Angular development proxy too.
It also requires MAMP's PHP CLI (override `TUBONG_PHP_BIN` if necessary).
The wallet test creates two temporary accounts, checks account switching and
saved inventory, and submits concurrent purchases from different sessions.
It deletes only those test accounts and their related records afterward.

For deployment, serve `backend/public/api` at `/api` on the same origin as the
Angular build, use HTTPS and deployment-specific database credentials, and make
only the session directory writable by PHP. The development proxy is not included
in the production build. Do not use the MAMP development account for deployment.

References: [Angular development proxy](https://angular.dev/tools/cli/serve#proxying-to-a-backend-server),
[PHP password hashing](https://www.php.net/manual/en/function.password-hash.php),
[PHP session cookie options](https://www.php.net/manual/en/function.session-set-cookie-params.php).

## Game high scores

Run `backend/bin/setup.php` after updating to create `game_high_scores` while
preserving existing accounts. Each `(user_id, game)` has one personal best.
`GET /api/scores.php?game=tumbang-preso` (or `jolens-blast`) returns that game's
top 10 accounts and the signed-in user's `personalBest`. Ties use account ID
ascending for stable ordering. Accounts without a positive score do not appear.
`POST /api/scores.php` accepts JSON `{ "game": "tumbang-preso", "points": 100 }`
and requires a session and CSRF token. The server derives identity from the session
and atomically retains the greater score, including concurrent submissions.
Tumbang Preso saves cumulative points after each hit. Jolens Blast saves its final
score at session end. These scores do not grant Tansans or change the wallet.

Scores are reported by browser gameplay and validated for game, integer range,
and scoring increments. This does not verify physics or prevent a modified client
from submitting fabricated scores; competitive anti-cheat would require server
verification of game runs. Live rankings here mean saved database scores, refreshed
on page load, score submission, or the Refresh scores button.

Run `python3 backend/tests/scores_smoke.py` to verify authentication, validation,
per-account/per-game isolation, persistence, and concurrent personal-best updates
with temporary accounts that are cleaned up afterward.

## Tutorial preferences

Run `backend/bin/setup.php` to create `game_tutorials`. Each account stores a
separate seen flag for `tumbang-preso` and `jolens-blast`, shared across browser
sessions/devices. Existing accounts start unseen for both games.
`GET /api/tutorial.php?game=tumbang-preso` returns `{ game, seen }`.
`POST /api/tutorial.php` with `{ "game": "tumbang-preso" }` marks it seen and
requires the authenticated session and CSRF token. Dismissing the instructions
(including with Escape) records the preference; future visits skip the automatic
popup. How to Play always remains available. If preferences cannot be read, the
instructions remain available; a failed save is explained in the game's feedback.
Run `python3 backend/tests/tutorial_smoke.py` to verify persistence, account/game
isolation, validation, and CSRF protection using temporary accounts.
