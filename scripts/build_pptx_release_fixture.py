#!/usr/bin/env python3
"""Build the deterministic Marin Learn PPTX release-acceptance fixture package."""
from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = ROOT / "tests" / "fixtures" / "pptx-release"
DEFAULT_OUTPUT = ROOT / "build" / "pptx-fixtures" / "pptx-release-conformance.zip"
FIXED_TIMESTAMP = (1980, 1, 1, 0, 0, 0)
ALLOWED_TOP_LEVEL = {"learning.json", "content", "assets"}


class FixtureError(ValueError):
    """Raised when fixture source cannot be safely packaged."""


def sha256(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def discover_files(source: pathlib.Path) -> list[pathlib.Path]:
    source = source.resolve()
    if not source.is_dir():
        raise FixtureError(f"Fixture source directory does not exist: {source}")
    learning = source / "learning.json"
    if not learning.is_file():
        raise FixtureError(f"Fixture source is missing learning.json: {source}")

    files: list[pathlib.Path] = []
    for path in sorted(source.rglob("*"), key=lambda item: item.as_posix()):
        if path.is_symlink():
            raise FixtureError(f"Fixture source must not contain symlinks: {path}")
        if not path.is_file():
            continue
        relative = path.relative_to(source)
        if relative.parts[0] not in ALLOWED_TOP_LEVEL:
            raise FixtureError(f"Unexpected top-level fixture path: {relative.as_posix()}")
        if any(part in {"", ".", ".."} for part in relative.parts):
            raise FixtureError(f"Unsafe fixture path: {relative.as_posix()}")
        files.append(path)
    return files


def validate_learning_document(path: pathlib.Path) -> dict:
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise FixtureError(f"Unable to parse fixture learning.json: {exc}") from exc
    graph = document.get("@graph")
    if not isinstance(graph, list) or not graph:
        raise FixtureError("Fixture learning.json must contain a nonempty @graph array.")

    def types(item: object) -> list[str]:
        if not isinstance(item, dict):
            return []
        value = item.get("@type", [])
        if isinstance(value, str):
            return [value]
        return [entry for entry in value if isinstance(entry, str)] if isinstance(value, list) else []

    roots = [item for item in graph if "marin:LearningSet" in types(item)]
    presentations = [item for item in graph if "marin:Presentation" in types(item)]
    slides = [item for item in graph if "marin:Slide" in types(item)]
    if len(roots) != 1:
        raise FixtureError(f"Fixture must contain exactly one marin:LearningSet; found {len(roots)}.")
    if len(presentations) != 1:
        raise FixtureError(f"Fixture must contain exactly one marin:Presentation; found {len(presentations)}.")
    if len(slides) < 6:
        raise FixtureError("Fixture must contain at least six slides.")
    if roots[0].get("identifier") != "pptx-release-conformance":
        raise FixtureError("Fixture learning-set identifier must be pptx-release-conformance.")
    if presentations[0].get("identifier") != "pptx-release-conformance-slides":
        raise FixtureError("Fixture presentation identifier must be pptx-release-conformance-slides.")

    layouts = {item.get("marin:layout") for item in slides if isinstance(item.get("marin:layout"), str)}
    required_layouts = {"title", "section", "content", "split", "media", "quote"}
    missing_layouts = sorted(required_layouts - layouts)
    if missing_layouts:
        raise FixtureError(f"Fixture is missing required slide layouts: {', '.join(missing_layouts)}.")

    display_modes: set[str] = set()
    for slide in slides:
        sequence = slide.get("marin:contentSequence")
        elements = sequence.get("itemListElement", []) if isinstance(sequence, dict) else []
        for element in elements if isinstance(elements, list) else []:
            if isinstance(element, dict):
                display_modes.add(str(element.get("marin:displayMode") or "full"))
    required_modes = {"full", "abstract", "title"}
    missing_modes = sorted(required_modes - display_modes)
    if missing_modes:
        raise FixtureError(f"Fixture is missing required display modes: {', '.join(missing_modes)}.")

    return {
        "learningSetIdentifier": roots[0].get("identifier"),
        "presentationIdentifier": presentations[0].get("identifier"),
        "slideCount": len(slides),
        "layouts": sorted(layouts),
        "displayModes": sorted(display_modes),
    }


def build_fixture(source: pathlib.Path = DEFAULT_SOURCE, output: pathlib.Path = DEFAULT_OUTPUT) -> dict:
    source = source.resolve()
    output = output.resolve()
    files = discover_files(source)
    metadata = validate_learning_document(source / "learning.json")

    if output == source or output in source.parents:
        raise FixtureError(f"Output path is unsafe: {output}")
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(output.suffix + ".tmp")
    temporary.unlink(missing_ok=True)

    try:
        with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            for path in files:
                relative = path.relative_to(source).as_posix()
                info = zipfile.ZipInfo(relative, date_time=FIXED_TIMESTAMP)
                info.create_system = 3
                info.external_attr = 0o100644 << 16
                info.compress_type = zipfile.ZIP_DEFLATED
                archive.writestr(info, path.read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
        temporary.replace(output)
    finally:
        temporary.unlink(missing_ok=True)

    result = {
        "schema": 1,
        "source": source.as_posix(),
        "output": output.as_posix(),
        "files": len(files),
        "bytes": output.stat().st_size,
        "sha256": sha256(output),
        **metadata,
    }
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=pathlib.Path, default=DEFAULT_SOURCE, help="Fixture source directory")
    parser.add_argument("--out", type=pathlib.Path, default=DEFAULT_OUTPUT, help="Output package ZIP")
    parser.add_argument("--summary", type=pathlib.Path, help="Optional JSON result path")
    args = parser.parse_args()

    try:
        result = build_fixture(args.source, args.out)
    except FixtureError as exc:
        parser.error(str(exc))

    if args.summary:
        args.summary.parent.mkdir(parents=True, exist_ok=True)
        args.summary.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(
        f"Built {result['output']} ({result['slideCount']} slides, "
        f"{result['files']} files, sha256 {result['sha256']})"
    )


if __name__ == "__main__":
    main()
