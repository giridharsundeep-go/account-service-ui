# Greatley Poshley connected apps

## Local ports

Use `localhost` consistently in your browser so all app tabs share the same sign-in cookie. The app launcher preserves the current hostname.

| Application | Directory | UI port | API port |
| --- | --- | --- | --- |
| Professy | account-service-ui/account-service-ui | 4200 | 8080 |
| Hello | chatly-ui | 4201 | 8084 |
| Paper | greatley-poshley-docs-ui | 4202 | 8087 |
| Agenda | greatley-poshley-calendar-ui | 4203 | 8088 |
| Columns | greatley-poshley-sheets-ui | 4205 | 8089 |
| Show | greatley-poshley-slides-ui | 4206 | 8090 |
| Room | greatley-poshley-meetings-ui | 4207 | 8091 |
| Radar | greatley-poshley-instru-ui | 4209 | 8094 |
| Post | greatley-poshley-mail-ui | 4210 | 8095 |
| Hotline | greatley-poshley-support-ui | 4211 | 8080 |
| Passport | greatley-poshley-auth-ui | 4204 | 8086 |

Supporting APIs remain notification service 8082, email service 8083, and Chatly realtime 8085. Redis uses 6379 and local Kafka uses 9092.

From the Professy UI directory, run `npm run start:apps` to start every missing UI. Run `npm run apps:status` to see which ports are ready. Logs are in `greatley-poshley-suite/.runtime/ui`. `npm run apps:stop` stops only UI processes created by that launcher; it leaves pre-existing servers alone.

The launcher binds new servers to `localhost` and detects existing servers on either `localhost` or `127.0.0.1`, including IPv6 loopback. Use `http://localhost:4200` through `http://localhost:4211` consistently in your browser. It limits Angular build workers to two by default to reduce memory pressure when the suite runs together. Backend APIs do not serve the Angular pages: running an API on 8084 does not start Hello’s UI on 4201. Angular does not open a browser automatically.

Each UI also has its own `npm start` command with the port above. Run it from the corresponding directory. All UI packages reference the sibling `greatley-poshley-suite` and `greatley-poshley-design-system` packages. Keep those folders alongside the apps; use `npm ci` after copying to another machine.

## Start or restart the services

The UI launcher starts the missing frontend servers when requested; backend services remain managed separately. Restart the already-running core, Chatly, realtime, and notification services to load the new CORS, document, and event integrations.

The three new service directories are:

- `greatley-poshley-auth-service` (8086)
- `greatley-poshley-docs-service` (8087)
- `greatley-poshley-calendar-service` (8088)

Run `./gradlew bootRun` from each directory, or build with `./gradlew bootJar` and run the generated jar from `build/libs`. Start core and shared sign-in before opening the UIs. Start MySQL, Kafka, and Redis using the existing local setup. The email service can remain without SMTP until mail settings are supplied.

Private local properties are in `~/.config/professy/<service-name>.properties`, with restricted file permissions. No passwords or service secrets are included in this package. Core also reads its existing private service configuration. Identity uses a separate identity-service secret in addition to the common internal service token.

Database migrations already applied on this machine:

- Core: `professy-backend/professy/src/main/resources/db/V20261103__document_workspace.sql` adds document tags, revisions, and metadata to existing documents.
- Chatly: `message_documents` links messages to the same project documents.
- Identity: `greatley_identity`, dedicated user, `auth_sessions` and one-use `auth_codes`.
- Calendar: `greatley_calendar`, dedicated user, events, attendees, document links, and event outbox. Event date/time columns use UTC DATETIME(6).

New services include idempotent `schema.sql` initialization. For another machine, provision the databases and restricted users, apply the core migration, and configure the private properties before starting services. Never use root database credentials in application configuration.

Kafka topics `greatley.calendar.events.v1` and `greatley.calendar.events.v1.dlt` have been created locally with three partitions. The existing Chatly event topics remain in use.

## How the apps connect

- Professy remains the authority for organization accounts, passwords, project membership, and permissions. Shared sign-in delegates account validation to core rather than copying users or passwords.
- Every application, including Professy, redirects to the same sign-in UI on port 4204. That sign-in establishes the shared HttpOnly cookie before returning to the requested workspace. Other tabs resume the same account. When a redirect is needed, apps use a short-lived one-use code with a PKCE verifier and saved state. Tokens and passwords are not passed in app URLs.
- Signing out through the Apps/account controls revokes the shared account session and API token version. Open apps recheck the session periodically and on unauthorized API responses.
- The Apps menu shows the eleven suite products and their primary functions. Forge is hidden.
- Chatly supports direct/group conversations, team channels, existing file uploads, and references to project documents. Team and people actions in Professy open the relevant conversation.
- Documents uses the existing Professy document records through an API gateway, with project access checks, tags, templates, rich text, autosave, version history, and revision conflicts. It does not create a second document store. Live simultaneous co-editing is not implemented.
- Calendar supports personal/project events, attendees and RSVP, month/week/agenda views, shared document references, and ICS export. Calendar changes use a transactional Kafka outbox and appear in the existing notification center for recipients.

## CORS and deployment

Local development permits HTTP loopback origins on arbitrary ports, including `http://localhost:64836`, so Angular's temporary development ports work. External origins are not allowed by those loopback rules.

For deployment, replace the development origin patterns with explicit HTTPS app origins in core (`app.cors.allowed-origin-patterns`) and the app services (`APP_ORIGINS`, or `CHAT_ORIGINS` for Chatly). Set `AUTH_DEVELOPMENT=false`, `AUTH_COOKIE_SECURE=true`, and register the exact app origins using `AUTH_CLIENT_ORIGINS`. Supply private service tokens through your deployment secret store. The local shared registry uses the port table above; configure its app URLs and API endpoints for the deployment's domains. This local setup is not a full OIDC provider or a claim of production-scale validation.

## Validation

Source compilation, Angular development bundles, and isolated CORS/sign-in security checks are used without launching application servers. The CORS checks cover the reported loopback origin and rejection of unrelated origins; sign-in checks cover callback validation and code-exchange protections. Browser interaction and live end-to-end integration still need verification after the services are started.

## Shared Teams design

The actual Professy Teams hero stylesheet is now `greatley-poshley-design-system/hero.css`, imported by both Teams and the standalone apps. Shared controls and workspace styles provide the same white canvas, typography, primary actions, 50px fields, 10px control corners, card surfaces, and rainbow avatars. Cover images are included in each app’s assets configuration.

## Clarity shared UI

Navigation, Apps and people cards use `visual-system.js` inside their shadow roots and inherit the shared `--gp-*` visual tokens from `@greatley-poshley/design-system/clarity.css`. All ten app builds include that stylesheet after their existing global styles. Local suite code is excluded from dev dependency prebundling to keep current exports and theme changes in sync.

Post is the eleventh app (UI 4210, backend 8095), using SSO client `mail`. It is registered in `appRegistry`, the Apps menu and the UI launcher manager. Existing authentication deployments must add its exact origin. The shared registry is the single source of truth for app links/icons.

## Hotline service management

Hotline is registered in the Apps launcher on port **4211** (`greatley-poshley-support-ui`). It uses the existing Professy backend on 8080 and Passport on 8086. Start it with `node manage.mjs start Hotline`, or `npm start` from its own project. Restart Professy and Passport after updating their code/configuration. When `AUTH_CLIENT_ORIGINS` is overridden, add `support=http://localhost:4211`.
