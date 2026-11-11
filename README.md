# Tubongpinoybeta2

A browser gaming website featuring traditional Filipino games, owned by Big Chico Studio.
This project uses Angular 22.2.4, Angular CLI 22.2.5, and TypeScript 6.0.

PHP/MySQL authentication setup and SQL are documented in [backend/README.md](backend/README.md).
The lobby is public; playing games, shopping, and top-ups require login.
Tansans, Juice, and purchased skin ownership are saved separately for each account.

Website readiness, policy drafts, accessibility limitations, and the planned itch.io
hosting requirements are documented in [docs/website-readiness.md](docs/website-readiness.md).

## Requirements

- Node.js 24.22.0 (or a later compatible Node.js 24 release)
- npm 11.19.1

Install dependencies using `npm ci`. Run npm commands without `sudo` so dependency files remain owned by your user.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Backend verification and deployment

Run `python3 backend/tests/run_smoke.py` to exercise the PHP APIs in a disposable
MySQL database. This requires local MySQL credentials with CREATE/DROP DATABASE
permission. The runner removes its test database and stops its PHP server afterward.
`TUBONG_PHP_BIN` can override the local MAMP PHP executable.

There is no configured `ng e2e` target. Production hosting configuration, audit
results, and remaining launch requirements are in
[docs/prehosting-audit.md](docs/prehosting-audit.md).

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.

## Supabase backend (current)

The application now uses Supabase's `tubong-api` Edge Function for every account,
wallet, inventory, tutorial, recovery, and verified-game request. No PHP server or
Angular development proxy is required. The existing service contracts are routed
through `BackendApi` in `src/app/core/services/backend-api.ts`.

Browser-safe project configuration is in `src/environments/environment.ts`.
Only a publishable key belongs there. Server credentials are supplied by Supabase
inside the Edge Function; never copy them into Angular or the public directory.

See [Supabase deployment and verification](docs/supabase-backend.md) for architecture,
migrations, account transfer, security, and deployment instructions. The PHP code
and MAMP documentation above are retained for historical regression/reference.

Before public release, follow the [security and deployment checklist](docs/security-deployment.md).
Signup and login remain username/password only. On itch.io, sessions use
tab-scoped sessionStorage so refreshing keeps you signed in. Remember Me stays
disabled on its shared CDN origins.

The app uses hash routing for static itch.io hosting. Build the upload files with:

```sh
npm run package:itch
```

Upload `dist/tubong-pinoy-itch.zip`. The packaging command builds production,
checks public files and itch.io limits, and creates a verified ZIP with index.html
at its root and no hidden files. Navigation preserves index.html because itch.io
rejects directory URLs. Backend source, configuration, and SQL exports must never
be included in the frontend ZIP.

See [the itch.io upload steps](docs/itch-deployment.md) for project settings and updates.
