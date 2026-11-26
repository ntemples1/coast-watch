#!/usr/bin/env python3
"""Refresh site/assets/js/bathing.js from the Environment Agency bathing water API.

The EA API does not allow browser requests from other sites (no CORS header),
so the page cannot read it live. Instead this script takes a snapshot of the
official classifications. Run it once a year after the EA publishes the new
classifications (usually November), then bump ?rev= on bathing.js in
site/index.html and deploy site/.

    python3 tools/update_bathing.py

No API key needed. Uses only the Python standard library.
"""
import json
import sys
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "site/assets/js/bathing.js"
API = "https://environment.data.gov.uk"

# EA bathing water IDs used by the beaches in app.js (BEACHES[].bw).
SITES = [
    "ukk2102-19350",  # Poole Sandbanks Peninsular
    "ukk2102-19200",  # Poole Shore Road Beach
    "ukk2102-19190",  # Poole Canford Cliffs Chine
    "ukk2102-19170",  # Poole Branksome Chine
    "ukk2101-19160",  # Bournemouth Alum Chine
    "ukk2101-19150",  # Bournemouth Durley Chine
    "ukk2101-19100",  # Bournemouth Pier
    "ukk2101-19060",  # Bournemouth Boscombe Pier
    "ukk2101-19030",  # Bournemouth Fisherman's Walk
    "ukk2101-19020",  # Bournemouth Southbourne
    "ukk2101-19000",  # Bournemouth Hengistbury West
    "ukk2102-19400",  # Poole Harbour Lake
    "ukk2102-19450",  # Poole Harbour Rockley Sands
]
YEARS_KEPT = 5


def get(path):
    req = urllib.request.Request(API + path, headers={"Accept": "application/json", "User-Agent": "coast-watch-update"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def val(x):
    return x.get("_value") if isinstance(x, dict) else x


def site(bw_id):
    p = get(f"/id/bathing-water/{bw_id}.json")["result"]["primaryTopic"]
    point = bw_id.split("-")[1]
    hist = get(f"/doc/bathing-water-quality/compliance-rBWD/point/{point}.json?_pageSize=50")["result"]["items"]
    years = {}
    for i in hist:
        y = str(i.get("sampleYear", {}).get("_about", i.get("sampleYear"))).rstrip("/").split("/")[-1]
        c = val(i.get("complianceClassification", {}).get("name"))
        if y.isdigit() and c:
            years[y] = c
    latest = sorted(years, reverse=True)[:YEARS_KEPT]
    name = val(p["name"]).replace("`", "’")
    return {
        "name": name,
        "lat": round(p["samplingPoint"]["lat"], 4),
        "lon": round(p["samplingPoint"]["long"], 4),
        "rainWarning": bool(p.get("waterQualityImpactedByHeavyRain")),
        "classes": {y: years[y] for y in latest},
    }


def main():
    sites = {}
    for bw_id in SITES:
        print("Fetching", bw_id, file=sys.stderr)
        sites[bw_id] = site(bw_id)
    data = {"snapshot": date.today().isoformat(), "sites": sites}
    body = json.dumps(data, ensure_ascii=False, indent=1)
    OUT.write_text(
        "// Environment Agency bathing water classifications, snapshot made by tools/update_bathing.py.\n"
        "// Official annual classifications only. No live forecasts are stored here.\n"
        f"window.CW_BATHING={body};\n",
        encoding="utf-8",
    )
    print("Wrote", OUT, file=sys.stderr)


if __name__ == "__main__":
    main()
