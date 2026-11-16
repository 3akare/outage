# ADR 0040: The share card is drawn on the phone and shared as a picture

Status: accepted (human blanket approval 2026-11-15). Spec: power-log task 9 (R8). The task was "blocked until the human decides how the image is built"; the blanket approval of 2026-11-15 lets the agent decide and record it.

## Context
R8 asks for a monthly card with the Light Score, hours of power, outage count and the app link, with no location, area name, install ID or name, marked "estimate" with the number of days. The text fallback shipped with task 8.

## Decision
- Draw a 1080 x 1350 `Bitmap` with `android.graphics.Canvas` (`ShareCardImage.render`). No new library and no server render, so it works offline and the numbers never leave the phone.
- Write it as PNG to `cacheDir/share/outage-light-score.png` (one file, overwritten) and share it with `ACTION_SEND`, `image/png`, a `FileProvider` content URI (`<applicationId>.share`, not exported, `cache-path share/`) and a read grant on the URI. The same intent carries the share text, so apps that ignore images still get the facts.
- The only input is `ShareFacts` (month, score, hours, outage count, days covered). It has no field for a location, area, install ID or name, so none can reach the picture or the text. The app link is the Worker's `/install` page, left out when the build has no Worker address.
- Delete-my-data removes the cached picture.
- The picture is drawn off the main thread. Colours are fixed (the card looks the same in light and dark mode, so a shared card is stable).

## Alternatives
- Compose `GraphicsLayer` capture of a composable: needs the card on screen and a newer API surface. Rejected.
- Render on the Worker: sends the user's numbers to a server and fails offline. Rejected.
- `MediaStore` insert: asks for storage semantics and leaves the picture in the gallery. Rejected.

## Consequences
`androidx.core` (`FileProvider`) is used, which is part of the approved AndroidX core libraries. One more manifest entry and one XML resource. The picture carries Light Score copy from the string pack, so a language change changes the card.

Docs: https://developer.android.com/reference/androidx/core/content/FileProvider and https://developer.android.com/training/sharing/send
