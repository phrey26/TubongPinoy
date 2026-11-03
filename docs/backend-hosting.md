# Local database and hosting migration

The application uses one connection factory, `backend/database.php`. All account,
wallet, inventory, profile, tutorial, game-run, and leaderboard APIs use that connection.
The browser calls `/api/*.php`; it never connects directly to MySQL.

## Local connection

The verified local setup is MAMP Apache on port 8888 and MySQL on
`127.0.0.1:8889`, database `tubongpinoy_db`. Angular on port 4200 forwards `/api`
to MAMP using `proxy.conf.json`. Private credentials stay in the ignored
`backend/config.local.php`; environment variables override that file.

Run this read-only check from the repository root:

```sh
/Applications/MAMP/bin/php/php8.3.30/bin/php backend/bin/check-database.php --expect-database=tubongpinoy_db
```

It checks the selected database, required tables and columns, and InnoDB storage.
It does not change records or validate every index, constraint, or column type.
Use `python3 backend/tests/run_smoke.py` to test fresh setup and API workflows
in a disposable database. That runner requires local CREATE/DROP DATABASE permissions;
do not run it with a production account.

Audio preferences are intentionally stored in the browser. Authentication sessions
are private PHP files in `backend/var/sessions`, while account and game data are
stored in MySQL. Contact is currently a message preview, not a submission API.
Real payment processing is not implemented; demo top-ups are disabled in production.

## Move to hosting

1. Use hosting that can run this PHP 8.3+ backend with PDO MySQL and a compatible
   MySQL database. The current installation has been tested on MySQL 8.0.44.
   A static-only host cannot execute the backend. Keep the browser-facing API
   on the frontend's origin at `/api`, using a reverse proxy if the backend runs
   on a separate service. The current cookies and CSP assume this arrangement.
2. Pause writes during the final cutover and export **structure and data** from
   `tubongpinoy_db` using phpMyAdmin. Keep the export private and retain a rollback
   backup. Import it into the hosting database. Preserve IDs, password hashes,
   balances, inventory, and both score tables. This is a database transfer, not
   just an import of `schema.sql`, which contains no user records.
3. Configure the host privately with `TUBONG_ENV=production`, `TUBONG_DB_HOST`,
   `TUBONG_DB_PORT`, `TUBONG_DB_DATABASE`, `TUBONG_DB_USERNAME`, and
   `TUBONG_DB_PASSWORD`. Use the host's actual database name (including any account
   prefix) and dedicated database credentials. Alternatively, create a host-specific
   `config.local.php` outside the document root. Do not upload local root credentials.
   Production mode forces Secure cookies and disables demo credits, so use HTTPS.
4. Deploy the complete backend with its relative directory structure intact,
   including `game-data/tumbang-levels.json`. Expose **only** `backend/public/api`
   at `/api`. Keep configuration, SQL, CLI scripts, game data, and session files
   outside the public document root. Ensure PHP can write `backend/var/sessions`.
   Existing local login sessions are not migrated; players sign in again.
5. Run `php backend/bin/check-database.php --expect-database=HOST_DATABASE_NAME`.
   For a fresh empty database run `php backend/bin/setup.php` first. For an older
   restored database, back it up and review the applicable migrations and
   `backend/README.md` before setup. Do not blindly rerun historical data migrations
   or the debug-account migration. Setup preserves accounts but refreshes catalog
   metadata; it is not a substitute for restoring a backup.
6. Run `npm ci` and `npm run build` in the build environment, then deploy
   `dist/tubongpinoybeta2/browser` as the frontend document root. Node is needed
   for building, not for serving the PHP backend. The development proxy is not
   deployed. Configure the host's `/api` alias/proxy separately from SPA fallback;
   API failures must not return `index.html`. The supplied frontend `.htaccess`
   blocks PHP in the frontend directory, so do not drop PHP files into that directory.
7. On staging, verify registration, login, logout, profile changes, inventory,
   purchases, Juice recovery, both games and verified leaderboards. Reload and sign
   in again to check persistence. Check that private backend files cannot be fetched
   over HTTP. Switch traffic only after these checks; retain the old database for
   rollback without allowing conflicting writes to both copies.

No host has been selected or deployed yet. Provider-specific routing, database
permissions, TLS, and PHP configuration still need verification on that host.
