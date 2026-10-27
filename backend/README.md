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

This first backend implements accounts and authentication. The database has initial
balance columns, but gameplay scores, Juice spending, shop purchases, and simulated
top-ups still use the existing frontend logic. They are not yet persisted or
validated by the backend. Email verification and password recovery are not
implemented; the inactive Forgot link has been removed from the login form.

## Verification

Run `npm test -- --watch=false` and `npm run build` from the project root.
The API smoke test creates one uniquely named test account and deletes only that
account in its cleanup step. It checks CSRF, validation, duplicate registration,
password verification, session rotation, Remember Me, and logout:

```sh
python3 backend/tests/auth_smoke.py
```

The test uses MAMP directly by default. Set `TUBONG_TEST_API_URL` to
`http://localhost:4200/api` to exercise the Angular development proxy too.
It also requires MAMP's PHP CLI (override `TUBONG_PHP_BIN` if necessary).

For deployment, serve `backend/public/api` at `/api` on the same origin as the
Angular build, use HTTPS and deployment-specific database credentials, and make
only the session directory writable by PHP. The development proxy is not included
in the production build. Do not use the MAMP development account for deployment.

References: [Angular development proxy](https://angular.dev/tools/cli/serve#proxying-to-a-backend-server),
[PHP password hashing](https://www.php.net/manual/en/function.password-hash.php),
[PHP session cookie options](https://www.php.net/manual/en/function.session-set-cookie-params.php).
