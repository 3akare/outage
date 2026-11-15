# Detection engine notes (work in progress)

## Design decisions not in the spec (so far)
- Sweep is one pass over events sorted by (timeMs, installId, seq). Decisions are a pure function of the retained event set + nowMs.
- Window (t-W, t]: k counts distinct eligible installs with eligible drops not attached to an already closed outage. Drop eligibility is decided at the drop's own time (weight at that time). n eligibility uses weight at the anchor time t.
- Baseline day for a window = local day of window START (t-W); hour = hour of t. Lambda uses only whole days before that day.
- Baseline day buckets are finalized when the sweep passes dayEnd+W (fixed knowledge point), so settle can fold them exactly (D5).
- Outage id = hash of earliest drop (installId, seq), time-free so P8 holds.
- Outage closes to new drops at start+12h even if nowMs is earlier; status ENDED_UNKNOWN only when nowMs > start+12h.
- Hints apply only to OPEN outages, only Possible->Confirmed (needs max k >= 3 anywhere). Hint-raise decision time = nowMs.
- Baseline human count and exposure both use eligible installs only (spec R4.3 is silent on numerator) - OPEN QUESTION.
- P8: spec says offset shifted by the same constant; mathematically the offset must move by -s (local time unchanged). Tested with offset - s. OPEN QUESTION.
- Settle cuts at a quiet time T <= nowMs - H (no outage open, no event in [T-W,T)), carrying armed state and isolated-unplug times per install.
