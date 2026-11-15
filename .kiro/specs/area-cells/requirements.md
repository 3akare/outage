# Requirements: area-cells

Status: APPROVED by delegation on 2026-11-14 (human: "make the right decisions"). Design in `design.md`, tasks in `tasks.md`.

## Introduction

Area-cells decides where each sensor's events are evaluated and what may be shown publicly. It owns the cell hierarchy (H3 res 8 and its res 7 parent), the choice between a precise cell, a linked group and the parent cell, the linking of cells that share a feeder, hints from neighbor cells, push de-duplication per cell, and the privacy rule for public boundaries.

It runs the detection engine (`detection-engine`) once per scope. It does not contain detection logic.

## Glossary

- **Cell**: an H3 res-8 cell (average 0.74 km²).
- **Parent**: the res-7 ancestor of a cell (average 5.16 km², seven child cells).
- **Area actor**: the Durable Object for one parent. It holds all state for its seven child cells.
- **Scope**: the set of sensors one engine evaluates. Kinds: `CELL`, `GROUP` (linked cells) and `PARENT`.
- **Precision label**: `CELL`, `LINKED` or `COARSE`, shown with every public status.
- **Member**: an install that has produced an event in a cell within the last 7 days and whose weight is at least 0.5.
- **Recently armed**: armed for any time in the last 24 hours.
- **Co-outage**: one outage in which both cells of a pair had at least one eligible drop.
- **Link**: a recorded relation between two cells in one parent that had 3 or more co-outages in 7 days.
- **Notice**: a small message that tells a neighbor area actor a cell's level changed.
- **Public status**: what the web page and push system may show for a scope.

## Requirements

### R1 Cell addressing
**User story:** As a maintainer, I want one definition of cells, so that every part agrees.
1. THE system SHALL use H3 resolution 8 for cells and resolution 7 for parents.
2. THE shared package SHALL provide `cellOf(lat, lng)`, `parentOf(cell)`, `isCell(res8)`, `neighborsOf(cell)` and `childrenOf(parent)`, with a pure-TypeScript `parentOf` and `isCell` that do not load the full H3 library.
3. IF a cell string is not a valid res-8 index, THEN THE system SHALL reject it with `BAD_CELL`.
4. THE phone SHALL compute the cell from GPS once, discard the coordinates, and send only the cell (see `privacy.md`).
5. THE system SHALL treat pentagon cells like any other cell.

### R2 Area actor
**User story:** As the zero-budget owner, I want few Durable Objects, so that the free tier lasts.
1. THE Ingest API SHALL route each event to the area actor named by the parent of the event's cell. This amends `event-ingest` R7.1.
2. THE area actor SHALL hold, for its seven child cells, the members, the engine states for every active scope, the links, the neighbor notices and the push memory.
3. THE system SHALL create an area actor only when an event first arrives for its parent.
4. WHEN a batch contains cells from several parents, THE Ingest API SHALL make one call per parent.
5. THE area actor SHALL be the single writer of its state.
6. THE area actor SHALL publish each public scope view to the public index when it changes, and SHALL send a removal when the scope is no longer publishable (amendment from `web-and-area-pages` R8.2, ADR 0010).

### R3 Membership
1. WHEN an event arrives, THE area actor SHALL record or refresh the install's membership in the event's cell with the event time.
2. THE area actor SHALL treat an install as a member of exactly one cell at a time, the cell of its latest event by event time.
3. THE area actor SHALL drop an install from membership after 7 days without events.
4. THE area actor SHALL exclude installs with weight below 0.5 from member counts.
5. THE member count SHALL be a stored value derived only from events and weights, and SHALL NOT be sent to any client.

### R4 Scope selection
**User story:** As a user in a sparse spot, I want a status that is honest about how coarse it is.
1. WHILE a cell has fewer than 3 recently armed members, THE area actor SHALL evaluate that cell in its linked group if it has one with 3 or more recently armed members, and otherwise in its parent.
2. WHILE a cell has 3 or more recently armed members, THE area actor SHALL evaluate it in its own scope.
3. THE public status SHALL carry the precision label of the scope used: `CELL`, `LINKED` or `COARSE`.
4. THE parent scope SHALL pool the events of all seven child cells.
5. WHEN an outage is open in a scope, THE system SHALL keep that outage in that scope until it closes, even if membership changes. Scope changes SHALL NOT open, close or duplicate an outage.
6. THE system SHALL NOT output `CONFIRMED` at `CELL` precision for a cell with fewer than 3 recently armed members.
7. IF the parent has fewer than 3 recently armed members, THEN THE system SHALL still evaluate the parent scope, which the engine caps below `CONFIRMED`, and SHALL NOT publish it (R9).

### R5 Moving installs
1. WHEN an install's event arrives in a different cell than its previous event, THE area actor SHALL close its armed interval in the old cell with a synthetic internal `DISARMED` at the new event's time, reason `MOVED`.
2. THE synthetic event SHALL NOT be stored as an uploaded event and SHALL NOT appear in any report.
3. IF the new cell is in a different parent, THEN THE area actor SHALL ask the old parent's actor to remove the membership. The request SHALL carry only the install ID, the old cell and the time.

### R6 Linking
**User story:** As a sparse cell on a shared feeder, I want to borrow my neighbors' sensors.
1. WHEN two cells in one parent have 3 or more co-outages within 7 days, THE area actor SHALL link them.
2. THE system SHALL count a co-outage when one outage, in any scope, had at least one eligible drop in each cell, and SHALL count each outage once per pair.
3. WHEN the count for a linked pair falls below 3 in the trailing 7 days, THE area actor SHALL remove the link.
4. THE system SHALL form groups as the connected components of the links within one parent.
5. THE system SHALL pool the events of the group's cells into one `GROUP` scope.
6. THE links and groups SHALL depend only on the set of outages, and SHALL NOT depend on the order in which they were recorded.
7. THE system SHALL NOT link cells in different parents in this version.

### R7 Neighbor hints
1. WHEN a public scope's level changes, THE area actor SHALL send a notice to each area actor that owns a neighbor cell of the scope's cells. The notice SHALL carry the cell, the level, the largest k and an as-of time.
2. THE system SHALL NOT send notices for scopes that are not public.
3. THE receiving actor SHALL keep, per cell, the notice with the latest as-of time, and SHALL treat a notice as `NORMAL` once it is older than 12 hours.
4. THE final neighbor table SHALL NOT depend on notice delivery order or duplicates.
5. THE area actor SHALL pass neighbor and linked levels to the engine as hints. THE engine's rules in `detection-engine` R7 apply, including no `CONFIRMED` without k >= 3 somewhere.
6. WHEN a notice arrives, THE area actor SHALL re-evaluate only the scopes that touch the notice's neighbor cell.

### R8 Manual-report hints
1. THE area actor SHALL accept a count of distinct installs that reported "power is out" for a scope in the last 10 minutes, and SHALL pass it as the manual-report hint.
2. THE hint SHALL apply only when 2 or more distinct installs reported.
3. THE storage and wire format of manual reports SHALL be defined in a later spec. Until then the count is zero.

### R9 Public view and privacy
**User story:** As a user, I want no one to be able to find my phone from a map.
1. THE system SHALL publish a scope only when it has 3 or more members.
2. WHEN a cell has fewer than 3 members, THE system SHALL NOT publish that cell's boundary, status or history.
3. THE public view SHALL NOT contain install IDs, per-install counts, or any member count below 3. It MAY say "3+ phones".
4. THE public view SHALL give the boundary of the scope used (cell, group or parent), never the boundary of a smaller area than the scope.
5. THE public view SHALL NOT show `SPOT_ONLY` states. They are private to the phone.
6. WHERE a scope is not published, THE web page SHALL show an install invitation and no status.
7. THE public history SHALL list outages with start, end or "unknown", level and precision label, and no counts below 3.

### R10 Push de-duplication
1. THE area actor SHALL send at most one `CONFIRMED` push and one `RESTORED` push per cell per episode, where an episode is the union of overlapping outage intervals that touch the cell.
2. WHEN the scope for a cell changes during an episode, THE area actor SHALL NOT send a second push for the same episode.
3. THE area actor SHALL pass pushes to the `alerts-and-light-alarm` system with the cell and episode, and SHALL NOT send pushes itself.
4. THE 10-minute push-age rule of the engine SHALL still hold for every push.

### R11 Evaluation scheduling
1. THE area actor SHALL evaluate the affected scopes when a batch contains a detection event.
2. WHEN a batch contains only state events, THE area actor SHALL merge them and evaluate at the next detection event or after the flush interval, whichever is first.
3. THE decisions SHALL be the same as if every batch had been evaluated at once.
4. THE area actor SHALL evaluate each scope at most once per request.
5. THE area actor SHALL set an alarm for the earliest time an open outage could reach 12 hours, so unknown-end decisions happen on time.

### R12 Delete and expiry
1. WHEN delete-my-data removes an install, THE area actor SHALL remove its membership and its events from every engine state in the actor, and SHALL re-evaluate the live horizon.
2. THE archive records and public history SHALL stay unchanged by a deletion.
3. THE area actor SHALL remove state for empty scopes and SHALL keep no data older than the engine horizon, except archive records, which are kept for 30 days.

### R13 Budget
1. THE system SHALL create at most one area actor per active parent and no actor for cells without events.
2. THE area actor SHALL send neighbor notices only on level changes.
3. THE area actor SHALL write its state behind on the ingest flush interval and SHALL NOT write unchanged scopes.
4. THE H3 library SHALL be loaded only when needed (neighbors), after a measured startup check (see design).

### R14 Observability
1. THE area actor SHALL expose counters: events by scope kind, scope switches, links formed and removed, notices sent and received, evaluations and evaluation time.
2. THE counters SHALL hold no install IDs.

## Analysis of requirements (gaps found and how they were fixed)

Done by Kiro Web. Run Kiro's Analyze Requirements in IDE on this file and record the result here.

| # | Gap in the brief | Fix |
|---|---|---|
| G1 | "Fewer than 3 armed sensors" is the wrong test during an outage: every phone drops, so the cell would turn sparse in the middle of the outage. | R4.1 uses "recently armed in 24 h". R4.5 pins an open outage to its scope. |
| G2 | "Evaluate in the parent" needs events from several cells in one place, but ingest routes to one actor per cell. | R2 shards by parent. R2.1 amends ingest. |
| G3 | "Drop together in 3+ outages" had no definition of together or of an outage that spans sparse cells. | R6.2 defines a co-outage by eligible drops per cell in one outage of any scope. |
| G4 | Links had no expiry. | R6.3. |
| G5 | Link groups could depend on insertion order. | R6.4, R6.6. |
| G6 | "Never show a boundary that reveals one sensor's location" had no testable rule. | R9. |
| G7 | A parent with fewer than 3 sensors would show a boundary around one sensor. | R4.7, R9.1. |
| G8 | Several scopes can confirm the same outage and send duplicate pushes. | R10. |
| G9 | Installs move or re-onboard to a new spot. | R3.2, R5. |
| G10 | Neighbor hints cross actor boundaries and could arrive out of order. | R7. |
| G11 | State events could force an engine sweep on every request, which the free CPU limit cannot afford. | R11.2. |
| G12 | Manual reports could be spammed to raise levels. | R8.2 and R7.5 (never Confirmed without k >= 3). |
| G13 | Expiry of armed state was left to this spec by `event-ingest`. | R3.3, R12.3, and the engine's stale-armed rule. |
| G14 | Delete-my-data across engines and scopes. | R12. |
| G15 | Loading the full H3 library on every Worker start may cost startup time. | R1.2, R13.4. |

## Decisions (2026-11-14)

- **Shard by res-7 parent** (ADR 0006). The brief says one Durable Object per area cell; the area actor is one per parent, which still evaluates at res 8.
- **"Armed" for scope selection means recently armed in 24 hours**, not armed this second (ADR 0006).
- **Link rule:** 3 co-outages in 7 days, links limited to one parent in this version.
- **Public rule:** publish only scopes with 3 or more members (ADR 0007). This is a privacy rule; the human should confirm it.
- **Manual-report hint:** 2 distinct installs in 10 minutes (starting value, a detection-adjacent threshold, so flagged in ADR 0006).
- **Phone side.** The app (Kotlin) looks up its own cell with `com.uber:h3`, which needs human approval (ADR 0012). The Worker re-checks every cell with its own helpers.
- **No new dependency on the Worker side.** `h3-js` is in the approved stack. It is used lazily and only on the Worker for neighbors, with pure-TypeScript parent and validity code for the hot path.
