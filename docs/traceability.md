# Traceability

Links requirement, property, test and task. Tasks are filled in when `tasks.md` exists. Status values: planned, written, passing.

## sensor-android

| Requirement | Property | Test | Task | Status |
|---|---|---|---|---|
| R2.1 | S1 | `S1_records_before_reschedule` | TBD | planned |
| R3.1, R3.3, R3.4 | S2 | `S2_unplug_requires_unplugged_facts` | TBD | planned |
| R3.2 | S3 | `S3_full_battery_is_not_unplug` | TBD | planned |
| R4.1, R4.4 | S4 | `S4_replug_pairs_with_unplug` | TBD | planned |
| R5.1, R3.3 | S5 | `S5_other_stops_reschedule` | TBD | planned |
| R6.2, R6.4 | S6 | `S6_non_detection_plugs_silent` | TBD | planned |
| R9.1 | S7 | `S7_seq_monotonic_across_restarts` | TBD | planned |
| R7 | S8 | `S8_confidence_rules` | TBD | planned |

## event-ingest

| Requirement | Property | Test | Task | Status |
|---|---|---|---|---|
| R3 | I1 | `I1_event_time_formula` | 4 | planned |
| R5 | I2 (supports P4) | `I2_idempotent_any_batching` | 5 | planned |
| R4 | I3 | `I3_elapsed_bounds` | 2 | planned |
| R6 | I4 | `I4_bucket_invariants` | 5 | planned |
| R8 | I5 | `I5_batch_isolation` | 4 | planned |
| R9.7, R10, R4.3 | I6 (supports P9) | `I6_excluded_events` | 5 | planned |
| R9 | I7 | `I7_uploader_convergence` | 6 | planned |
| R1 | I8 | `I8_strict_schema` | 2 | planned |
| R11 | I9 | `I9_write_behind_state` | 7 | planned |

## station-mode

| Requirement | Property | Test | Task | Status |
|---|---|---|---|---|
| R4.2 | T1 | `T1_single_unplug_any_interleaving` | 2 | planned |
| R3.2 | T2 | `T2_receiver_unplug_any_battery` | 2 | planned |
| R3.6 | T3 | `T3_mismatch_emits_nothing` | 2 | planned |
| R3.3, R4.3 | T4 | `T4_single_replug_per_drop` | 2 | planned |
| R1.2, R4.5 | T5 (supports S7) | `T5_mode_changes_are_silent` | 2 | planned |
| R5 | T6 | `T6_heartbeat_cadence` | 2 | planned |
| R5.2 | T7 | `T7_heartbeat_vs_silence_limit` | 2 | planned |
