#!/usr/bin/env python3
"""Marin Learn v1 Package Publisher and Catalog Generator.
Validates conforming Marin Learn v1 ZIP packages, checks publication eligibility,
validates graph structure, references, Markdown constraints, and assets,
and generates the static publication tree and catalog.json.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import pathlib
import re
import sys
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from note_validate import validate_notes, validate_quizzes  # noqa: E402

def load_themes() -> list:
    """Read the fixed theme list that learning sets may be filed under."""
    data = json.loads((ROOT / "themes.json").read_text(encoding="utf-8"))
    return data["themes"]

def error(msg: str) -> None:
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(1)

def has_type(obj: dict, type_name: str) -> bool:
    """Check if object matches a given JSON-LD type name (string or list)."""
    # Match the whole local name ("Assessment" must not match "marin:AssessmentItem").
    t = obj.get("@type")
    types = [t] if isinstance(t, str) else t if isinstance(t, list) else []
    return any(isinstance(item, str) and item.split(":")[-1] == type_name for item in types)

def validate_zip_safety(zf: zipfile.ZipFile) -> None:
    """Enforce ZIP safety limits and path traversal protection."""
    max_entries = 500
    max_total_size = 50 * 1024 * 1024  # 50MB
    max_entry_size = 15 * 1024 * 1024  # 15MB

    infolist = zf.infolist()
    if len(infolist) > max_entries:
        error(f"ZIP exceeds maximum entry count limit ({len(infolist)} > {max_entries})")

    total_size = 0
    for info in infolist:
        if info.file_size > max_entry_size:
            error(f"ZIP entry exceeds size limit: {info.filename}")
        total_size += info.file_size
        if total_size > max_total_size:
            error("ZIP total uncompressed size exceeds limit")

        # Path traversal and safety checks
        name = info.filename
        if ".." in name or name.startswith("/") or name.startswith("\\") or ":" in name or "\0" in name:
            error(f"Unsafe ZIP entry path: {name}")
        if info.flag_bits & 1:
            error(f"Encrypted ZIP entry prohibited: {name}")

def sanitize_svg(content: bytes) -> None:
    """Validate SVG content for active executable elements."""
    text = content.decode("utf-8", errors="ignore").lower()
    if "<script" in text or "foreignobject" in text or "javascript:" in text:
        error("Unsafe SVG asset contains script, foreignObject, or javascript: URL")
    if re.search(r"\bon[a-z]+\s*=", text):
        error("Unsafe SVG asset contains event handler attributes")

def validate_markdown(text: str, unit_id: str) -> None:
    """Validate Markdown content against Marin Learn v1 rules."""
    lines = text.splitlines()
    for i, line in enumerate(lines, 1):
        stripped = line.strip()
        if re.fullmatch(r"#\s+.*", stripped) or (stripped.startswith("#") and not stripped.startswith("##")):
            error(f"ContentUnit {unit_id} line {i}: H1 headings are prohibited in content (.md)")
        if re.search(r"</?[a-z][^>]*>", line, re.I) or "<!--" in line:
            error(f"ContentUnit {unit_id} line {i}: Raw HTML or comments are prohibited in Markdown")

    last_level = 2  # Logical H1 is ContentUnit name, first child normally starts at h2
    for line in lines:
        match = re.match(r"^(#{2,6})\s+", line)
        if match:
            level = len(match.group(1))
            if level > last_level + 1:
                error(f"ContentUnit {unit_id}: Skipped heading level (jumped from h{last_level} to h{level})")
            last_level = level

def themes_for(lset: dict) -> list:
    """Theme names from the set's `about` list; each must be a known theme."""
    known = {t["name"] for t in load_themes()}
    names = [a.get("name") for a in lset.get("about", []) if isinstance(a, dict) and a.get("@type") == "DefinedTerm"]
    for name in names:
        if name not in known:
            error(f"Unknown theme '{name}' in {lset.get('identifier')}. Add it to themes.json or fix the name.")
    return names

def publish_package(zip_path: pathlib.Path, output_dir: pathlib.Path) -> dict:
    """Validate a Marin Learn ZIP package and publish to output_dir."""
    if not zip_path.is_file():
        error(f"Package not found: {zip_path}")

    try:
        zf = zipfile.ZipFile(zip_path, "r")
    except Exception as e:
        error(f"Failed to open ZIP archive {zip_path}: {e}")

    validate_zip_safety(zf)

    names = zf.namelist()
    if "learning.json" not in names:
        error("Missing required learning.json at ZIP root")

    try:
        learning_data = json.loads(zf.read("learning.json").decode("utf-8"))
    except Exception as e:
        error(f"Invalid JSON in learning.json: {e}")

    ctx = learning_data.get("@context")
    if not isinstance(ctx, list) or len(ctx) != 2:
        error("Invalid @context in learning.json")

    graph = learning_data.get("@graph")
    if not isinstance(graph, list) or not graph:
        error("Missing or invalid @graph in learning.json")

    learning_sets = [obj for obj in graph if isinstance(obj, dict) and has_type(obj, "LearningSet")]
    if len(learning_sets) != 1:
        error(f"Graph must contain exactly one LearningSet (found {len(learning_sets)})")

    lset = learning_sets[0]
    if lset.get("schemaVersion") != "1.0.0":
        error(f"Unsupported schemaVersion: {lset.get('schemaVersion')}")

    status = lset.get("creativeWorkStatus")
    if status != "published":
        error(f"LearningSet is not published (creativeWorkStatus is '{status}', required 'published')")

    identifier = lset.get("identifier")
    if not identifier or not re.fullmatch(r"[a-z0-9-]+", identifier):
        error(f"Invalid or missing LearningSet identifier: {identifier}")

    objects_by_id = {}
    for obj in graph:
        if not isinstance(obj, dict):
            error("Graph contains non-object element")
        obj_id = obj.get("@id")
        if not obj_id or not re.fullmatch(r"urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", obj_id):
            error(f"Invalid or missing object @id UUID: {obj_id}")
        if obj_id in objects_by_id:
            error(f"Duplicate object @id: {obj_id}")
        objects_by_id[obj_id] = obj

    content_units = [obj for obj in graph if has_type(obj, "ContentUnit")]
    referenced_md = set()
    for cu in content_units:
        enc = cu.get("encoding")
        if not isinstance(enc, dict) or enc.get("encodingFormat") != "text/markdown":
            error(f"ContentUnit {cu.get('@id')} missing valid text/markdown encoding")
        curl = enc.get("contentUrl")
        if not curl or not curl.startswith("content/") or not curl.endswith(".md"):
            error(f"ContentUnit {cu.get('@id')} has invalid contentUrl: {curl}")
        if curl in referenced_md:
            error(f"Multiple ContentUnits reference Markdown file: {curl}")
        referenced_md.add(curl)
        if curl not in names:
            error(f"Missing Markdown file in ZIP: {curl}")
        md_text = zf.read(curl).decode("utf-8")
        validate_markdown(md_text, cu.get("identifier", cu.get("@id")))

    zip_md_files = {name for name in names if name.startswith("content/") and name.endswith(".md")}
    orphans_md = zip_md_files - referenced_md
    if orphans_md:
        error(f"Orphan Markdown files found under content/: {orphans_md}")

    asset_objs = [obj for obj in graph if has_type(obj, "ImageObject") or has_type(obj, "MediaObject")]
    referenced_assets = set()
    for asset in asset_objs:
        curl = asset.get("contentUrl")
        if not curl or not curl.startswith("assets/"):
            error(f"Asset object {asset.get('@id')} has invalid contentUrl: {curl}")
        if curl in referenced_assets:
            error(f"Multiple asset objects reference file: {curl}")
        referenced_assets.add(curl)
        if curl not in names:
            error(f"Missing asset file in ZIP: {curl}")
        if curl.endswith(".svg"):
            sanitize_svg(zf.read(curl))

    zip_asset_files = {name for name in names if name.startswith("assets/")}
    orphans_assets = zip_asset_files - referenced_assets
    if orphans_assets:
        error(f"Orphan asset files found under assets/: {orphans_assets}")

    note_problems = validate_notes(graph) + validate_quizzes(graph)
    if note_problems:
        error("Invalid Note content:\n  - " + "\n  - ".join(note_problems))

    notes = [obj for obj in graph if has_type(obj, "Note")]
    materials = [obj for obj in graph if has_type(obj, "LearningMaterial")]
    presentations = [obj for obj in graph if has_type(obj, "Presentation")]
    assessments = [obj for obj in graph if has_type(obj, "Assessment")]

    set_out_dir = output_dir / "learning" / identifier
    if set_out_dir.exists():
        for p in set_out_dir.glob("**/*"):
            if p.is_file():
                p.unlink()
    set_out_dir.mkdir(parents=True, exist_ok=True)

    zf.extractall(set_out_dir)
    zf.close()

    try:
        from generate_pdf import generate_material_pdf
        for mat in materials:
            mat_ident = mat.get("identifier", "material")
            pdf_out = set_out_dir / f"{mat_ident}.pdf"
            generate_material_pdf(set_out_dir / "learning.json", pdf_out)
    except Exception as e:
        print(f"Warning: PDF generation failed during publication: {e}", file=sys.stderr)

    hasher = hashlib.sha256()
    for p in sorted(set_out_dir.glob("**/*")):
        if p.is_file():
            hasher.update(p.relative_to(set_out_dir).as_posix().encode("utf-8"))
            hasher.update(p.read_bytes())
    revision = hasher.hexdigest()[:12]

    return {
        "setId": lset.get("@id"),
        "identifier": identifier,
        "name": lset.get("name"),
        "abstract": lset.get("abstract"),
        "educationalLevel": lset.get("educationalLevel"),
        "inLanguage": lset.get("inLanguage", "en-US"),
        "keywords": lset.get("keywords", []),
        "themes": themes_for(lset),
        "graphUrl": f"learning/{identifier}/learning.json",
        "resourceCounts": {
            "notes": len(notes),
            "materials": len(materials),
            "presentations": len(presentations),
            "assessments": len(assessments)
        },
        "revision": revision
    }

def main() -> None:
    parser = argparse.ArgumentParser(description="Publish Marin Learn v1 packages and generate catalog.json")
    parser.add_argument("packages", nargs="+", type=pathlib.Path, help="Path to conforming learning ZIP package(s) or directory containing packages")
    parser.add_argument("--out", type=pathlib.Path, default=ROOT / "dist", help="Output directory (default: dist/)")
    args = parser.parse_args()

    out_dir = args.out
    out_dir.mkdir(parents=True, exist_ok=True)

    package_files = []
    for p in args.packages:
        if p.is_dir():
            package_files.extend(sorted(p.glob("*.zip")))
        elif p.is_file():
            package_files.append(p)
        else:
            matched = list(ROOT.glob(str(p)))
            if matched:
                package_files.extend([m for m in matched if m.is_file() and m.suffix == ".zip"])
            else:
                print(f"Warning: Path not found or not a zip file: {p}", file=sys.stderr)

    if not package_files:
        error("No learning packages found to publish.")

    items = []
    for pkg in package_files:
        print(f"Publishing package: {pkg}")
        item = publish_package(pkg, out_dir)
        items.append(item)

    items.sort(key=lambda x: (x["name"].lower(), x["identifier"]))

    catalog = {
        "format": "marin-learn-catalog/v1",
        "themes": load_themes(),
        "items": items
    }

    catalog_path = out_dir / "catalog.json"
    catalog_path.write_text(json.dumps(catalog, indent=2) + "\n", encoding="utf-8")
    print(f"Successfully published {len(items)} learning set(s) to {out_dir}")
    print(f"Generated catalog: {catalog_path}")

if __name__ == "__main__":
    main()
