# Website readiness

Updated October 29, 2026. These changes target the current local Angular/PHP app.
They do not deploy the project or make the existing build ready to upload to itch.io.

## Requested checklist

| Item | Current implementation |
| --- | --- |
| Privacy Policy | Public `/privacy` page describes actual account data, leaderboard visibility, essential cookies, optional maps, and the preview-only contact form. Draft until operator/contact, hosting, and retention details are finalized. |
| Terms | Public `/terms` page covers accounts, fair play, virtual items, and development limitations. Signup links both policies and requires agreement. |
| Clear CTA | Existing home and lobby calls to action retained. Game links have distinct accessible names; FAQ and 404 offer game/home links. |
| FAQ | Public `/faq`, with keyboard-operable native disclosure controls and rules matching the current code. |
| robots.txt | Deferred: no production origin exists, and the planned itch.io project page is controlled by itch.io. A file in an uploaded game ZIP cannot control the host's root robots rules. |
| sitemap.xml | Deferred: no real public URLs to list yet. Do not submit localhost, invented domains, protected account pages, or iframe asset URLs. |
| Custom 404 | Unknown Angular routes show a not-found screen without silently redirecting home. It sets `noindex`. HTTP status codes still depend on the eventual host; the Angular dev server serves an SPA fallback with HTTP 200. |
| Alt text | Images have meaningful alt text or empty alt for decorations. Canvas boards have descriptions and fallback text. |
| Analytics | Disabled by owner preference; no analytics provider or tracking scripts added. Hosting platforms may have their own measurement and privacy policies. |
| Meta titles/descriptions | Each route has a title and description, updated on navigation. Protected routes, signup/login, and missing pages use `noindex`. Initial HTML includes the homepage description. |
| Canonical URL | Deferred until a final public listing/origin exists. No guessed domain, localhost URL, or account URL is emitted. |
| Cookie choice | Essential session cookies disclosed. Google Maps is absent until the user selects Load Google Map; Hide map removes the embed. No global tracking-consent banner is needed for analytics because analytics is not enabled. Reassess consent requirements if tracking is introduced. |
| Basic accessibility | Skip link, labels, visible focus, native FAQ controls, page-change focus, accessible game links, error contrast, and descriptive canvas names. Automated checks do not establish full accessibility conformance. |
| Forms | Existing signup/login/profile/inventory/settings/shop tests retained; added UTF-8 password, policy-agreement, whitespace-validation, and map-choice coverage. Contact is a preview; top-up/payment controls are intentionally disabled. |
| Links | New internal routes are public and linked from the footer; fake support email removed. Policy links in signup open a new tab so the signup draft is retained. |
| Performance | Secondary routes and games load on demand. Large images use WebP; avatars are sized for their rendered use. Original PNGs remain in source, but superseded files and asset prompt files are excluded from the build. |

## Before an itch.io release

[itch.io's HTML5 hosting guide](https://itch.io/docs/creators/html5) describes a static
HTML/JavaScript/CSS ZIP loaded in an iframe, with relative asset paths. The PHP/MySQL
backend is not part of that execution environment.

The current app uses `/api/*.php` and an Angular development proxy to MAMP. The proxy
does not ship with a production build. Choose the production account-service host
and test the authentication design before release. Uploading the frontend alone
will not provide login, wallets, scores, or saved profiles. Never upload backend
configuration, credentials, or session files in the game ZIP.

Routing and assets also need an explicit itch.io deployment configuration: the
current `<base href="/">` and clean route URLs assume a root-hosted SPA. Validate a
relative base URL and an iframe-compatible navigation strategy for the final host.
Cross-origin authentication, CSRF, CORS, and browser restrictions on third-party
cookies must be tested against the actual deployment. Do not simply enable wildcard
CORS or weaken cookie protections to make an iframe login appear to work.

The public listing's title, description, artwork, and discovery settings belong on
the itch.io project page. Route metadata inside the game is not a replacement for
that listing. If an independent website is also deployed later, add its verified
canonical URLs, a sitemap of public pages, robots rules, and host-level 404 handling.

## Policies and accessibility limits

“HH productions” is the requested working name. A working privacy/support contact,
operator details, retention schedule, data-request process, and hosting disclosures
must be finalized before the legal drafts become release policies. The app has no
self-service account deletion or password recovery. The contact preview cannot
receive support or privacy requests.

Privacy reference: [National Privacy Commission — data subject rights](https://privacy.gov.ph/data-subject-rights/).
Optional map reference: [Google Privacy Policy](https://policies.google.com/privacy).

The two canvas games still require pointing input; Tumbang Preso uses a mouse and
Jolens Blast supports mouse/touch. Neither currently offers keyboard-only gameplay
or a nonvisual equivalent. This limitation is disclosed in the FAQ and canvas
descriptions; it is not resolved by alt text or an automated accessibility scan.

## Verification

- `npm test -- --watch=false` — Angular component, service, routing and physics tests.
- `npm run build` — optimized bundle and size budgets. Three existing component CSS
  warnings remain for Shop and the two games; the initial bundle is below 500 kB.
- Existing backend smoke suites are described in `backend/README.md` and use
  temporary accounts with cleanup.

Image optimization uses derived WebP assets while retaining original artwork. The
eleven optimized files total about 1.81 MB, compared with 20.70 MB of originals.
The initial production JS/CSS bundle was reduced from about 570.59 kB to 391.95 kB.

Verified locally on October 29, 2026:

- 213 Angular tests passed across 38 test files.
- All 29 authentication API smoke checks passed, including CSRF and required
  signup agreement; the temporary account was removed afterward.
- Chrome exercised Contact preview/reset, signup, profile editing, skin selection,
  all three Settings forms, logout, and login with the changed credentials against
  MAMP. Its temporary account was removed afterward.
- 32 page/viewport combinations at 1440 px and 390 px passed the automated
  WCAG A/AA rules checked by axe, with no horizontal overflow. This includes the
  initial game tutorial dialogs; it does not establish accessible canvas gameplay.
- Four additional checks of active game boards (with account responses mocked)
  passed after correcting the Juice labels' text contrast in both games.
- Browser checks found no missing alt attributes, invalid internal route links,
  failing image requests, or JavaScript exceptions on the pages visited.
- All 47 literal asset references found in the production bundles resolve to
  packaged files. All 11 derived WebP images are present. Packaged assets total
  about 2.32 MiB.
