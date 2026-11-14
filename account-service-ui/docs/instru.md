# Radar — application observability

Open [Radar](http://localhost:4209) directly or choose **Apps → Radar**. The local collector/API is **8094**. Radar shares Workspace sign-in, project context and the suite's light/dark design.

## Start monitoring

1. Select a project in the header and choose **Monitor service**. Name the application and environment. Project/release managers and organization administrators can configure monitors.
2. Copy the one-time, write-only ingest key. Keep it in the application's environment or secret manager.
3. In **Agent setup**, Java applications can choose On a host, Gradle, Maven, Docker, Kubernetes, or AWS Lambda. Kubernetes instruments Java pods in your deployment. Lambda uses explicit SDK spans and exceptions. The SDK coordinates are `com.greatleyposhley.instru:instru-sdk:0.4.2`.
4. Start your Java 17+ application with:

```sh
export INSTRU_ENDPOINT=http://127.0.0.1:8094
export INSTRU_KEY='<your service ingest key>'
export INSTRU_VERSION='1.0.0'
java -javaagent:/absolute/path/instru-agent-0.4.2.jar -jar your-application.jar
```

Maven artifacts are hosted locally at `http://localhost:8094/maven/`; they are not published on Maven Central.

## Capture the local Greatley suite

The local Gradle builds for all 13 Spring backends include `com.greatleyposhley.instru:instru-spring-boot-starter:0.4.2`, resolved from Radar's local Maven endpoint (`http://127.0.0.1:8094/maven/`). The starter is conditional: without `INSTRU_KEY` it does not start or export telemetry. With a key, it starts the SDK during app startup, samples JVM/host metrics every 10 seconds, and records templated HTTP method/route/status/duration spans. It also samples Hikari database pool gauges, supported Spring Cache statistics, Redis server counters and memory, plus Kafka producer/consumer throughput, buffer, latency, and lag. Database calls through Spring `JdbcTemplate` are measured as generic operation durations; SQL and parameters are never inspected. It does not record request bodies, query values, cookies, cache keys, queue/topic names, message contents or credentials.

For localhost, one Radar service and write-only ingest key are configured for each of the 13 Java backends. The keys live in the gitignored suite file `.runtime/secrets/instru-local.env` with mode 600; they are not stored in source or Gradle files. Each Gradle `bootRun` task reads only its own key from that file and sets `INSTRU_ENDPOINT=http://127.0.0.1:8094`, `INSTRU_VERSION`, and a stable local instance ID. It also loads the matching private Spring settings from `~/.config/professy/` when present.

From this app's directory, `npm run start:apps` starts missing UI and Java API services; it leaves already-running servers alone. Use `npm run apps:restart-backends` after rebuilding APIs to restart the 13 Java services with Radar telemetry. Use `npm run apps:status` to see which APIs are managed and reporting. The default Gradle repository URL can be changed with `INSTRU_MAVEN_URL`.

The Java services covered are Professy, Hello API, Hello realtime, Passport, Paper, Agenda, Columns, Show, Room, Post, email, notifications and Radar. Forge and Agent Runtime are Python processes. Both now use a standard-library adapter to send local process metrics and templated HTTP spans to their own Radar services; Agent Runtime also sends content-free `agent.run` spans.

Open a monitored service in Radar and choose **Dependencies** for its live database-pool and generic JDBC-duration graphs, Spring Cache statistics, Redis hits/misses, memory and command volume, and Kafka producer/consumer throughput, buffer, and lag. Redis INFO measurements are server-wide totals. Java SDK 0.4.2 uses a bounded 20,000-record queue and batches up to 600 records every 500 ms; Radar allows up to 1,000 records per batch, within its payload and per-key rate limits.


## Capture local Python services and agents

Forge and Agent Runtime are registered as separate `local` services in the selected Radar project. Each process reads its own write-only key (`INSTRU_FORGE_KEY` or `INSTRU_AGENT_RUNTIME_KEY`) from the gitignored `.runtime/secrets/instru-local.env` file, which must remain mode 600. The adapter only exports to `http://127.0.0.1:8094`. It sends process CPU, resident memory, thread count and garbage-collection measurements every 10 seconds, plus HTTP method, allowlisted route template, response status and duration. Agent Runtime adds one `agent.run` internal span per real work run with only outcome and duration. It does not send query values, headers, credentials, request or response bodies, prompts, messages, file names or run IDs.

The service rows show runtime instances and HTTP request counts. In a service detail view, transactions show HTTP requests and content-free agent spans. Agent run spans appear after a genuine assigned run completes; no synthetic agent work is created to populate the charts. The metrics adapter is best effort with a bounded in-memory queue and no service-start dependency on Radar availability.

## Capture the hosted Greatley suite

For each Java backend and environment, create a separate service in Radar and store its write-only ingest key in the host's secret manager. Do not share one key across services or put keys in browser code, source control, or an image. The Gradle starter is already a dependency of all 13 backend projects. At hosted build time, configure `INSTRU_MAVEN_URL` to the HTTPS artifact registry where the starter is published.

For each Java container or host process, set `INSTRU_ENDPOINT` to the Radar origin, `INSTRU_KEY` to that service's secret, and `INSTRU_VERSION` to the deployed build or commit. The Gradle starter starts the SDK automatically when a key is present. The standalone startup agent remains available for applications that cannot add the starter:

```sh
exec java -javaagent:/opt/greatley/instru-agent-0.4.2.jar -jar /opt/app/service.jar
```

Inject the three `INSTRU_*` values through the deployment's environment or secret manager. Use a reachable HTTPS Radar origin for hosted services; `127.0.0.1:8094` only works when Radar shares the same host or network namespace. Keep each service's key scoped to that service and environment, then verify its first heartbeat, instance, JVM samples, HTTP spans, version and errors in Radar.

The Java agent covers the suite's Java APIs, including Professy, Passport, Hello's chat APIs, Paper, Agenda, Columns, Show, Room, Post, Hotline, notifications, email and Radar itself. It does not instrument Angular pages; browser errors and web vitals need a separate browser telemetry design that sends through a rate-limited backend endpoint. A service ingest key must never be shipped to the browser. Browser errors and web vitals need a separate browser telemetry design that sends through a rate-limited backend endpoint; a service ingest key must never be shipped to the browser. Keep those components marked as unmonitored until their adapters are deployed.

On the hosted path, JVM/host samples are emitted about every 10 seconds and Radar's live dashboard refreshes every 15 seconds, plus transport and queue delay. Treat this as near-real-time telemetry, not a sub-second event stream. HTTP spans contain route, method, status and duration; request bodies, query values, cookies and credentials are not captured. Use explicit SDK events for business actions that are not represented by HTTP requests.

## Available measurements

- **Infra dashboards:** Instance stats opens first, with HTTP stats and Errors in the top navigation. Filter by service and instance, use a rolling time preset, or apply From and To dates (up to seven days). Rolling views refresh every 15 seconds while visible. **View sample data** opens a simulated Checkout API with three JVM instances, populated charts, a release marker, and an incident. The dashboard starts in this view when the selected project has no service with a recent heartbeat. Use `http://localhost:4209/?sample=1` to open it directly. Sample data stays separate from monitored services.
- **Overview:** JVM CPU, heap/non-heap memory, threads, GC, uptime, instance freshness and CPU/heap/latency/throughput graphs.
- **Transactions:** synchronous servlet durations/statuses, custom spans, local parent/child trace IDs, search and cursor pagination.
- **Dependencies:** database connection pool usage and generic Spring JDBC call durations; cache hits, misses, evictions and item estimates when the configured provider exposes statistics; Kafka produced/consumed rates, producer buffer use and consumer lag. The detail page graphs these over the selected window and leaves unavailable providers empty.
- **Errors:** grouped exception classes, stack traces, version association and individual occurrences.
- **Incidents:** threshold/manual incidents, severity, acknowledgment/investigation/resolution, notes and audited human/system actions.
- **Deployments:** SDK startup version markers and manual deployment records linked to actual project releases, commit IDs and notes.
- **Java setup:** SDK/agent installation, key creation/revocation and per-service alert thresholds.

Login success/failure/logout counts require explicit `Instru.login(...)` calls at the application's existing authentication boundary. This is outcome tracking, not a user identity audit. Exception messages are off by default; request bodies, cookies, queries, SQL and credentials are not automatically captured.

Infrastructure latency percentiles use nearest rank from individual HTTP durations, excluding internal/custom spans. At most the latest 50,000 HTTP samples per window contribute to latency; the UI discloses sampling. Request/status counts use all stored HTTP requests in the window. Existing 0.1.0 agents remain ingest-compatible but need upgrading for HTTP classification and host measurements.

Set `INSTRU_DISK_PATH` to choose the filesystem volume (defaults to the JVM working directory). Disk utilization means used/unavailable capacity, not disk busy time. File read/write throughput uses bounded JFR events for Java file operations, excluding native and memory-mapped I/O; disable with `INSTRU_FILE_IO=false`. Unsupported/first-sample values stay unavailable. Host CPU/memory reflect the OS/container view, and are not added across JVMs sharing a host.

## Recorded local verification — organization 309

In **[DEMO] Atlas Commerce Launch** (project 3734), open service **[DEMO] Instru Java checkout sample**. The stopped sample exported **40 spans and 8 intentionally captured exceptions**, plus actual JVM measurements, through the MySQL outbox and Kafka topic `gp.instru.telemetry.v1` into Radar. Release 303 was linked to a manual incident, whose creation, timeline and resolution were verified. The temporary sample keys were revoked.

This is historical demonstration data, not an ongoing production monitor or real outage. Select a sufficiently wide time window to inspect the sample; live cards correctly become stale after it stops. The demo's 20% error rate reflects deliberately thrown exceptions.

## Source and operations

Sibling projects under `/Users/giridharsundeep/Documents/projects`:

| Project | Purpose |
| --- | --- |
| `greatley-poshley-instru-java` | Java 17 bytecode SDK, Byte Buddy startup agent, local Maven publication and fixture tests |
| `greatley-poshley-instru-service` | Authenticated APIs, isolated MySQL storage, Kafka outbox/consumers and incidents |
| `greatley-poshley-instru-ui` | Angular dashboard, shared login and theme |

Their READMEs contain detailed configuration, package usage and operational limits. The collector uses dedicated `greatley_instru` storage and a restricted database account. Local credentials live outside source in `~/.config/professy/instru.properties` with mode 0600. Its LaunchAgent is `com.greatleyposhley.instru`.

The local UI currently uses the existing first-party `professy` auth client; dedicated `instru` registration is present in auth-service source for activation on deployment. The existing auth JVM was not restarted.

## Limits and verification

The SDK is best effort with a bounded queue and retries; high traffic/outages/process crashes can lose records. The collector durably queues accepted batches and deduplicates within its retention window. Raw telemetry defaults to seven days. Overview latency/error cards are limited to the latest 10,000 observed spans and disclose that sample; incident thresholds operate on received data.

Automatic coverage includes JVM metrics, synchronous Jakarta/Javax servlets, Spring controller exceptions, Python process metrics, templated Python HTTP spans, and Agent Runtime outcomes. WebFlux, JDBC, async/cross-service context, continuous profiling, RUM and log ingestion need further implementation. Alerts create in-app incidents; outbound paging/email is not connected yet. This implementation has not been load-tested for production scale.

SDK/agent fixture tests, backend validation and real-MySQL tests, Angular builds and shared launcher checks passed. A separate headless JVM exercised actual startup instrumentation. No application browser was launched and no visual matching was claimed.
