#!/usr/bin/env python3
"""Render PPTX review artifacts through LibreOffice and Poppler.

The script is intended for CI evidence, not as a substitute for Microsoft PowerPoint
or manual accessibility testing. It produces a PDF, one PNG per slide, an optional
montage, and a machine-readable summary for each input deck.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from typing import Any


ROOT = pathlib.Path(__file__).resolve().parents[1]


def discover_pptx(inputs: list[pathlib.Path]) -> list[pathlib.Path]:
    files: list[pathlib.Path] = []
    for input_path in inputs:
        resolved = input_path.resolve()
        if resolved.is_dir():
            files.extend(sorted(resolved.rglob("*.pptx")))
        elif resolved.is_file() and resolved.suffix.lower() == ".pptx":
            files.append(resolved)
        else:
            raise ValueError(f"Input does not exist or is not a PPTX file: {input_path}")
    return sorted(set(files), key=lambda item: item.as_posix())


def assert_safe_output_root(output_root: pathlib.Path, source_files: list[pathlib.Path]) -> pathlib.Path:
    target = output_root.resolve()
    filesystem_root = pathlib.Path(target.anchor).resolve()
    forbidden = {filesystem_root, ROOT, pathlib.Path.cwd().resolve()}
    if target in forbidden:
        raise ValueError(f"Refusing to recursively clean unsafe output directory: {target}")
    for source in source_files:
        resolved_source = source.resolve()
        if target == resolved_source or target in resolved_source.parents:
            raise ValueError(
                f"Refusing to clean output directory because it contains an input PPTX: {target}"
            )
    return target


def pptx_slide_count(path: pathlib.Path) -> int:
    with zipfile.ZipFile(path, "r") as archive:
        return sum(1 for name in archive.namelist() if re.fullmatch(r"ppt/slides/slide\d+\.xml", name))


def sha256(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def run(command: list[str], *, cwd: pathlib.Path | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        cwd=cwd,
        check=True,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )


def render_deck(
    pptx: pathlib.Path,
    output_root: pathlib.Path,
    *,
    libreoffice: str,
    pdftoppm: str,
    montage: str | None,
    dpi: int,
) -> dict[str, Any]:
    parent_name = pptx.parent.name if pptx.parent.name else "presentation"
    deck_output = output_root / parent_name / pptx.stem
    if deck_output.exists():
        shutil.rmtree(deck_output)
    deck_output.mkdir(parents=True, exist_ok=True)

    logs: list[str] = []
    with tempfile.TemporaryDirectory(prefix="marin-learn-pptx-render-") as temp_name:
        temp_dir = pathlib.Path(temp_name)
        profile_dir = temp_dir / "libreoffice-profile"
        profile_dir.mkdir()
        profile_uri = profile_dir.resolve().as_uri()
        completed = run([
            libreoffice,
            "--headless",
            f"-env:UserInstallation={profile_uri}",
            "--convert-to",
            "pdf",
            "--outdir",
            str(temp_dir),
            str(pptx),
        ])
        logs.append(completed.stdout.strip())
        converted_pdf = temp_dir / f"{pptx.stem}.pdf"
        if not converted_pdf.is_file():
            candidates = list(temp_dir.glob("*.pdf"))
            if len(candidates) == 1:
                converted_pdf = candidates[0]
            else:
                raise RuntimeError(f"LibreOffice did not produce a PDF for {pptx}.")
        pdf_path = deck_output / f"{pptx.stem}.pdf"
        shutil.copy2(converted_pdf, pdf_path)

    prefix = deck_output / "slide"
    completed = run([pdftoppm, "-png", "-r", str(dpi), str(pdf_path), str(prefix)])
    if completed.stdout.strip():
        logs.append(completed.stdout.strip())
    slide_images = sorted(deck_output.glob("slide-*.png"), key=natural_slide_key)
    expected_slides = pptx_slide_count(pptx)
    if len(slide_images) != expected_slides:
        raise RuntimeError(
            f"Rendered slide count mismatch for {pptx.name}: expected {expected_slides}, found {len(slide_images)}."
        )

    montage_path = None
    if montage and slide_images:
        montage_path = deck_output / f"{pptx.stem}-montage.png"
        command = [
            montage,
            *[str(item) for item in slide_images],
            "-thumbnail",
            "480x270",
            "-tile",
            "3x",
            "-geometry",
            "+18+18",
            str(montage_path),
        ]
        completed = run(command)
        if completed.stdout.strip():
            logs.append(completed.stdout.strip())

    log_path = deck_output / "render.log"
    log_path.write_text("\n".join(item for item in logs if item) + "\n", encoding="utf-8")
    return {
        "source": pptx.as_posix(),
        "sourceSha256": sha256(pptx),
        "slideCount": expected_slides,
        "pdf": pdf_path.relative_to(output_root).as_posix(),
        "pdfSha256": sha256(pdf_path),
        "slides": [item.relative_to(output_root).as_posix() for item in slide_images],
        "montage": montage_path.relative_to(output_root).as_posix() if montage_path else None,
        "log": log_path.relative_to(output_root).as_posix(),
        "status": "pass",
    }


def natural_slide_key(path: pathlib.Path) -> int:
    match = re.search(r"-(\d+)\.png$", path.name)
    return int(match.group(1)) if match else 10**9


def main() -> None:
    parser = argparse.ArgumentParser(description="Render PPTX files to PDF and slide PNG evidence.")
    parser.add_argument("inputs", nargs="+", type=pathlib.Path, help="PPTX files or directories containing PPTX files")
    parser.add_argument("--out", type=pathlib.Path, default=pathlib.Path("build/pptx-rendered"), help="Output directory")
    parser.add_argument("--summary", type=pathlib.Path, help="Combined JSON summary path")
    parser.add_argument("--dpi", type=int, default=120, help="PNG render resolution (default: 120 DPI)")
    parser.add_argument("--no-montage", action="store_true", help="Do not create montage images")
    args = parser.parse_args()

    if args.dpi < 72 or args.dpi > 300:
        parser.error("--dpi must be between 72 and 300.")
    try:
        files = discover_pptx(args.inputs)
    except ValueError as exc:
        parser.error(str(exc))
    if not files:
        parser.error("No PPTX files were found.")

    libreoffice = shutil.which("libreoffice") or shutil.which("soffice")
    pdftoppm = shutil.which("pdftoppm")
    montage = None if args.no_montage else shutil.which("montage")
    missing = [name for name, value in (("libreoffice", libreoffice), ("pdftoppm", pdftoppm)) if not value]
    if missing:
        parser.error(f"Required rendering tools are unavailable: {', '.join(missing)}")

    try:
        output_root = assert_safe_output_root(args.out, files)
    except ValueError as exc:
        parser.error(str(exc))
    if output_root.exists():
        shutil.rmtree(output_root)
    output_root.mkdir(parents=True, exist_ok=True)
    reports: list[dict[str, Any]] = []
    failures: list[dict[str, str]] = []
    for pptx in files:
        try:
            report = render_deck(
                pptx,
                output_root,
                libreoffice=libreoffice,
                pdftoppm=pdftoppm,
                montage=montage,
                dpi=args.dpi,
            )
            reports.append(report)
            print(f"PASS: rendered {pptx}")
        except Exception as exc:  # pragma: no cover - exercised by command-level failures
            failures.append({"source": pptx.as_posix(), "message": str(exc)})
            print(f"FAIL: {pptx}: {exc}", file=sys.stderr)

    summary = {
        "schema": 1,
        "tool": "Marin Learn PPTX renderer",
        "status": "fail" if failures else "pass",
        "dpi": args.dpi,
        "tools": {
            "libreoffice": libreoffice,
            "pdftoppm": pdftoppm,
            "montage": montage,
        },
        "counts": {
            "files": len(files),
            "rendered": len(reports),
            "failed": len(failures),
            "slides": sum(item["slideCount"] for item in reports),
        },
        "files": reports,
        "failures": failures,
    }
    summary_path = (args.summary or output_root / "render-results.json").resolve()
    summary_path.parent.mkdir(parents=True, exist_ok=True)
    summary_path.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(f"Render summary: {summary_path}")
    raise SystemExit(0 if not failures else 1)


if __name__ == "__main__":
    main()
