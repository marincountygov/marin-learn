#!/usr/bin/env python3
"""Create and evaluate auditable Marin Learn PPTX manual release evidence."""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import pathlib
import sys
import zipfile
from collections import Counter
from typing import Any, Iterable

ROOT = pathlib.Path(__file__).resolve().parents[1]
DEFAULT_PLAN = ROOT / "docs" / "pptx" / "manual-acceptance-plan.json"
DEFAULT_REVIEW = ROOT / "build" / "pptx-review"
DEFAULT_RENDER = ROOT / "build" / "pptx-rendered"
FIXED_TIMESTAMP = (1980, 1, 1, 0, 0, 0)
FORBIDDEN_EVIDENCE_EXTENSIONS = {
    ".ttf", ".otf", ".woff", ".woff2", ".eot", ".fon", ".fnt"
}
READY_DISPOSITIONS = {"ready-for-controlled-pilot", "ready-for-production"}

sys.path.insert(0, str(ROOT / "scripts"))
import validate_pptx  # noqa: E402


class ReleaseGateError(ValueError):
    """Raised for malformed or unsafe release-gate inputs."""


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def sha256_file(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def has_magic(path: pathlib.Path, magic: bytes) -> bool:
    try:
        with path.open("rb") as handle:
            return handle.read(len(magic)) == magic
    except OSError:
        return False


def load_json(path: pathlib.Path, label: str) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise ReleaseGateError(f"Missing {label}: {path}") from exc
    except json.JSONDecodeError as exc:
        raise ReleaseGateError(f"Invalid JSON in {label} {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise ReleaseGateError(f"{label} must contain a JSON object: {path}")
    return value


def write_json(path: pathlib.Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def relative_to_file(path: pathlib.Path, base_file: pathlib.Path) -> str:
    return pathlib.Path(os.path.relpath(path.resolve(), base_file.resolve().parent)).as_posix()


def safe_relative_path(value: str, label: str) -> pathlib.PurePosixPath:
    if not isinstance(value, str) or not value.strip():
        raise ReleaseGateError(f"{label} must be a nonempty relative path.")
    normalized = value.replace("\\", "/")
    path = pathlib.PurePosixPath(normalized)
    if path.is_absolute() or ":" in normalized or any(part in {"", ".", ".."} for part in path.parts):
        raise ReleaseGateError(f"Unsafe {label}: {value}")
    return path


def resolve_root_recorded_path(value: str, label: str) -> pathlib.Path:
    if not isinstance(value, str) or not value.strip():
        raise ReleaseGateError(f"{label} must be a nonempty path.")
    path = pathlib.Path(value)
    return path.resolve() if path.is_absolute() else (ROOT / path).resolve()


def artifact_key(item: dict[str, Any]) -> str:
    return f"{item.get('learningSetIdentifier', '')}/{item.get('presentationIdentifier', '')}"


def inspect_automated_evidence(review_root: pathlib.Path, render_root: pathlib.Path) -> dict[str, Any]:
    review_root = review_root.resolve()
    render_root = render_root.resolve()
    issues: list[str] = []

    try:
        generation = load_json(review_root / "results.json", "PPTX generation summary")
    except ReleaseGateError as exc:
        generation = {}
        issues.append(str(exc))
    try:
        independent = load_json(review_root / "independent-validation.json", "independent validation summary")
    except ReleaseGateError as exc:
        independent = {}
        issues.append(str(exc))
    try:
        rendering = load_json(render_root / "render-results.json", "render summary")
    except ReleaseGateError as exc:
        rendering = {}
        issues.append(str(exc))

    if generation and generation.get("status") != "pass":
        issues.append("PPTX generation summary did not pass.")
    if generation and generation.get("counts", {}).get("failures") not in (0, None):
        issues.append("PPTX generation summary contains failures.")
    if independent and independent.get("overallAutomatedStatus") != "pass":
        issues.append("Independent OOXML validation did not pass.")
    if independent and independent.get("counts", {}).get("failed") not in (0, None):
        issues.append("Independent OOXML validation contains failed files.")
    if rendering and rendering.get("status") != "pass":
        issues.append("PPTX rendering did not pass.")
    if rendering and rendering.get("counts", {}).get("failed") not in (0, None):
        issues.append("PPTX rendering contains failed files.")

    artifacts: list[dict[str, Any]] = []
    seen_keys: set[str] = set()
    for raw in generation.get("artifacts", []) if isinstance(generation.get("artifacts"), list) else []:
        if not isinstance(raw, dict):
            issues.append("Generation summary contains a non-object artifact record.")
            continue
        key = artifact_key(raw)
        if not key.strip("/") or key in seen_keys:
            issues.append(f"Generation summary contains an invalid or duplicate artifact key: {key or '(empty)'}")
            continue
        seen_keys.add(key)
        try:
            pptx_rel = safe_relative_path(raw.get("file", ""), f"artifact file for {key}")
            manifest_rel = safe_relative_path(raw.get("manifest", ""), f"artifact manifest for {key}")
            validation_rel = safe_relative_path(raw.get("validation", ""), f"artifact validation for {key}")
            build_rel = safe_relative_path(raw.get("buildRecord", ""), f"artifact build record for {key}")
        except ReleaseGateError as exc:
            issues.append(str(exc))
            continue
        pptx_path = review_root.joinpath(*pptx_rel.parts)
        sidecars = {
            "manifest": review_root.joinpath(*manifest_rel.parts),
            "validation": review_root.joinpath(*validation_rel.parts),
            "buildRecord": review_root.joinpath(*build_rel.parts),
            "independentValidation": pptx_path.with_suffix(".independent-validation.json"),
        }
        for label, path in {"PPTX": pptx_path, **sidecars}.items():
            if not path.is_file():
                issues.append(f"Missing {label} for {key}: {path}")
        actual_sha = sha256_file(pptx_path) if pptx_path.is_file() else None
        expected_sha = raw.get("sha256")
        if actual_sha and expected_sha != actual_sha:
            issues.append(f"PPTX checksum mismatch for {key}: expected {expected_sha}, found {actual_sha}.")
        if raw.get("status") != "pass":
            issues.append(f"Generation artifact {key} did not pass its production gate.")

        if sidecars["manifest"].is_file():
            try:
                manifest_record = load_json(sidecars["manifest"], f"generation manifest for {key}")
                if len(manifest_record.get("slides", [])) != raw.get("slideCount"):
                    issues.append(f"Generation manifest slide count does not match {key}.")
            except ReleaseGateError as exc:
                issues.append(str(exc))
        if sidecars["validation"].is_file():
            try:
                validation_record = load_json(sidecars["validation"], f"production validation for {key}")
                if validation_record.get("status") != "pass":
                    issues.append(f"Production validation sidecar did not pass for {key}.")
            except ReleaseGateError as exc:
                issues.append(str(exc))
        if sidecars["buildRecord"].is_file():
            try:
                build_record = load_json(sidecars["buildRecord"], f"build record for {key}")
                output_record = build_record.get("output") if isinstance(build_record.get("output"), dict) else {}
                if output_record.get("sha256") != actual_sha:
                    issues.append(f"Build-record output checksum does not match {key}.")
                if pptx_path.is_file() and output_record.get("bytes") != pptx_path.stat().st_size:
                    issues.append(f"Build-record output byte count does not match {key}.")
                runtime_record = build_record.get("runtime") if isinstance(build_record.get("runtime"), dict) else {}
                if runtime_record.get("source") == "vendored-node-bundle" and not runtime_record.get("svgFallback"):
                    issues.append(f"Build record does not identify the Node SVG fallback policy for {key}.")
            except ReleaseGateError as exc:
                issues.append(str(exc))
        if sidecars["independentValidation"].is_file():
            try:
                independent_sidecar = load_json(
                    sidecars["independentValidation"], f"independent validation sidecar for {key}"
                )
                if independent_sidecar.get("overallAutomatedStatus") != "pass":
                    issues.append(f"Independent validation sidecar did not pass for {key}.")
                if independent_sidecar.get("sha256") != actual_sha:
                    issues.append(f"Independent validation sidecar checksum does not match {key}.")
            except ReleaseGateError as exc:
                issues.append(str(exc))
        artifacts.append({
            "key": key,
            "learningSetIdentifier": raw.get("learningSetIdentifier"),
            "presentationIdentifier": raw.get("presentationIdentifier"),
            "presentationName": raw.get("presentationName"),
            "path": pptx_path,
            "relativePath": pptx_rel.as_posix(),
            "sha256": actual_sha or expected_sha,
            "slideCount": raw.get("slideCount"),
            "warningCount": raw.get("warningCount", 0),
            "sidecars": sidecars,
        })

    independent_by_sha = {
        item.get("sha256"): item
        for item in independent.get("files", []) if isinstance(item, dict) and item.get("sha256")
    }
    render_by_sha = {
        item.get("sourceSha256"): item
        for item in rendering.get("files", []) if isinstance(item, dict) and item.get("sourceSha256")
    }
    for artifact in artifacts:
        digest = artifact.get("sha256")
        independent_item = independent_by_sha.get(digest)
        if not independent_item:
            issues.append(f"No independent validation record matches {artifact['key']} ({digest}).")
        elif independent_item.get("overallAutomatedStatus") != "pass":
            issues.append(f"Independent validation failed for {artifact['key']}.")
        render_item = render_by_sha.get(digest)
        if not render_item:
            issues.append(f"No render record matches {artifact['key']} ({digest}).")
        elif render_item.get("status") != "pass":
            issues.append(f"Rendering failed for {artifact['key']}.")
        else:
            render_paths: dict[str, Any] = {}
            try:
                pdf_rel = safe_relative_path(render_item.get("pdf", ""), f"rendered PDF for {artifact['key']}")
                pdf_path = render_root.joinpath(*pdf_rel.parts)
                render_paths["pdf"] = pdf_path
                if not pdf_path.is_file():
                    issues.append(f"Rendered PDF is missing for {artifact['key']}: {pdf_path}")
                elif not has_magic(pdf_path, b"%PDF-"):
                    issues.append(f"Rendered PDF has an invalid file signature for {artifact['key']}.")
                elif render_item.get("pdfSha256") != sha256_file(pdf_path):
                    issues.append(f"Rendered PDF checksum does not match {artifact['key']}.")

                slide_values = render_item.get("slides")
                if not isinstance(slide_values, list):
                    issues.append(f"Render slide list is invalid for {artifact['key']}.")
                    slide_values = []
                slide_paths: list[pathlib.Path] = []
                for index, value in enumerate(slide_values, start=1):
                    slide_rel = safe_relative_path(value, f"rendered slide {index} for {artifact['key']}")
                    slide_path = render_root.joinpath(*slide_rel.parts)
                    slide_paths.append(slide_path)
                    if not slide_path.is_file():
                        issues.append(f"Rendered slide {index} is missing for {artifact['key']}: {slide_path}")
                    elif not has_magic(slide_path, b"\x89PNG\r\n\x1a\n"):
                        issues.append(f"Rendered slide {index} has an invalid PNG signature for {artifact['key']}.")
                render_paths["slides"] = slide_paths
                if len(slide_paths) != artifact.get("slideCount"):
                    issues.append(f"Rendered slide count does not match {artifact['key']}.")

                montage_value = render_item.get("montage")
                if montage_value:
                    montage_rel = safe_relative_path(montage_value, f"rendered montage for {artifact['key']}")
                    montage_path = render_root.joinpath(*montage_rel.parts)
                    render_paths["montage"] = montage_path
                    if not montage_path.is_file():
                        issues.append(f"Rendered montage is missing for {artifact['key']}: {montage_path}")
                    elif not has_magic(montage_path, b"\x89PNG\r\n\x1a\n"):
                        issues.append(f"Rendered montage has an invalid PNG signature for {artifact['key']}.")

                log_rel = safe_relative_path(render_item.get("log", ""), f"render log for {artifact['key']}")
                log_path = render_root.joinpath(*log_rel.parts)
                render_paths["log"] = log_path
                if not log_path.is_file():
                    issues.append(f"Render log is missing for {artifact['key']}: {log_path}")
            except ReleaseGateError as exc:
                issues.append(str(exc))
            artifact["render"] = render_item
            artifact["renderPaths"] = render_paths

    expected_count = len(artifacts)
    if generation and generation.get("counts", {}).get("presentations") != expected_count:
        issues.append("Generation presentation count does not match artifact records.")
    if independent and independent.get("counts", {}).get("files") != expected_count:
        issues.append("Independent validation file count does not match generated artifacts.")
    if rendering and rendering.get("counts", {}).get("files") != expected_count:
        issues.append("Render file count does not match generated artifacts.")
    expected_slides = sum(int(item.get("slideCount") or 0) for item in artifacts)
    if rendering and rendering.get("counts", {}).get("slides") != expected_slides:
        issues.append("Render slide total does not match generated artifacts.")

    release_fixture = next(
        (artifact for artifact in artifacts if artifact["learningSetIdentifier"] == "pptx-release-conformance"),
        None,
    )
    if release_fixture is None:
        issues.append("The PPTX release-conformance fixture is missing from automated evidence.")

    fixture_package = None
    for package in generation.get("packages", []) if isinstance(generation.get("packages"), list) else []:
        if not isinstance(package, dict):
            continue
        learning_set = package.get("learningSet") or {}
        if learning_set.get("identifier") == "pptx-release-conformance":
            fixture_package = {
                "source": package.get("source"),
                "sha256": package.get("sourceSha256"),
            }
            break
    if fixture_package is None:
        issues.append("The generation summary does not identify the PPTX release fixture source package.")
    else:
        try:
            fixture_source_path = resolve_root_recorded_path(
                fixture_package.get("source", ""), "release-fixture source package"
            )
            fixture_package["path"] = fixture_source_path
            allowed_roots = (ROOT.resolve(), review_root.parent.resolve())
            if not any(fixture_source_path == root or fixture_source_path.is_relative_to(root) for root in allowed_roots):
                issues.append(f"The release-fixture source package is outside allowed evidence roots: {fixture_source_path}")
            elif fixture_source_path.is_symlink():
                issues.append(f"The release-fixture source package must not be a symlink: {fixture_source_path}")
            elif not fixture_source_path.is_file():
                issues.append(f"The release-fixture source package is missing: {fixture_source_path}")
            elif fixture_package.get("sha256") != sha256_file(fixture_source_path):
                issues.append("The release-fixture source package checksum no longer matches generation evidence.")
        except ReleaseGateError as exc:
            issues.append(str(exc))

    return {
        "status": "pass" if not issues else "fail",
        "issues": issues,
        "reviewRoot": review_root,
        "renderRoot": render_root,
        "generation": generation,
        "independent": independent,
        "rendering": rendering,
        "artifacts": artifacts,
        "releaseFixture": release_fixture,
        "fixturePackage": fixture_package,
    }


def default_scope(target: str) -> dict[str, Any]:
    return {
        "distributionScope": "controlled-internal-pilot" if target == "pilot" else "production",
        "supportedPowerPointEnvironments": ["Microsoft PowerPoint desktop for Windows"],
        "chartsPresent": False,
        "unmanagedFontEnvironmentInScope": False,
        "officialIdentityApprovalRequiredForPilot": False,
        "pdfOrHandoutsDistributed": False,
    }


def initialize_manual_record(
    plan: dict[str, Any], automated: dict[str, Any], target: str, output_path: pathlib.Path
) -> dict[str, Any]:
    if target not in plan.get("targets", {}):
        raise ReleaseGateError(f"Unknown release target: {target}")
    files = []
    for artifact in automated["artifacts"]:
        files.append({
            "key": artifact["key"],
            "presentationName": artifact["presentationName"],
            "path": artifact["relativePath"],
            "sha256": artifact["sha256"],
            "slideCount": artifact["slideCount"],
            "generationPath": "node",
        })
    tests = []
    all_keys = [item["key"] for item in files]
    for case in plan.get("cases", []):
        tests.append({
            "id": case["id"],
            "status": "not_run",
            "notes": "",
            "notApplicableReason": "",
            "testedFiles": list(all_keys),
            "evidence": [],
            "remediationOwner": "",
            "retestDate": "",
        })
    fixture_package = automated.get("fixturePackage") or {}
    record = {
        "schema": 1,
        "planVersion": plan.get("planVersion"),
        "target": target,
        "createdAt": utc_now(),
        "session": {
            "tester": "",
            "testDate": "",
            "operatingSystem": "",
            "powerPoint": {"product": "Microsoft PowerPoint", "channel": "", "version": ""},
            "screenReaders": [],
            "fonts": {"jostInstalled": None, "openSansInstalled": None},
            "contentOwner": "",
            "notes": "",
        },
        "scope": default_scope(target),
        "policies": {
            "fontDistribution": "",
            "identityApproval": "",
            "derivativeDistribution": "",
        },
        "automatedEvidence": {
            "statusAtInitialization": automated["status"],
            "generationSummary": relative_to_file(automated["reviewRoot"] / "results.json", output_path),
            "independentValidation": relative_to_file(
                automated["reviewRoot"] / "independent-validation.json", output_path
            ),
            "renderSummary": relative_to_file(
                automated["renderRoot"] / "render-results.json", output_path
            ),
        },
        "filesUnderTest": files,
        "browserExport": {
            "status": "not_run",
            "file": "",
            "sha256": "",
            "browser": "",
            "downloadedAt": "",
            "sourcePackageSha256": fixture_package.get("sha256") or "",
            "notes": "",
        },
        "tests": tests,
    }
    return record


def resolve_manual_path(manual_path: pathlib.Path, value: str, label: str) -> pathlib.Path:
    relative = safe_relative_path(value, label)
    return manual_path.resolve().parent.joinpath(*relative.parts).resolve()


def evidence_paths_for_test(test: dict[str, Any], manual_path: pathlib.Path) -> tuple[list[pathlib.Path], list[str]]:
    paths: list[pathlib.Path] = []
    issues: list[str] = []
    evidence = test.get("evidence", [])
    if not isinstance(evidence, list):
        return [], [f"{test.get('id')}: evidence must be an array."]
    for index, entry in enumerate(evidence, start=1):
        value = entry if isinstance(entry, str) else entry.get("path") if isinstance(entry, dict) else None
        if not value:
            issues.append(f"{test.get('id')}: evidence item {index} has no path.")
            continue
        try:
            path = resolve_manual_path(manual_path, value, f"evidence path for {test.get('id')}")
        except ReleaseGateError as exc:
            issues.append(str(exc))
            continue
        evidence_root = manual_path.resolve().parent
        if not (path == evidence_root or path.is_relative_to(evidence_root)):
            issues.append(f"{test.get('id')}: evidence file must remain under {evidence_root}: {path}")
        elif path.suffix.lower() in FORBIDDEN_EVIDENCE_EXTENSIONS:
            issues.append(f"{test.get('id')}: font files are not permitted as release evidence: {path}")
        elif not path.is_file():
            issues.append(f"{test.get('id')}: evidence file does not exist: {path}")
        else:
            paths.append(path)
    return paths, issues


def validate_session(manual: dict[str, Any], tests_by_id: dict[str, dict[str, Any]]) -> list[str]:
    issues: list[str] = []
    session = manual.get("session")
    if not isinstance(session, dict):
        return ["Manual record is missing the session object."]
    for key, label in (
        ("tester", "tester"),
        ("testDate", "test date"),
        ("operatingSystem", "operating system"),
    ):
        if not str(session.get(key) or "").strip():
            issues.append(f"Manual test session is missing {label}.")
    if str(session.get("testDate") or "").strip():
        try:
            dt.date.fromisoformat(str(session["testDate"]))
        except ValueError:
            issues.append("Manual test session testDate must use YYYY-MM-DD.")
    power_point = session.get("powerPoint")
    if not isinstance(power_point, dict):
        issues.append("Manual test session is missing PowerPoint product information.")
    else:
        for key in ("product", "version"):
            if not str(power_point.get(key) or "").strip():
                issues.append(f"Manual test session PowerPoint {key} is required.")

    if any(test.get("status") == "pass" and test.get("screenReaderRequired") for test in tests_by_id.values()):
        readers = session.get("screenReaders")
        if not isinstance(readers, list) or not readers:
            issues.append("A passing screen-reader test requires at least one screen reader and version in session.screenReaders.")
        else:
            for item in readers:
                if not isinstance(item, dict) or not item.get("name") or not item.get("version"):
                    issues.append("Each screen reader record must include name and version.")
                    break
    return issues


def requirement_for(case: dict[str, Any], target: str, scope: dict[str, Any]) -> tuple[str, bool]:
    requirement = case.get(f"{target}Requirement")
    if requirement == "conditional":
        condition = case.get("conditionKey")
        return requirement, bool(scope.get(condition))
    return str(requirement or "required"), requirement == "required"


def validate_browser_export(
    manual: dict[str, Any], manual_path: pathlib.Path, automated: dict[str, Any]
) -> tuple[dict[str, Any] | None, list[str]]:
    issues: list[str] = []
    record = manual.get("browserExport")
    if not isinstance(record, dict):
        return None, ["Manual record is missing browserExport evidence."]
    if record.get("status") != "pass":
        issues.append("A real browser-generated release-fixture PPTX has not been recorded as passing.")
        return None, issues
    if not str(record.get("browser") or "").strip():
        issues.append("browserExport.browser must identify the browser and version.")
    downloaded_at = str(record.get("downloadedAt") or "").strip()
    if not downloaded_at:
        issues.append("browserExport.downloadedAt is required.")
    else:
        try:
            parsed_downloaded_at = dt.datetime.fromisoformat(downloaded_at.replace("Z", "+00:00"))
            if parsed_downloaded_at.tzinfo is None:
                issues.append("browserExport.downloadedAt must include a UTC offset or Z.")
        except ValueError:
            issues.append("browserExport.downloadedAt must be an ISO 8601 date and time.")
    fixture_package = automated.get("fixturePackage") or {}
    expected_source_sha = fixture_package.get("sha256")
    if not expected_source_sha:
        issues.append("The automated evidence does not identify the release-fixture package checksum.")
    elif record.get("sourcePackageSha256") != expected_source_sha:
        issues.append(
            "Browser export source-package checksum is stale or does not match the release fixture "
            f"(expected {expected_source_sha}, found {record.get('sourcePackageSha256')})."
        )
    try:
        path = resolve_manual_path(manual_path, record.get("file", ""), "browser export file")
    except ReleaseGateError as exc:
        issues.append(str(exc))
        return None, issues
    browser_root = manual_path.resolve().parent
    if not (path == browser_root or path.is_relative_to(browser_root)):
        issues.append(f"Browser export file must remain under {browser_root}: {path}")
        return None, issues
    if path.suffix.lower() != ".pptx":
        issues.append(f"Browser export file must use the .pptx extension: {path}")
        return None, issues
    if not path.is_file():
        issues.append(f"Browser export file does not exist: {path}")
        return None, issues
    digest = sha256_file(path)
    if record.get("sha256") != digest:
        issues.append(f"Browser export checksum mismatch: expected {record.get('sha256')}, found {digest}.")

    fixture = automated.get("releaseFixture")
    if not fixture:
        issues.append("Automated release fixture is unavailable for browser-output validation.")
        return None, issues
    manifest_path = fixture["sidecars"]["manifest"]
    if not manifest_path.is_file():
        issues.append(f"Release fixture manifest is missing: {manifest_path}")
        return None, issues
    manifest = load_json(manifest_path, "release fixture manifest")
    report = validate_pptx.PptxValidation(path, manifest).run()
    if report.get("overallAutomatedStatus") != "pass":
        issues.append("Independent validation failed for the browser-generated release fixture.")
    return {
        "path": path,
        "sha256": digest,
        "validation": report,
    }, issues


def evaluate_manual_tests(
    plan: dict[str, Any], manual: dict[str, Any], manual_path: pathlib.Path, target: str
) -> tuple[list[dict[str, Any]], list[str], list[str], list[pathlib.Path]]:
    blockers: list[str] = []
    warnings: list[str] = []
    attachments: list[pathlib.Path] = []
    scope = manual.get("scope") if isinstance(manual.get("scope"), dict) else {}
    files_under_test = manual.get("filesUnderTest") if isinstance(manual.get("filesUnderTest"), list) else []
    known_file_keys = {
        item.get("key") for item in files_under_test
        if isinstance(item, dict) and isinstance(item.get("key"), str) and item.get("key")
    }
    raw_tests = manual.get("tests")
    if not isinstance(raw_tests, list):
        return [], ["Manual record tests must be an array."], warnings, attachments
    manual_by_id: dict[str, dict[str, Any]] = {}
    for item in raw_tests:
        if not isinstance(item, dict) or not item.get("id"):
            blockers.append("Manual record contains a test without an id.")
            continue
        if item["id"] in manual_by_id:
            blockers.append(f"Manual record contains duplicate test id {item['id']}.")
        manual_by_id[item["id"]] = item

    plan_ids = [case["id"] for case in plan.get("cases", [])]
    extra = sorted(set(manual_by_id) - set(plan_ids))
    if extra:
        blockers.append(f"Manual record contains unknown tests: {', '.join(extra)}.")

    evaluated: list[dict[str, Any]] = []
    plan_statuses = set(plan.get("statusValues", []))
    for case in plan.get("cases", []):
        test = manual_by_id.get(case["id"])
        requirement, condition_applies = requirement_for(case, target, scope)
        if test is None:
            blockers.append(f"Missing manual test result: {case['id']} — {case['title']}.")
            evaluated.append({**case, "status": "missing", "required": condition_applies})
            continue
        status = test.get("status")
        if status not in plan_statuses:
            blockers.append(f"{case['id']}: invalid status {status!r}.")
            status = "invalid"
        notes = str(test.get("notes") or "").strip()
        if status not in {"not_run"} and not notes:
            blockers.append(f"{case['id']}: notes are required for status {status}.")
        evidence_paths, evidence_issues = evidence_paths_for_test(test, manual_path)
        blockers.extend(evidence_issues)
        attachments.extend(evidence_paths)
        if status == "pass" and case.get("evidenceFileRequired") and not evidence_paths:
            blockers.append(f"{case['id']}: at least one evidence file is required for a passing result.")

        required = requirement == "required" or (requirement == "conditional" and condition_applies)
        if status == "escalate":
            blockers.append(f"{case['id']} requires escalation: {notes or case['title']}.")
        elif status in {"fail", "blocked"}:
            blockers.append(f"{case['id']} is {status}: {notes or case['title']}.")
        elif required and status != "pass":
            blockers.append(f"{case['id']} must pass for the {target} target; current status is {status}.")
        elif requirement == "conditional" and not condition_applies:
            if status == "not_applicable":
                if not str(test.get("notApplicableReason") or "").strip():
                    blockers.append(f"{case['id']}: not_applicable requires notApplicableReason.")
            elif status == "pass":
                warnings.append(f"{case['id']} was completed although its configured condition is false.")
            else:
                blockers.append(
                    f"{case['id']} is conditionally out of scope and must be explicitly marked not_applicable with a reason."
                )
        elif requirement not in {"required", "conditional"} and status == "not_run":
            pass

        tested_files = test.get("testedFiles")
        if status == "pass" and (not isinstance(tested_files, list) or not tested_files):
            blockers.append(f"{case['id']}: a passing result must name at least one tested file.")
        if isinstance(tested_files, list):
            invalid_tested_files = sorted({
                str(item) for item in tested_files
                if not isinstance(item, str) or item not in known_file_keys
            })
            if invalid_tested_files:
                blockers.append(
                    f"{case['id']}: testedFiles contains unknown or stale keys: "
                    + ", ".join(invalid_tested_files)
                    + "."
                )
        evaluated.append({
            **case,
            "requirement": requirement,
            "conditionApplies": condition_applies,
            "required": required,
            "status": status,
            "notes": notes,
            "notApplicableReason": str(test.get("notApplicableReason") or "").strip(),
            "testedFiles": tested_files if isinstance(tested_files, list) else [],
            "evidence": [relative_to_file(path, manual_path) for path in evidence_paths],
        })

    evaluated_by_id = {item["id"]: item for item in evaluated}
    blockers.extend(validate_session(manual, evaluated_by_id))
    session = manual.get("session") if isinstance(manual.get("session"), dict) else {}
    policies = manual.get("policies") if isinstance(manual.get("policies"), dict) else {}

    if evaluated_by_id.get("MANUAL-015", {}).get("status") == "pass":
        fonts = session.get("fonts") if isinstance(session.get("fonts"), dict) else {}
        if fonts.get("jostInstalled") is not True or fonts.get("openSansInstalled") is not True:
            blockers.append("MANUAL-015 pass requires session.fonts to confirm Jost and Open Sans are installed.")
    if evaluated_by_id.get("MANUAL-016", {}).get("status") == "pass" and not str(
        policies.get("fontDistribution") or ""
    ).strip():
        blockers.append("MANUAL-016 pass requires policies.fontDistribution.")
    if evaluated_by_id.get("MANUAL-018", {}).get("status") == "pass":
        environments = scope.get("supportedPowerPointEnvironments")
        if not isinstance(environments, list) or not any(str(item).strip() for item in environments):
            blockers.append("MANUAL-018 pass requires scope.supportedPowerPointEnvironments.")
    if evaluated_by_id.get("MANUAL-019", {}).get("status") == "pass" and not str(
        policies.get("identityApproval") or ""
    ).strip():
        blockers.append("MANUAL-019 pass requires policies.identityApproval.")
    if evaluated_by_id.get("MANUAL-022", {}).get("status") == "pass" and not str(
        session.get("contentOwner") or ""
    ).strip():
        blockers.append("MANUAL-022 pass requires session.contentOwner.")

    return evaluated, blockers, warnings, sorted(set(attachments), key=lambda item: item.as_posix())


def compare_files_under_test(manual: dict[str, Any], automated: dict[str, Any]) -> list[str]:
    issues: list[str] = []
    raw = manual.get("filesUnderTest")
    if not isinstance(raw, list):
        return ["Manual record filesUnderTest must be an array."]
    manual_by_key = {item.get("key"): item for item in raw if isinstance(item, dict) and item.get("key")}
    automated_by_key = {item["key"]: item for item in automated["artifacts"]}
    missing = sorted(set(automated_by_key) - set(manual_by_key))
    extra = sorted(set(manual_by_key) - set(automated_by_key))
    if missing:
        issues.append(f"Manual record is missing generated files: {', '.join(missing)}.")
    if extra:
        issues.append(f"Manual record contains stale or unknown generated files: {', '.join(extra)}.")
    for key in sorted(set(manual_by_key) & set(automated_by_key)):
        manual_item = manual_by_key[key]
        artifact = automated_by_key[key]
        if manual_item.get("sha256") != artifact.get("sha256"):
            issues.append(f"Manual record checksum is stale for {key}.")
        if manual_item.get("slideCount") != artifact.get("slideCount"):
            issues.append(f"Manual record slide count is stale for {key}.")
    return issues


def make_decision(
    plan: dict[str, Any], manual: dict[str, Any], manual_path: pathlib.Path,
    automated: dict[str, Any], target: str
) -> tuple[dict[str, Any], list[pathlib.Path]]:
    blockers = list(automated["issues"])
    warnings: list[str] = []
    if manual.get("schema") != 1:
        blockers.append("Manual record schema must be 1.")
    if manual.get("planVersion") != plan.get("planVersion"):
        blockers.append(
            f"Manual record planVersion {manual.get('planVersion')!r} does not match {plan.get('planVersion')!r}."
        )
    if manual.get("target") != target:
        blockers.append(f"Manual record target {manual.get('target')!r} does not match requested target {target!r}.")
    blockers.extend(compare_files_under_test(manual, automated))

    browser, browser_issues = validate_browser_export(manual, manual_path, automated)
    blockers.extend(browser_issues)
    evaluated, manual_blockers, manual_warnings, attachments = evaluate_manual_tests(
        plan, manual, manual_path, target
    )
    blockers.extend(manual_blockers)
    warnings.extend(manual_warnings)

    escalation = any(item.get("status") == "escalate" for item in evaluated)
    if escalation:
        disposition = "escalate"
    elif blockers:
        disposition = "hold"
    else:
        disposition = plan["targets"][target]["readyDisposition"]

    counts = Counter(item.get("status") for item in evaluated)
    decision = {
        "schema": 1,
        "tool": "Marin Learn PPTX release gate",
        "planVersion": plan.get("planVersion"),
        "evaluatedAt": utc_now(),
        "target": target,
        "disposition": disposition,
        "automatedStatus": automated["status"],
        "manualStatus": "pass" if not manual_blockers and not browser_issues else "fail",
        "counts": {
            "generatedDecks": len(automated["artifacts"]),
            "generatedSlides": sum(int(item.get("slideCount") or 0) for item in automated["artifacts"]),
            "manualTests": len(evaluated),
            "manualByStatus": dict(sorted(counts.items())),
            "blockers": len(blockers),
            "warnings": len(warnings),
        },
        "blockers": blockers,
        "warnings": warnings,
        "session": manual.get("session"),
        "scope": manual.get("scope"),
        "policies": manual.get("policies"),
        "filesUnderTest": [
            {
                "key": item["key"],
                "presentationName": item["presentationName"],
                "path": item["relativePath"],
                "sha256": item["sha256"],
                "slideCount": item["slideCount"],
                "warningCount": item["warningCount"],
            }
            for item in automated["artifacts"]
        ],
        "browserExport": {
            "file": relative_to_file(browser["path"], manual_path) if browser else None,
            "sha256": browser["sha256"] if browser else None,
            "independentValidationStatus": (
                browser["validation"].get("overallAutomatedStatus") if browser else None
            ),
        },
        "manualTests": evaluated,
        "statement": (
            "This decision records the tested environments and evidence. It does not assert universal "
            "accessibility, universal compatibility, or WCAG conformance for every future presentation."
        ),
    }
    if browser:
        attachments.append(browser["path"])
    return decision, sorted(set(attachments), key=lambda item: item.as_posix())


def markdown_report(decision: dict[str, Any]) -> str:
    lines = [
        "# Marin Learn PPTX release decision",
        "",
        f"- **Disposition:** `{decision['disposition']}`",
        f"- **Target:** `{decision['target']}`",
        f"- **Evaluated:** {decision['evaluatedAt']}",
        f"- **Automated evidence:** {decision['automatedStatus']}",
        f"- **Manual evidence:** {decision['manualStatus']}",
        "",
        decision["statement"],
        "",
        "## Automated evidence",
        "",
        f"- Generated decks: {decision['counts']['generatedDecks']}",
        f"- Generated slides: {decision['counts']['generatedSlides']}",
        f"- Browser output independently validated: {decision['browserExport']['independentValidationStatus'] or 'not available'}",
        "",
    ]
    if decision["blockers"]:
        lines.extend(["## Blocking findings", ""])
        lines.extend(f"- {item}" for item in decision["blockers"])
        lines.append("")
    if decision["warnings"]:
        lines.extend(["## Warnings", ""])
        lines.extend(f"- {item}" for item in decision["warnings"])
        lines.append("")
    lines.extend([
        "## Files under test",
        "",
        "| Presentation | Slides | Warnings | SHA-256 |",
        "|---|---:|---:|---|",
    ])
    for item in decision["filesUnderTest"]:
        lines.append(
            f"| {item['presentationName']} | {item['slideCount']} | {item['warningCount']} | `{item['sha256']}` |"
        )
    lines.extend([
        "",
        "## Manual test results",
        "",
        "| Test | Requirement | Status | Notes |",
        "|---|---|---|---|",
    ])
    for item in decision["manualTests"]:
        requirement = "required" if item["required"] else item["requirement"]
        notes = (item.get("notes") or item.get("notApplicableReason") or "").replace("|", "\\|")
        lines.append(f"| {item['id']} — {item['title']} | {requirement} | {item['status']} | {notes} |")
    lines.extend([
        "",
        "## Supported scope",
        "",
        f"- Distribution scope: {decision.get('scope', {}).get('distributionScope', '')}",
        "- PowerPoint environments: " + ", ".join(decision.get("scope", {}).get("supportedPowerPointEnvironments", [])),
        f"- Font policy: {decision.get('policies', {}).get('fontDistribution', '') or 'Not recorded'}",
        f"- Identity approval: {decision.get('policies', {}).get('identityApproval', '') or 'Not recorded'}",
        f"- Derivative policy: {decision.get('policies', {}).get('derivativeDistribution', '') or 'Not recorded'}",
        "",
    ])
    return "\n".join(lines)


def archive_file_entries(
    review_root: pathlib.Path,
    render_root: pathlib.Path,
    manual_path: pathlib.Path,
    decision_path: pathlib.Path,
    report_path: pathlib.Path,
    plan_path: pathlib.Path,
    attachments: Iterable[pathlib.Path],
    automated: dict[str, Any],
) -> list[tuple[pathlib.Path, str]]:
    entries: list[tuple[pathlib.Path, str]] = []

    def add_tree(root: pathlib.Path, prefix: str) -> None:
        for path in sorted(root.rglob("*"), key=lambda item: item.as_posix()):
            if path.is_symlink():
                raise ReleaseGateError(f"Evidence tree must not contain symlinks: {path}")
            if path.is_file():
                entries.append((path, f"{prefix}/{path.relative_to(root).as_posix()}"))

    add_tree(review_root.resolve(), "automated/pptx-review")
    add_tree(render_root.resolve(), "automated/pptx-rendered")
    entries.extend([
        (manual_path.resolve(), "manual/manual-results.json"),
        (decision_path.resolve(), "decision/release-decision.json"),
        (report_path.resolve(), "decision/RELEASE-DECISION.md"),
        (plan_path.resolve(), "plan/manual-acceptance-plan.json"),
        (ROOT / "docs" / "pptx" / "MANUAL-ACCEPTANCE.md", "plan/MANUAL-ACCEPTANCE.md"),
        (ROOT / "docs" / "pptx" / "RELEASE.md", "plan/RELEASE.md"),
    ])
    fixture_record = automated.get("fixturePackage") or {}
    fixture_path = fixture_record.get("path")
    if not isinstance(fixture_path, pathlib.Path) and fixture_record.get("source"):
        fixture_path = resolve_root_recorded_path(
            fixture_record["source"], "release-fixture source package"
        )
    if isinstance(fixture_path, pathlib.Path) and fixture_path.is_file():
        entries.append((fixture_path, "manual/pptx-release-conformance.zip"))

    attachment_root = manual_path.resolve().parent
    for path in attachments:
        path = path.resolve()
        try:
            relative = path.relative_to(attachment_root).as_posix()
        except ValueError as exc:
            raise ReleaseGateError(f"Manual evidence must be stored under {attachment_root}: {path}") from exc
        entries.append((path, f"manual/evidence/{relative}"))

    unique: dict[str, pathlib.Path] = {}
    for source, archive_name in entries:
        if not source.is_file():
            raise ReleaseGateError(f"Evidence source file does not exist: {source}")
        normalized = safe_relative_path(archive_name, "archive entry").as_posix()
        if source.suffix.lower() in FORBIDDEN_EVIDENCE_EXTENSIONS:
            raise ReleaseGateError(f"Font files must not be included in release evidence: {source}")
        existing = unique.get(normalized)
        if existing and existing != source:
            raise ReleaseGateError(f"Duplicate evidence archive path: {normalized}")
        unique[normalized] = source
    return [(source, name) for name, source in sorted(unique.items())]


def create_evidence_package(
    output: pathlib.Path,
    entries: list[tuple[pathlib.Path, str]],
) -> dict[str, Any]:
    output = output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    if any(output == source.resolve() for source, _ in entries):
        raise ReleaseGateError("Evidence package output must not overwrite an input file.")
    temporary = output.with_suffix(output.suffix + ".tmp")
    temporary.unlink(missing_ok=True)
    checksums = [(sha256_file(source), archive_name) for source, archive_name in entries]
    checksum_text = "".join(f"{digest}  {name}\n" for digest, name in checksums)
    try:
        with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            for source, archive_name in entries:
                info = zipfile.ZipInfo(archive_name, date_time=FIXED_TIMESTAMP)
                info.create_system = 3
                info.external_attr = 0o100644 << 16
                info.compress_type = zipfile.ZIP_DEFLATED
                archive.writestr(info, source.read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
            info = zipfile.ZipInfo("SHA256SUMS", date_time=FIXED_TIMESTAMP)
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, checksum_text.encode("utf-8"), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
        temporary.replace(output)
    finally:
        temporary.unlink(missing_ok=True)
    return {
        "file": output.as_posix(),
        "bytes": output.stat().st_size,
        "sha256": sha256_file(output),
        "entries": len(entries) + 1,
    }


def command_init(args: argparse.Namespace) -> int:
    plan = load_json(args.plan, "manual acceptance plan")
    automated = inspect_automated_evidence(args.review, args.render)
    record = initialize_manual_record(plan, automated, args.target, args.out)
    write_json(args.out, record)
    print(f"Manual acceptance record: {args.out.resolve()}")
    if automated["issues"]:
        for issue in automated["issues"]:
            print(f"AUTOMATED EVIDENCE ERROR: {issue}", file=sys.stderr)
        return 1
    print(f"Automated evidence: PASS ({len(automated['artifacts'])} decks)")
    return 0


def command_evaluate(args: argparse.Namespace) -> int:
    plan = load_json(args.plan, "manual acceptance plan")
    manual = load_json(args.manual, "manual acceptance record")
    target = args.target or manual.get("target")
    if target not in plan.get("targets", {}):
        raise ReleaseGateError(f"Unknown or missing release target: {target!r}")
    automated = inspect_automated_evidence(args.review, args.render)
    decision, attachments = make_decision(plan, manual, args.manual, automated, target)
    write_json(args.out, decision)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(markdown_report(decision), encoding="utf-8")

    package_result = None
    if args.package:
        entries = archive_file_entries(
            args.review, args.render, args.manual, args.out, args.report, args.plan,
            attachments, automated
        )
        package_result = create_evidence_package(args.package, entries)
        print(f"Evidence package: {package_result['file']} ({package_result['entries']} entries)")
        print(f"Evidence package SHA-256: {package_result['sha256']}")

    print(f"Release disposition: {decision['disposition']}")
    print(f"Decision JSON: {args.out.resolve()}")
    print(f"Decision report: {args.report.resolve()}")
    for blocker in decision["blockers"]:
        print(f"BLOCKER: {blocker}", file=sys.stderr)
    return 0 if decision["disposition"] in READY_DISPOSITIONS else 1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plan", type=pathlib.Path, default=DEFAULT_PLAN, help="Manual acceptance plan JSON")
    subparsers = parser.add_subparsers(dest="command", required=True)

    init = subparsers.add_parser("init", help="Create a checksum-bound manual acceptance record")
    init.add_argument("--review", type=pathlib.Path, default=DEFAULT_REVIEW, help="PPTX review evidence directory")
    init.add_argument("--render", type=pathlib.Path, default=DEFAULT_RENDER, help="PPTX render evidence directory")
    init.add_argument("--target", choices=("pilot", "production"), default="pilot")
    init.add_argument("--out", type=pathlib.Path, required=True, help="Manual results JSON to create")
    init.set_defaults(handler=command_init)

    evaluate = subparsers.add_parser("evaluate", help="Evaluate completed manual results and create a release decision")
    evaluate.add_argument("--review", type=pathlib.Path, default=DEFAULT_REVIEW, help="PPTX review evidence directory")
    evaluate.add_argument("--render", type=pathlib.Path, default=DEFAULT_RENDER, help="PPTX render evidence directory")
    evaluate.add_argument("--manual", type=pathlib.Path, required=True, help="Completed manual results JSON")
    evaluate.add_argument("--target", choices=("pilot", "production"), help="Override and verify target")
    evaluate.add_argument("--out", type=pathlib.Path, required=True, help="Release decision JSON")
    evaluate.add_argument("--report", type=pathlib.Path, required=True, help="Release decision Markdown report")
    evaluate.add_argument("--package", type=pathlib.Path, help="Optional final evidence ZIP")
    evaluate.set_defaults(handler=command_evaluate)
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    try:
        status = args.handler(args)
    except ReleaseGateError as exc:
        parser.error(str(exc))
    raise SystemExit(status)


if __name__ == "__main__":
    main()
