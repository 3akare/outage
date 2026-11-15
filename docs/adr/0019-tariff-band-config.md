# ADR 0019: Tariff band config and its verification status

Status: ACCEPTED (2026-11-15, under the blanket approval).

## Context
Power Log compares a user's logged hours of power with their NERC tariff band's promised minimum (power-log R5). The band list must live in a config file with sources and a checked date (R5.5), and the claims rules forbid inventing a number or implying compensation. The service-based bands are widely reported as A 20 h, B 16 h, C 12 h, D 8 h, E 4 h minimum per day, but NERC's authoritative MYTO orders are published as PDFs, which the build tooling (web_fetch) cannot read as text. Only NERC's HTML-indexed notices could be read.

## Decision
- Ship `apps/android/app/src/main/assets/bands.json` as the single config file: a top-level checked date and official-source list, and per band the promised minimum hours, a `verified` flag, an `officialSource`, supporting `sources`, a checked date, and a provenance `note`.
- Mark a band `verified: true` only when its figure or boundary appears in a NERC source readable as text. That is true only for Band C: NERC's 2021 public notice and 2020 press release state that bands D and E are served less than an average of 12 hours per day, which fixes Band C's floor at 12 hours.
- Mark Bands A, B, D and E `verified: false`. Their exact figures are from news reports; Band A also carries NERC's April 2024 Band A order as `officialSource`, but the explicit 20-hour number is not in readable NERC text.
- `BandConfig.validate()` requires every band to carry at least one source, https sources, a valid date and a provenance note, and requires a `verified` band to cite an https `nerc.gov.ng` source. The UI (task 8) and Stats (task 6) must show unverified bands as unconfirmed, never as a firm promise. Promise copy is always labelled an estimate and never uses refund, compensation or claim (R5.4, PL6).

## Alternatives
1. Mark all five bands verified from the secondary consensus. Rejected: overclaims against the claims rules; no readable official text for four of them.
2. Mark all five unverified. Honest but needlessly drops the one figure (12 h) that a readable NERC notice does confirm.
3. Omit unconfirmed bands. Rejected: the picker needs all five, and hiding them loses the sourced estimates.

## Consequences
- Four of five bands are unconfirmed until the human reads the NERC MYTO order PDFs and flips `verified` (the step power-log design section 2 already assigns to the human). The feature still works: unverified bands are shown with the "not confirmed with NERC yet" copy.
- No number is presented as official without an official readable source. Changing a figure or its status is a config edit plus a log entry; no code change.
