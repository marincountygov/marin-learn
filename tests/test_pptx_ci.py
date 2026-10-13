#!/usr/bin/env python3
"""Tests for the PPTX-3 Node/CI generation and independent validation boundary."""
from __future__ import annotations

import json
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
import warnings
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import render_pptx  # noqa: E402
import validate_pptx  # noqa: E402


class PptxCiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.temp = tempfile.TemporaryDirectory(prefix="marin-learn-pptx-ci-")
        cls.temp_path = pathlib.Path(cls.temp.name)
        cls.output = cls.temp_path / "review"
        completed = subprocess.run(
            [
                "node",
                str(ROOT / "scripts" / "generate_pptx.mjs"),
                str(ROOT / "packages" / "marinos-foundations.zip"),
                "--out",
                str(cls.output),
                "--summary",
                str(cls.output / "results.json"),
            ],
            cwd=ROOT,
            check=True,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
        )
        cls.generation_log = completed.stdout
        cls.pptx = cls.output / "marinos-foundations" / "marinos-foundations-slides.pptx"
        cls.manifest_path = cls.pptx.with_suffix(".manifest.json")
        cls.manifest = json.loads(cls.manifest_path.read_text(encoding="utf-8"))

    @classmethod
    def tearDownClass(cls) -> None:
        cls.temp.cleanup()

    def test_node_cli_generated_expected_review_artifacts(self) -> None:
        summary = json.loads((self.output / "results.json").read_text(encoding="utf-8"))
        self.assertEqual(summary["status"], "pass")
        self.assertEqual(summary["counts"]["presentations"], 1)
        self.assertEqual(summary["runtime"]["source"], "vendored-node-bundle")
        self.assertTrue(self.pptx.is_file())
        self.assertTrue(self.manifest_path.is_file())
        self.assertTrue(self.pptx.with_suffix(".validation.json").is_file())
        self.assertTrue(self.pptx.with_suffix(".build.json").is_file())
        self.assertIn("Generated marinos-foundations/marinos-foundations-slides.pptx", self.generation_log)

    def test_independent_validator_passes_valid_generated_output(self) -> None:
        report = validate_pptx.PptxValidation(self.pptx, self.manifest).run()
        self.assertEqual(report["overallAutomatedStatus"], "pass", json.dumps(report, indent=2))
        self.assertEqual(report["evidence"]["slideParts"], 7)
        self.assertEqual(report["evidence"]["notesParts"], 7)
        self.assertEqual(report["evidence"]["titleTextMatches"], 7)
        self.assertEqual(report["evidence"]["automaticFitObjects"], 0)
        self.assertEqual(report["counts"]["manual"], 5)

    def test_independent_validator_rejects_known_language_and_id_defects(self) -> None:
        broken = self.temp_path / "broken.pptx"
        with zipfile.ZipFile(self.pptx, "r") as source, zipfile.ZipFile(broken, "w", compression=zipfile.ZIP_DEFLATED) as target:
            for item in source.infolist():
                data = source.read(item.filename)
                if item.filename == "docProps/core.xml":
                    text = data.decode("utf-8")
                    text = re.sub(r"<dc:language>[^<]*</dc:language>", "", text, count=1)
                    data = text.encode("utf-8")
                elif item.filename == "ppt/slides/slide1.xml":
                    text = data.decode("utf-8")
                    ids = re.findall(r"(<p:cNvPr\b[^>]*\bid=\")([0-9]+)(\")", text)
                    if len(ids) >= 2:
                        first_id = ids[0][1]
                        second = ids[1]
                        second_tag = "".join(second)
                        replacement = f"{second[0]}{first_id}{second[2]}"
                        text = text.replace(second_tag, replacement, 1)
                    data = text.encode("utf-8")
                target.writestr(item, data)

        report = validate_pptx.PptxValidation(broken, self.manifest).run()
        self.assertEqual(report["overallAutomatedStatus"], "fail")
        failed_ids = {item["id"] for item in report["checks"] if item["status"] == "fail"}
        self.assertIn("PPTX-CI-003", failed_ids)
        self.assertIn("PPTX-CI-007", failed_ids)

    def test_independent_validator_rejects_unsafe_and_duplicate_zip_members_before_extraction(self) -> None:
        broken = self.temp_path / "unsafe-duplicate.pptx"
        with zipfile.ZipFile(self.pptx, "r") as source, zipfile.ZipFile(
            broken, "w", compression=zipfile.ZIP_DEFLATED
        ) as target:
            core = source.read("docProps/core.xml")
            for item in source.infolist():
                target.writestr(item, source.read(item.filename))
            with warnings.catch_warnings():
                warnings.simplefilter("ignore", UserWarning)
                target.writestr("docProps/core.xml", core)
            target.writestr("../outside.xml", b"<outside/>")

        report = validate_pptx.PptxValidation(broken, self.manifest).run()
        self.assertEqual(report["overallAutomatedStatus"], "fail")
        package_check = next(item for item in report["checks"] if item["id"] == "PPTX-CI-001")
        self.assertEqual(package_check["status"], "fail")
        evidence = "\n".join(package_check["evidence"])
        self.assertIn("docProps/core.xml", evidence)
        self.assertIn("../outside.xml", evidence)

    def test_validator_cli_writes_combined_and_sidecar_reports(self) -> None:
        combined = self.temp_path / "independent.json"
        completed = subprocess.run(
            [
                sys.executable,
                str(ROOT / "scripts" / "validate_pptx.py"),
                str(self.output),
                "--require-manifest",
                "--write-sidecars",
                "--out",
                str(combined),
            ],
            cwd=ROOT,
            check=True,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
        )
        report = json.loads(combined.read_text(encoding="utf-8"))
        self.assertEqual(report["overallAutomatedStatus"], "pass")
        self.assertEqual(report["counts"], {"files": 1, "passed": 1, "failed": 0})
        self.assertTrue(self.pptx.with_suffix(".independent-validation.json").is_file())
        self.assertIn("PASS:", completed.stdout)

    def test_render_helpers_discover_and_count_generated_deck(self) -> None:
        self.assertEqual(render_pptx.discover_pptx([self.output]), [self.pptx])
        self.assertEqual(render_pptx.pptx_slide_count(self.pptx), 7)
        self.assertRegex(render_pptx.sha256(self.pptx), r"^[0-9a-f]{64}$")

    def test_renderer_refuses_destructive_output_directory(self) -> None:
        with self.assertRaisesRegex(ValueError, "unsafe output directory"):
            render_pptx.assert_safe_output_root(pathlib.Path.cwd(), [self.pptx])
        with self.assertRaisesRegex(ValueError, "contains an input PPTX"):
            render_pptx.assert_safe_output_root(self.output, [self.pptx])

    def test_renderer_requires_external_tools_only_when_invoked(self) -> None:
        # Repository checks can run without LibreOffice. The GitHub workflow installs
        # and invokes the renderer as a separate evidence-producing gate.
        self.assertTrue((ROOT / "scripts" / "render_pptx.py").is_file())
        self.assertIn("libreoffice", (ROOT / "scripts" / "render_pptx.py").read_text(encoding="utf-8"))
        self.assertIn("pdftoppm", (ROOT / "scripts" / "render_pptx.py").read_text(encoding="utf-8"))
        self.assertIsInstance(shutil.which("node"), str)


if __name__ == "__main__":
    unittest.main()
