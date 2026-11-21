# ADR 0040: The share card is drawn on the phone and shared as a picture

Status: SUPERSEDED by the removal in commit 9fe8b88 (the picture share card is gone; the owner asked for it to be removed). Earlier status: accepted (human blanket approval 2026-11-15). Spec: power-log task 9 (R8). The task was "blocked until the human decides how the image is built"; the blanket approval of 2026-11-15 lets the agent decide and record it.

## Context
This is the record of how the card was built before it was removed. Nothing below is live in the app today; it is kept for history.

R8 asked for a monthly card with the Light Score, hours of power, outage count and the app link, with no location, area name, install ID or name, marked "estimate" with the number of days. The text fallback shipped with task 8 and is the only share that remains.

## Decision (as built, now removed)
- Drew a 1080 x 1350 `Bitmap` with `android.graphics.Canvas` (`ShareCardImage.render`). No new library and no server render, so it worked offline and the numbers never left the phone.
- Wrote it as PNG to `cacheDir/share/outage-light-score.png` (one file, overwritten) and shared it with `ACTION_SEND`, `image/png`, a `FileProvider` content URI (`<applicationId>.share`, not exported, `cache-path share/`) and a read grant on the URI. The same intent carried the share text, so apps that ignore images still got the facts.
- The only input is `ShareFacts` (month, score, hours, outage count, days covered). It had no field for a location, area, install ID or name, so none could reach the picture or the text. The app link was the Worker's `/install` page, left out when the build had no Worker address.
- Delete-my-data removed the cached picture.
- The picture was drawn off the main thread. Colours were fixed (the card looked the same in light and dark mode).

## Alternatives
- Compose `GraphicsLayer` capture of a composable: needs the card on screen and a newer API surface. Rejected.
- Render on the Worker: sends the user's numbers to a server and fails offline. Rejected.
- `MediaStore` insert: asks for storage semantics and leaves the picture in the gallery. Rejected.

## Consequences
`androidx.core` (`FileProvider`) was used, part of the approved AndroidX core libraries, with one manifest entry and one XML resource. The picture carried Light Score copy from the string pack. All of this code, the manifest entry and the resource are gone with the removal.

Docs: https://developer.android.com/reference/androidx/core/content/FileProvider and https://developer.android.com/training/sharing/send
