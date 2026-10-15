"""Serve the repo plus a sample Note course, without adding the sample to the real catalog.

Used by the Notes browser tests, and for a local preview:
    python3 tests/helpers/sample_note_site.py 8766
"""
from __future__ import annotations

import json
import pathlib
import sys
import tempfile
import time
import zipfile
from contextlib import contextmanager
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
import publish  # noqa: E402

SAMPLE = "sample-note-course"


def build(out_dir: pathlib.Path) -> dict:
    document = (ROOT / "tests" / "fixtures" / "sample-note" / "learning.json").read_text(encoding="utf-8")
    zip_path = out_dir / f"{SAMPLE}.zip"
    with zipfile.ZipFile(zip_path, "w") as zf:
        zf.writestr("learning.json", document)
    item = publish.publish_package(zip_path, out_dir / "site")
    item["themes"] = ["Data"]  # so the sample course shows a theme badge
    return item


def make_handler(site: pathlib.Path, item: dict):
    catalog = json.loads((ROOT / "catalog.json").read_text(encoding="utf-8"))
    catalog["items"].append(item)

    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(ROOT), **kwargs)

        def do_GET(self):
            path = self.path.split("?")[0]
            if path == "/catalog.json":
                body = json.dumps(catalog).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(body)
                return
            if path.startswith(f"/learning/{SAMPLE}/"):
                file = site / path.lstrip("/")
                if file.is_file():
                    body = file.read_bytes()
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json" if file.suffix == ".json" else "application/octet-stream")
                    self.send_header("Content-Length", str(len(body)))
                    self.send_header("Cache-Control", "no-store")
                    self.end_headers()
                    self.wfile.write(body)
                    return
            super().do_GET()

        def end_headers(self):
            self.send_header("Cache-Control", "no-store")
            super().end_headers()

        def log_message(self, *args) -> None:
            pass

    return Handler


@contextmanager
def serve(port: int = 0):
    with tempfile.TemporaryDirectory() as temp:
        out = pathlib.Path(temp)
        item = build(out)
        server = ThreadingHTTPServer(("127.0.0.1", port), make_handler(out / "site", item))
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            yield f"http://127.0.0.1:{server.server_port}/"
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)


if __name__ == "__main__":
    with serve(int(sys.argv[1]) if len(sys.argv) > 1 else 0) as url:
        print(url, flush=True)
        try:
            while True:
                time.sleep(3600)
        except KeyboardInterrupt:
            pass
