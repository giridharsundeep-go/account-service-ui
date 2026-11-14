# Greatley Poshley product roadmap 2026 to 2029

The goal for November 2026 through October 2029 is a dependable workspace connecting Professy delivery planning, Chatly conversations, Docsy knowledge and Timely calendars. Reliability and consistent permissions come first. Human and agent collaboration follows in supervised stages, with explicit identity, attribution and approval controls.

This is a proposed delivery sequence. Accountable roles below must be assigned to actual people before initiatives are committed. The in-app **Roadmap** view lets each project turn these outcomes into dated initiatives, assign owners, link tickets and track completion from their workflow statuses.

## Year one establish dependable collaboration

| Window | Initiative | Accountable role | Work to plan | Release gate |
| --- | --- | --- | --- | --- |
| Nov–Dec 2026 | Reliable collaboration foundation | Engineering lead | Resolve project visibility, shared sign-in, organization membership, attachment delivery and common ticket views. Add permission and recovery regression checks. | Supported flows recover from service interruptions without losing drafts. No unresolved organization-isolation defects. |
| Jan–Mar 2027 | Consistent planning and delivery | Product owner and scrum master | Connect initiatives to epics and stories; refine sprint start/close behavior, carry-forward rules, project allocation, test tags and release readiness. | Each committed initiative has an owner, target, linked work and acceptance criteria. Sprint and release changes leave an audit trail. |
| Apr–Jun 2027 | Connected knowledge and conversations | Collaboration lead | Improve Docsy formatting and sharing, document revisions and authorship, ticket document links, Chatly discovery, mentions and activity search. | Document permissions are enforced consistently in Docsy, Chatly, ticket links and older APIs. Concurrent edits preserve unsaved work. |
| Jul–Sep 2027 | Operational readiness | Platform lead | Add service dashboards, distributed traces, alert routing, backups, restore drills, queue replay and delivery monitoring. | Demonstrate recovery from database, broker and service failures. Establish latency and availability targets from observed workloads. |

## Year two introduce supervised agents

| Window | Initiative | Accountable role | Work to plan | Release gate |
| --- | --- | --- | --- | --- |
| Oct–Dec 2027 | Human and agent identity design | Security lead and AI lead | Define separate actor identities, scopes, creator attribution, approval policies, credentials and execution budgets. Design an agent registry. | Review the threat model and organization boundaries. Agent identity cannot impersonate a human or inherit unrestricted human credentials. |
| Jan–Mar 2028 | Agent recommendations pilot | Product owner and AI lead | Suggest ticket breakdowns, documentation drafts and triage. Collect reviewer feedback against agreed evaluation cases. | Suggestions are labelled and accepted by a person. Pilot evidence meets quality criteria before expanding scope. |
| Apr–Jun 2028 | Supervised agent assignments | AI engineering lead | Add ticket assignment to approved agents, isolated execution, run history, logs, cancellation, bounded retries and budget controls. | Exercise stop and rollback paths. External actions and sensitive changes require explicit approval. Every change records the agent and approving person. |
| Jul–Sep 2028 | Evidence-based delivery insights | Analytics lead | Publish flow, predictability, blocked-work and release-readiness trends with source definitions and drill-downs. | Metrics reconcile to source records and disclose missing data. Use team outcomes for improvement without ranking individuals. |

## Year three strengthen governance and scale

| Window | Initiative | Accountable role | Work to plan | Release gate |
| --- | --- | --- | --- | --- |
| Oct–Dec 2028 | Enterprise governance | Security lead and platform lead | Configurable retention, exports, delegated administration, audit access, organization policies and access reviews. | Demonstrate organization isolation, retention behavior and recoverable exports. |
| Jan–Mar 2029 | Integration ecosystem | Developer experience lead | Versioned APIs, scoped integration credentials, webhooks, installation permissions and integration health. | Publish contracts and verify idempotency, rate limits, signing, revocation and replay behavior. |
| Apr–Jun 2029 | Scale validated by workload | SRE lead | Model realistic usage, identify bottlenecks, partition hot data where justified, improve search and scale services independently. | Prove capacity and recovery targets through controlled workload and failover exercises. Service count alone is not a scale measure. |
| Jul–Oct 2029 | Trusted agent collaboration expansion | Product, security and AI leads | Expand approved agent capabilities based on pilot quality, customer controls and operational evidence. Finish a portfolio and reliability review in October. | Maintain auditability, attribution, approval gates and measured quality. Expand only capabilities that meet their acceptance gates. |

## Plan initiatives in Professy

For each selected project, create an initiative in **Roadmap**, assign one accountable person and set its start and target dates. Add the intended outcome, acceptance criteria and dependencies in the description. Link existing epics, stories, tasks and issues; use the standard work-item dialog to review their details. Progress reflects the percentage of linked items in an organization-defined done status, rather than an estimate of effort.

Break each initiative into an epic with measurable stories. Link implementation tasks, verification tasks and rollout work before assigning a sprint. A release should identify the delivered initiative outcomes and evidence that their gates passed. Keep dates adjustable during planning, and review dependencies before moving work between sprints.

Review the roadmap monthly, delivery commitments each sprint, and the three-year sequence quarterly. Mark an initiative at risk when a dependency or acceptance gate threatens its target. Archive or revise outdated commitments instead of silently resetting their dates.

## Human and agent collaboration contract

The future assignment model must distinguish the **assignee**, **creator**, **actor performing a change**, and **person approving that change**. A human account and an agent identity remain separate even when they belong to the same organization.

An agent profile should identify its display name, provider, owning team, allowed projects, capabilities, credential reference, approval policy and active status. A run should reference its ticket, agent, requesting person, approved scope, inputs, evidence, costs and final outcome. Audit events must retain actor identity after a profile is renamed or deactivated.

Begin with recommendations and supervised runs. Require approval before publishing, sending external communications, changing access, deploying or making destructive changes. Keep credentials outside ticket text and logs. Support cancellation, time limits, bounded retries, idempotency and reviewable results before a run can be considered complete.

The current increment includes an identity-schema foundation and this delivery plan. Executing agents, autonomous ticket work, model-provider integration and a distributed collaborative document editor are later initiatives, not active capabilities.

## Dependencies and success measures

- Shared identity, organization boundaries and current user permissions underpin every app and integration.
- Reliable outbox delivery, consumer deduplication and replay underpin notifications, activity and cross-app updates.
- Document access checks must protect content, revisions, comments, search results and linked previews.
- Track successful sign-in, successful save and attachment delivery, duplicate-event rates, notification delay, restore time, incident recovery and measured delivery flow. Set numeric targets after establishing a baseline.
- Measure agent quality using reviewed outcomes, correction rate, policy violations, cancellation reliability and cost per accepted result. Do not equate generated output volume with useful work.
