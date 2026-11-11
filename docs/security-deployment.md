# Security and deployment checklist

Security changes are deployed to Supabase. Signup and login remain
**username/password only**. Email verification, recovery email and forgot-password
features are not part of this version. The four existing accounts were preserved.

## Your 20 checks

| Check | Result |
| --- | --- |
| 1. Hide API keys | Only the Supabase **publishable** key is shipped. It identifies a public client and cannot be hidden in a static app. The service-role key stays in Edge Function secrets. |
| 2. Environment variables | Browser configuration validates HTTPS/project-host and publishable-key format. The server fails startup without its privileged configuration. Private environment files are ignored and excluded from builds. |
| 3. Git credentials | `npm run check:secrets` scans current files and reachable Git history for recognized private-key/token patterns, printing paths only. This is a pattern scan, not a guarantee that every possible credential format is detected. |
| 4. Admin routes | There are no admin web routes. Administrative/debug PHP tools remain outside the published build. Privileged database RPCs deny public/anon/authenticated execution. |
| 5. Authentication | Passwords use bcrypt; random bearer sessions are hashed in the database, expire and can be revoked. Signup remains username/password only, with a single-use human check. Credential changes require the current password and revoke other sessions. |
| 6. Permissions | Every protected operation derives its player from the validated session. Ownership, inventory, balances, scores and run sequence/version are checked on the server. |
| 7. Inputs | Field types, lengths, allowlists, game values and password byte limits are checked on the server. JSON bodies are limited to 12 KB; file/form payloads are rejected. |
| 8. XSS | Angular interpolation escapes text. No HTML bypass APIs are used. The frontend CSP blocks inline scripts, eval, plugins and unapproved connections. Inline styles remain necessary for Angular/game rendering. See the shared-origin limitation below. |
| 9. SQL injection | The Edge API calls fixed RPC names with JSON parameters; database business queries use static SQL, not concatenated user SQL. Injection-shaped usernames are rejected. |
| 10. DB rules | All game tables have RLS and no browser-role grants. Service-only SECURITY INVOKER functions perform account authorization. No public storage buckets exist. Run the security advisor after changes. |
| 11. Rate limits | Database limits cover login identities, IP hints and account operations. The first caller-controlled X-Forwarded-For entry is ignored; account and login-identity limits remain independent of the network header. These controls do not replace platform DDoS protection. |
| 12. Spend cap | No paid plan or add-on was enabled. Confirm the organization remains on **Free** in Billing. Free quotas restrict service rather than adding metered overage charges. If you later upgrade, enable the Pro Spend Cap; it does not cap every billable item. Billing state cannot be verified through the CLI commands available here. |
| 13. Uploads | There is no upload endpoint. Avatars and skins are server-controlled static allowlists. No Storage bucket was opened. |
| 14. CSRF | The app uses explicit bearer headers, JSON and no ambient authentication cookies. Cross-site forms cannot authenticate requests. No additional cookie-CSRF mechanism is needed for this transport. |
| 15. CORS | Exact origins: `https://html-classic.itch.zone`, `https://html.itch.zone`, localhost/127.0.0.1 ports 4200 and 4173. Other/opaque browser origins are rejected before DB work. No credentialed CORS. Non-browser callers without Origin still require a session for protected operations. |
| 16. HTTPS | The frontend connects only to the HTTPS Supabase endpoint. itch.io supplies HTTPS for uploaded games. |
| 17. Headers | API responses add no-store, nosniff, no-referrer, HSTS, restrictive API CSP and Permissions-Policy. The static frontend has CSP/referrer meta policies. itch.io controls the HTTP response headers; uploaded `.htaccess` does not configure its CDN. |
| 18. Cookies/storage | No authentication cookies. itch.io login tokens use tab-scoped sessionStorage so reload preserves login; Remember Me and localStorage token restoration are disabled there. Separate app origins can use session/local storage. See limitation below. |
| 19. Debug | Production builds disable source maps and Angular development mode. API errors hide database details; no detailed database errors or privileged credentials are returned to clients. |
| 20. Production | `npm run build:itch` builds production with relative asset URLs and checks source/output for private files. Upload only the browser build, excluding `.htaccess`; never upload source, SQL, PHP, environment files, Git, or exports. |

## itch.io shared-origin limitation

itch.io serves unrelated HTML games on the same CDN origins. Login tokens use
**sessionStorage** so refreshing the same tab preserves sign-in. A new independent
tab does not inherit the session; normal sessions expire after eight hours. The
app disables Remember Me and ignores localStorage login tokens on those hosts.

Session storage separates browser tabs, but is not isolated by upload path.
Other same-origin frames in the same top-level tab, or a same-origin page opened
in that tab, may be able to read it. Namespacing a key would not prevent this.
A same-origin page with a reference to the app window can also access its DOM. CORS also cannot distinguish one
itch.io upload from another at the same origin. For stronger isolation of login
and personal information, host the authenticated app on a separate origin and
link to it from the itch.io listing. Do not use this shared-origin deployment for
payment credentials or sensitive personal records. Real-money payments remain
disabled in this application.

[itch.io's explanation of shared game domains](https://itch.io/t/3099694/notice-for-html-game-devs-upcoming-change-to-cdn-domain).

## Hosting and billing checks that remain manual

- In **Organization → Billing**, confirm **Free**. No upgrade is required. On a
  future Pro plan use the [Spend Cap](https://supabase.com/docs/guides/platform/cost-control),
  while checking exclusions such as compute/add-ons. An application rate limiter
  is not a billing cap.
- Upload a draft itch.io build and test its actual iframe, mobile behavior and
  username/password login flow. HTTP security headers and certificates for that CDN are managed
  by itch.io. The local Chrome test cannot certify the final uploaded page.
- If moving to another frontend origin, set `TUBONG_ALLOWED_ORIGINS` in Edge
  Function secrets to a comma-separated **full replacement** list of exact
  allowed origins. Retain localhost only if you still need it. CORS is not an
  account authorization boundary.

## Verification commands

```sh
npm run check:secrets
npm test -- --watch=false
npm run test:security
npm run test:supabase
npm run check:physics
npm run build:itch
npx supabase db advisors --remote=twtyscqdbdoqumrvravj --type security --fail-on error
```

The live test scripts require Supabase CLI management access, create only
uniquely named fixture accounts, and remove them afterward. The security tests verify username-only signup, failed-login throttling, input
validation, CORS, request limits, database restrictions and privileged RPC denial.
