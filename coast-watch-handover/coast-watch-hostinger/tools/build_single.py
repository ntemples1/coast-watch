#!/usr/bin/env python3
"""Bundle Coast Watch into one self-contained HTML file.

Usage:
  python3 tools/build_single.py
  python3 tools/build_single.py --out /path/to/coast-watch.html

Reads the Hostinger site files next to this tools/ folder. Does not modify them.
Leaflet, fonts, favicons and marker images are inlined as data URIs or script/style
tags. Map tiles and live APIs stay as online fetches. Manifest, font preloads and
any CSP meta are dropped so the file works from file://.
"""
from __future__ import annotations

import argparse
import base64
import mimetypes
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUT = Path("/workspace/coast-watch-single/coast-watch.html")
LEAFLET_IMAGES = Path(__file__).resolve().parent / "leaflet-images"

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


def b64(path: Path) -> str:
    return base64.b64encode(path.read_bytes()).decode("ascii")


def data_uri(path: Path, mime: str | None = None) -> str:
    mime = mime or mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    if path.suffix.lower() == ".woff2":
        mime = "font/woff2"
    if path.suffix.lower() == ".ico":
        mime = "image/x-icon"
    return f"data:{mime};base64,{b64(path)}"


def escape_tag_text(s: str) -> str:
    # Stop the HTML parser closing the enclosing <script> or <style> early.
    return s.replace("</", "<\\/").replace("<!--", "<\\!--")


def rewrite_css_urls(css: str, mapping: dict[str, str]) -> str:
    def repl(m: re.Match[str]) -> str:
        raw = m.group(1).strip().strip("\"'")
        if raw.startswith("data:") or raw.startswith("#") or raw.startswith("http"):
            return m.group(0)
        key = raw.split("?")[0]
        if key in mapping:
            return f"url({mapping[key]})"
        # also match by basename
        base = Path(key).name
        for k, v in mapping.items():
            if Path(k).name == base:
                return f"url({v})"
        return m.group(0)

    return re.sub(r"url\(([^)]+)\)", repl, css)


def build(out: Path) -> Path:
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    style = (ROOT / "assets/css/style.css").read_text(encoding="utf-8")
    data_js = (ROOT / "assets/js/data.js").read_text(encoding="utf-8")
    app_js = (ROOT / "assets/js/app.js").read_text(encoding="utf-8")
    leaflet_css = (ROOT / "assets/vendor/leaflet/leaflet.css").read_text(encoding="utf-8")
    leaflet_js = (ROOT / "assets/vendor/leaflet/leaflet.js").read_text(encoding="utf-8")

    font_map = {
        "../fonts/manrope-latin.woff2": data_uri(ROOT / "assets/fonts/manrope-latin.woff2"),
        "../fonts/dm-sans-latin.woff2": data_uri(ROOT / "assets/fonts/dm-sans-latin.woff2"),
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

    if not LOAD_LEAFLET_RE.search(app_js):
        raise SystemExit("Could not find loadLeaflet() in app.js; update the build patch.")
    app_js = LOAD_LEAFLET_RE.sub(LOAD_LEAFLET_SRC.rstrip(), app_js, count=1)

    favicon = data_uri(ROOT / "favicon.ico")
    icon_svg = data_uri(ROOT / "assets/icons/icon.svg", "image/svg+xml")
    apple = data_uri(ROOT / "assets/icons/apple-touch-icon.png", "image/png")
    og = data_uri(ROOT / "assets/icons/og-image.png", "image/png")

    # Drop external resource links that cannot work in a single file:// document.
    html = re.sub(r'<link rel="manifest" href="manifest\.webmanifest">\n?', "", html)
    html = re.sub(
        r'<link rel="preload" href="assets/fonts/manrope-latin\.woff2"[^>]*>\n?',
        "",
        html,
    )
    html = re.sub(r'<link rel="stylesheet" href="assets/css/style\.css[^"]*">\n?', "", html)
    html = re.sub(r'<script src="assets/js/data\.js[^"]*" defer></script>\n?', "", html)
    html = re.sub(r'<script src="assets/js/app\.js[^"]*" defer></script>\n?', "", html)
    html = re.sub(
        r'<meta http-equiv="Content-Security-Policy"[^>]*>\n?',
        "",
        html,
        flags=re.I,
    )

    html = html.replace('content="assets/icons/og-image.png"', f'content="{og}"')
    html = html.replace('href="favicon.ico"', f'href="{favicon}"')
    html = html.replace('href="assets/icons/icon.svg"', f'href="{icon_svg}"')
    html = html.replace(
        'href="assets/icons/apple-touch-icon.png"', f'href="{apple}"'
    )

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

    icon_json = (
        "{"
        + ", ".join(f"{k}: {repr(v)}" for k, v in icon_opts.items())
        + "}"
    )
    # repr() uses single quotes, which is valid JS for strings.
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
            escape_tag_text(app_js),
            "</script>",
        ]
    )
    html = html.replace("</body>", scripts + "\n</body>", 1)

    banner = (
        "<!-- Coast Watch v6.1 single-file build, generated by tools/build_single.py. "
        "Fonts, icons, CSS, JS and Leaflet are inlined. Map tiles and live Wessex / "
        "Open-Meteo feeds are still fetched online. Open this file in a browser. -->\n"
    )
    if html.startswith("<!doctype") or html.startswith("<!DOCTYPE"):
        html = banner + html
    else:
        html = banner + html

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding="utf-8")
    return out


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--out", type=Path, default=DEFAULT_OUT, help="Output HTML path")
    args = p.parse_args()
    path = build(args.out.resolve())
    size = path.stat().st_size
    print(f"Wrote {path} ({size} bytes, {size/1024:.1f} KiB)")


if __name__ == "__main__":
    main()
