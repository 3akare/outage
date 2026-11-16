---
inclusion: always
---

# Product: Outage

**Pitch:** "Your phone charger is a power-grid sensor."

When grid power dies, every phone charging in an area stops charging in the same second. Outage collects those events, confirms blackouts area by area with no one reporting anything, and tells people when power goes and when it comes back.

Single-player value comes first. The map is the bonus. Every feature must be useful to one person with one charging phone on day one.

- One Android app is both sensor and viewer.
- The same Cloudflare Worker serves the website: a landing page at `/` (what Outage is, "Try the app in your browser", downloads: Google Play and Aptoide when listed, the APK from GitHub always), and the Android app in the browser at `/app/simulate`, screen for screen on a simulated city, for judges and anyone without an Android phone (ADR 0049). Area pages stay public. `/app` redirects to `/app/simulate`.
- The app: install, answer "Use my location" or "Not now", land on a full-screen hex map centred on your spot, with a sheet for your spot and feed and a bar of Insights, Home (middle), Settings (ADR 0050).
- One look everywhere: the Outage night design from one token file, a real rotating globe as the map, and the Outage mark (ADR 0051). The Material 3 skill was removed at the human's request; do not reinstall it.
- Open worldwide. Lagos is the proving ground and demo city.
- Budget: zero. Free tiers only.

## Hooks that work from one charging phone
- **Light Alarm**: rings a real alarm, even at 3 a.m., when power returns at your spot. Works offline.
- **Home Watch**: a spare phone charging at home; your main phone shows "Home: power on since 2:14 p.m." from anywhere. Brings a second install built in.
- **Freezer Guard**: alert when your spot has been without power past a limit you set.
- **Power Log and Light Score**: daily hours of power, every outage, a monthly share card carrying the app link.
- **Supply promise check**: logged hours vs. your tariff band's promise (e.g. Nigeria Band A promises 20 h/day). Never promise compensation.
- **Stretch**: outage cost estimate (hours on generator x fuel use x price), usual-pattern prediction after 7 days, "Power's back" moment with a live count and share card.
- **Public area pages** ("Is there power in Yaba right now?") are the search channel. Each has an install button, even before the area has sensors.

## Claims discipline
Never claim that phones produced the "utility undercounted outages by nearly 100%" finding. That came from nLine's hardware sensors. See `gridwatch-lessons.md`.
