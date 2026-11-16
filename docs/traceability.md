# Traceability

Links requirement, property, test and task. Tasks are filled in when `tasks.md` exists. Status values: planned, written, passing.

## sensor-android

Tests in `android/outage/app/src/test/kotlin/app/outage/sensor/` (`SensorCoreTest.kt`, `SensorControllerTest.kt`). Decisions in ADR 0032 and ADR 0033.

| Requirement | Property | Test | Task | Status |
|---|---|---|---|---|
| R2.1, R4 | S1 | `S1_outage_and_restore_give_unplug_then_replug` | 4 | passing |
| R3.1, R3.3, R6 | S2 | `S2_plug_classification` | 3 | passing |
| R3.2, R3 | S3 | `S3_decision_table_every_row` | 3 | passing |
| R4.1, R4.4 | S4 | `S4_job_replug_carries_scheduling_delay` | 4 | passing |
| R5.1, R3.3, R11.2 | S5 | `S5_timeout_is_a_gap_without_receiver_and_silent_with_it`, `S5_user_stop_disarms_and_goes_idle` | 4 | passing |
| R7 | S6 | `S6_low_confidence_only_without_stop_reason` | 3 | passing |
| R9.1 | S7 | `S7_seq_strictly_increasing_across_restart_and_ack` | 5 | passing |
| R5.3, R5.4 | S8 | `S8_recovery_after_reboot_and_process_death`, `R5_4_reboot_recovery_records_gap` | 8 | passing |
| R2.3 | - | `R2_3_write_failure_is_counted_and_job_still_rescheduled` | 9 | passing |
| R13.1 to R13.3 | - | `R13_1_only_plug_changes_are_reported_not_level_ticks`, `R13_2_demo_flag_suppresses_the_prompt_only_while_open`, `R13_3_demo_flag_clears_after_30_seconds_in_the_background` | demo-mode 1 | passing (`PlugObserverTest.kt`) |
| R9.4, R9.5 | - | `R9_4_events_across_reboot_are_lost`, `R9_5_retention_drops_old_acked_events` | 5 | passing |
| R10 | - | `R10_telemetry_armed_ratio_and_gaps`, `R10_no_charging_gives_null_ratio` | 6 | passing |
| R4.3, R11 | - | `R4_3_replug_reaches_listener_in_process`, `R11_start_arms_schedules_job_and_starts_receiver` | 9 | passing |
| R8.4, R10.4 | - | `R8_blocked_receiver_is_reported` | 10 | passing |
| R12 | - | `R12_delete_all_data_erases_everything`, `R12_manifest_privacy_check` | 11 | passing |
| R9, R11 | - | `R9_contract_enum_names_match_shared_fixture`, `core/shared/test/sensor.test.ts` | 2 | passing |

## event-ingest

| Requirement | Property | Test | Task | Status |
|---|---|---|---|---|
| R3 | I1 | `I1_event_time_formula` | 4 | test written (`web/test/handlers.test.ts`) |
| R5 | I2 | `I2_idempotent_any_batching` | 5 | test written (`web/test/core.test.ts`) |
| R4 | I3 | `I3_elapsed_bounds` | 2 | test written (`core/shared/test/ingest.test.ts`) |
| R6 | I4 | `I4_bucket_invariants` | 5 | test written (`web/test/core.test.ts`) |
| R8 | I5 | `I5_batch_isolation` | 4 | test written (`web/test/handlers.test.ts`) |
| R9.7, R10, R4.3 | I6 (supports P9) | `I6_excluded_events` | 5 | test written (`web/test/core.test.ts`) |
| R9 | I7 | `I7_uploader_convergence_under_any_failure_pattern` (`android/outage/app/src/test/kotlin/app/outage/net/UploaderTest.kt`) | 6 | test written |
| R1 | I8 | `I8_strict_schema` | 2 | test written (`core/shared/test/ingest.test.ts`) |
| R11 | I9 | `I9_write_behind_state` | 7 | test written (`web/test/core.test.ts`) |
| R7, R8, R12.1 | - | `web/test/integration.test.ts` (Workers runtime) | 8 | test written |
| R12, R13 | - | `web/test/delete.test.ts` | 9 | test written |
| R2, R9, R12 | I7 | `I1_register_parses_install_id_and_token`, `I7_events_ok_retry_and_auth_header`, `I7_sensor_outbox_adds_cell_and_waits_without_one`, `I7_uploader_drains_sensor_end_to_end`, `R12_delete_refuses_malformed_ids` (`android/outage/app/src/test/kotlin/app/outage/net/IngestApiTest.kt`) | 10 | passing |

## station-mode

Tests in `android/outage/app/src/test/kotlin/app/outage/sensor/SensorCoreTest.kt`.

| Requirement | Property | Test | Task | Status |
|---|---|---|---|---|
| R4.2 | T1 | `T1_T4_single_unplug_and_replug_any_interleaving` | 2 | passing |
| R3.2 | T2 | `T2_receiver_unplug_any_battery` | 2 | passing |
| R3.6 | T3 | `T3_mismatch_emits_nothing` | 2 | passing |
| R3.3, R4.3 | T4 | `T1_T4_single_unplug_and_replug_any_interleaving` | 2 | passing |
| R1.2, R4.5 | T5 (supports S7) | `T5_mode_changes_are_silent` | 2 | passing |
| R5 | T6 | `T6_heartbeat_only_while_armed` | 2 | passing |
| R5.2 | T7 | `T7_heartbeat_vs_silence_limit` | 2 | passing |

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
| R1 (design 11.3) | performance budget | `npm run bench -w core/detection` (`bench/evaluate-bench.mjs`), report in ADR 0005 addendum | 17 | measured: 500 events fit |
| R5.4 | D2 | `D2_poisson_tail_accuracy` (incl. large mu) | 4 | planned |
| R13 | D3 | `D3_explanations_complete` | 13 | planned |
| R3.5, R4.3, R8 | D4 | `D4_labels` | 7 | planned |
| R16 | D5 | `D5_settle_equivalence` | 14 | planned |
| R12.3 | D6 | `D6_push_once` | 13 | planned |

## area-cells

| Requirement | Property | Test | Task | Status |
|---|---|---|---|---|
| R4.1 to R4.4 | A1 | `A1_scope_selection` | 4 | test written (`web/test/area-scope.test.ts`) |
| R4.6 | A2 | `A2_no_confirmed_for_sparse_cell` | 4 | test written (`web/test/area-scope.test.ts`) |
| R4.5 | A3 | `A3_open_outage_keeps_scope` | 4 | test written (`web/test/area-scope.test.ts`) |
| R6.1 to R6.3 | A4 | `A4_link_rule` | 5 | test written (`web/test/area-links.test.ts`) |
| R6.4, R6.6 | A5 | `A5_groups_deterministic` | 5 | test written (`web/test/area-links.test.ts`) |
| R7.3, R7.4 | A6 | `A6_notice_convergence` | 7 | test written (`web/test/area-neighbors.test.ts`) |
| R7.5, R8 | A7 | `A7_hints_never_confirm_alone` | 6 | test written (`web/test/area-hints.test.ts`) |
| R9 | A8 | `A8_public_view_privacy` | 8 | test written (`web/test/area-view.test.ts`) |
| R10 | A9 | `A9_push_dedup` | 9 | test written (`web/test/area-reducer.test.ts`) |
| R3.2, R5 | A10 | `A10_move_closes_old_cell` | 3 | test written (`web/test/area-members.test.ts`) |
| R12 | A11 | `A11_delete_removes_install` | 9 | test written (`web/test/area-reducer.test.ts`) |
| R11 | A12 | `A12_deferred_evaluation_equivalence` | 9 | test written (`web/test/area-reducer.test.ts`) |

## alerts-and-light-alarm

| Requirement | Property | Test | Task | Status |
|---|---|---|---|---|
| R1 | L1 | `L1_one_prompt_per_unplug` | 3 | test written (`android/outage/app/src/test/kotlin/app/outage/alarm/AlarmPolicyTest.kt`) |
| R3.1, R3.2 | L2 | `L2_ring_iff_conditions` | 3 | test written (`android/outage/app/src/test/kotlin/app/outage/alarm/AlarmPolicyTest.kt`) |
| R3.3, R3.5 | L3 | `L3_alarm_has_no_network` | 4 | test written (`android/outage/app/src/test/kotlin/app/outage/alarm/AlarmAdaptersTest.kt`) |
| R2 | L4 | `L4_first_answer_wins` | 3 | test written (`android/outage/app/src/test/kotlin/app/outage/alarm/AlarmPolicyTest.kt`) |
| R7 | L5 | `L5_quiet_window` | 6 | done (`web/test/alerts-planner.test.ts`) |
| R6 | L6 | `L6_push_planning` | 6 | done (`web/test/alerts-planner.test.ts`) |
| R8.2, R10.2 | L7 | `L7_token_hygiene_and_delete` | 5 | done (`web/test/alerts-server.test.ts`, `alerts-sql.test.ts`) |
| R8.1, R8.3 | L8 | `L8_batching_and_retry` | 7 | done (`web/test/alerts-fcm.test.ts`) |
| R4.1, R4.2 | L9 | `L9_expiry_and_reboot` | 3 | test written (`android/outage/app/src/test/kotlin/app/outage/alarm/AlarmPolicyTest.kt`) |
| R1.4, R3 | L10 | `L10_replay_equivalence` | 3 | test written (`android/outage/app/src/test/kotlin/app/outage/alarm/AlarmPolicyTest.kt`) |
| R1.2, R9 | L11 | `L11_channel_config` | 4 | test written (`android/outage/app/src/test/kotlin/app/outage/alarm/AlarmAdaptersTest.kt`) |
| R5, R6.1, R6.2, R7, R9 | L13 | `FollowTest` (request shape against the shared schema, quiet window wrap) | 8 | test written (`android/outage/app/src/test/kotlin/app/outage/net/FollowTest.kt`) |
| all | L14 | `simulated_outage_push_plan` | 9 | done (`tools/sim/test/push-plan.test.ts`) |
| R6.6, R10.5 | L12 | `L12_string_pack` | 2, 6 | server texts tested in `web/test/alerts-planner.test.ts`; Android test written (`android/outage/app/src/test/kotlin/app/outage/alarm/AlarmStringPackTest.kt`) |

## power-log

| Requirement | Property | Test | Task | Status |
|---|---|---|---|---|
| R1, R2 | PL1 | `PL1_timeline_pure` | 4 | code done (`TimelineBuilder`); test not written (human asked for no more tests, 2026-11-23) |
| R1.2 | PL2 | `PL2_intervals_cover_time` | 4 | code done; test not written (same) |
| R2.2, R2.4 | PL3 | `PL3_no_outage_without_evidence` | 4 | code done; test not written (same) |
| R3 | PL4 | `PL4_daily_stats` | 6 | code done (`Stats`); test not written (same) |
| R4 | PL5 | `PL5_light_score` | 6 | code done; test not written (same) |
| R5 | PL6 | `PL6_promise_copy` | 6 | code done (`Stats.promiseText` checks its own words); test not written (same) |
| R5.5 | - (band config + copy) | `BandConfigTest` (`android/outage/app/src/test/kotlin/app/outage/log/BandConfigTest.kt`) | 3 | test written |
| R6 | PL7 | `PL7_freezer_guard_lifecycle` | 7 | code done (`FreezerRules`, `FreezerGuard`, ADR 0038); test not written (same); device checks in `docs/probe-checklist.md` |
| R1.3, R8.2 | PL8 | `PL8_no_wall_clock_upload` | 8 | code done: the log database is never uploaded and `REPORT` carries `kind` only (`SensorOutbox.toPending`); test not written (same) |
| R8 | PL9 | `PL9_share_card_privacy` | 8, 9 | code done: `ShareFacts` has no location, area, install ID or name; text in `ShareCardText`, picture in `ShareCardImage` (ADR 0040); test not written (same) |
| R1.6 | - | delete-my-data clears the log, settings, Freezer Guard alarm and cached share picture | 10 | done: `OutageApp.registerPowerLog` registers `power_log`; no dedicated test (same) |
| R7, R10 | - | Power Log screen, taps, rate limit | 8 | done: `PowerLogScreen`, `LogRecorder` (ADR 0039); no dedicated test (same) |

## home-watch

| Requirement | Property | Test | Task | Status |
|---|---|---|---|---|
| R2.4, R2.5 | H1 | `H1_offline_never_off` | 3 | passing (`core/shared/test/home.test.ts`) |
| R2.6, R2.7 | H2 | `H2_state_order_independent` | 3 | passing (`core/shared/test/home.test.ts`) |
| R2.2, R2.3, R3 | H3 | `H3_non_power_events_ignored` | 1, 3 | task 1 passing (`web/test/home-heartbeat.test.ts`, Kotlin `T6_heartbeat_only_while_armed`, `R3_2_battery_heartbeat_is_not_a_gap`); task 3 passing (`core/shared/test/home.test.ts`) |
| R2.8 | H4 | `H4_state_independent_of_area` | 3 | passing (`core/shared/test/home.test.ts`) |
| R1.2, R1.3, R1.5 | H5 (pure part) | `H5_pairing_rules` | 2 | passing (`core/shared/test/pairing.test.ts`) |
| R1.1 to R1.6, R1.9, R7.2 | H5 (Worker part) | `H5_pairing_rules` | 4 | passing (`web/test/pairing.test.ts`) |
| R5, R8.3 | H6 | `H6_push_once_per_change` | 6 | passing (`web/test/home-watch.test.ts`, `home-sql.test.ts`) |
| R6, R8.1, R8.2 | H7 | `H7_alarm_multiplexer` | 5 | passing (`web/test/home-watch.test.ts`) |
| R4, R7.5 | viewer API | `viewer API GET /v1/home/:pairId` | 7 | passing (`web/test/home-watch.test.ts`, shape in `core/shared/test/home.test.ts`) |
| R1.1, R1.4, R1.8 to R1.10, R4, R7.6, R9 | app screens | `R1_4_claim_sends_the_normalized_code_and_no_push_token_and_stores_the_name_locally`, `R4_2_fixture_states_map_to_the_spec_wording`, `R4_4_a_failed_refresh_keeps_the_cached_state_and_marks_it_stale`, `R1_9_station_lists_every_pair_and_removes_a_dead_viewer`, `H5_R1_5_every_failed_claim_gives_the_same_answer`, `H8_R7_4_delete_lists_the_viewer_pair_ids` | 8 | passing (`android/outage/app/src/test/kotlin/app/outage/home/HomeWatchTest.kt`; station list and no-push token: `web/test/home-watch.test.ts`) |
| R2.4 to R2.7 | H1, H2 (scenario) | `H1_offline_never_off: power off with the router down ...`, `H2_state_order_independent: power back before the router ...`, `H1_offline_never_off and H2_state_order_independent: any cut, outage, router delay and upload order` | 9 | passing (`tools/sim/test/home-scenario.test.ts`) |
| R5.1 | push latency on devices | `docs/probe-checklist.md` Home Watch step 6 | 9 | open: needs Firebase Messaging in the app (ADR 0045) and two phones; left for the human |
| R1.10, R7.4 | H8 (pair part) | `H8_delete_removes_pairs`, `R1.10 remove a pair` | 4 | passing (`web/test/pairing.test.ts`; state parts: `H8_delete_removes_pairs (state parts, R7.3, R7.4)` in `web/test/home-watch.test.ts`) |

## onboarding

| Requirement | Property | Test | Task | Status |
|---|---|---|---|---|
| R1, R4.3 | O1 | `O1_flow_machine` | 3 | test written (`android/outage/app/src/test/kotlin/app/outage/onboarding/OnboardingFlowTest.kt`) |
| R3.3, R12.2 | O2 | `O2_no_coordinates_stored` | 5 | test written (`android/outage/app/src/test/kotlin/app/outage/onboarding/SpotAndChecksTest.kt`) |
| R4.3, R5.3 | O3 | `O3_no_register_before_consent` | 3 | test written (`android/outage/app/src/test/kotlin/app/outage/onboarding/OnboardingFlowTest.kt`) |
| R7.1 | O4 | `O4_maker_matching` | 4 | test written (`android/outage/app/src/test/kotlin/app/outage/onboarding/OemGuideTest.kt`) |
| R7.3, R7.4 | O5 | `O5_guide_labels` | 4 | test written (`android/outage/app/src/test/kotlin/app/outage/onboarding/OemGuideTest.kt`) |
| R8.2, R8.6 | O6 | `O6_self_test_isolated` | 2 | test written (`android/outage/app/src/test/kotlin/app/outage/sensor/SelfTestAndLabelTest.kt`) |
| R1.5 | O7 | `O7_resume` | 3 | test written (`android/outage/app/src/test/kotlin/app/outage/onboarding/OnboardingFlowTest.kt`) |
| R10 | O8 | `O8_reonboarding_skips` | 3 | test written (`android/outage/app/src/test/kotlin/app/outage/onboarding/OnboardingFlowTest.kt`) |
| R6.5 | O9 | `alarmCheckListsEveryFactAndHidesRegisteredWhenTrue` | 6 | test written (`android/outage/app/src/test/kotlin/app/outage/onboarding/SpotAndChecksTest.kt`) |
| R3.2, R3.4, R3.8 | O10 | `firstResultWins`, `mockedPositionAsksForConfirmation` | 5 | test written (`android/outage/app/src/test/kotlin/app/outage/onboarding/SpotAndChecksTest.kt`) |

## web-and-area-pages

| Requirement | Property | Test | Task | Status |
|---|---|---|---|---|
| R1.4, R3 | W1 | `W1_page_without_script` | 4, 11 | test written (`web/test/web-pages.test.ts`; size budget for every page in `web/test/web-routes.test.ts`; 390 px visual check `web/visual/check.mjs`, ADR 0019) |
| R4.3, R11.1 | W2 | `W2_public_privacy` | 4, 7 | test written (`web/test/web-pages.test.ts`, `web/test/web-index.test.ts`) |
| R2 | W3 | `W3_five_states` | 4 | test written (`web/test/web-pages.test.ts`) |
| R9 | W4 | `W4_cache_ttl` | 5 | unit tests (`web/test/web-cache.test.ts`); deployed-domain check done 2026-11-21 (curl) and in `.github/workflows/deploy-worker.yml` "Post-deploy header check" |
| R6.4, R6.6 | W5 | `W5_replay_matches_engine` | 9 | test written (`tools/sim/test/replay.test.ts`) |
| R6.1 to R6.3, R6.5, R6.7 to R6.9, R1.3 | W6 | `W6_simulated_separation` | 10 | test written (`web/test/web-replay.test.ts`) |
| R10.3, R11.5 | W7 | `W7_sitemap_robots` | 3, 8 | test written (`web/test/web-catalog.test.ts`, `web/test/web-routes.test.ts`) |
| R1.6, R11.2, R11.3 | W8 | `W8_headers_and_escaping` | 2 | test written (`web/test/web-kit.test.ts`) |
| R4.4 | W9 | `W9_cell_page_indistinguishable` | 4 | test written (`web/test/web-pages.test.ts`) |

## demo-mode

| Requirement | Property | Test | Task | Status |
|---|---|---|---|---|
| R2 | DM1 | `DM1_all_labeled_the_loader_refuses_any_object_without_simulated_true`, `DM1_all_labeled_every_session_view_carries_the_banner` | 4 | passing (`android/outage/app/src/test/kotlin/app/outage/demo/DemoSessionTest.kt`) |
| R4.4, R4.6 | DM2 | `DM2_default_params` | 3 | test written (`tools/sim/test/scenario.test.ts`) |
| R5 | DM3 | `DM3_no_real_writes_demo_sources_import_only_the_parser_and_their_own_package` | 4 | passing (`DemoArchitectureTest.kt`; a source-import check of `app/outage/demo`, not a before-and-after diff of the stores) |
| R4 | DM4 | `DM4_plan_confirms_and_restores` | 3 | test written (`tools/sim/test/scenario.test.ts`) |
| R5.6 | DM5 | `DM5_one_real_drop` | 3, 4 | test written (`tools/sim/test/scenario.test.ts`); app side passing (`DM5_one_real_drop_the_judge_only_or_none_in_simulate_mode`) |
| R4.5, R4.7, R4.8 | - | `R4_5_confirmed_shows_within_5_seconds_of_the_unplug_then_restored_after_the_replug`, `R4_7_an_early_replug_shows_every_unplug_frame_first`, `R4_8_demo_alarm_is_due_once_after_restored_only_if_the_judge_said_yes` | 4 | passing (`DemoSessionTest.kt`) |
| R6 | DM6 | `DM6_sanitizer` | 2 | test written (`tools/sim/test/sanitize.test.ts`) |
| R7 | DM7 | `DM7_replay_in_sync_the_app_asset_is_the_file_the_worker_serves` (app side), `W5_replay_matches_engine` (build side) | 5 | passing (`android/outage/app/src/test/kotlin/app/outage/demo/ReplayPlayerTest.kt`, `tools/sim/test/replay.test.ts`) |
| R1.1, R1.2, R1.4, R4.1, R4.2, R4.8, R4.9, R5.4 | - | `R4_1_R4_2_a_real_unplug_on_the_unplug_page_starts_the_track_and_opens_the_demo_prompt`, `R4_9_simulate_buttons_do_the_same_labelled_simulated_and_no_alarm_without_yes`, `R1_4_R5_4_leaving_discards_everything_and_back_goes_to_judge_home_first`, `design_9_a_missing_replay_file_shows_the_error_and_offers_no_simulate_button`, `R2_1_every_page_state_carries_a_simulated_label` | 6 | passing (`android/outage/app/src/test/kotlin/app/outage/demo/JudgeFlowTest.kt`); time to Confirmed on 3 phones is task 7 (device, left for the human) |
| R3.3 to R3.5 | - | `R3_4_R3_5_play_reaches_every_state_including_your_spot_only`, `R3_3_pause_restart_and_speed`, `R3_a_run_at_1x_takes_about_15_seconds_like_the_web_player` | 5 | passing (`ReplayPlayerTest.kt`) |

## field-telemetry

| Requirement | Property | Test | Task | Status |
|---|---|---|---|---|
| R1, R2, R3.4 | F1 | `F1_aggregate_privacy_and_size` | 1, 4 | schema part passing (`core/shared/test/device-day.test.ts`); Kotlin part planned (task 4) |
| R2.5, R3 | F2 | `F2_upload_idempotent` | 4, 5 | server part passing (`web/test/telemetry.test.ts`, `web/test/telemetry-integration.test.ts`); client part planned (task 4) |
| R4 | F3 | `F3_percentiles_and_ratio` | 2 | passing (`core/shared/test/field-metrics.test.ts`) |
| R5 | F4 | `F4_outage_classes` | 3 | passing (`core/shared/test/field-outage.test.ts`, `web/test/area-field.test.ts`) |
| R6 | F5 | `F5_report_pure_and_clean` | 6 | passing (`tools/field/test/report.test.ts`, golden files in `tools/field/test/golden/`) |
| R8 | F6 | `F6_signature_dedup` | 6 | passing (`tools/field/test/failures.test.ts`, `tools/field/test/cli.test.mjs`) |
| R4.3, R10 | F7 | `F7_gate_statuses` | 2 | passing (`core/shared/test/field-metrics.test.ts`) |
| R7.5, R6.6 | F8 | `F8_admin_auth_and_aliases` | 5 | passing (`web/test/telemetry.test.ts`, `web/test/telemetry-integration.test.ts`) |
| R7 | (no property) | `R7.2 the schedule record`, `dry run of the scheduled procedure on a recorded day` | 7 | passing (`tools/field/test/schedule.test.mjs`) |

## feasibility-probe

| Requirement | Test | Task | Status |
|---|---|---|---|
| R5, R6 (M1) | `PR1 analyze_armed_ratio` | 3 | test written (`android/probe/analyze/test/analyze.test.ts`) |
| R5, R6 (M2) | `PR2 analyze_nearest_rank` | 3 | test written (`android/probe/analyze/test/analyze.test.ts`) |
| R5 | `PR3 analyze_segments` | 3 | test written (`android/probe/analyze/test/analyze.test.ts`) |
| R6 | `PR4 analyze_pairing` | 3 | test written (`android/probe/analyze/test/analyze.test.ts`) |
| R8 | `PR5 analyze_gate` | 3 | test written (`android/probe/analyze/test/analyze.test.ts`) |
| R3.1, R3.3 | `R3.1 stores a batch and exports it back`, `R3.1 a retried upload is harmless`, `R3.1 SQLite store` (Workers runtime) | 4 | test written (`android/probe/worker/test/`) |
| R3.2 | `R3.2 R3.3 every route needs the token`, `R3.2 the token is required in the runtime too` | 4 | test written (`android/probe/worker/test/`) |
| R4.3, R5 | `PR6_live_armed_ratio_matches_the_analysis_on_the_shared_sample`, `PR6_restart_gap_is_not_armed_and_reboot_gap_is_not_counted` | 5, 7 | test written (`android/probe/app/src/test/`) |
| R3.1, R3.4 | `PR7_export_file_round_trips_the_shared_sample_exactly`, `PR7_upload_body_has_the_contract_shape_and_respects_the_batch_limit` | 7 | test written (`android/probe/app/src/test/`) |
| R1 (ADR 0001: immediate reschedule, no OS backoff) | `R1_onStopJob_never_uses_the_os_backoff_policy`, `R1_reschedules_immediately_while_the_sensor_is_on`, `R1_does_not_reschedule_after_the_sensor_is_stopped` | 5 (fix 2026-11-15) | test written (`android/probe/app/src/test/RestartPolicyTest.kt`); phone rerun needed (task 8) |
| R1, R2, R6 (M1 to M14 on a phone) | `docs/probe-checklist.md` | 5, 6, 8 | needs a device (task 8) |

## app-shell

| Requirement | Property | Test | Task | Status |
|---|---|---|---|---|
| R1 | AS1 | `AS1_start_routing` | 2 | test written (`android/outage/app/src/test/kotlin/app/outage/shell/RoutingTest.kt`) |
| R3.3 | AS2 | `AS2_router_back` | 2 | test written (`android/outage/app/src/test/kotlin/app/outage/shell/RoutingTest.kt`) |
| R1.3 | AS3 | `AS3_unknown_routes` | 2 | test written (`android/outage/app/src/test/kotlin/app/outage/shell/RoutingTest.kt`) |
| R6.2 | AS4 | `AS4_status_style_complete` | 3 | test written (`android/outage/app/src/test/kotlin/app/outage/shell/StatusStyleTest.kt`) |
| R2 | AS5 | `AS5_home_state` | 5 | test written (`android/outage/app/src/test/kotlin/app/outage/shell/HomeReducerTest.kt`) |
| R5 | AS6 | `AS6_delete_all` | 7 | test written (`android/outage/app/src/test/kotlin/app/outage/shell/DeleteRegistryTest.kt`) |
| R7 | AS7 | `AS7_strings` | 4 | test written (`android/outage/app/src/test/kotlin/app/outage/shell/StringPackTest.kt`) |
| R6.3 | AS8 | device check | 8 | checklist written (`docs/probe-checklist.md`, "App shell check") |

## app-map-insights

| Requirement | Property | Test | Task | Status |
|---|---|---|---|---|
| R2.1, R2.2 | AM1 | `am1_floor_*` | 2 | test written (`android/outage/app/src/test/kotlin/app/outage/map/MapTest.kt`) |
| R1.4, R1.5 | AM2 | `am2_*` | 2 | test written (`MapTest.kt`) |
| R1.6 | AM3 | `am3_*` | 2 | test written (`MapTest.kt`) |
| R1.9, R3.1 | AM4 | `am4_*` | 2 | test written (`MapTest.kt`) |
| R1.7, R6.2 | AM5 | `am5_every_state_has_its_own_pattern_and_existing_strings` | 3 | test written (`android/outage/app/src/test/kotlin/app/outage/map/MapSourceTest.kt`) |
| R1.8 | - | `labels_that_overlap_or_leave_the_view_are_dropped_in_priority_order` | 3 | test written (`MapSourceTest.kt`) |
| R4, R5.2, R11.4 | AM6 | `am6_a_simulated_map_never_writes_the_cache`, `real_map_is_cached_and_used_when_the_network_fails` | 5 | test written (`MapSourceTest.kt`) |
| R2, R11.2 | AM7 | `M1_floor` (Vitest `web/test/map-json.test.ts`), `the_shared_fixture_parses_with_every_state_the_worker_emits` (`MapContractTest.kt`) | 1 | tests pass |
| R5, R10 | - | `a_set_api_base_gives_the_real_source_with_an_empty_state`, `a_blank_api_base_keeps_the_labelled_demo` (`InsightsTest.kt`) | 6 | tests pass; task 6 open until the Power Log timeline exists |
| R7 | IN1 | `in1_power_plus_outage_equals_observed_for_any_order_of_intervals` | 4 | test written (`android/outage/app/src/test/kotlin/app/outage/insights/InsightsTest.kt`) |
| R8 | IN2 | `in2_heatmap_shares_are_in_range_and_rare_slots_are_null` | 4 | test written (`InsightsTest.kt`) |
| R8 | IN3 | `in3_weekly_trend_has_twelve_entries_in_order_with_null_for_no_data` | 4 | test written (`InsightsTest.kt`) |
| R7, R10 | IN4 | `in4_days_without_enough_coverage_are_null_not_zero` | 4 | test written (`InsightsTest.kt`) |
| R7, R8 | IN5 | `in5_day_edges_follow_the_time_zone_across_a_dst_change` | 4 | test written (`InsightsTest.kt`) |
| R9 | IN6 | `in6_promise_text_never_uses_forbidden_words_and_says_estimate` | 4 | test written (`InsightsTest.kt`) |
| R12.1, R12.2 | AS1 | `AS1_start_routing_parses_known_routes` (insights) | 10 | test written (`RoutingTest.kt`) |
| R12.3 | AS7 | `AS7_strings_*` | 10 | test written (`StringPackTest.kt`) |
| R1, R3, R6.1, R6.3, R7, R8 | - | drawing, gestures, TalkBack | 7 to 10, 12 | screens built (`ui/MapScreen.kt`, `ui/InsightsScreen.kt`, `ui/charts/`); emulator check is task 12 |

<!-- BEGIN GENERATED: detection properties (.kiro/scripts/traceability.mjs) -->
## Detection properties P1 to P12 (generated)

Scanned 15 test file(s) under core/detection. A property counts when a test title names its ID.

| ID | Test file | Test title | Status |
|---|---|---|---|
| P1 | `core/detection/test/levels.test.ts` | P1_single_unplug_never_alerts | test written |
| P2 | `core/detection/test/levels.test.ts` | P2_confirmed_when_k3_p_small | test written |
| P3 | `core/detection/test/whole.test.ts` | P3_order_and_delay_independence | test written |
| P4 | `core/detection/test/merge.test.ts` | P4_duplicates_change_nothing | test written |
| P5 | `core/detection/test/restore.test.ts` | P5_spread_replugs_never_restore | test written |
| P6 | `core/detection/test/restore.test.ts` | P6_restore_needs_outage | test written |
| P7 | `core/detection/test/levels.test.ts` | P7_more_drops_never_lower | test written |
| P8 | `core/detection/test/whole.test.ts` | P8_time_shift_invariance | test written |
| P9 | `core/detection/test/merge.test.ts` | P9_simulated_never_counts | test written |
| P10 | `core/detection/test/weights.test.ts` | P10_noisy_never_confirms | test written |
| P11 | `core/detection/test/levels.test.ts` | P11_sparse_never_confirms | test written |
| P12 | `core/detection/test/decisions.test.ts` | P12_no_stale_push | test written |
<!-- END GENERATED -->
| R4, R2 (app-map-insights), W7 | M1 | `map.json with an unlisted catalog` (`web/test/map-json.test.ts`) | 1 | test written: unlisted catalog cells are NO_DATA on the map, `/area/<slug>` stays 404 |

## ux-redesign

| Requirement | Property | Test | Task | Status |
|---|---|---|---|---|
| R3.1, R3.2 | UX1 | dock list (web and Kotlin) | 4, 6 | web done (web-app.test.ts); Kotlin dock is three items in `ui/Shell.kt`, old `log` and `area` links map to Insights and Home (RoutingTest); no JVM test for the dock list itself |
| R7.3, R8.5 | UX2 | replica and simulation data separation | 4, 5 | done: web-app.test.ts, web-replay.test.ts (W6) |
| R9.2 | UX3 | token compare test | 2 | done: `.kiro/scripts/test/tokens.test.mjs`; `ui/Tokens.kt`, `tokens.css` and `tokens.gen.ts` are generated |
| R10.1 | UX4 | no other origin on any route | 3 | done: web/test/web-app.test.ts |
| R8.1 | UX5 | simulation banner in every state | 5 | done: web-replay.test.ts, visual check plays every state |
| R2.7 | UX6 | empty map renders honest empty state | 4 | done: web-app.test.ts |
| R2.4 | UX7 | floor looks like no data | 4 | done: web-app.test.ts (fast-check) |
| R1.1, R1.2 | UX8 | first-run model | 7 | done on the phone: OnboardingFlowTest UX8_first_run_*, RoutingTest; on-device check and screenshots wait for the Kiro IDE pass (task 9) |
| R6.1, R6.3, R6.4 | UX9 | landing content | 3 | done: web-app.test.ts |
| R1 to R10 | - | spec, ADRs 0026 to 0028, steering | 1 | done (docs) |
| - | - | ADR 0032: receiver primary, job backup (sensor-android and station-mode amended) | sensor-android 1 to 12, station-mode 1 to 8 | docs done; code not started |

| R17 | - | golden fixture replay | detection-engine 18 | harness done: `core/detection/test/golden.test.ts`; no fixtures until the field test |
| R7.4, R7.5 | - | REPORT event and manual hint count | power-log 1 | done: code and fixture, ADR 0042; no dedicated test yet |
| R1 | - | local RAW_INPUT store, migrations | power-log 2 | done: code, ADR 0043; no dedicated test yet |
| R1, R2, R7.2 | PL1, PL2, PL3 | TimelineBuilder | power-log 4 | code done; tests PL1 to PL3 not written |
| R9 | - | public outage endpoint and phone sync | power-log 5 | done: Worker tests in web-routes.test.ts (empty when not public); phone sync not tested |
| R3, R4, R5 | PL4, PL5, PL6 | Stats | power-log 6 | code done; tests PL4 to PL6 not written |
| R6 | PL7 | Freezer Guard | power-log 7 | code done, ADR 0038; test PL7 not written |
| R7, R10 | - | Power Log screen and sensor wiring | power-log 8 | code done, ADR 0039; tests PL8, PL9 not written |
| R8 | PL9 | image share card | power-log 9 | code done, ADR 0040 |
| R1.6 | - | delete-my-data for the log | power-log 10 | code done |
| R5, R10 | IN | real Power Log in Insights, 12-week demo | app-map-insights 6 | done, ADR 0039; demo-days assertion updated to 84 |
| R1, R2 | F1, F2 (client) | phone aggregator and daily uploader | field-telemetry 4 | code done, ADR 0041; Kotlin tests F1, F2 not written (human asked for no more tests); consent through `TelemetryConsent` |

## material-redesign

| Requirement | Property | Test | Task | Status |
|---|---|---|---|---|
| R1.1 to R1.4 | MD1 | every Material 3 role and status colour in CSS and Kotlin | 2 | done: `.kiro/scripts/test/tokens.test.mjs` |
| R1.5, R2.1 to R2.3 | MD2 | generated icon files current, mark inside the safe circle, one-colour themed layer | 3 | done: `.kiro/scripts/test/icon.test.mjs` |
| R4.4 | MD3 | bar order Insights, Home, Settings; opens on Home | 5, 6 | done: `web/test/web-app.test.ts`, `MaterialShellTest` (JUnit) |
| R3.1 to R3.5 | MD4 | first run permissions and cell-only storage | 6 | done: `MaterialShellTest` (JUnit, source checks) and the existing O2 and manifest tests; device run waits for task 7 |
| R5.2, R5.3 | MD5 | app in the browser reads only the replay | 5 | done: `web/test/web-replay.test.ts` (W6), `web/test/web-app.test.ts` |
| R5.1 | MD6 | store buttons only when configured | 4 | done: `web/test/web-app.test.ts` |
| R5.5 | MD7 | no other origin, no inline style, size | 4 | done: `web/test/web-app.test.ts`, `web/test/web-kit.test.ts` |
| R5.4 | MD8 | old `/app` addresses redirect | 5 | done: `web/test/web-app.test.ts` |
| R1 to R5 | - | spec, ADRs 0048 to 0050, steering | 1 | done (docs) |
| R3, R4 | - | device screenshots and TalkBack | 7 | not done: needs a phone or emulator |
| R6.1, R6.2 | ML1 | hex GeoJSON per block | 13, 14 | done: `HexGeoJsonTest` (JUnit), `web/test/web-app.test.ts`; screens on a device wait for task 7 |
| R6.3 | ML2 | only OpenFreeMap, only on map pages | 13 | done: `web/test/web-app.test.ts`, `web/visual/check.mjs` |
| R6.4 | ML3 | Insights sums | 13, 14 | done: `web/test/web-insights.test.ts`, `AreaHistoryTest` (JUnit) |
| R6.4 | ML4 | simulated history current and shared | 13 | done: `.kiro/scripts/test/demo-city.test.mjs` |
| R1, R2 | - | night palette, new mark, Material skill removed | 8 | done: `tokens.test.mjs`, `icon.test.mjs` |
| R4, R5 | - | real Lagos city, Hallmark Midnight, Mona Sans | 11, 12 | done: `demo-city.test.mjs`, `MapTest`, `web-app.test.ts` (real places, font, stamp); sloplint not run in the cloud session |
