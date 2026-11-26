# Coast Watch v6.1 (Hostinger build)

Static site. Upload the contents of coast-watch-hostinger-upload.zip into public_html.
No server code, no API keys. Live data comes straight from public feeds that allow browser requests (CORS *):
Wessex Water ArcGIS (status, names, 24h events) and Open-Meteo (weather, marine).

Local test: `python3 -m http.server 8200` in this folder, then `python tests/check.py` (Playwright, uses /usr/bin/google-chrome).

When you change CSS or JS, bump `?v=6.1` in index.html so phones fetch the new file (they are cached for a year).
Once the site has its final address, change og:image in index.html to the full https:// URL so link previews show the image.

Single-file copy for offline handover or a local download:
`python3 tools/build_single.py` writes `/workspace/coast-watch-single/coast-watch.html` (or pass `--out`). Fonts, icons, CSS, JS and Leaflet are inlined. Map tiles and the live Wessex / Open-Meteo feeds still need a network.
