# BeachBuds Alerts handover

Live dashboard of Wessex Water storm overflow reports for beaches around Branksome, Bournemouth and Poole. Built for Neil Evans. Independent; not affiliated with Wessex Water. All times are UK time (Europe/London).

Live site: https://coastwatch.beatbake.co.uk

`site/` is the only source of truth for the web app. Edit files there, then deploy `site/` as a whole. Do not keep a second copy of the page elsewhere in this repo.

This project needs no API keys. Do not commit or paste any.

## File map

```
site/                                The live website, paths as served
  index.html                         App shell (title BeachBuds Alerts)
  .htaccess                          HTTPS redirect, cache, CSP
  404.html, favicon.ico, robots.txt
  beachbuds.webmanifest              Web app manifest
  assets/beachbuds-6.4/app-6.7.js    App logic (?rev= on the script tag)
  assets/beachbuds-6.4/style-6.7.css Layout and theme
  assets/beachbuds-6.4/moon-nasa.jpg NASA moon disc photo (SVS 5001)
  assets/js/data.js                  CW_NAMES and CW_EXPECTED
  assets/js/bathing.js               EA classification snapshot (not live)
  assets/fonts/                      Manrope and DM Sans (woff2, latin)
  assets/icons/                      Favicon, PWA icons, og-image.png
  assets/vendor/leaflet/             Leaflet 1.9.4 JS/CSS (no images folder)
tools/update_bathing.py              Refreshes site/assets/js/bathing.js from the EA API
tools/build_single.py                Bundles site/ into one HTML file
tools/leaflet-images/                Official Leaflet 1.9.4 marker images, for the single-file build only
alerts/check-branksome.mjs           Branksome spill checker (GitHub Actions + ntfy)
.github/workflows/spill-alerts.yml   Runs the checker every 10 minutes
HANDOVER.md                          This file
README.md                            Short pointer here
```

## How to edit

1. Change files in `site/` only.
2. After you change CSS or JS (including `bathing.js`), bump the `?rev=` token on that asset in `site/index.html`. Those files are cached for a long time.
3. Preview locally: `python3 -m http.server --bind 127.0.0.1 8765` from `site/`.
4. Syntax-check JS with `node --check` on the files you touched.
5. Deploy the whole `site/` folder (see below).

## Architecture

Static HTML, CSS and JS. No server code, no backend, no keys. The browser talks to public feeds that allow CORS `*`. Preferences (saved beaches and outfalls, motion pause) live in `localStorage` under `coast-watch.v6`.

`data.js` is a lookup only. It stores no statuses. `CW_EXPECTED` lists local outfalls so a monitor missing from the feed shows as Unavailable, never as all-clear.

Cache-busting on the current CSS/JS uses `?rev=20261126` (and `data.js` still uses `?v=6.1`).

## What is in this version (v6.7 plus bathing water)

Branding. The product is BeachBuds Alerts: document title, OG tags, apple-mobile-web-app-title, header, footer, and `beachbuds.webmanifest`. The URL is still coastwatch.beatbake.co.uk.

Wind over Poole Bay. A north-up, non-interactive Leaflet map (`#wind-map`) sits on the home view and moves into the Weather & tides view when that tab is open. Bounds: `[[50.678, -1.954], [50.727, -1.862]]`. OSM tiles. Circle markers and labels for Branksome, Shore Road, Sandbanks and Bournemouth Pier. Wind data is not a spatial wind field. It is the single Branksome Open-Meteo current forecast (`wind_speed_10m`, `wind_direction_10m` from `WEATHER_URL` at 50.705, -1.907). The same vector is drawn across the view. Fifteen CSS arrows in `#wind-field` point where the wind is blowing towards (from-bearing plus 180 degrees; the glyph points east at zero rotation, so the CSS angle is `towards - 90deg`). Animation is CSS `@keyframes wind-flow`, period `max(2.8, 5.5 - speed/12)` seconds. It pauses when "Pause motion" is on or the user prefers reduced motion.

Branksome wave forecast. Home panel with combined wave height, primary swell and wind-wave (chop) from the marine hourly request. 24-hour chart, hour slider, and a note of how far the model grid point is from Branksome.

8-day wave outlook. Compares daily peak offshore height at Branksome, Sandbanks, Bournemouth Pier, Boscombe, Southbourne and Avon Beach. Fetch is lazy: an `IntersectionObserver` (root margin 180px) calls `refreshWaveOutlook()` when `#outlook-panel` nears the viewport.

Beach card colour. `BEACHES` entries may have a named `outfall`. That outfall alone drives the card and map-pin colour. The `outfalls` list is nearby context only. Beaches without a named outfall show "Nearby reports only" and do not turn amber just because a neighbour spilled. Named outfalls today: Shore Road (`WXW00991`), Branksome Chine (`WXW00865`), Bournemouth Pier, Boscombe Pier, Fisherman's Walk, Hengistbury Head, Evening Hill, Whitecliff and Baiter, Poole Quay, Hamworthy. Nearby-only: Sandbanks, Canford Cliffs, Alum Chine, Durley Chine, Southbourne. Branksome does not include Shore Road. Sandbanks and Canford Cliffs still list Shore Road in nearby reports, pending any further review.

Moon disc. Meeus chapter 49 phase maths, with large faces from a NASA moon photo (`assets/beachbuds-6.4/moon-nasa.jpg`, credit https://svs.gsfc.nasa.gov/5001/) clipped to the lit shape.

Bathing water panel. Official Environment Agency annual classifications, snapshotted into `assets/js/bathing.js` because the EA API does not allow browser requests from other sites. It is not a reading for today. From 15 May to 30 September the UI also links out to the EA daily pollution risk forecast on Swimfo.

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

- Forecast: `https://api.open-meteo.com/v1/forecast?...` current temp/wind/gusts, hourly rain, daily sunrise/sunset, past 2 days, next 3 days, wind in mph. This current wind is also what the wind map draws.
- Marine (Branksome): `https://marine-api.open-meteo.com/v1/marine?...` hourly sea level, sea surface temperature, combined waves, swell and wind waves, past 1 day, next 3 days, `cell_selection=sea`.
- Outlook marine and outlook wind: same hosts, multi-point lists as above.

Bathing water snapshot (server-side only, via `tools/update_bathing.py`): `https://environment.data.gov.uk` bathing-water and compliance-rBWD endpoints. No key.

Map tiles: `https://tile.openstreetmap.org/{z}/{x}/{y}.png`. Leaflet is lazy-loaded from `assets/vendor/leaflet/`.

## Moon accuracy

Computed locally (no extra API). Phase instants: Meeus, *Astronomical Algorithms*, chapter 49. Illuminated fraction: Meeus phase-angle approximation. Expect about two minutes of error on phase times. That is good enough for this UI. Reference instants (UTC): full moon 24 Nov 2026 14:53 computes as 14:54; new moon 9 Dec 2026 00:51 computes as 00:53.

## Bathing water updater

The EA API has no CORS header, so the page cannot fetch it in the browser. Once a year, after the EA publishes new classifications (usually November):

```
python3 tools/update_bathing.py
```

This overwrites `site/assets/js/bathing.js`. Then bump `?rev=` on that script in `site/index.html` and deploy `site/`.

## Spill alerts

`alerts/check-branksome.mjs` is run by `.github/workflows/spill-alerts.yml` every 10 minutes. It checks Branksome Chine (`WXW00865`) and pushes to ntfy when the status changes. Set the `NTFY_TOPIC` repository variable. State is committed back to `alerts/state.json` only when it changes. Paths in the workflow are already under `alerts/` and must stay there.

## Single-file build

Does not modify `site/`:

```
python3 tools/build_single.py
# default output: beachbuds-alerts.html in the repo root (gitignored)
python3 tools/build_single.py --out /path/to/beachbuds-alerts.html
```

The file inlines CSS, JS (including the bathing snapshot), Leaflet, fonts, favicons, Leaflet marker images, and `moon-nasa.jpg`. Manifest, font preloads and CSP are dropped so it runs from `file://`. OpenStreetMap tiles and the live APIs are still fetched online.

## Hosting and deploy

- Live: https://coastwatch.beatbake.co.uk
- Hostinger folder: `/home/u261951836/domains/beatbake.co.uk/public_html/coastwatch`
- Plan SSL is already active for that host.

Deploy replaces the whole site from `site/`. Preferred path: Hostinger `hosting_deploy` of the static `site/` folder to the domain `coastwatch.beatbake.co.uk`. If that connector times out, upload the contents of `site/` (including `.htaccess`) in hPanel File Manager to `/home/u261951836/domains/beatbake.co.uk/public_html/coastwatch`.

Bump `?rev=` (or the 6.7 filenames) after CSS/JS changes, then deploy. `.htaccess` cannot be fetched over HTTP (403). The live response headers should keep this policy: scripts from self only; connect only to `services.arcgis.com`, `api.open-meteo.com` and `marine-api.open-meteo.com`; images from self, `data:` and `tile.openstreetmap.org`. If you add a new third-party domain, update the CSP or the browser will block it.

The public URL may serve CDN-recompressed copies of some PNG and JPEG files. That is expected. Keep the originals in `site/`.

## Known gaps

- Plain `http://coastwatch.beatbake.co.uk` has returned 500. Apex `beatbake.co.uk` DNS is not pointed at Hostinger; HTTPS on the subdomain works.
- `og:image` is still a relative path (`assets/icons/icon-512.png`). Use the absolute `https://coastwatch.beatbake.co.uk/assets/icons/icon-512.png` for link previews.
- Sandbanks and Canford Cliffs still list Shore Road as a nearby outfall. Their cards no longer take colour from it (they are "Nearby reports only"), but the neighbour is still shown in the open card.
- History is only about 24 hours, because that is all the public events layer holds.
- Leaflet's default marker/control PNGs are not on the server (`assets/vendor/leaflet/images/` is 404). The app uses `divIcon` and `circleMarker`, so this has not mattered in testing.
- The 8-day outlook stays on "Loading wave outlook…" until the panel is scrolled near the viewport. That is intentional lazy-load, not a dead feed.

## Rules

- No API keys in the repo or in the page.
- No em dashes in user-facing copy.
- Keep it simple: static files, public feeds, no server.
- Ask before changing the beach-to-outfall map, other than finishing a change Neil already agreed.
- Anything unconfirmed is Unavailable, never an all-clear.
- The wind map must not be presented as a spatially varying forecast. It repeats the Branksome model reading.
