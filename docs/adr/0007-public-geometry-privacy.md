# ADR 0007: What the public map may show

Status: ACCEPTED 2026-11-15, under the human's blanket approval. The floor of 3 members stays; it is a privacy rule and does not change.

## Context
`privacy.md` and the brief: never show a boundary that reveals one sensor's location. A res-8 cell is about 0.74 km². Publishing its outline and a status when exactly one phone lives there tells a viewer where that phone is, to within that area, and the status change timing identifies its owner's power events.

## Decision
- Publish a scope (boundary and status) only when it has at least 3 members. Members are installs with events in the last 7 days and weight >= 0.5.
- Otherwise publish nothing and show an install invitation.
- Show the boundary of the scope used (cell, linked group or parent), never a smaller part.
- Show "3+ phones", never an exact count below 3, and never install-level data.
- `SPOT_ONLY` stays on the phone.

## Alternatives
1. **Floor of 5.** Safer against differencing attacks, delays coverage in a small field test. Not chosen for the demo.
2. **Floor of 2.** Hides single phones but exposes pairs.
3. **Fuzz boundaries by rounding to the parent for all cells.** Simple, but removes the precision story for cells with many phones.
4. **No public map until many users exist.** Breaks Judge mode and the area pages.

## Consequences
- A real demo needs at least 3 phones in a cell or parent to show any status. Judge mode uses labeled simulated data and says so.
- A viewer watching a 3-member scope over time can still learn that one of three people lost power. The floor is a starting rule, not a proof of anonymity.
- Changing the floor changes what the public sees, not what is stored, and needs the human.
