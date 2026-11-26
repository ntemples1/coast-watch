#!/usr/bin/env python3
"""Bundle BeachBuds Alerts (live v6.7 layout) into one self-contained HTML file.

Usage:
  python3 tools/build_single.py
  python3 tools/build_single.py --out /path/to/beachbuds-alerts.html

Reads ../site/ (the website source of truth), or --site. Does not modify those files.
Leaflet, fonts, icons, the NASA moon photo and marker images are inlined.
Map tiles and live APIs stay as online fetches. Manifest, font preloads and
any CSP meta are dropped so the file works from file://.
"""
from __future__ import annotations

import argparse
import base64
import mimetypes
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT_DEFAULT = HERE.parent / "site"
DEFAULT_OUT = HERE.parent / "beachbuds-alerts.html"
LEAFLET_IMAGES = HERE / "leaflet-images"

LOAD_LEAFLET_SRC = """function loadLeaflet() {
  if (window.L) return Promise.resolve();
  if (leafletLoading) return leafletLoading;
  leafletLoading = new Promise((ok, fail) => {
    try {
      const css = document.getElementById('cw-leaflet-css');
      if (css) css.disabled = false;
      const src = document.getElementById('cw-leaflet-src');
      if (!src || !src.textContent) throw new Error('Map library failed to load');
      const js = el('script');
      js.textContent = src.textContent;
      document.head.append(js);
      if (!window.L) throw new Error('Map library failed to load');
      if (window.CW_LEAFLET_ICONS && L.Icon && L.Icon.Default) {
        L.Icon.Default.prototype._getIconUrl = L.Icon.prototype._getIconUrl;
        L.Icon.Default.mergeOptions(window.CW_LEAFLET_ICONS);
      }
      ok();
    } catch (err) {
      leafletLoading = null;
      fail(err);
    }
  });
  return leafletLoading;
}"""

LOAD_LEAFLET_RE = re.compile(
    r"function loadLeaflet\(\) \{.*?\n  return leafletLoading;\n\}",
    re.S,
)

MOON_PATH = "assets/beachbuds-6.4/moon-nasa.jpg"


def b64(path: Path) -> str:
    return base64.b64encode(path.read_bytes()).decode("ascii")


def data_uri(path: Path, mime: str | None = None) -> str:
    mime = mime or mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    if path.suffix.lower() == ".woff2":
        mime = "font/woff2"
    if path.suffix.lower() == ".ico":
        mime = "image/x-icon"
    if path.suffix.lower() == ".jpg" or path.suffix.lower() == ".jpeg":
        mime = "image/jpeg"
    return f"data:{mime};base64,{b64(path)}"


def escape_tag_text(s: str) -> str:
    return s.replace("</", "<\\/").replace("<!--", "<\\!--")


def rewrite_css_urls(css: str, mapping: dict[str, str]) -> str:
    def repl(m: re.Match[str]) -> str:
        raw = m.group(1).strip().strip("\"'")
        if raw.startswith("data:") or raw.startswith("#") or raw.startswith("http"):
            return m.group(0)
        key = raw.split("?")[0]
        if key in mapping:
            return f"url({mapping[key]})"
        base = Path(key).name
        for k, v in mapping.items():
            if Path(k).name == base:
                return f"url({v})"
        return m.group(0)

    return re.sub(r"url\(([^)]+)\)", repl, css)


def build(site: Path, out: Path) -> Path:
    html = (site / "index.html").read_text(encoding="utf-8")
    style = (site / "assets/beachbuds-6.4/style-6.7.css").read_text(encoding="utf-8")
    data_js = (site / "assets/js/data.js").read_text(encoding="utf-8")
    bathing_path = site / "assets/js/bathing.js"
    if not bathing_path.is_file():
        raise SystemExit(f"Missing bathing snapshot: {bathing_path}")
    bathing_js = bathing_path.read_text(encoding="utf-8")
    app_js = (site / "assets/beachbuds-6.4/app-6.7.js").read_text(encoding="utf-8")
    leaflet_css = (site / "assets/vendor/leaflet/leaflet.css").read_text(encoding="utf-8")
    leaflet_js = (site / "assets/vendor/leaflet/leaflet.js").read_text(encoding="utf-8")

    font_map = {
        "../fonts/manrope-latin.woff2": data_uri(site / "assets/fonts/manrope-latin.woff2"),
        "../fonts/dm-sans-latin.woff2": data_uri(site / "assets/fonts/dm-sans-latin.woff2"),
    }
    style = rewrite_css_urls(style, font_map)

    leaflet_img_map = {}
    icon_opts = {}
    for name, opt in (
        ("layers.png", None),
        ("layers-2x.png", None),
        ("marker-icon.png", "iconUrl"),
        ("marker-icon-2x.png", "iconRetinaUrl"),
        ("marker-shadow.png", "shadowUrl"),
    ):
        path = LEAFLET_IMAGES / name
        if not path.is_file():
            raise SystemExit(f"Missing Leaflet image: {path}")
        uri = data_uri(path, "image/png")
        leaflet_img_map[f"images/{name}"] = uri
        if opt:
            icon_opts[opt] = uri
    leaflet_css = rewrite_css_urls(leaflet_css, leaflet_img_map)

    moon = site / MOON_PATH
    if not moon.is_file():
        raise SystemExit(f"Missing moon photo: {moon}")
    moon_uri = data_uri(moon, "image/jpeg")
    if MOON_PATH not in app_js:
        raise SystemExit("app JS does not reference the moon photo path; update the build.")
    app_js = app_js.replace(MOON_PATH, moon_uri)

    if not LOAD_LEAFLET_RE.search(app_js):
        raise SystemExit("Could not find loadLeaflet() in app JS; update the build patch.")
    app_js = LOAD_LEAFLET_RE.sub(LOAD_LEAFLET_SRC.rstrip(), app_js, count=1)

    favicon = data_uri(site / "favicon.ico")
    icon_svg = data_uri(site / "assets/icons/icon.svg", "image/svg+xml")
    apple = data_uri(site / "assets/icons/apple-touch-icon.png", "image/png")
    og_src = None
    og_m = re.search(r'<meta property="og:image" content="([^"]+)"', html)
    if og_m and not og_m.group(1).startswith(("http:", "https:", "data:")):
        og_path = site / og_m.group(1)
        if og_path.is_file():
            og_src = og_m.group(1)
            og_uri = data_uri(og_path)

    html = re.sub(r'<link rel="manifest" href="[^"]+"\s*/?>\n?', "", html)
    html = re.sub(
        r'<link rel="preload" href="assets/fonts/[^"]+"[^>]*>\n?',
        "",
        html,
    )
    html = re.sub(r'<link rel="stylesheet" href="assets/[^"]+"\s*/?>\n?', "", html)
    html = re.sub(r'<script src="assets/[^"]*" defer></script>\n?', "", html)
    html = re.sub(
        r'<meta http-equiv="Content-Security-Policy"[^>]*>\n?',
        "",
        html,
        flags=re.I,
    )

    if og_src:
        html = html.replace(f'content="{og_src}"', f'content="{og_uri}"')
    html = html.replace('href="favicon.ico"', f'href="{favicon}"')
    html = html.replace('href="assets/icons/icon.svg"', f'href="{icon_svg}"')
    html = html.replace('href="assets/icons/apple-touch-icon.png"', f'href="{apple}"')

    inject = "\n".join(
        [
            "<style>",
            escape_tag_text(style),
            "</style>",
            '<style id="cw-leaflet-css" disabled>',
            escape_tag_text(leaflet_css),
            "</style>",
        ]
    )
    html = html.replace("</head>", inject + "\n</head>", 1)

    icon_json = "{" + ", ".join(f"{k}: {repr(v)}" for k, v in icon_opts.items()) + "}"
    scripts = "\n".join(
        [
            f"<script>window.CW_LEAFLET_ICONS = {icon_json};</script>",
            '<script type="text/plain" id="cw-leaflet-src">',
            escape_tag_text(leaflet_js),
            "</script>",
            "<script>",
            escape_tag_text(data_js),
            "</script>",
            "<script>",
            escape_tag_text(bathing_js),
            "</script>",
            "<script>",
            escape_tag_text(app_js),
            "</script>",
        ]
    )
    html = html.replace("</body>", scripts + "\n</body>", 1)

    banner = (
        "<!-- BeachBuds Alerts v6.7 single-file build, generated by tools/build_single.py. "
        "Fonts, icons, CSS, JS, Leaflet and the moon photo are inlined. Map tiles and live "
        "Wessex / Open-Meteo feeds are still fetched online. Open this file in a browser. -->\n"
    )
    html = banner + html

    leftover = [
        p
        for p in re.findall(r'(?:src|href)="(assets/[^"]+)"', html)
        if not p.startswith("data:")
    ]
    if leftover:
        raise SystemExit(f"Uninlined local asset refs remain: {leftover}")

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding="utf-8")
    return out


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--site", type=Path, default=ROOT_DEFAULT, help="Mirrored site folder")
    p.add_argument("--out", type=Path, default=DEFAULT_OUT, help="Output HTML path")
    args = p.parse_args()
    path = build(args.site.resolve(), args.out.resolve())
    size = path.stat().st_size
    print(f"Wrote {path} ({size} bytes, {size/1024:.1f} KiB)")


if __name__ == "__main__":
    main()
