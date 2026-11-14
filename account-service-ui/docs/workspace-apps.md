# Connected workspace apps

Current names, ports, Forge, themes and the local coding worker are documented in [Greatley Workspace](./workspace-suite.md). The notes below also describe integrations implemented in earlier iterations.

All apps use the shared identity service and the existing organization users. Open them from **Apps** in the header. The Knowledge group has been removed from the left navigation.

| Product | UI | Backend | Project directories under `/Users/giridharsundeep/Documents/projects` |
| --- | --- | --- | --- |
| Professy | 4200 | 8080 | `account-service-ui/account-service-ui`, `professy-backend/professy` |
| Hello | 4201 | 8084; realtime 8085 | `chatly-ui`, `chatly-service`, `chatly-realtime-service` |
| Paper | 4202 | 8087 | `greatley-poshley-docs-ui`, `greatley-poshley-docs-service` |
| Agenda | 4203 | 8088 | `greatley-poshley-calendar-ui`, `greatley-poshley-calendar-service` |
| Columns | 4205 | 8089 | `greatley-poshley-sheets-ui`, `greatley-poshley-sheets-service` |
| Show | 4206 | 8090 | `greatley-poshley-slides-ui`, `greatley-poshley-slides-service` |
| Room | 4207 | 8091 | `greatley-poshley-meetings-ui`, `greatley-poshley-meetings-service` |
| Radar | 4209 | 8094 | `greatley-poshley-instru-ui`, `greatley-poshley-instru-service` |
| Post | 4210 | 8095 | `greatley-poshley-mail-ui`, `greatley-poshley-mail-service` |
| Hotline | 4211 | 8080 | `greatley-poshley-support-ui`, `professy-backend/professy` |
| Passport | 4204 | 8086 | `greatley-poshley-auth-ui`, `greatley-poshley-auth-service` |
| Forge (hidden) | 4208 | 8093 | `greatley-poshley-forge-ui`, `greatley-poshley-forge-service` |

Notifications remain on 8082 and email on 8083. Use the same hostname (`localhost` or `127.0.0.1`) for all UI tabs so the shared sign-in cookie is available.

## Run locally

The new Forge UI/API and local coding worker have been deployed; see the current setup guide. Existing apps were not launched for browser testing. Restart the existing Professy, Auth, Chatly and Docsy services after rebuilding, and restart existing UI development servers so the updated shared app registry is read. In each new service directory, run `./gradlew bootRun`; in its corresponding UI directory, run `npm ci` then `npm start`. The new UI directories currently reuse the installed Docsy dependencies through a local `node_modules` link; `npm ci` gives each app an independent installation. Keep services bound to loopback for local development.

The Sheets, Slides and Meetings API services forward the signed-in user's bearer token to canonical workspace APIs on 8080. The browser does not supply an organization or owner identity. Set `CORE_API_URL` and `APP_ORIGINS` when deploying the gateways. New client IDs are `sheets`, `slides`, and `meetings`; if `AUTH_CLIENT_ORIGINS` is supplied externally, include all three origins and keep existing entries.

## Agents

Open **People & Access → Agents**, or a project's **Agents** tab. Create a named agent, designation, purpose, operating instructions, and explicit project membership. Owners and SUPER_USER can edit setup; SUPER_USER controls multiple access roles and individual permission overrides, using the same permission vocabulary as human accounts.

Active agents belonging to a project appear in its assignee/reporter picker. Their assignments appear on boards, sprint/project planning, work item lists, and the agent's Work tab. Removing a project membership is blocked while the agent has assigned tickets there. Agent identities live in `workspace_actors`; they are not human user accounts, do not receive human login tokens, and do not inherit the owner's administrator access. Negative selection IDs are UI identifiers only; real agent foreign keys are stored in `ticket_actor_assignments`.

Agents appear in Chatly's searchable directory, direct and group chat membership, and meeting invitations. A local Ollama coding worker is now connected for explicitly requested isolated Python prototypes. General chat and meeting model providers remain unconfigured. Agent seats and conversations are available, but automated chat replies, autonomous production changes, speech recognition, and agent voice are not enabled. Asking an agent reports this explicitly; it never fabricates an agent reply. There are no provider credentials stored in the browser.

## Documents and sharing

Docsy lists and direct URLs now require ownership or an explicit share. Organization-wide defaults and implicit administrator visibility have been removed from both current and legacy document access paths. Existing sharing records were made restricted; individual reader/editor grants were preserved. Documents linked from tickets or Chatly do not automatically grant access to the underlying document.

Sheets and Slides use the same private-by-default owner/reader/editor model. Readers cannot change file content. Only owners manage sharing and deletion. Saves use optimistic revision checks, so another tab's updates cannot silently overwrite a newer version. Conflicting local edits can be saved as a separate copy. Versions, tags, and comments are persisted.

## Sheets

Implemented: multiple named sheets, sparse editable cells, range selection, formula bar, arithmetic/comparisons, cross-sheet references and ranges, SUM/AVERAGE/MIN/MAX/COUNT/COUNTA/IF/ROUND/ABS/CONCAT, dependency-cycle errors, fonts, colors, alignment, undo/redo, row filtering, column sorting, find, row/column expansion, clipboard ranges, CSV and XLSX import/export, workbook JSON export, autosave, version restore, comments, and sharing. Limits: 1,000 rows and 52 columns per sheet; 1.5 MB workbook JSON. Formula execution never uses JavaScript `eval`.

See the [current editor capability matrix](./office-editor-capabilities.md) for the expanded functions, static pivot summaries and remaining compatibility gaps. Macros and simultaneous cell-level collaborative editing are not implemented. Saving sorts literal/formula cells; formulas keep their original references.

## Slides

Implemented: slide thumbnails, title/content/blank slides, ordering, duplication/deletion, text editing, drag/resize, editable position/size, text formatting, shapes, image uploads, tables, bar charts, themes, backgrounds, notes, slideshow controls, auto advance, undo/redo, autosave, versions, sharing, comments, JSON export, and PowerPoint export. PowerPoint export preserves editable text and shapes; tables and charts export as images. Advanced theme/animation fidelity is limited. Small embedded images are supported; the file-size limit remains 1.5 MB.

This is an initial presentation editor, not complete PowerPoint/Google Slides compatibility: PPTX import, arbitrary animations, master-slide editing, and simultaneous object-level collaboration are not implemented.

## Meetings

Implemented: instant/scheduled private meetings, human and agent invitations, pre-join camera preview, microphone/camera selection, join/leave/end, participant presence, microphone/camera indicators, raised hands, persistent chat, room links, screen sharing, pinned video, full-screen rooms, and WebRTC peer connections. The organizer controls invitations and ending the meeting. Room metadata, chat and signaling enforce invitation and organization checks. Signaling is polled over authenticated HTTP; media flows directly between browsers. The current peer-to-peer implementation admits eight live participants per room, including agent runtimes, with up to seven peer connections per browser.

### Connecting an agent to a meeting

1. Create the agent in Professy's **People & Access → Agents**, then invite it when creating or managing a meeting.
2. In the meeting's **People and agents** section, the organizer selects **Join link** for the agent.
3. Supply that private, two-hour link to the agent's browser/media runtime. It joins under the named agent identity and can publish audio/video, receive screen shares, and send meeting messages. The page labels the participant as an agent. The runtime supplies the media; it does not generate AI speech by itself.
4. **Disconnect agent** revokes its credentials; generating another link replaces the previous one. Ending the meeting also revokes all runtime credentials. Invalid or expired sessions stop device capture on the next signaling check.

The credential is a random 256-bit value, stored only as a SHA-256 hash on the backend, and is restricted to the invited agent and meeting. The link places it in the URL fragment, then the runtime removes it from the address bar and keeps it in this tab's session storage for reconnects. It never receives a human account token or access to other workspace APIs. Active agent status, invitation, expiry, meeting state, and a denied `MEETINGS.READ` override are checked on each runtime request.

External runtimes can also use `Authorization: Bearer <meeting credential>` against `8091/api/meetings/runtime/{meetingId}` and its `/join`, `/leave`, `/signals`, `/presence`, and `/messages` endpoints. `/runtime/config` supplies ICE configuration. Signaling accepts WebRTC `offer`, `answer`, and `candidate` messages; send `{to: participantId, payload: ...}`. Agent participant IDs in these meeting APIs are negative actor IDs; the authenticated credential determines the sender.

For connections outside the same network, configure `app.meetings.ice-servers` on the **Professy core service** with a JSON array of WebRTC ICE servers, including your TURN configuration. The authenticated Meetings config endpoint passes those settings to participants. Default is `[]`, suitable for local-network peer discovery; no external TURN credentials are assumed. Production needs HTTPS, TURN infrastructure, an SFU for larger meetings, and load testing. Recording, live transcription, generated agent speech, and PSTN dialing are not implemented. The model provider remains deferred as requested.

Restart Professy core (8080) and Meetings API (8091) after rebuilding these changes. Core creates the additive agent-session and media-presence tables at startup. Reload Professy UI (4200) and Meetings UI (4207) for the new launcher, page loading states, and meeting controls.

## Verification

Angular development builds pass for Professy, Chatly, Docsy, Timely, shared sign-in, Sheets, Slides and Meetings. Backend builds cover Professy, Auth, Chatly, Docsy and the three new gateways. Focused tests cover restricted documents, reader permissions, stale file versions, agent assignment boundaries, board filter saves, meeting access, formulas and CSV parsing. Exported Excel and presentation ZIP/XML parts are checked independently. Browser interaction/media tests were deliberately not run, following the request not to launch apps.

## Radar

Java observability is available in **Apps → Radar** on UI 4209 / API 8094. See [installation and verification](./instru.md), including Maven/Gradle SDK usage, startup agent, JVM graphs, exceptions and release incidents.
