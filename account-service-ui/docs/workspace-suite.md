# Greatley Workspace

The suite uses the shared [Clarity visual system](./visual-system.md): white light-mode surfaces, bold system typography, capsule actions/search, consistent compact people rows, and distinct human/agent icons. A header theme button switches to dark chrome. The choice follows tabs on the same hostname; document pages and slides keep their authored colors. Existing API/client identifiers and project directories remain stable so the new names do not break integrations.

| App | Purpose | Open locally | Backend |
| --- | --- | --- | --- |
| Professy | Agile, projects, tasks, sprints | [4200](http://localhost:4200) | 8080 |
| Hello | Team chat and messaging | [4201](http://localhost:4201) | 8084, realtime 8085 |
| Paper | Documents and knowledge | [4202](http://localhost:4202) | 8087 |
| Agenda | Calendar and scheduling | [4203](http://localhost:4203) | 8088 |
| Columns | Spreadsheets and data | [4205](http://localhost:4205) | 8089 |
| Show | Slides and presentations | [4206](http://localhost:4206) | 8090 |
| Room | Meetings and video calls | [4207](http://localhost:4207) | 8091 |
| Radar | Logs, metrics, traces, monitoring | [4209](http://localhost:4209) | 8094 |
| Post | Business email | [4210](http://localhost:4210) | 8095 |
| Hotline | Support and service management | [4211](http://localhost:4211) | 8080 |
| Passport | Authentication, identity and SSO | [4204](http://localhost:4204) | 8086 |

Local coding worker: 8092. Ollama: 11434. Notifications: 8082. Email: 8083.

All eleven products appear in **Apps**, with unique icons. Agents and Roadmap remain tools inside Professy. Hello adds separate People/Agents conversation filters; Room adds a searchable human/agent roster and compact/comfortable video grids. Each standalone product retains its own navigation; editors switch to a focused file workspace with the same Apps and theme controls.

## Forge and organization 309

Forge is hidden from the Apps menu.

Sign in using the existing organization 309 account. Forge contains 28 private source snapshots of the suite's local repositories and a separate `agent-payment-prototype` review repository. They are hosted on this Mac, not published to GitHub or an external organization. Existing source histories and remotes were not rewritten.

Use a repository's **Code**, **Commits**, **Issues** and **Pull requests** tabs. Branches, file contents, diffs and commit history come from real bare Git repositories. The organization navigation also lists pull requests across repositories. Clone/fetch/push uses Git smart HTTP and a short-lived token created under **Access tokens**; use username `gp` and the displayed token as the password. Do not embed tokens in Git remote URLs. Tokens expire after 10 minutes, when the workspace session becomes invalid, or when Forge restarts; they can be revoked sooner. Only repository owners or organization administrators can push or merge.

Imports omit dependency/build directories, uploads, local databases, environment files, keys and detected credential-bearing configuration. Each snapshot includes `IMPORT-NOTES.md` describing omissions. This is an aid for local review, not a guarantee that a source repository is safe to publish. Import snapshots include the current working source, including pre-existing unfinished changes.

Verified workspace actor metadata is stored separately from Git author strings. Imported snapshots are attributed to the requesting human; the agent demo commit is attributed to its actual agent/run. Other Git authors are explicitly shown as unverified metadata, because a Git author name alone cannot establish human or agent identity.

Forge currently supports explicit **fast-forward-only** merges. CI runners, branch protections, required review approvals, complex merge resolution, webhook delivery, repository-level read ACLs and distributed Git storage remain future work. Repositories are organization-readable; a private repository here means private to the organization.

## Local coding agent

Ollama and a single local worker are installed. Configure the assigned agent under **Agents → Local runtime & skills**, then open **Repository, tests & run agent** from its ticket. The current local model is `qwen2.5-coder:3b-instruct`. Model licensing is separate from product licensing; this model's bundled license is the Qwen Research License.

Ticket execution uses the description, saved repository/test metadata and a frozen source revision. Each run has its own workspace, an original-test baseline, new regression tests, bounded checks, actual work logs and an unmerged Forge pull request. See the workflow below for configuration and supported profiles. This does not enable automatic chat replies, agent voice, production deployment or automatic merging.

The previous organization 309 demo remains available as historical evidence: project **3734**, agent **Implementation Assistant**, ticket **TASK-301506**. Its historical “Atlas” names are customer sample data, not a remaining Atlas app. That demo used an isolated in-memory payment prototype and does not prove a production payment implementation. See the [recorded walkthrough](./org-309-demo.md) and [editor capabilities](./office-editor-capabilities.md).

## Running the new services

Source directories under `/Users/giridharsundeep/Documents/projects`:

- `greatley-poshley-agent-runtime`: Python standard-library worker, 8092.
- `greatley-poshley-forge-service`: Python standard-library API/Git host, 8093.
- `greatley-poshley-forge-ui`: Angular UI, 4208.
- `greatley-poshley-instru-java`: Java SDK/startup agent and local Maven publication.
- `greatley-poshley-instru-service`: JVM telemetry collector, Kafka and isolated MySQL storage, 8094.
- `greatley-poshley-instru-ui`: Angular observability dashboard, 4209.

See [Radar installation and recorded verification](./instru.md). Its collector has a separate `com.greatleyposhley.instru` LaunchAgent.

The worker and Forge API have local LaunchAgents named `com.greatleyposhley.agent-runtime` and `com.greatleyposhley.forge`. The newly deployed Forge development UI runs on 4208. From Professy's directory, `npm run start:apps` starts missing app UIs and Java APIs; existing servers are left running. `npm run apps:restart-backends` restarts the 13 instrumented Java APIs, and `npm run apps:status` reports their state. The manager only stops API processes it started itself. Ollama is managed by Homebrew services.

Forge has a dedicated `forge` auth client registered in auth-service source. For compatibility with the already-running local auth service, its UI currently uses the existing first-party `professy` client. A deployed environment should activate the dedicated client and its exact redirect origin. Keep local APIs on loopback; production needs TLS, managed storage, restricted CORS, scalable queues, separate sandboxed workers and operational monitoring.

## Verification boundaries

Angular template/type checks and development builds were run, plus focused editor, actor-icon, shared launcher, access-boundary, real Git and sandbox tests. A genuine model-generated prototype was executed and its source inspected. Browser/media interaction and visual pixel matching were not tested; no browser was launched. No claim of complete Google or GitHub feature parity is made.

Post mail: UI `http://localhost:4210`, API `http://127.0.0.1:8095/api/mail`, SSO client `mail`, isolated `greatley_mail` database. See [implementation and security scope](improvements-2026-11-04.md).


## Ticket-driven agent execution and Radar

Atlas has been removed from Apps, startup and sign-in registration. Its UI is stopped and its source retained privately as a retired app; previous customer catalog/diagram and delivery records are not dropped. **Radar (4209)** now owns Services & infrastructure and Architecture. On the first manager visit to an empty project inventory, existing catalog/diagram records are imported. A manual import action can retry. Measured CPU, memory, exceptions and incidents remain tied to instrumented SDK services, rather than inferred from a catalog entry.

1. In Professy, configure an active agent's identity, roles and project membership. Use **Agents → Local runtime & skills** to enable and enroll its worker. Keep the private downloaded configuration at `~/.config/professy/local-agent.json`, mode `600`.
2. Assign an epic, story, task or issue to that agent. Its **description** contains the problem, reproduction steps and implementation instructions.
3. Open **Repository, tests & run agent** on the ticket. Choose a writable Forge repository and base branch, specify editable source/test paths, acceptance criteria, the test directory/profile and optional related Radar resource.
4. **Run agent against ticket** freezes the description, source revision and settings. The worker runs original tests, changes only approved files, adds a new regression test, runs the supported regression profile and prepares an unmerged Forge pull request.
5. Review the actual diff, baseline/regression output, logs and attached evidence. Passing checks alone do not establish correctness. Humans review/merge; existing release scope and incident/fix-release associations connect the work to releases. This runner does not deploy or merge automatically.

Local profiles currently support Python standard-library unittest and Node's built-in test runner. Existing regression tests cannot be rewritten. No network, package installation or child processes are available inside test execution. Snapshot/model/file limits are enforced; Maven/Gradle, external Git providers, browser regression suites and arbitrary language pipelines remain unsupported. The model/provider license is a separate deployment choice.

Radar incidents capture confirmed root cause, resolution, the affected release, linked incident ticket and fix release. Marking an incident resolved requires root-cause/resolution details. Completing its linked ticket is an explicit checkbox; the backend verifies the saved incident and project link. Professy release profiles show these incident associations and resolution state.

**Professy → Retrospectives** groups feedback per sprint into Went well, Improve and Actions. Project members add/edit their own entries and vote; facilitators manage phases and discussion summaries. Action entries support owners/due dates and idempotent creation of real backlog tickets. Closed retrospectives reject further entry/vote changes.

Verification used Angular checks/builds, backend validation tests, temporary real Git repositories and sandboxed Python/Node fixtures. No browser or application was launched for visual testing, and the new workflow has not been claimed as a completed model-authored production fix.

### Example ticket instructions

Description: “Fix duplicate payment event handling in the payments service. Reproduce the failure from the supplied payload; preserve the response contract; add tests for duplicate and new event IDs. Explain the change and remaining risks.”

Execution metadata: choose the actual Forge repository and base branch; allow only the relevant source directory and new test paths; choose a supported local verification profile and existing test directory; state observable acceptance criteria. Optionally select the matching Radar resource. Unsupported pipelines should be run separately and their evidence reviewed before merge.
