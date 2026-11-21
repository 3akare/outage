# ADR 0056: Pick your spot by Lagos LGA and ward, not GPS

Status: ACCEPTED (2026-11-21). Asked for by the human: "I don't want to use my location anymore because it doesn't work... list all... by local government... use all the local governments in Lagos... or the postcode thing the country recently did... automatically set up their local government and the cell that they are in." Supersedes ADR 0037 (coarse location for the spot) and the nine hand-placed catalog areas of the area-cells spec.

## Context
The spot was found with one coarse GPS fix, hit-tested against nine hand-placed rings of 19 hexes (Yaba, Ikeja, ...). Coarse fixes in Lagos are often off by kilometres or never come, most of the state was in no area at all, and the manual picker lived in Settings, not in first run.

## Decision
1. **Places are official boundaries.** The 20 Lagos LGAs and their 376 wards come from GRID3 NGA Operational Wards v4.0 (CC BY-SA 4.0, attribution in the app and site). `tools/places/build_lagos.py` turns them into `core/shared/fixtures/places/lagos-places.json` (LGAs, wards, cells, anchors) and `lagos-geo.json` (hex rings, simplified ward and LGA outlines). LGAs replace the nine catalog areas everywhere an area is shown.
2. **The grid stays H3 resolution 8** (about 0.74 km2), the unit the server already groups phones by, so the wire format, ingest validation and area actors do not change. A hex belongs to the ward that contains its centre, so every hex has exactly one ward and one LGA. Hexes centred in the lagoon or sea belong to no ward and are not offered. Lagos has 4,968 land hexes.
3. **How a person gets a cell.** First run asks "Which local government are you in?" (search over the 20), then "Which ward?" (search over its wards, including GRID3 alternative names). Each ward has an anchor: its own hex nearest the ward's representative point. A ward with one hex, or none of its own (35 small wards in the dense core, where a ward is smaller than a hex), gives the anchor straight away. For a ward with no hex, the anchor is the land hex that holds its representative point, and the build stops if that hex centre is more than 500 m from the ward outline (the widest today is 384 m, Oke Arin-Idumota on Lagos Island). The old test only asked for 25 grid steps from the LGA centre, about 10 km, which could have let a large Epe or Badagry ward be anchored far away. All 35 hexless wards are in the dense core, and all but two are anchored in their own LGA. A ward with more hexes shows them on the street map with the anchor selected; the person may tap the hex where they live, or keep the anchor.
4. **NIPOST digital postcode** (live 1 Oct 2026, `LA-NN-DDD-AA-BB`). The `NN` digits are the LGA, numbered alphabetically (`LA-01` Agege ... `LA-20` Surulere), checked against postcode.gov.ng reverse lookups at two points per LGA on 2026-11-21. Typing a postcode is decoded on the phone to pick the LGA; the postcode itself is never stored or sent (privacy.md allows only a prefix). The app links to https://postcode.gov.ng/find for people who do not know theirs. We do not call NIPOST's API from the app: its developer API needs a key and paid credits for anything beyond validity.
5. **No location permission.** GPS is no longer read; `ACCESS_COARSE_LOCATION` is removed from the manifest.

## Alternatives
- **Keep GPS.** Coarse fixes in Lagos are often kilometres off or never arrive, and it needs a permission prompt. Lost: it does not work.
- **Keep the nine hand-placed areas.** Most of Lagos was in none of them, and people could not find their own place. Lost: not complete.
- **A grid of wards only (one cell per ward).** Wards vary a lot in size, and in the dense core a ward is smaller than a hex. The server already groups phones by H3 resolution 8, so wards alone would change the wire format. Lost: wrong size and a bigger change.
- **Call the NIPOST postcode API from the app.** It needs a key and paid credits beyond validity checks. Lost: cost and a secret in the app. We decode the postcode on the phone instead.

## Consequences
- In the dense core a hex can hold several wards; those wards share a sensor group. That is the right size for detection (more phones per group) and the ward name still says where you are.
- The rural east and west (Epe 1,448 hexes, Badagry 696) have large wards; the map picker matters there.
- Stored spot records keep the cell; the area name becomes "Ward, LGA". Old spots stay valid if their cell is a Lagos land hex.
