# Coast Watch handover

Independent live dashboard of Wessex Water storm overflow reports for beaches around Branksome, Bournemouth and Poole. Built for Neil Evans. Not affiliated with Wessex Water. All times are UK time (Europe/London).

This zip is the v6.1 source, plus a single-file HTML copy you can open locally. The live site is https://coastwatch.beatbake.co.uk.

## File map

```
HANDOVER.md                          This file
coast-watch.html                     Self-contained single-file build (open in a browser)
coast-watch-hostinger/
  index.html                         App shell, v6.1 asset query strings
  assets/css/style.css               Layout, theme, self-hosted fonts
  assets/js/data.js                  CW_NAMES (national ID -> name + Wessex map ID) and CW_EXPECTED
  assets/js/app.js                   All app logic: feeds, status, beaches, moon, map, UI
  assets/fonts/                      Manrope and DM Sans (woff2, latin)
  assets/icons/                      Favicon, PWA icons, og-image.png
  assets/vendor/leaflet/             Leaflet 1.9.4 JS/CSS (images live under tools/leaflet-images/)
  .htaccess                          HTTPS redirect, cache headers, CSP
  404.html, favicon.ico, manifest.webmanifest, robots.txt
  README.md                          Short build and deploy notes
  tests/check.py                     Playwright checks (live, simulated, feeds-down, moon, mapping)
  tools/build_single.py              Bundles the site into one HTML file
  tools/leaflet-images/              Official Leaflet 1.9.4 marker/control images, for the single-file build
  screenshots/                       A few representative captures (not the full set)
```

Do not commit or paste API keys. This project does not need any.

## Architecture

Static HTML, CSS and JS. No server code, no backend, no keys. The browser talks to public feeds that allow CORS `*`. Preferences (saved beaches/outfalls, motion pause) go in `localStorage` under `coast-watch.v6`. Refresh: outfalls every 5 minutes, weather every 30 minutes.

`data.js` is a lookup only. It stores no statuses. `CW_EXPECTED` lists local outfalls so a monitor missing from the feed shows as Unavailable, never as all-clear.

## Data sources

Base for Wessex: `https://services.arcgis.com/3SZ6e0uCvPROr4mS/arcgis/rest/services/`

Queries use `returnGeometry=false&f=json`. Bbox for the activity layer: `Latitude >= 50.65 AND Latitude <= 50.80 AND Longitude >= -2.10 AND Longitude <= -1.70`. Records are then kept only if they are in a known coastal ID set or the receiving water looks like the local coast or harbour.

1. Live status
   `Wessex_Water_Storm_Overflow_Activity/FeatureServer/0/query`
   Fields: `Id` (national WXW/WSX id), `Status`, `StatusStart`, `LatestEventStart`, `LatestEventEnd`, `Latitude`, `Longitude`, `ReceivingWaterCourse`, `LastUpdated`.
   Status: `1` discharging, `0` not discharging, `-1` monitor offline. Any other value, stale `LastUpdated` (older than 2 hours), missing record, or inconsistent start/end is treated as Unavailable. Never show an all-clear unless the live status is confirmed.

2. Names and details
   `Storm_Overflow_Services_PROD_view/FeatureServer/0/query`
   Fields: `unique_id` (Wessex map id, e.g. `15240B` for Branksome Chine), `wsx_overflow_name`, `LevelOfTreatment`, `CauseOfDischarge`, `DischargeStatusDesc`.
   `unique_id` is the second value in `CW_NAMES`. Branksome Chine is `WXW00865` / `15240B`. Shore Road is `WXW00991` / `15235B`.

3. Discharge events (about the last 24 hours only; Wessex does not publish older events here)
   `Storm_Overflow_Services_PROD_view/FeatureServer/1/query`
   Filter: `overflowid IN (...) AND Publishstatus='TRUE'`.
   Fields: `dischargeid`, `overflowid`, `dischargestart`, `dischargeend`.

Weather (point on Branksome Chine beach, `50.705, -1.907`, timezone Europe/London, unixtime):

- Forecast: `https://api.open-meteo.com/v1/forecast?...` current temp/wind/gusts, hourly rain+showers+probability, daily sunrise/sunset, past 2 days, next 3 days, wind in mph.
- Marine: `https://marine-api.open-meteo.com/v1/marine?...` hourly `sea_level_height_msl`, `wave_height`, `wave_period`, `sea_surface_temperature`, past 1 day, next 3 days, `cell_selection=sea`.

Map tiles: `https://tile.openstreetmap.org/{z}/{x}/{y}.png`. Leaflet is lazy-loaded from `assets/vendor/leaflet/` on the hosted site, and inlined in `coast-watch.html`.

## Beaches and the Shore Road / Branksome fix

`BEACHES` in `app.js` lists beaches west to east, then harbour. Each has a list of nearest monitored outfalls. The home beach is Branksome Chine (`HOME_ID = WXW00865`, `HOME_BEACH = branksome`).

Shore Road (`WXW00991`) used to be grouped under Branksome Chine. A short Shore Road spill (about 10 seconds, morning of 23 Nov 2026) turned the Branksome map pin amber even though Branksome Chine itself was not discharging. Shore Road is now its own beach. Branksome's outfalls are `['WXW00865']` only.

Reviewed by Neil on 26 Nov 2026: Sandbanks now lists only `WXW00955` (Sandbanks Pavilion), so a Shore Road spill no longer turns it amber. Canford Cliffs keeps `WXW00991` and `WXW00865` on purpose, as it has no outfall of its own and sits between the two.

## Moon

Computed locally in `app.js` (no extra API). Phase instants use Meeus, *Astronomical Algorithms*, chapter 49 (new, quarters, full, plus the periodic terms). Illuminated fraction uses the standard Meeus phase-angle approximation (elongation with the main corrections in D, M, Mp). The disc drawing uses that illumination and whether the moon is waxing or waning. A short tide note flags spring tides near new/full and neap tides near the quarters.

Checked in `tests/check.py` against 2026 reference instants (UTC):

- Full moon 24 Nov 2026 14:53: computed 14:54:41, error 1.7 minutes, 100% lit, name Full.
- New moon 9 Dec 2026 00:51: computed 00:53:01, error 2.0 minutes, 0% lit, name New.

Expect about two minutes of error on phase times. That is good enough for this UI.

## Tests and single-file build

From `coast-watch-hostinger/`:

```
python3 -m http.server 8200
python3 tests/check.py
```

`tests/check.py` expects Playwright and `/usr/bin/google-chrome`. It hits the real feeds, then mocks a Branksome discharge and a feeds-down case, and prints JSON including beach mapping and moon errors. Screenshots go to `screenshots/` if that folder is writable.

Single-file build (does not modify the site files):

```
python3 tools/build_single.py
# default output: /workspace/coast-watch-single/coast-watch.html
python3 tools/build_single.py --out /path/to/coast-watch.html
```

The single file inlines CSS, JS, Leaflet (lazy-injected from an in-page source so `loadLeaflet()` still works), fonts, favicons and Leaflet marker images as data URIs. Manifest, font preloads and CSP are dropped so it runs from `file://`. OpenStreetMap tiles and the live APIs are still fetched online.

## Hosting and deploy

- Live: https://coastwatch.beatbake.co.uk
- Hostinger folder: `/home/u261951836/domains/beatbake.co.uk/public_html/coastwatch`
- Plan SSL is already active for that host.
- Deploy: zip the site files (not this handover zip as-is unless you strip HANDOVER.md and the single-file copy), upload, extract into that folder. Keep `.htaccess`.
- After changing CSS or JS, bump the `?v=6.1` query strings in `index.html`. Those assets are cached for a year.
- `.htaccess` CSP allowlist is tight: scripts from self only, connect only to `services.arcgis.com`, `api.open-meteo.com` and `marine-api.open-meteo.com`, images from self, `data:` and `tile.openstreetmap.org`. If you add a new third-party domain, update the CSP or the browser will block it.

The Hostinger MCP `execute` / `hosting_deploy` path has been unreliable (timeouts). Browser upload via hPanel File Manager works.

## Known gaps

- Plain `http://coastwatch.beatbake.co.uk` has returned 500. Apex `beatbake.co.uk` DNS is not pointed at Hostinger; HTTPS on the subdomain works. The `.htaccess` HTTPS redirect never sees some of those HTTP hits.
- `og:image` in `index.html` is still a relative path. It should be the absolute `https://coastwatch.beatbake.co.uk/assets/icons/og-image.png` so link previews work.
- Canford Cliffs includes Shore Road and Branksome Chine on purpose (see above).
- History is only about 24 hours, because that is all the public events layer holds.

## Rules

- No API keys in the repo or in the page.
- No em dashes in user-facing copy.
- Keep it simple: static files, public feeds, no server.
- Ask before changing the beach-to-outfall map, other than finishing a change Neil already agreed.
- Anything unconfirmed is Unavailable, never an all-clear.
