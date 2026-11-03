# Pre-hosting audit — November 3, 2026

Follow-up: [server-verified scoring](verified-scores.md) now replaces browser-reported
leaderboard totals. Its additive migration preserves historical scores.

This audit fixes verified issues in the local Angular/PHP application. No deployment
was performed. The private `backend/config.local.php` was neither printed nor edited.
This is a code and regression review, not a guarantee that every vulnerability has
been eliminated or a penetration test of the eventual production host.

## Fixes

- Updated Angular to 22.2.4 and CLI/build to 22.2.5, Vitest to 4.1.12, and compatible
  transitive dependencies. npm initially reported 16 toolchain findings; the updated
  dependency graph reports zero known vulnerabilities. No forced peer resolution
  or major framework migration was used.
- Wallet operations capture the initiating account and reject a different account
  discovered during session refresh. Late unauthorized purchase responses no longer
  sign out a newly selected account. Scores/tutorial writes use the same identity check.
- Delayed session responses cannot overwrite an identity established after the request
  began, including failure responses arriving after a successful account switch.
- Account snapshots and mutations recheck the session security version while holding
  the account lock, closing the gap between initial authorization and concurrent
  credential changes. The existing transactional wallet and idempotency guarantees remain.
- Unlimited Juice checks use server time. Shop reuses the existing recovery timer
  instead of maintaining a separate device-clock interval.
- Login validates the same ASCII username alphabet as registration before database
  lookup, preventing alternate collation spellings from bypassing identity limits.
- Wallet request IDs must have UUID-shaped groups, rather than accepting arbitrary
  36-character combinations of hyphens and hexadecimal digits.
- Added explicit production configuration: Secure cookies are forced even behind TLS
  termination, demo credits are disabled regardless of their development switch, and
  root/empty-password database credentials are rejected. Session startup failures are
  handled as service failures.
- Validated database host/port/name and allowed hosting-specific database names.
  Configuration loading is shared by the database and economy code.
- Added Apache private-directory protection, SPA routing with real missing-asset/API
  errors, no directory listings, security headers, and a same-origin Content Security
  Policy. Critical CSS inlining is disabled so the production build needs no inline
  script exception; Angular's generated component styles still require inline styles.
- Removed the unused placeholder Tansan pipe and its construction-only test, unused
  app title state, dead Shop feature flag/count/styles, and redundant Shop layout rules.
  Enabled TypeScript unused-local/parameter checks. All sprite/audio files were retained:
  generated asset paths mean a filename-only search cannot prove they are unused.
- Replaced the README's nonexistent `ng e2e` instructions with real verification commands.
  Corrected a wallet concurrency test that assumed an obsolete skin price.
- Added a disposable-database smoke runner and HTTP/configuration security regressions.

## Verification

- Angular unit suite: 300 passing tests across 43 files.
- Production build: all existing size budgets pass; no budget increases.
- Backend API suites: authentication 31, wallet 27, scores 19, tutorials 14, Juice 15,
  profile/inventory 36, settings 22 checks, using a temporary database removed afterward.
- Standalone backend checks: 8 Juice calculations, 22 registration challenges, and
  14 catalog rotation checks. All 29 PHP files other than private local config pass syntax checks.
- Added 13 HTTP input/security and production configuration checks pass.
- Eight production Apache route/protection checks pass: deep-link refresh, missing
  assets/API routes, private/dotfile paths, directory listings, and anonymous API access.
- Chrome: 16 routes at 390 px and 1440 px under the production Apache headers, with
  no JavaScript/CSP errors, broken images, or horizontal overflow. Account responses
  were mocked for browser layout checks; backend behavior was tested separately.
  This is not an accessibility conformance audit or exhaustive gameplay testing.

Reproduce with `npm ci`, `npm test -- --watch=false`, `npm run build`, and
`python3 backend/tests/run_smoke.py`. The Python runner requires a local MySQL user
with CREATE/DROP DATABASE permission. Do not grant those permissions to the deployed
runtime user. `TUBONG_PHP_BIN` overrides the local MAMP PHP executable.

## Deployment layout

This configuration targets a root-hosted, same-origin Apache 2.4 website.

1. Serve only `dist/tubongpinoybeta2/browser` as the frontend document root. Upload
   its `.htaccess` too. Enable `mod_rewrite`, `mod_headers`, and the required
   `.htaccess` overrides. For Nginx, translate the routing and headers explicitly.
2. Map `/api/` to `backend/public/api/` using a separately configured PHP 8.3+ handler.
   Keep the rest of `backend/`, all source, Git metadata, SQL, tests, credentials,
   and session files outside the public document root. Never upload the repository
   as the public website. `.htaccess` protection is defense in depth, not a substitute
   for the correct document root and working PHP execution.
3. Enable HTTPS and redirect HTTP at the host. Set `TUBONG_ENV=production` and all
   five `TUBONG_DB_*` values. Use a dedicated runtime database account and a strong
   password; perform schema/migration work using separate provisioning credentials.
   Do not copy local MAMP root credentials. Run the documented migrations before serving
   the API. The production database name may differ from `tubongpinoy_db`.
4. Make `backend/var/sessions` writable only by the PHP service account. Back up the
   database privately, verify restoration, and configure log/session retention.
5. At a reverse proxy, configure the trusted real client address on the web server
   so request limits do not group every visitor under the proxy IP. The application
   deliberately does not trust arbitrary forwarded headers.
6. Smoke-test real HTTPS login, Remember Me, logout, purchases, credential revocation,
   deep-link refreshes, and missing assets on the actual host. Verify secrets and
   backups return 403/404, cookies have Secure/HttpOnly/SameSite, and no API response
   or authenticated account data is cached.

The development proxy does not ship with the build. Static-only hosts, including
an itch.io HTML ZIP, cannot run this PHP/MySQL backend. The supplied CSP and frame
policy target same-origin hosting; cross-origin iframe authentication requires a
separate tested deployment design. Do not weaken CORS or cookie protections to
work around that limitation.

## Remaining launch decisions and limitations

- Server-verified runs now reject fabricated scores; see [verified-scores.md](verified-scores.md).
  Automated solvers remain possible. Prizes or valuable rewards need additional
  bot-abuse monitoring and competitive-integrity controls.
- Real payments are not implemented. Demo credits are blocked in production; Top Up
  must remain unavailable until provider verification and payment lifecycle handling exist.
- Contact is a preview and does not send messages. Password recovery, self-service
  account deletion, and a verified support/privacy channel remain unimplemented.
- Final operator/contact, retention, and hosting disclosures are still needed for the
  draft policies. No legal-readiness claim is made by this technical audit.
- The production domain and host are not selected here. Canonical URLs, sitemap,
  host-specific redirects, TLS, monitoring, and backup operations need final configuration.
  Unknown SPA routes still depend on the host for a true HTTP 404 status.
- Canvas gameplay lacks a complete keyboard-only/nonvisual equivalent. Existing page
  accessibility features do not resolve that limitation.

Security implementation references: [PHP session security settings](https://www.php.net/manual/en/session.security.ini.php)
and [Angular security/CSP guidance](https://angular.dev/best-practices/security).
