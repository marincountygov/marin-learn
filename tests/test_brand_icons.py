#!/usr/bin/env python3
"""Check that the viewer and editor have their own Lucide brand identities."""
from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
ICONS = {
    "index.html": (
        "M8.3 10a.7.7 0 0 1-.626-1.079L11.4 3a.7.7 0 0 1 1.198-.043L16.3 8.9a.7.7 0 0 1-.572 1.1Z",
    ),
    "editor/index.html": (
        "M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4",
        "M2 6h4",
        "M2 10h4",
        "M2 14h4",
        "M2 18h4",
        "M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z",
    ),
}


class Icons(HTMLParser):
    def __init__(self, content: str):
        self.favicon = ""
        super().__init__()
        self.feed(content)

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if tag == "link" and attributes.get("rel") == "icon":
            self.favicon = attributes.get("href", "")


def path_data(svg: ET.Element) -> tuple[str, ...]:
    return tuple(path.attrib["d"] for path in svg.findall(".//{*}path"))


def main() -> None:
    for relative, expected in ICONS.items():
        html = (ROOT / relative).read_text(encoding="utf-8")
        header_svg = re.search(r"<template data-icon>\s*(<svg.*?</svg>)\s*</template>", html, re.S)
        assert header_svg, f"{relative}: missing header SVG"
        header = ET.fromstring(header_svg.group(1))
        assert header.attrib.get("viewBox") == "0 0 24 24", f"{relative}: invalid header viewBox"
        assert path_data(header) == expected, f"{relative}: wrong header Lucide icon"

        favicon_url = Icons(html).favicon
        assert favicon_url.startswith("data:image/svg+xml,"), f"{relative}: favicon must be inline SVG"
        favicon = ET.fromstring(unquote(favicon_url.partition(",")[2]))
        assert favicon.attrib.get("viewBox") == "0 0 48 48", f"{relative}: invalid favicon viewBox"
        assert path_data(favicon) == expected, f"{relative}: favicon must match header icon"
        assert favicon.find("{*}rect") is not None, f"{relative}: missing MarinOS favicon background"
    assert ICONS["index.html"] != ICONS["editor/index.html"]
    print("Viewer and editor Lucide identities: PASS")


if __name__ == "__main__":
    main()
