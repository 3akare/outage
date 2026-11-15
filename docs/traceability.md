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
| R3 | I1 | `I1_event_time_formula` | 4 | test written (`workers/api/test/handlers.test.ts`) |
| R5 | I2 | `I2_idempotent_any_batching` | 5 | test written (`workers/api/test/core.test.ts`) |
| R4 | I3 | `I3_elapsed_bounds` | 2 | test written (`packages/shared/test/ingest.test.ts`) |
| R6 | I4 | `I4_bucket_invariants` | 5 | test written (`workers/api/test/core.test.ts`) |
| R8 | I5 | `I5_batch_isolation` | 4 | test written (`workers/api/test/handlers.test.ts`) |
| R9.7, R10, R4.3 | I6 (supports P9) | `I6_excluded_events` | 5 | test written (`workers/api/test/core.test.ts`) |
| R9 | I7 | `I7_uploader_convergence` | 6 | planned |
| R1 | I8 | `I8_strict_schema` | 2 | test written (`packages/shared/test/ingest.test.ts`) |
| R11 | I9 | `I9_write_behind_state` | 7 | test written (`workers/api/test/core.test.ts`) |
| R7, R8, R12.1 | - | `workers/api/test/integration.test.ts` (Workers runtime) | 8 | test written |
| R12, R13 | - | `workers/api/test/delete.test.ts` | 9 | test written |

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
| R17.2, R14 | contract | `R17_outage30_confirmed_within_10s`, `R17_outage30_shape` | 16 | passing (`tools/sim/test/outage30.test.ts`) |
| R3.6 | P10 | `P10_noisy_never_confirms` | 7 | planned |
| R5.6 | P11 | `P11_sparse_never_confirms` | 9 | planned |
| R12.2 | P12 | `P12_no_stale_push` | 13 | planned |
| R1.3 | D1 | `D1_incremental_equals_sweep` | follow-up if needed | planned |
| R1 (design 11.3) | performance budget | `npm run bench -w packages/detection` (`bench/evaluate-bench.mjs`), report in ADR 0005 addendum | 17 | measured: 500 events fit |
| R5.4 | D2 | `D2_poisson_tail_accuracy` (incl. large mu) | 4 | planned |
| R13 | D3 | `D3_explanations_complete` | 13 | planned |
| R3.5, R4.3, R8 | D4 | `D4_labels` | 7 | planned |
| R16 | D5 | `D5_settle_equivalence` | 14 | planned |
| R12.3 | D6 | `D6_push_once` | 13 | planned |

## area-cells

| Requirement | Property | Test | Task | Status |
|---|---|---|---|---|
| R4.1 to R4.4 | A1 | `A1_scope_selection` | 4 | test written (`workers/api/test/area-scope.test.ts`) |
| R4.6 | A2 | `A2_no_confirmed_for_sparse_cell` | 4 | test written (`workers/api/test/area-scope.test.ts`) |
| R4.5 | A3 | `A3_open_outage_keeps_scope` | 4 | test written (`workers/api/test/area-scope.test.ts`) |
| R6.1 to R6.3 | A4 | `A4_link_rule` | 5 | test written (`workers/api/test/area-links.test.ts`) |
| R6.4, R6.6 | A5 | `A5_groups_deterministic` | 5 | test written (`workers/api/test/area-links.test.ts`) |
| R7.3, R7.4 | A6 | `A6_notice_convergence` | 7 | test written (`workers/api/test/area-neighbors.test.ts`) |
| R7.5, R8 | A7 | `A7_hints_never_confirm_alone` | 6 | test written (`workers/api/test/area-hints.test.ts`) |
| R9 | A8 | `A8_public_view_privacy` | 8 | test written (`workers/api/test/area-view.test.ts`) |
| R10 | A9 | `A9_push_dedup` | 9 | test written (`workers/api/test/area-reducer.test.ts`) |
| R3.2, R5 | A10 | `A10_move_closes_old_cell` | 3 | test written (`workers/api/test/area-members.test.ts`) |
| R12 | A11 | `A11_delete_removes_install` | 9 | test written (`workers/api/test/area-reducer.test.ts`) |
| R11 | A12 | `A12_deferred_evaluation_equivalence` | 9 | test written (`workers/api/test/area-reducer.test.ts`) |

## alerts-and-light-alarm

| Requirement | Property | Test | Task | Status |
|---|---|---|---|---|
| R1 | L1 | `L1_one_prompt_per_unplug` | 3 | planned |
| R3.1, R3.2 | L2 | `L2_ring_iff_conditions` | 3 | planned |
| R3.3, R3.5 | L3 | `L3_alarm_has_no_network` | 4 | planned |
| R2 | L4 | `L4_first_answer_wins` | 3 | planned |
| R7 | L5 | `L5_quiet_window` | 6 | planned |
| R6 | L6 | `L6_push_planning` | 6 | planned |
| R8.2, R10.2 | L7 | `L7_token_hygiene_and_delete` | 5 | planned |
| R8.1, R8.3 | L8 | `L8_batching_and_retry` | 7 | planned |
| R4.1, R4.2 | L9 | `L9_expiry_and_reboot` | 3 | planned |
| R1.4, R3 | L10 | `L10_replay_equivalence` | 3 | planned |
| R1.2, R9 | L11 | `L11_channel_config` | 4 | planned |
| R6.6, R10.5 | L12 | `L12_string_pack` | 2, 6 | test written (`apps/android/app/src/test/kotlin/app/outage/alarm/AlarmStringPackTest.kt`) |

## power-log

| Requirement | Property | Test | Task | Status |
|---|---|---|---|---|
| R1, R2 | PL1 | `PL1_timeline_pure` | 4 | planned |
| R1.2 | PL2 | `PL2_intervals_cover_time` | 4 | planned |
| R2.2, R2.4 | PL3 | `PL3_no_outage_without_evidence` | 4 | planned |
| R3 | PL4 | `PL4_daily_stats` | 6 | planned |
| R4 | PL5 | `PL5_light_score` | 6 | planned |
| R5 | PL6 | `PL6_promise_copy` | 6 | planned |
| R6 | PL7 | `PL7_freezer_guard_lifecycle` | 7 | planned |
| R1.3, R8.2 | PL8 | `PL8_no_wall_clock_upload` | 8 | planned |
| R8 | PL9 | `PL9_share_card_privacy` | 8 | planned |

## home-watch

| Requirement | Property | Test | Task | Status |
|---|---|---|---|---|
| R2.4, R2.5 | H1 | `H1_offline_never_off` | 3 | planned |
| R2.6, R2.7 | H2 | `H2_state_order_independent` | 3 | planned |
| R2.2, R2.3, R3 | H3 | `H3_non_power_events_ignored` | 3 | planned |
| R2.8 | H4 | `H4_state_independent_of_area` | 3 | planned |
| R1.2, R1.5 | H5 | `H5_pairing_rules` | 2, 4 | planned |
| R5, R8.3 | H6 | `H6_push_once_per_change` | 6 | planned |
| R6 | H7 | `H7_alarm_multiplexer` | 5 | planned |
| R1.10, R7.4 | H8 | `H8_delete_removes_pairs` | 4 | planned |

## onboarding

| Requirement | Property | Test | Task | Status |
|---|---|---|---|---|
| R1, R4.3 | O1 | `O1_flow_machine` | 3 | test written (`apps/android/app/src/test/kotlin/app/outage/onboarding/OnboardingFlowTest.kt`) |
| R3.3, R12.2 | O2 | `O2_no_coordinates_stored` | 5 | planned |
| R4.3, R5.3 | O3 | `O3_no_register_before_consent` | 3 | test written (`apps/android/app/src/test/kotlin/app/outage/onboarding/OnboardingFlowTest.kt`) |
| R7.1 | O4 | `O4_maker_matching` | 4 | test written (`apps/android/app/src/test/kotlin/app/outage/onboarding/OemGuideTest.kt`) |
| R7.3, R7.4 | O5 | `O5_guide_labels` | 4 | test written (`apps/android/app/src/test/kotlin/app/outage/onboarding/OemGuideTest.kt`) |
| R8.2, R8.6 | O6 | `O6_self_test_isolated` | 2 | planned |
| R1.5 | O7 | `O7_resume` | 3 | test written (`apps/android/app/src/test/kotlin/app/outage/onboarding/OnboardingFlowTest.kt`) |
| R10 | O8 | `O8_reonboarding_skips` | 3 | test written (`apps/android/app/src/test/kotlin/app/outage/onboarding/OnboardingFlowTest.kt`) |

## web-and-area-pages

| Requirement | Property | Test | Task | Status |
|---|---|---|---|---|
| R1.4, R3 | W1 | `W1_page_without_script` | 4, 11 | test written (`workers/api/test/web-pages.test.ts`; size budget for every page in `workers/api/test/web-routes.test.ts`) |
| R4.3, R11.1 | W2 | `W2_public_privacy` | 4, 7 | test written (`workers/api/test/web-pages.test.ts`, `workers/api/test/web-index.test.ts`) |
| R2 | W3 | `W3_five_states` | 4 | test written (`workers/api/test/web-pages.test.ts`) |
| R9 | W4 | `W4_cache_ttl` | 5 | unit tests (`workers/api/test/web-cache.test.ts`); deployed-domain check open |
| R6.4, R6.6 | W5 | `W5_replay_matches_engine` | 9 | test written (`tools/sim/test/replay.test.ts`) |
| R6.1 to R6.3, R6.5, R6.7 to R6.9, R1.3 | W6 | `W6_simulated_separation` | 10 | test written (`workers/api/test/web-judge.test.ts`) |
| R10.3, R11.5 | W7 | `W7_sitemap_robots` | 3, 8 | test written (`workers/api/test/web-catalog.test.ts`, `workers/api/test/web-routes.test.ts`) |
| R1.6, R11.2, R11.3 | W8 | `W8_headers_and_escaping` | 2 | test written (`workers/api/test/web-kit.test.ts`) |
| R4.4 | W9 | `W9_cell_page_indistinguishable` | 4 | test written (`workers/api/test/web-pages.test.ts`) |

## demo-mode

| Requirement | Property | Test | Task | Status |
|---|---|---|---|---|
| R2 | DM1 | `DM1_all_labeled` | 4 | planned |
| R4.4, R4.6 | DM2 | `DM2_default_params` | 3 | planned |
| R5 | DM3 | `DM3_no_real_writes` | 4 | planned |
| R4 | DM4 | `DM4_plan_confirms_and_restores` | 3 | planned |
| R5.6 | DM5 | `DM5_one_real_drop` | 3 | planned |
| R6 | DM6 | `DM6_sanitizer` | 2 | planned |
| R7 | DM7 | `DM7_replay_in_sync` | 5 | planned |

## field-telemetry

| Requirement | Property | Test | Task | Status |
|---|---|---|---|---|
| R1, R2 | F1 | `F1_aggregate_privacy_and_size` | 1, 4 | planned |
| R2.5, R3 | F2 | `F2_upload_idempotent` | 4, 5 | planned |
| R4 | F3 | `F3_percentiles_and_ratio` | 2 | planned |
| R5 | F4 | `F4_outage_classes` | 3 | planned |
| R6 | F5 | `F5_report_pure_and_clean` | 6 | planned |
| R8 | F6 | `F6_signature_dedup` | 6 | planned |
| R4.3, R10 | F7 | `F7_gate_statuses` | 2 | planned |
| R7.5, R6.6 | F8 | `F8_admin_auth_and_aliases` | 5 | planned |

## feasibility-probe

| Requirement | Test | Task | Status |
|---|---|---|---|
| R5, R6 (M1) | `PR1 analyze_armed_ratio` | 3 | test written (`tools/probe/analyze/test/analyze.test.ts`) |
| R5, R6 (M2) | `PR2 analyze_nearest_rank` | 3 | test written (`tools/probe/analyze/test/analyze.test.ts`) |
| R5 | `PR3 analyze_segments` | 3 | test written (`tools/probe/analyze/test/analyze.test.ts`) |
| R6 | `PR4 analyze_pairing` | 3 | test written (`tools/probe/analyze/test/analyze.test.ts`) |
| R8 | `PR5 analyze_gate` | 3 | test written (`tools/probe/analyze/test/analyze.test.ts`) |
| R3.1, R3.3 | `R3.1 stores a batch and exports it back`, `R3.1 a retried upload is harmless`, `R3.1 SQLite store` (Workers runtime) | 4 | test written (`tools/probe/worker/test/`) |
| R3.2 | `R3.2 R3.3 every route needs the token`, `R3.2 the token is required in the runtime too` | 4 | test written (`tools/probe/worker/test/`) |
| R4.3, R5 | `PR6_live_armed_ratio_matches_the_analysis_on_the_shared_sample`, `PR6_restart_gap_is_not_armed_and_reboot_gap_is_not_counted` | 5, 7 | test written (`tools/probe/android/app/src/test/`) |
| R3.1, R3.4 | `PR7_export_file_round_trips_the_shared_sample_exactly`, `PR7_upload_body_has_the_contract_shape_and_respects_the_batch_limit` | 7 | test written (`tools/probe/android/app/src/test/`) |
| R1, R2, R6 (M1 to M14 on a phone) | `docs/probe-checklist.md` | 5, 6, 8 | needs a device (task 8) |

## app-shell

| Requirement | Property | Test | Task | Status |
|---|---|---|---|---|
| R1 | AS1 | `AS1_start_routing` | 2 | test written (`apps/android/app/src/test/kotlin/app/outage/shell/RoutingTest.kt`) |
| R3.3 | AS2 | `AS2_router_back` | 2 | test written (`apps/android/app/src/test/kotlin/app/outage/shell/RoutingTest.kt`) |
| R1.3 | AS3 | `AS3_unknown_routes` | 2 | test written (`apps/android/app/src/test/kotlin/app/outage/shell/RoutingTest.kt`) |
| R6.2 | AS4 | `AS4_status_style_complete` | 3 | test written (`apps/android/app/src/test/kotlin/app/outage/shell/StatusStyleTest.kt`) |
| R2 | AS5 | `AS5_home_state` | 5 | test written (`apps/android/app/src/test/kotlin/app/outage/shell/HomeReducerTest.kt`) |
| R5 | AS6 | `AS6_delete_all` | 7 | test written (`apps/android/app/src/test/kotlin/app/outage/shell/DeleteRegistryTest.kt`) |
| R7 | AS7 | `AS7_strings` | 4 | test written (`apps/android/app/src/test/kotlin/app/outage/shell/StringPackTest.kt`) |
| R6.3 | AS8 | device check | 8 | checklist written (`docs/probe-checklist.md`, "App shell check") |

<!-- BEGIN GENERATED: detection properties (.kiro/scripts/traceability.mjs) -->
## Detection properties P1 to P12 (generated)

Scanned 0 test file(s) under packages/detection. A property counts when a test title names its ID.

| ID | Test file | Test title | Status |
|---|---|---|---|
| P1 | - | - | no tests yet |
| P2 | - | - | no tests yet |
| P3 | - | - | no tests yet |
| P4 | - | - | no tests yet |
| P5 | - | - | no tests yet |
| P6 | - | - | no tests yet |
| P7 | - | - | no tests yet |
| P8 | - | - | no tests yet |
| P9 | - | - | no tests yet |
| P10 | - | - | no tests yet |
| P11 | - | - | no tests yet |
| P12 | - | - | no tests yet |
<!-- END GENERATED -->
