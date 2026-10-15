#!/usr/bin/env python3
"""Notes at publish time: valid Notes publish and are counted; invalid Notes are refused."""
from __future__ import annotations

import copy
import json
import pathlib
import sys
import tempfile
import unittest
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import note_validate  # noqa: E402
import publish  # noqa: E402

FIXTURE = json.loads((ROOT / "tests" / "fixtures" / "sample-note" / "learning.json").read_text(encoding="utf-8"))


def find(graph, identifier):
    return next(obj for obj in graph if obj.get("identifier") == identifier)


class NotePublishTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.tmp = pathlib.Path(self.temp.name)

    def tearDown(self) -> None:
        self.temp.cleanup()

    def publish(self, document: dict) -> dict:
        zip_path = self.tmp / "sample.zip"
        with zipfile.ZipFile(zip_path, "w") as zf:
            zf.writestr("learning.json", json.dumps(document))
        return publish.publish_package(zip_path, self.tmp / "out")

    def test_valid_note_publishes_and_is_counted(self) -> None:
        item = self.publish(copy.deepcopy(FIXTURE))
        self.assertEqual(item["resourceCounts"], {"notes": 1, "materials": 0, "presentations": 1, "assessments": 1})

    def test_valid_note_has_no_problems(self) -> None:
        self.assertEqual(note_validate.validate_notes(FIXTURE["@graph"]), [])

    def test_too_long_title_is_refused(self) -> None:
        document = copy.deepcopy(FIXTURE)
        find(document["@graph"], "plain-language-101")["name"] = "x" * 61
        problems = note_validate.validate_notes(document["@graph"])
        self.assertTrue(any("limit is 60" in problem for problem in problems), problems)
        with self.assertRaises(SystemExit):
            self.publish(document)

    def test_too_many_items_and_http_links_are_refused(self) -> None:
        document = copy.deepcopy(FIXTURE)
        find(document["@graph"], "sample-why-it-matters")["marin:items"] = ["Point."] * 6
        find(document["@graph"], "sample-learn-more")["marin:items"][0]["url"] = "http://example.gov"
        problems = note_validate.validate_notes(document["@graph"])
        self.assertTrue(any("limit is 5" in problem for problem in problems), problems)
        self.assertTrue(any("required format" in problem for problem in problems), problems)

    def test_too_few_items_and_missing_sections_are_refused(self) -> None:
        document = copy.deepcopy(FIXTURE)
        find(document["@graph"], "sample-questions")["marin:items"] = ["Who is the reader?"]
        problems = note_validate.validate_notes(document["@graph"])
        self.assertTrue(any("questions needs at least 5" in problem for problem in problems), problems)

        document = copy.deepcopy(FIXTURE)
        note = find(document["@graph"], "plain-language-101")
        mantras = find(document["@graph"], "sample-mantras")["@id"]
        sequence = note["marin:sectionSequence"]["itemListElement"]
        note["marin:sectionSequence"]["itemListElement"] = [e for e in sequence if e["item"]["@id"] != mantras]
        self.assertTrue(any("missing required section mantras" in p for p in note_validate.validate_notes(document["@graph"])))

    def test_optional_sections_can_be_absent(self) -> None:
        document = copy.deepcopy(FIXTURE)
        examples = find(document["@graph"], "sample-examples")["@id"]
        note = find(document["@graph"], "plain-language-101")
        note["marin:sectionSequence"]["itemListElement"] = [
            dict(entry, position=index + 1)
            for index, entry in enumerate(e for e in note["marin:sectionSequence"]["itemListElement"] if e["item"]["@id"] != examples)
        ]
        document["@graph"] = [obj for obj in document["@graph"] if obj["@id"] != examples]
        self.assertEqual(note_validate.validate_notes(document["@graph"]), [])

    def test_slide_and_quiz_references_are_checked(self) -> None:
        document = copy.deepcopy(FIXTURE)
        slide = find(document["@graph"], "sample-slide")
        slide["marin:contentSequence"]["itemListElement"][0]["marin:itemRange"] = {"first": 4, "last": 9}
        self.assertTrue(any("outside the section" in p for p in note_validate.validate_notes(document["@graph"])))
        slide["marin:contentSequence"]["itemListElement"][0]["marin:itemRange"] = {"first": 1, "last": 3}
        slide["marin:contentSequence"]["itemListElement"][0]["marin:displayMode"] = "abstract"
        self.assertTrue(any("abstract" in p for p in note_validate.validate_notes(document["@graph"])))
        find(document["@graph"], "sample-question")["isBasedOn"] = [{"@id": "urn:uuid:20000000-0000-4000-8000-999999999999"}]
        self.assertTrue(any("isBasedOn" in p for p in note_validate.validate_notes(document["@graph"])))

    def test_quiz_of_more_than_ten_questions_is_refused(self) -> None:
        document = copy.deepcopy(FIXTURE)
        quiz = find(document["@graph"], "sample-quiz")
        entries = quiz["marin:itemSequence"]["itemListElement"]
        for position in range(2, 13):
            entries.append(dict(entries[0], position=position))
        problems = note_validate.validate_quizzes(document["@graph"])
        self.assertTrue(any("at most 10" in problem for problem in problems), problems)
        with self.assertRaises(SystemExit):
            self.publish(document)

    def test_existing_packages_still_publish(self) -> None:
        item = publish.publish_package(ROOT / "tests" / "fixtures" / "reference-package" / "marinos-foundations.zip", self.tmp / "out2")
        self.assertEqual(item["resourceCounts"]["notes"], 0)
        self.assertEqual(item["resourceCounts"]["assessments"], 1)


if __name__ == "__main__":
    unittest.main()
