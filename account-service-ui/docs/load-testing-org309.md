# Organization 309 testing data and bounded rendering

This local dataset is **synthetic**, intended for functional and volume testing. It is not a record of actual conversations, customer mail, completed delivery, or production traffic.

## Available data

| App | Imported records | Where to find them |
| --- | ---: | --- |
| Relay | 100,000 messages in 1,000 group conversations | Search `[LOADTEST]` in [Relay](http://localhost:4201) |
| Post | 100,000 internal messages, 200,000 mailbox rows | Search `[LOADTEST]` in [Post](http://localhost:4210) |
| Astra | 120 tasks across six stories and multiple sprints | [Atlas Commerce, project 3734](http://localhost:4200/user-home?menu=projects&projectId=3734) and [demo guide](./org-309-demo.md) |
| Folio | 60 documents | Search `LOADTEST SUITE` in the document library |
| Grid | 60 spreadsheets | Search `LOADTEST SUITE` in the spreadsheet library |
| Prism | 60 presentations | Search `LOADTEST SUITE` in the presentation library |
| Tempo | 210 calendar events plus 24 Gather meetings | November 2026–January 2027 |
| Gather | 24 scheduled review meetings | Search `LOADTEST` in My meetings |
| Desk | 48 support cases linked to Astra issues | Open project 3734 and search `LOADTEST` |
| Instru | 6,000 requests, 27 errors, 60 metric samples, login events and 2 deployment markers | Open `[LOADTEST SUITE] Checkout API` in the `synthetic` environment. Replay to refresh the dashboard's rolling time window. |

Use organization 309's administrator account to browse the complete fixture collection. Each Relay group also includes four existing organization members; those users see only their own memberships. Post fixtures appear in the administrator's Inbox and the respective synthetic sender's Sent folder. These are not public or cross-organization records.

Relay and Post subjects/titles begin `[LOADTEST]`; message content explicitly says `SYNTHETIC LOAD TEST`. The history spans August–November 2026 and includes planning, review, incident and release scenarios, multilingual prose and fenced source code. The Relay and Post bulk import bypasses live notification and mail outboxes and sends no external email. The suite fixtures use `[LOADTEST SUITE]` and are tied to the signed-in org 309 account and its demo project where applicable. Desk cases are created without agent dispatch. Gather meetings are organizer-only.

## Pagination and limits

- Relay conversation pages contain up to **50** records with a stable timestamp/ID cursor. Membership and selected filters are applied before the database limit. Off-page links resolve an individual conversation directly.
- Relay rows show the avatar and name, with unread and presence indicators. The message text is available inside the conversation.
- Relay history and live catch-up fetch up to **50 messages** per request. The main conversation renders at most **200 unique messages**. Loading old history keeps that position; **Return to latest** resumes the current conversation.
- Post uses **40-message** cursor pages. Next/previous navigation replaces the rendered page; filter changes reset pagination. Failed navigation preserves the previous cursor.
- Conversation members, message attachments/reactions/documents, and mail labels use batch reads instead of a query for every displayed row.
- The existing Instru trace page stays selected during automatic refresh.
- Tempo returned the test events in two API pages (200 and 11 rows including an existing event). Desk returned the fixture cases in two pages (40 and 8 rows).
- Folio, Grid and Prism each returned their 60 fixtures in three API pages (24, 24 and 12 rows). The importer also read the saved content back from each editor API.

Local sequential API checks over five pages returned no overlapping IDs: Relay pages took 57–98 ms, Post pages 9–20 ms. These are development-machine observations, **not concurrent load-test or production capacity guarantees**. Searches that scan message bodies, large bursts of live events, and attachment-heavy usage need separate concurrent testing before deployment. The fixtures alone do not prove that every app page is protected against every load pattern.

## Language rendering

Relay and Instru use a lazy background syntax worker with **190+ registered programming-language grammars**, including Java, TypeScript, Python, SQL, Rust, Kotlin, Go, C# and XML. Use fenced code blocks with an explicit language for the most predictable result:

````text
```rust
fn ready(errors: usize) -> bool { errors == 0 }
```
````

Unknown languages fall back to escaped plain text. Code remains left-to-right; prose supports Unicode and automatic right-to-left direction. Fixtures cover Hindi, Tamil, Telugu, Chinese, Japanese, Korean, Arabic, Hebrew, French, Spanish and Russian. This is display support, not automatic translation or a full VS Code language server. Font availability still determines glyph coverage.

Highlighting is bounded: 20,000 characters per code block, 40,000 per message body, 32 blocks/jobs, 64 cached results and a 1.8-second worker timeout. Oversized/unsupported content uses safe plain text. Incoming HTML is escaped; a failed worker does not prevent reading the conversation.

## Repeat or extend the import

Run from this UI repository. Python 3 and the local MySQL client are required. The script reads database connection settings from private `~/.config/professy/chatly-service.properties` and `mail.properties`; it does not put database passwords on the command line.

First export the authenticated `/api/session/directory` response for **org 309** to a private JSON file. The default file is `/private/tmp/org309-directory.json`. Do not commit directory data, tokens, or credentials.

```sh
python3 scripts/seed-org309-load-data.py --org 309 --messages 100000 --mails 100000
python3 scripts/seed-org309-load-data.py --apply --org 309 --messages 100000 --mails 100000
```

The first command is a dry run. Deterministic keys make equal-count reruns idempotent; existing records are not deleted. Counts can be increased up to one million per app. Use the same saved directory when extending a dataset. Smaller counts do not remove previously imported records. This tool intentionally supports only local databases and org 309.

For the other apps, use the same private session file as the live replay below. The default run only reads existing records. `--apply` writes missing fixtures through the normal service APIs and then reads the pages back. Use `--apps` to restrict the run. Keep the default pacing when the local UI is open, since workspace events can cause clients to refresh. Run one importer at a time.

```sh
python3 scripts/seed-org309-suite.py --session-file /private/tmp/gp-org309-session.json
python3 scripts/seed-org309-suite.py --session-file /private/tmp/gp-org309-session.json --apply
python3 scripts/seed-org309-suite.py --session-file /private/tmp/gp-org309-session.json --apps instru --apply --refresh-telemetry
```

## Verification performed

- Production builds completed for Relay, Post and Instru.
- Nine focused frontend tests passed for cursor behavior, bounded/deduplicated message windows, Unicode, safe markup, large-code fallback and language-worker rendering.
- Four Relay backend tests passed for cursor validation, authorization before pagination, batched history metadata, deleted-content redaction and team conversation deep links.
- Mail backend checks completed successfully.
- A finite live replay persisted **three chat messages and one self-addressed internal mail** through the normal APIs, under the authenticated org 309 author. The labelled conversation is `[LOADTEST LIVE] 9cfeb0bc`; this verifies API persistence, not receipt in a second browser.
- No browser was launched and no concurrent stress benchmark was performed.

## Live traffic replay

Bulk historical records do not exercise the live transport. The finite replay script uses real authenticated chat and internal-mail APIs, which run their normal event/outbox paths. It sends as the actual logged-in user; it cannot impersonate other fixture authors. The default creates a private solo test group and sends mail to yourself. An optional `--recipient USER_ID` adds another active org 309 human for two-session testing. That recipient will receive test notifications.

```sh
python3 scripts/replay-org309-test-traffic.py --session-file /private/tmp/gp-org309-session.json
python3 scripts/replay-org309-test-traffic.py --session-file /private/tmp/gp-org309-session.json --apply --count 10 --interval-ms 1000 --mail-every 5
```

The session file must contain your token, either at the top level or under `data`. Do not share or commit it. Without `--apply`, only session/directory validation runs. Replay stops on the first API error. It supports 1–1,000 messages at a minimum interval of 250 ms, not an unbounded background producer. Use `--mail-every 0` for chat-only replay; use `--conversation ID` to reuse an authorized `[LOADTEST]` group. Watch from another authorized session to verify actual WebSocket delivery; an accepted API request alone is not proof that another browser received the event.
