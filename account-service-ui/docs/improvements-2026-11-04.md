# Suite improvements — 4 November 2026

The shared Clarity system now distinguishes layout wrappers, regular form fields and compact editor controls. Products and Boards have a single search outline. Ticket dialogs stack Status/Priority in the left metadata column and Assignee/Reporter in the right; create and view use the same layout. Releases and Folio headers use the available width. Relay's emoji picker has a bounded, scrollable grid above the composer. Grid/Prism title bars, menus, formatting controls and sheet tabs have explicit compact sizing; Gather's room, chat and call controls wrap responsively.

People cards open profile details through an explicit information button. Opening details does not select the card. Native Astra profiles retain their authenticated profile lookup, close on outside click/Escape and trap focus while open. Standalone cards display the profile fields supplied by their caller. Avatar URL aliases now include the core directory's `avatar` and `profilePictureUrl` fields.

## Post mail

| Component | Location | Port |
|---|---|---|
| Post UI | `/Users/giridharsundeep/Documents/projects/greatley-poshley-mail-ui` | 4210 |
| Post service | `/Users/giridharsundeep/Documents/projects/greatley-poshley-mail-service` | 8095 |

Post is registered in the common Apps launcher, with its own `mail` SSO client and mailbox navigation. It supports organization recipients, name/email/designation search with load more, inbox/sent/drafts/archive/trash/starred, paged search, read/unread state, saved recipients, replies/reply-all/forwarded text, and protected attachments. Sending is idempotent per draft and locks the draft before delivery. Attachment limits are 10 files, 5 MB per file and 20 MB per message. Recipient IDs are validated against the authenticated organization directory.

The isolated `greatley_mail` MySQL database and its tables were created. Private credentials are in `~/.config/professy/mail.properties`, mode 0600. Mail notifications use the transactional `mail_outbox`, Kafka topic `greatley.mail.events.v1`, and the existing notification service; event IDs deduplicate retries. Notification links open the matching message.

Post currently delivers **internal organization mail**. Internet SMTP/IMAP, external mailboxes, delivery/bounce handling, spam filtering, antivirus scanning and email-domain verification are not implemented. SMTP configuration was explicitly deferred earlier; Post does not pretend to send external email. The existing email service remains the transport for account/invitation mail.

Start Post from its directories with `npm start` and `./gradlew bootRun`. No app was started and no mail was sent during this change. Restart Access after changing its registered clients. Custom `AUTH_CLIENT_ORIGINS` values must include `mail=http://localhost:4210` (or the exact deployed origin).

## Profile photo storage

The frontend's existing `/api/user/upload-avatar` call now has a backend endpoint. It requires a signed-in account, validates actual image data, accepts PNG/JPEG up to 5 MB/20 million pixels, resizes to a maximum 1024-pixel dimension, strips metadata through re-encoding, and creates a random PNG key. Original names and paths are ignored. Non-image data and SVG are rejected. Local reads reject traversal and symbolic links.

Default storage is `~/.local/share/professy/avatars`, served through `http://localhost:8080/media/avatars/{random-key}.png` with a fixed image type and `nosniff`. Avatars are intentionally **public by unguessable link**; ticket, document and mail attachments do not use this public endpoint.

Configure the core through environment/private properties, never frontend configuration:

```properties
app.media.driver=s3
app.media.s3.bucket=your-avatar-bucket
app.media.s3.region=your-region
app.media.public-base-url=https://your-cdn.example/avatars
# Optional S3-compatible endpoint, without a bucket path:
# app.media.s3.endpoint=https://object-storage.example
```

Supply `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and, for temporary credentials, `AWS_SESSION_TOKEN` to the backend process. The S3 writer uses Signature V4, HTTPS and the `avatars/` prefix, with redirects disabled. Grant the service only `s3:PutObject` on that prefix. Provision the bucket/CDN origin policy separately. Cloud credentials, a bucket, and CDN access were not supplied, so live S3/CDN delivery has not been tested. Local photo processing is covered by automated tests.

## Dashboard and notifications

The dashboard refreshes every 30 seconds while visible, can pause live updates, preserves the selected team during refresh, and clears the old snapshot when changing projects. Added indicators include overdue open work, work with no recorded update in 14 days, median open age, estimation coverage, ownership coverage, human/agent/unassigned ownership, and high-priority open work. Estimates count tasks and leaf stories to avoid double counting parents and their children. Unknown dates/empty denominators remain unknown, not fabricated zero performance. These are snapshot indicators; historical velocity and cycle time need transition-history analytics.

Notification/email services had incorrect default core ports (`8081`/`8083`); both now point to `8080`. Notification errors expose retry and distinguish expired sign-in. Runtime availability still requires the notification service, core, MySQL and Kafka to be running with valid private configuration.

## Forge

Added repository write/maintainer collaborators, searchable colleague selection, issue comments and close/reopen, commit-specific approval/change-request reviews, and configurable protected branches. PR authors cannot approve their own changes. Stale approvals do not satisfy the merge gate, requests for changes block it, and protected refs reject direct Git pushes. Merges remain fast-forward-only, compare-and-swap the target SHA, and serialize policy checks with branch-rule changes.

This is not full GitHub parity. CI runners/check suites, required CI checks, CODEOWNERS, forks, organizations outside the workspace, advanced merge strategies, webhooks, package registries, vulnerability/code scanning, branch rules for tags, release assets and distributed Git storage remain outside this implementation. Do not treat the local Python server as an internet-facing Git hosting deployment.

## Security scope

- Core database credentials and the JWT signing key were removed from source configuration. The core now uses the restricted `professy_app` database account. A new signing key is stored in private configuration; old access tokens will need renewal after restarting the core. Existing services were not restarted automatically.
- All affected Java APIs have `nosniff`, referrer/frame protections, non-cacheable authenticated API responses, TLS-only HSTS and TRACE rejection. This does not replace deployment TLS or a frontend CSP.
- Database error details are redacted, including responses from legacy controllers that catch exceptions themselves.
- New mail queries bind input values; message/draft/attachment access is checked against verified identity. Forge validates Git arguments and enforces organization boundaries and review policies server-side.
- Angular runtime/compiler moved to 21.2.26; build/CLI to 21.2.29. Compatible dependency updates also address the installed HTTP/parser/proxy findings. Production audit results are recorded separately from development-tool findings.

This was a targeted source review and regression pass, not a complete CWE audit or independent penetration test. Development-tool advisories remain; `npm audit --force` recommended incompatible downgrades and was not used. Java transitive dependencies did not receive a complete advisory scan. Production still needs exact HTTPS origin/client settings, secure cookies (`AUTH_COOKIE_SECURE=true`), `AUTH_DEVELOPMENT=false`, managed secrets, least-privilege accounts for every remaining service, edge rate limits, backups, malware scanning and an independent security assessment. No application can be promised unhackable.

References: [OWASP file uploads](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html), [OWASP SQL injection prevention](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html), [AWS S3 Signature V4](https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-authenticating-requests.html).

## Verification

All eleven Angular frontends built and all thirteen Java services compiled without launching apps. Targeted tests cover photo sanitization/path safety, error redaction, mailbox ownership/recipient scope/parameterization/idempotency/outbox creation, Forge boundaries/protected refs/reviews, shared actor/profile-card behavior, launcher destinations and dashboard calculations. No SMTP/S3 live delivery, browser visual review, external penetration test or live multi-user end-to-end run was performed.

Final results: eleven successful frontend builds, thirteen successful Java compiles, 18 workspace/profile tests, 11 agile/document tests, 21 shared-card/metric/office tests, 13 core security/ownership tests, 6 mailbox tests and 17 Forge tests. All eleven production dependency audits reported zero advisories; this does not include development-tool or complete Java advisory scanning. Machine-readable results: [validation-2026-11-04.json](validation-2026-11-04.json).
