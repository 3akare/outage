# ADR 0020: Tariff band config and its verification status

Status: ACCEPTED (2026-11-15, under the blanket approval).

## Context
Power Log compares a user's logged hours of power with their NERC tariff band's promised minimum (power-log R5). The band list must live in a config file with sources and a checked date (R5.5), and the claims rules forbid inventing a number or implying compensation. The service-based bands are widely reported as A 20 h, B 16 h, C 12 h, D 8 h, E 4 h minimum per day, but NERC's authoritative MYTO orders are published as PDFs, which the build tooling (web_fetch) cannot read as text. Only NERC's HTML-indexed notices could be read.

Update 2026-11-15: NERC's own FAQ page on electricity tariffs (https://nerc.gov.ng/faq/electricity-tariffs/, HTML) lists the minimums: Band A 20 hours, B 16, C 12, D 8, E 4, under the Service-Based Tariff of 1 November 2020. That is an official NERC document, so all five bands are now verified.

## Decision
- Ship `apps/android/app/src/main/assets/bands.json` as the single config file: a top-level checked date and official-source list, and per band the promised minimum hours, a `verified` flag, an `officialSource`, supporting `sources`, a checked date, and a provenance `note`.
- Mark a band `verified: true` only when its figure appears in an official NERC document readable as text. As of 2026-11-15 all five bands qualify, from the NERC FAQ page above (no page number, it is HTML). The 2021 public notice and 2020 press release (PDFs) independently confirm the 12-hour boundary between Bands C and D. The news sources stay in `sources` as secondary references.
- `BandConfig.validate()` requires every band to carry at least one source, https sources, a valid date and a provenance note, and requires a `verified` band to cite an https `nerc.gov.ng` source. The UI (task 8) and Stats (task 6) must show unverified bands as unconfirmed, never as a firm promise. Promise copy is always labelled an estimate and never uses refund, compensation or claim (R5.4, PL6).

## Alternatives
1. Mark all five bands verified from the secondary consensus. Rejected: overclaims against the claims rules; no readable official text for four of them.
2. Mark all five unverified. Honest but needlessly drops the one figure (12 h) that a readable NERC notice does confirm.
3. Omit unconfirmed bands. Rejected: the picker needs all five, and hiding them loses the sourced estimates.

## Consequences
- All five bands are verified against NERC's FAQ page. The human should still compare against the current MYTO order before release, because the FAQ could change. If NERC changes a figure, edit the config and add a log entry; the unverified UI path stays for that case.
- No number is presented as official without an official readable source. Changing a figure or its status is a config edit plus a log entry; no code change.
