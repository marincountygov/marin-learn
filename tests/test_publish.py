#!/usr/bin/env python3
"""Automated tests for Marin Learn v1 publishing and catalog generation."""
from __future__ import annotations

import json
import pathlib
import sys
import tempfile
import unittest
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import publish

class PublishTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.out_dir = pathlib.Path(self.temp_dir.name)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_publish_valid_fixture(self) -> None:
        fixture = ROOT / "packages" / "marinos-foundations.zip"
        self.assertTrue(fixture.is_file(), "Reference fixture must exist")
        item = publish.publish_package(fixture, self.out_dir)
        self.assertEqual(item["identifier"], "marinos-foundations")
        self.assertEqual(item["name"], "MarinOS 101")
        self.assertEqual(item["resourceCounts"]["materials"], 1)
        self.assertTrue((self.out_dir / "learning" / "marinos-foundations" / "learning.json").is_file())
        self.assertTrue((self.out_dir / "learning" / "marinos-foundations" / "content" / "what-is-marinos.md").is_file())

    def test_reject_unpublished_status(self) -> None:
        fixture = ROOT / "packages" / "marinos-foundations.zip"
        with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as tmp:
            tmp_path = pathlib.Path(tmp.name)

        try:
            with zipfile.ZipFile(fixture, "r") as zf_in:
                with zipfile.ZipFile(tmp_path, "w") as zf_out:
                    for item in zf_in.infolist():
                        data = zf_in.read(item.filename)
                        if item.filename == "learning.json":
                            j = json.loads(data.decode("utf-8"))
                            for obj in j["@graph"]:
                                if publish.has_type(obj, "LearningSet"):
                                    obj["creativeWorkStatus"] = "draft"
                            data = json.dumps(j).encode("utf-8")
                        zf_out.writestr(item.filename, data)

            with self.assertRaises(SystemExit):
                publish.publish_package(tmp_path, self.out_dir)
        finally:
            if tmp_path.exists():
                tmp_path.unlink()

if __name__ == "__main__":
    unittest.main()
