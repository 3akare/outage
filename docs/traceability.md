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

## detection-engine

| Requirement | Property | Test | Task | Status |
|---|---|---|---|---|
| R6.3 | P1 | `P1_single_unplug_never_alerts` | 9 | planned |
| R6.1 | P2 | `P2_confirmed_when_k3_p_small` | 9 | planned |
| R2.3, R12.1 | P3 | `P3_order_and_delay_independence` | 15 | planned |
| R2.2 | P4 | `P4_duplicates_change_nothing` | 6 | planned |
| R10.4 | P5 | `P5_spread_replugs_never_restore` | 12 | planned |
| R10.5 | P6 | `P6_restore_needs_outage` | 12 | planned |
| R6.4 | P7 | `P7_more_drops_never_lower` | 9 | planned |
| R15 | P8 | `P8_time_shift_invariance` | 15 | planned |
| R14 | P9 | `P9_simulated_never_counts` | 6 | planned |
| R3.6 | P10 | `P10_noisy_never_confirms` | 7 | planned |
| R5.6 | P11 | `P11_sparse_never_confirms` | 9 | planned |
| R12.2 | P12 | `P12_no_stale_push` | 13 | planned |
| R1.3 | D1 | `D1_incremental_equals_sweep` | follow-up if needed | planned |
| R5.4 | D2 | `D2_poisson_tail_accuracy` | 4 | planned |
| R13 | D3 | `D3_explanations_complete` | 13 | planned |
| R3.5, R4.3, R8 | D4 | `D4_labels` | 7 | planned |
| R16 | D5 | `D5_settle_equivalence` | 14 | planned |
| R12.3 | D6 | `D6_push_once` | 13 | planned |

## area-cells

| Requirement | Property | Test | Task | Status |
|---|---|---|---|---|
| R4.1 to R4.4 | A1 | `A1_scope_selection` | 4 | planned |
| R4.6 | A2 | `A2_no_confirmed_for_sparse_cell` | 4 | planned |
| R4.5 | A3 | `A3_open_outage_keeps_scope` | 4 | planned |
| R6.1 to R6.3 | A4 | `A4_link_rule` | 5 | planned |
| R6.4, R6.6 | A5 | `A5_groups_deterministic` | 5 | planned |
| R7.3, R7.4 | A6 | `A6_notice_convergence` | 7 | planned |
| R7.5, R8 | A7 | `A7_hints_never_confirm_alone` | 6 | planned |
| R9 | A8 | `A8_public_view_privacy` | 8 | planned |
| R10 | A9 | `A9_push_dedup` | 9 | planned |
| R3.2, R5 | A10 | `A10_move_closes_old_cell` | 3 | planned |
| R12 | A11 | `A11_delete_removes_install` | 9 | planned |
| R11 | A12 | `A12_deferred_evaluation_equivalence` | 9 | planned |
