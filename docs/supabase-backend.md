# Supabase backend

The current frontend sends all account/game requests to the `tubong-api` Edge
Function on project `twtyscqdbdoqumrvravj`. `supabaseApiInterceptor` translates the
existing `/api/*.php` service contracts into HTTPS Edge requests. Those paths are
logical contracts now: the browser does not request PHP files and MAMP is not
required. The source PHP implementation remains available for regression checks.

## Identity and authorization

Username login is preserved using application accounts in PostgreSQL, not
Supabase Auth's email/phone accounts. These players will not appear in the
Dashboard's Authentication user list. Use the SQL Editor to inspect
`game_private.players` if necessary; do not expose that schema to the Data API.

Passwords are bcrypt-hashed. Sessions use 256-bit random bearer tokens; only a
SHA-256 digest is stored in the database. Normal sessions expire after eight
hours and use sessionStorage, which survives reload within the same tab. On
independent app origins, Remember Me uses localStorage and expires after 30 days.
On itch.io’s shared CDN origins, Remember Me is unavailable and localStorage
tokens are ignored. If browser storage is blocked, the token remains in page
memory and cannot survive a reload. The transport
keeps tokens out of component/account response objects and rejects responses
that arrive after an account switch. Username/password changes rotate the current
token, preserve its expiry, and invalidate every other session and existing run
through the account security version.

New passwords (signup and password changes) require at least 15 Unicode
characters excluding surrounding whitespace, within bcrypt's 72-byte UTF-8
limit. The form and database reject a small offline list of common password
roots/numeric variations, simple repeated or sequential patterns, and passwords
containing the username. Spaces and Unicode passphrases are allowed; there is
no mandatory mix of character classes. This does not check every breached
password. Existing passwords remain valid for login and for confirming changes.
The signup checklist reports policy requirements, not an entropy estimate.

This avoids third-party cookies inside itch.io's iframe. The API accepts CORS
requests only from the exact configured origins, without cookies: every protected call must supply `X-Game-Session`.
CORS is not authorization. The public publishable key grants no access to private
account tables or the privileged RPC functions. The Edge Function uses its
platform-provided `SUPABASE_SERVICE_ROLE_KEY`, which must never reach the browser.
All private tables have RLS enabled and no grants to anon/authenticated. RPC
facades are SECURITY INVOKER and executable only by service_role; no public
SECURITY DEFINER escape hatch is used.

Registration keeps the single-use, guest-bound arithmetic check, two-second
minimum, five-minute expiry, honeypot and agreement requirements. Server-side
rate limits cover login, registration, username checks and protected actions.
Review the [security and deployment checklist](security-deployment.md) before release.
Signup and login use only usernames and passwords; no email verification or
password-recovery feature is enabled.

Rejected business operations roll back while rate counts and challenge
consumption survive. This remains a basic abuse deterrent, not proof of humanity.

## Transactions and verification

`supabase/migrations/20261111130044_tubong_backend.sql` defines the private schema,
permanent skin catalog, 64 private layouts, session checks and transactional APIs.
Purchases, ownership, passive Juice recovery, operation deduplication and game
progress serialize under the player row lock. Currency and score values never
come from trusted browser input. Demo top-ups remain disabled.

Starting a new Tumbang Preso run requires at least 20 recovered Juice or an active
unlimited entitlement. The first attempt remains free. Already admitted runs and
attempts purchased with the final 20 Juice remain playable at zero; starting a
different run checks eligibility again.

The Edge Function replays each shot with copies of the browser's physics modules.
The PostgreSQL commit checks run identity, sequence and security version again,
so concurrent/replaced runs cannot commit a stale replay. The replay endpoint
has a bounded 600-step simulation; velocities, game transitions and minimum shot
time are validated. Duplicate operations cannot charge or score twice.

Run `node scripts/sync-supabase-physics.mjs` after physics edits, and verify with
`npm run check:physics`. This checks browser/PHP/Edge parity on 104 fixtures.
Do not edit the generated `_shared/*-physics.ts` files directly.

## Deploying changes

The repository pins the Supabase CLI. Sign in privately with `npx supabase login`.
Current CLI v3 targets local databases by default, so hosted commands explicitly
specify the project. Never use db reset on the hosted account database.

For new schema changes create an additive migration with `npx supabase migration
new <name>`, review it, and apply through the authenticated CLI. The initial
schema was applied transactionally with `supabase db query --remote=<ref>
--file <migration-file> --yes`, tested, and then recorded in migration history.
For subsequent migrations use `supabase db push --help` to verify the installed
CLI's hosted flags before deploying.

Deploy only this function:

```sh
npx supabase functions deploy tubong-api --remote=twtyscqdbdoqumrvravj --use-api --no-verify-jwt --yes
```

JWT verification is off because the API validates its own application bearer
sessions, including expiry and revocation; it does not treat a publishable key
as player authentication. Do not remove the database token checks.

Run the security advisor after database changes:

```sh
npx supabase db advisors --remote=twtyscqdbdoqumrvravj --type security --fail-on error
```

## Existing data

Four local MAMP accounts were transferred with their IDs, password payloads,
balances, profiles, equipment, ownership, tutorials, wallet ledger and verified
scores. PHP bcrypt `$2y$` markers are converted to PostgreSQL-compatible `$2a$`
markers; passwords are unchanged. Older unverified scores and unfinished run
records are archived privately in legacy tables, not ranked or resumed. Old PHP
sessions are not transferred: existing players sign in again.

`backend/bin/export-supabase.php` prepares a private SQL transfer from MAMP and
refuses to overwrite any cloud players. It reads MAMP without changing records.
Do not rerun the initial transfer over an active hosted database. Generated
exports contain account/password-hash data and must stay outside the repository
and web document root. Never upload an export in the itch.io ZIP.

Supabase is now the live source of truth. Later local MAMP changes do not sync
into cloud accounts, and hosted writes do not flow back to MAMP.

## Verification

- `npm test -- --watch=false`: frontend contracts and Edge transport behavior.
- `npm run check:physics`: browser/PHP/Edge simulation parity.
- `npm run test:supabase`: live API regression using uniquely named temporary
  accounts and controlled fixture funding; removes its accounts afterward.
- `npm run test:security`: browser-request protections, database restrictions, input validation and live
  failed-login throttling; temporary accounts with cleanup.
- `npm run test:passwords`: browser/database policy parity, direct weak-signup
  rejection, password changes and legacy-login compatibility, with temporary
  account cleanup.
- `npm run check:secrets`: current source and Git history credential pattern scan.
- `node scripts/test-supabase-browser.mjs`: Chrome flow against a built frontend
  served on localhost:4173, with a temporary account and cleanup. Uses the system
  Chrome on this Mac; adjust executablePath on another machine.
- `npm run build:itch`: production bundle, relative base URL, privacy checks.

The browser check covers login, profile save/reload, protected game start,
tutorial persistence and confirms zero PHP requests. Final itch.io embedded
verification still requires uploading the build to an actual draft itch.io page.
