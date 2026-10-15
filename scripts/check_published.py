#!/usr/bin/env python3
"""Check that the committed site files match what scripts/publish.py makes from packages/.

The site is served straight from the repository (GitHub Pages, branch main, root), so
`learning/` and `catalog.json` are committed. If someone changes a package and forgets
to publish, this fails and says what to run. PDFs and the catalog `revision` hash are
ignored because they change on every build.
"""
from __future__ import annotations

import json
import pathlib
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]


def main() -> int:
    with tempfile.TemporaryDirectory() as temp:
        out = pathlib.Path(temp)
        result = subprocess.run([sys.executable, str(ROOT / "scripts" / "publish.py"), "packages", "--out", str(out)],
                                cwd=ROOT, capture_output=True, text=True)
        if result.returncode != 0:
            print(result.stdout + result.stderr)
            return 1

        problems: list[str] = []

        def without_revision(path: pathlib.Path) -> dict:
            catalog = json.loads(path.read_text(encoding="utf-8"))
            for item in catalog["items"]:
                item.pop("revision", None)
            return catalog

        if without_revision(out / "catalog.json") != without_revision(ROOT / "catalog.json"):
            problems.append("catalog.json is out of date")

        def files(base: pathlib.Path) -> dict[str, bytes]:
            return {p.relative_to(base).as_posix(): p.read_bytes()
                    for p in sorted(base.glob("**/*")) if p.is_file() and p.suffix != ".pdf"}

        built, committed = files(out / "learning"), files(ROOT / "learning")
        for name in sorted(set(built) | set(committed)):
            if built.get(name) != committed.get(name):
                problems.append(f"learning/{name} is " + ("missing" if name not in committed else "extra" if name not in built else "out of date"))

        if problems:
            print("The published files do not match packages/. Run: python3 scripts/publish.py packages --out .")
            for line in problems:
                print(f"  - {line}")
            return 1
    print("Published files match packages/: PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
