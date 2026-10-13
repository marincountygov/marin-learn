#!/usr/bin/env python3
"""Tests for the PPTX-4 release fixture and manual acceptance gate."""
from __future__ import annotations

import json
import pathlib
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import build_pptx_release_fixture  # noqa: E402
import pptx_release_gate  # noqa: E402
import validate_pptx  # noqa: E402


class PptxReleaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.temp = tempfile.TemporaryDirectory(prefix="marin-learn-pptx-release-")
        cls.root = pathlib.Path(cls.temp.name)
        cls.fixture_a = cls.root / "fixture-a.zip"
        cls.fixture_b = cls.root / "fixture-b.zip"
        cls.fixture_result = build_pptx_release_fixture.build_fixture(
            ROOT / "tests" / "fixtures" / "pptx-release", cls.fixture_a
        )
        build_pptx_release_fixture.build_fixture(
            ROOT / "tests" / "fixtures" / "pptx-release", cls.fixture_b
        )

        cls.review = cls.root / "review"
        completed = subprocess.run(
            [
                "node",
                str(ROOT / "scripts" / "generate_pptx.mjs"),
                str(cls.fixture_a),
                "--out",
                str(cls.review),
                "--summary",
                str(cls.review / "results.json"),
            ],
            cwd=ROOT,
            check=True,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
        )
        cls.generation_log = completed.stdout
        cls.pptx = cls.review / "pptx-release-conformance" / "pptx-release-conformance-slides.pptx"
        cls.manifest = cls.pptx.with_suffix(".manifest.json")
        subprocess.run(
            [
                sys.executable,
                str(ROOT / "scripts" / "validate_pptx.py"),
                str(cls.review),
                "--require-manifest",
                "--write-sidecars",
                "--out",
                str(cls.review / "independent-validation.json"),
            ],
            cwd=ROOT,
            check=True,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
        )
        cls.render = cls.root / "render"
        render_deck = cls.render / "pptx-release-conformance"
        render_deck.mkdir(parents=True)
        pdf = render_deck / "release.pdf"
        pdf.write_bytes(b"%PDF-1.4\n% synthetic release-gate test evidence\n")
        render_log = render_deck / "render.log"
        render_log.write_text("Synthetic render evidence for release-gate unit tests.\n", encoding="utf-8")
        slide_paths = []
        for index in range(1, 15):
            slide = render_deck / f"slide-{index:02d}.png"
            slide.write_bytes(b"\x89PNG\r\n\x1a\nsynthetic-png-test-evidence")
            slide_paths.append(slide.relative_to(cls.render).as_posix())
        digest = pptx_release_gate.sha256_file(cls.pptx)
        render_summary = {
            "schema": 1,
            "tool": "PPTX-4 test render summary",
            "status": "pass",
            "counts": {"files": 1, "rendered": 1, "failed": 0, "slides": 14},
            "files": [{
                "source": cls.pptx.as_posix(),
                "sourceSha256": digest,
                "slideCount": 14,
                "pdf": pdf.relative_to(cls.render).as_posix(),
                "pdfSha256": pptx_release_gate.sha256_file(pdf),
                "slides": slide_paths,
                "montage": None,
                "log": render_log.relative_to(cls.render).as_posix(),
                "status": "pass",
            }],
            "failures": [],
        }
        (cls.render / "render-results.json").write_text(
            json.dumps(render_summary, indent=2) + "\n", encoding="utf-8"
        )
        cls.plan = pptx_release_gate.load_json(
            ROOT / "docs" / "pptx" / "manual-acceptance-plan.json", "test plan"
        )
        cls.automated = pptx_release_gate.inspect_automated_evidence(cls.review, cls.render)

    @classmethod
    def tearDownClass(cls) -> None:
        cls.temp.cleanup()

    def setUp(self) -> None:
        self.case_dir = pathlib.Path(tempfile.mkdtemp(prefix="case-", dir=self.root))
        self.manual_path = self.case_dir / "manual-results.json"

    def tearDown(self) -> None:
        shutil.rmtree(self.case_dir)

    def test_manual_acceptance_plan_is_complete_unique_and_documented(self) -> None:
        self.assertEqual(self.plan["schema"], 1)
        self.assertEqual(
            self.plan["statusValues"],
            ["not_run", "pass", "fail", "blocked", "not_applicable", "escalate"],
        )
        ids = [case["id"] for case in self.plan["cases"]]
        self.assertEqual(ids, [f"MANUAL-{index:03d}" for index in range(1, 23)])
        self.assertEqual(len(ids), len(set(ids)))
        documented = (ROOT / "docs" / "pptx" / "MANUAL-ACCEPTANCE.md").read_text(encoding="utf-8")
        conditions = set(self.plan["conditionalScopeKeys"])
        for case in self.plan["cases"]:
            self.assertIn(f"### {case['id']} — {case['title']}", documented)
            self.assertIn(case["risk"], {"critical", "high", "moderate"})
            self.assertTrue(case["procedure"].strip())
            self.assertTrue(case["expectedResult"].strip())
            for target in ("pilotRequirement", "productionRequirement"):
                self.assertIn(case[target], {"required", "conditional"})
            if case["pilotRequirement"] == "conditional" or case["productionRequirement"] == "conditional":
                self.assertIn(case["conditionKey"], conditions)
            else:
                self.assertIsNone(case["conditionKey"])

    def test_release_fixture_build_is_deterministic_and_safe(self) -> None:
        self.assertEqual(self.fixture_a.read_bytes(), self.fixture_b.read_bytes())
        self.assertEqual(self.fixture_result["slideCount"], 14)
        self.assertEqual(self.fixture_result["files"], 15)
        self.assertEqual(
            self.fixture_result["layouts"],
            ["content", "media", "quote", "section", "split", "title"],
        )
        self.assertEqual(self.fixture_result["displayModes"], ["abstract", "full", "title"])
        with zipfile.ZipFile(self.fixture_a) as archive:
            names = archive.namelist()
            self.assertEqual(names, sorted(names))
            self.assertEqual(len(names), len(set(names)))
            self.assertIn("learning.json", names)
            self.assertTrue(all(item.date_time == (1980, 1, 1, 0, 0, 0) for item in archive.infolist()))

    def test_release_fixture_exports_svg_through_node_and_passes_independent_validation(self) -> None:
        summary = json.loads((self.review / "results.json").read_text(encoding="utf-8"))
        self.assertEqual(summary["status"], "pass")
        self.assertEqual(summary["counts"]["presentations"], 1)
        self.assertIn("14 slides", self.generation_log)
        self.assertTrue(self.pptx.is_file())
        report = validate_pptx.PptxValidation(
            self.pptx, json.loads(self.manifest.read_text(encoding="utf-8"))
        ).run()
        self.assertEqual(report["overallAutomatedStatus"], "pass", json.dumps(report, indent=2))
        self.assertGreaterEqual(report["evidence"]["informativeImages"], 1)
        self.assertGreaterEqual(report["evidence"]["decorativeObjects"], 1)
        self.assertGreaterEqual(report["evidence"]["tables"], 1)
        self.assertGreaterEqual(report["evidence"]["hyperlinks"], 1)

    def test_missing_render_file_fails_automated_evidence_gate(self) -> None:
        render_copy = self.case_dir / "render"
        shutil.copytree(self.render, render_copy)
        missing = render_copy / "pptx-release-conformance" / "slide-14.png"
        missing.unlink()
        automated = pptx_release_gate.inspect_automated_evidence(self.review, render_copy)
        self.assertEqual(automated["status"], "fail")
        self.assertTrue(any("Rendered slide 14 is missing" in item for item in automated["issues"]))

    def test_incomplete_manual_template_is_held(self) -> None:
        manual = pptx_release_gate.initialize_manual_record(
            self.plan, self.automated, "pilot", self.manual_path
        )
        self._write_manual(manual)
        decision, _ = pptx_release_gate.make_decision(
            self.plan, manual, self.manual_path, self.automated, "pilot"
        )
        self.assertEqual(decision["disposition"], "hold")
        self.assertGreater(decision["counts"]["blockers"], 10)

    def test_completed_pilot_record_is_ready_for_controlled_pilot(self) -> None:
        manual = self._completed_record("pilot")
        decision, attachments = pptx_release_gate.make_decision(
            self.plan, manual, self.manual_path, self.automated, "pilot"
        )
        self.assertEqual(decision["disposition"], "ready-for-controlled-pilot", decision["blockers"])
        self.assertEqual(decision["automatedStatus"], "pass")
        self.assertEqual(decision["browserExport"]["independentValidationStatus"], "pass")
        self.assertGreaterEqual(len(attachments), 3)

    def test_completed_production_record_requires_font_and_identity_policy(self) -> None:
        manual = self._completed_record("production")
        decision, _ = pptx_release_gate.make_decision(
            self.plan, manual, self.manual_path, self.automated, "production"
        )
        self.assertEqual(decision["disposition"], "ready-for-production", decision["blockers"])
        self.assertIn("managed County workstations", decision["policies"]["fontDistribution"])
        self.assertIn("approved", decision["policies"]["identityApproval"])

    def test_stale_checksum_and_missing_not_applicable_reason_block_release(self) -> None:
        manual = self._completed_record("pilot")
        manual["filesUnderTest"][0]["sha256"] = "0" * 64
        manual["browserExport"]["sourcePackageSha256"] = "0" * 64
        conditional = next(item for item in manual["tests"] if item["id"] == "MANUAL-012")
        conditional["notApplicableReason"] = ""
        first_test = manual["tests"][0]
        first_test["testedFiles"].append("stale/unknown-presentation")
        self._write_manual(manual)
        decision, _ = pptx_release_gate.make_decision(
            self.plan, manual, self.manual_path, self.automated, "pilot"
        )
        self.assertEqual(decision["disposition"], "hold")
        joined = "\n".join(decision["blockers"])
        self.assertIn("checksum is stale", joined)
        self.assertIn("source-package checksum is stale", joined)
        self.assertIn("testedFiles contains unknown or stale keys", joined)
        self.assertIn("not_applicable requires", joined)

    def test_final_evidence_package_contains_checksums_and_excludes_fonts(self) -> None:
        manual = self._completed_record("pilot")
        decision, attachments = pptx_release_gate.make_decision(
            self.plan, manual, self.manual_path, self.automated, "pilot"
        )
        decision_path = self.case_dir / "decision.json"
        report_path = self.case_dir / "DECISION.md"
        pptx_release_gate.write_json(decision_path, decision)
        report_path.write_text(pptx_release_gate.markdown_report(decision), encoding="utf-8")
        output = self.case_dir / "evidence.zip"
        entries = pptx_release_gate.archive_file_entries(
            self.review,
            self.render,
            self.manual_path,
            decision_path,
            report_path,
            ROOT / "docs" / "pptx" / "manual-acceptance-plan.json",
            attachments,
            self.automated,
        )
        result = pptx_release_gate.create_evidence_package(output, entries)
        self.assertRegex(result["sha256"], r"^[0-9a-f]{64}$")
        with zipfile.ZipFile(output) as archive:
            names = archive.namelist()
            self.assertIn("SHA256SUMS", names)
            self.assertIn("manual/manual-results.json", names)
            self.assertIn("decision/release-decision.json", names)
            self.assertTrue(any(name.endswith(".pptx") for name in names))
            self.assertFalse(any(pathlib.PurePosixPath(name).suffix.lower() in pptx_release_gate.FORBIDDEN_EVIDENCE_EXTENSIONS for name in names))

    def _completed_record(self, target: str) -> dict:
        manual = pptx_release_gate.initialize_manual_record(
            self.plan, self.automated, target, self.manual_path
        )
        manual["session"] = {
            "tester": "Test Reviewer",
            "testDate": "2026-10-12",
            "operatingSystem": "Windows 11 Enterprise",
            "powerPoint": {"product": "Microsoft PowerPoint", "channel": "Current Channel", "version": "test"},
            "screenReaders": [{"name": "NVDA", "version": "test"}],
            "fonts": {"jostInstalled": True, "openSansInstalled": True},
            "contentOwner": "Test Content Owner",
            "notes": "Synthetic passing record for automated gate tests.",
        }
        manual["scope"]["chartsPresent"] = False
        manual["scope"]["pdfOrHandoutsDistributed"] = False
        manual["scope"]["unmanagedFontEnvironmentInScope"] = target == "production"
        manual["scope"]["officialIdentityApprovalRequiredForPilot"] = False
        manual["policies"]["fontDistribution"] = (
            "Jost and Open Sans are installed on managed County workstations; missing-font behavior was reviewed."
        )
        manual["policies"]["identityApproval"] = "County identity treatment approved for the tested release."
        manual["policies"]["derivativeDistribution"] = "PDF and printed derivatives are not distributed."

        browser = self.case_dir / "browser-release-fixture.pptx"
        shutil.copy2(self.pptx, browser)
        manual["browserExport"] = {
            "status": "pass",
            "file": browser.name,
            "sha256": pptx_release_gate.sha256_file(browser),
            "browser": "Microsoft Edge test",
            "downloadedAt": "2026-10-12T12:00:00-07:00",
            "sourcePackageSha256": self.fixture_result["sha256"],
            "notes": "Generated through the browser workflow for gate testing.",
        }

        case_by_id = {case["id"]: case for case in self.plan["cases"]}
        for result in manual["tests"]:
            case = case_by_id[result["id"]]
            requirement, applies = pptx_release_gate.requirement_for(case, target, manual["scope"])
            if requirement == "conditional" and not applies:
                result["status"] = "not_applicable"
                result["notes"] = "The configured release scope does not include this conditional output."
                result["notApplicableReason"] = "The condition is false for this release scope."
            else:
                result["status"] = "pass"
                result["notes"] = "Completed without an unresolved finding."
            if case.get("evidenceFileRequired") and result["status"] == "pass":
                evidence = self.case_dir / f"{result['id'].lower()}.txt"
                evidence.write_text("Synthetic evidence for release-gate testing.\n", encoding="utf-8")
                result["evidence"] = [{"path": evidence.name, "description": "Synthetic evidence"}]
        self._write_manual(manual)
        return manual

    def _write_manual(self, manual: dict) -> None:
        self.manual_path.write_text(json.dumps(manual, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    unittest.main()
