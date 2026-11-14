# Organization 309 · Atlas Commerce demo

Project **3734 — [DEMO] Atlas Commerce Launch**. Created using the supplied organization administrator account. Sample records use existing organization members; their global roles and designations were not changed.

[Open the selected project workspace](http://localhost:4200/user-home?menu=projects&projectId=3734) · [Kanban](http://localhost:4200/user-home?menu=kanban-board&projectId=3734) · [Sprint planning](http://localhost:4200/user-home?menu=sprint-planning&projectId=3734) · [Agents](http://localhost:4200/user-home?menu=agents&projectId=3734) · [Roadmap](http://localhost:4200/user-home?menu=roadmap&projectId=3734) · [Test cases](http://localhost:4200/user-home?menu=test-cases&projectId=3734) · [Releases](http://localhost:4200/user-home?menu=releases&projectId=3734)

This is demonstration data, with one explicitly requested local coding run now executed and independently inspected. No customer delivery or shipped release is asserted. General chat/meeting AI providers remain unconfigured; the coding workflow uses local Ollama.

## What exists

- 1 product and project; 2 allocated teams; 1 separately allocated individual contributor.
- 3 manual two-week sprints; Cycle 1 is active.
- 3 human-accountable epics, 6 stories, 12 tasks and 2 linked defects.
- 3 project-scoped agent identities; 4 tasks assigned to agents with explicit human review handoffs.
- 6 DRAFT test cases with multiple tags and linked tasks; 2 PLANNED releases with 10 included work-item references.
- 3 delivery documents plus this walkthrough, with explicit viewer/editor shares.
- 3 linked roadmap initiatives, a scoped Scrum board and an invited planning meeting.

## People and accountability

| Responsibility | Existing member | Designation |
|---|---|---|
| Product acceptance | Aarav Agarwal | Group Product Manager |
| Engineering review | Aarav Gupta | Software Engineering Manager |
| Backend implementation | Aarav Jain | Backend Engineer |
| Frontend implementation | Aishwarya Swathi Shetty | Frontend Engineer |
| Test execution | Aarav Kulkarni | Test Engineer |
| Experience design | Aarav Kapoor | UX Designer |
| Release approval | Aarav Desai | DevOps Engineer |
| Individual project contributor | Akshay Shetty | Support Engineer |

## Human and agent handoffs

| Step | Work item | Assigned to | Approval / outcome |
|---|---|---|---|
| Draft catalog criteria | [TASK-301502](http://localhost:4200/user-home?menu=kanban-board&projectId=3734&openType=TASK&openId=301502) | [DEMO] Atlas Planning Analyst | Human product owner reviews task 2. |
| Prepare API proposal | [TASK-301504](http://localhost:4200/user-home?menu=kanban-board&projectId=3734&openType=TASK&openId=301504) | [DEMO] Atlas Implementation Assistant | Human engineer reviews task 4. |
| Draft payment retry design | [TASK-301506](http://localhost:4200/user-home?menu=kanban-board&projectId=3734&openType=TASK&openId=301506) | [DEMO] Atlas Implementation Assistant | Human engineering owner reviews task 6. |
| Draft coverage gaps | [TASK-301510](http://localhost:4200/user-home?menu=kanban-board&projectId=3734&openType=TASK&openId=301510) | [DEMO] Atlas Quality Reviewer | Human QA executes task 10 and records evidence. |
| Approve release runbook | [TASK-301512](http://localhost:4200/user-home?menu=kanban-board&projectId=3734&openType=TASK&openId=301512) | Aarav Desai | Human operations owner makes the release decision. |

Assignment changes support human → agent → agent → human. An authenticated human currently makes these changes. A ticket assigned to an active agent can now run an explicitly requested isolated Python prototype; autonomous production changes and automatic handoffs are not enabled.

## Walk through the product

1. Choose **[DEMO] Atlas Commerce Launch** in the top header. Open the project profile from the Projects list. Allocated teams and the individual member are separate.
2. Open Sprint planning. Expand Cycle 1, then a human or agent group. Review a task; the person/robot icon identifies the recorded actor type. Backlog tasks 8 and 12 remain unallocated to a sprint.
3. Open Agents, choose the implementation assistant, and open **Work → Work & logs**. Review its instructions, actual ticket activity and isolated coding runs. TASK-301506 now has a validated run with six passing checks and downloadable source.
4. In a ticket, use the top-right options button to clone. Confirm **Create clone**, observe **Cloning…**, and open the new backlog item. Full-screen viewing preserves the underlying workspace.
5. Open Test cases and filter tags such as `catalog`, `accessibility`, `payments`, `agents`, `release`. Every sample case is DRAFT; `actualResult` explicitly says not executed.
6. Open Releases. Both milestones are PLANNED. Their scoped stories and tasks can be opened in the common ticket dialog.
7. Open Docsy from Apps. Only explicitly shared humans see these documents. Product, engineering, QA and operations are editors; other selected contributors are viewers.
8. Open the invited planning meeting. It has the host, four human invitees and three agent seats; agents require a runtime/provider before participating. The local peer-to-peer room supports eight live participants, not a production-scale SFU.

## Ticket metadata

All seeded work belongs to org 309/project 3734. Tickets contain a title, description, status, actual creator, reporter, assignee identity and sprint/parent links where applicable. Agent IDs are distinct from human user-account IDs; negative selection keys are a UI representation only. Human-authored demonstration handoff comments are attributed to the actual administrator. Test tags, document shares, release inclusion and activity provide linked context.

## Dates and controls

| Cycle | Dates | State |
|---|---|---|
| 1 · Discovery & catalog | 4–17 Nov 2026 | ACTIVE, manual |
| 2 · Checkout & payments | 18 Nov–1 Dec 2026 | PLANNED, manual |
| 3 · Quality & release readiness | 2–15 Dec 2026 | PLANNED, manual |

No real sprint was closed, no automatic rollover was enabled, and no other project was changed.

## Verification

The running local APIs returned the demo project, six test cases, three agents, the board, eight meeting participants, assigned agent work, and recorded ticket activity. Six draft tests were inserted directly in the local database during seeding; the correct read API is `/api/v1/testcases`.

The complete product roadmap is in [product-roadmap-2026-2029.md](./product-roadmap-2026-2029.md). UI/backend source changes require the running servers to reload or restart; the new local worker and Forge were deployed without browser testing. Existing applications were not restarted by this iteration.

## Validated local coding run

- Agent: **3 — [DEMO] Atlas Implementation Assistant**. Ticket: **TASK-301506**.
- Run: `e33c7c6bbeb9137c773d8ee0aa2326d5`, status **REVIEW_READY**.
- Six real tests import the delivered `implementation.py` and cover first charge, repeat requests, different keys, key conflicts, invalid amount and empty keys. They ran successfully in the macOS sandbox.
- Source, raw model events, assembly events, hashes and check output are accessible under **Agent work**. The ticket has not been marked complete.
- [Forge](http://localhost:4208): repository `agent-payment-prototype`, branch `review/agent-payment-validated`. Its commit is attributed to the actual agent identity through verified run metadata.
- The previous run `5236c04d600365c4ba1fbcedf1562d79` was rejected during source inspection because copied tests did not validate its implementation. Its former passing status was invalidated; the rejected source/history remains auditable.

The prototype is in-memory sample code. It does not charge money or provide persistence/concurrency guarantees. A human must review it before considering any real implementation. See the [suite guide](./workspace-suite.md) for the deployed services and limitations.
