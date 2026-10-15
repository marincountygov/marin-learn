"""Publish-time checks for Marin Learn Notes.

Mirrors js/core/validate.js for the Note types, reading its limits from
schema/marin-learn-v1.schema.json so there is one source of truth. A package that
reaches publish.py is already marked published, so every Note rule is an error here.
"""
from __future__ import annotations

import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[1]
SCHEMA = json.loads((ROOT / "schema" / "marin-learn-v1.schema.json").read_text(encoding="utf-8"))


def _resolve(ref: str) -> dict:
    node = SCHEMA
    for part in ref.lstrip("#/").split("/"):
        node = node[part]
    return node


def _is_type(value, expected: str) -> bool:
    return {
        "object": isinstance(value, dict),
        "array": isinstance(value, list),
        "string": isinstance(value, str),
        "integer": isinstance(value, int) and not isinstance(value, bool),
        "number": isinstance(value, (int, float)) and not isinstance(value, bool),
        "boolean": isinstance(value, bool),
    }.get(expected, True)


def schema_errors(value, schema: dict, path: str = "$") -> list[str]:
    """A small JSON Schema checker for the keywords the Note definitions use."""
    errors: list[str] = []
    if "$ref" in schema:
        errors += schema_errors(value, _resolve(schema["$ref"]), path)
    for child in schema.get("allOf", []):
        errors += schema_errors(value, child, path)
    if "if" in schema and not schema_errors(value, schema["if"], path):
        errors += schema_errors(value, schema.get("then", {}), path)
    if "not" in schema and not schema_errors(value, schema["not"], path):
        errors.append(f"{path}: value is not allowed here")
    if "const" in schema and value != schema["const"]:
        errors.append(f"{path}: must equal {schema['const']!r}")
    if "enum" in schema and value not in schema["enum"]:
        errors.append(f"{path}: must be one of {schema['enum']}")
    if "type" in schema and not _is_type(value, schema["type"]):
        return errors + [f"{path}: expected {schema['type']}"]
    if isinstance(value, str):
        # JSON Schema counts code points, as Python's len() does.
        if "minLength" in schema and len(value) < schema["minLength"]:
            errors.append(f"{path}: must have at least {schema['minLength']} character(s)")
        if "maxLength" in schema and len(value) > schema["maxLength"]:
            errors.append(f"{path}: is {len(value)} characters; the limit is {schema['maxLength']}")
        if "pattern" in schema and not re.search(schema["pattern"], value):
            errors.append(f"{path}: does not match the required format")
    if isinstance(value, list):
        if "maxItems" in schema and len(value) > schema["maxItems"]:
            errors.append(f"{path}: has {len(value)} items; the limit is {schema['maxItems']}")
        if "items" in schema:
            for index, item in enumerate(value):
                errors += schema_errors(item, schema["items"], f"{path}[{index}]")
    if isinstance(value, dict):
        for key in schema.get("required", []):
            if key not in value:
                errors.append(f"{path}: missing {key}")
        for key, child in schema.get("properties", {}).items():
            if key in value:
                errors += schema_errors(value[key], child, f"{path}.{key}")
        if schema.get("additionalProperties") is False:
            for key in value:
                if key not in schema.get("properties", {}):
                    errors.append(f"{path}: unexpected property {key}")
    return errors


def _has_type(obj: dict, name: str) -> bool:
    t = obj.get("@type")
    types = [t] if isinstance(t, str) else t or []
    return any(isinstance(item, str) and item.split(":")[-1] == name for item in types)


def _ids(entries) -> list[str]:
    return [e["item"]["@id"] for e in (entries or {}).get("itemListElement", []) if isinstance(e, dict) and isinstance(e.get("item"), dict)]


def validate_notes(graph: list[dict]) -> list[str]:
    """Return a list of problems; empty means every Note passes."""
    by_id = {obj["@id"]: obj for obj in graph if isinstance(obj, dict) and "@id" in obj}
    notes = [obj for obj in graph if _has_type(obj, "Note")]
    problems: list[str] = []
    rules = SCHEMA["$defs"]["note"]["x-marin-note-sections"]
    order = [rule["type"] for rule in rules]
    sections_by_note: dict[str, list[dict]] = {}

    for obj in graph:
        if _has_type(obj, "NoteSection"):
            problems += [f"NoteSection {obj.get('identifier')}: {e}" for e in schema_errors(obj, SCHEMA["$defs"]["noteSection"])]

    for note in notes:
        label = f"Note {note.get('identifier')}"
        problems += [f"{label}: {e}" for e in schema_errors(note, SCHEMA["$defs"]["note"])]
        sections = []
        for ref in _ids(note.get("marin:sectionSequence")):
            target = by_id.get(ref)
            if target is None or not _has_type(target, "NoteSection"):
                problems.append(f"{label}: marin:sectionSequence must reference NoteSections ({ref})")
            else:
                sections.append(target)
        sections_by_note[note["@id"]] = sections
        types = [s.get("marin:sectionType") for s in sections]
        if len(set(types)) != len(types):
            problems.append(f"{label}: has more than one section of the same type")
        positions = [order.index(t) for t in types if t in order]
        if positions != sorted(positions):
            problems.append(f"{label}: sections are not in the standard order")
        for rule in rules:
            section = next((s for s in sections if s.get("marin:sectionType") == rule["type"]), None)
            if section is None:
                if rule["required"]:
                    problems.append(f"{label}: missing required section {rule['type']}")
                continue
            if rule.get("text"):
                if not str(section.get("marin:text", "")).strip():
                    problems.append(f"{label}: the {rule['type']} is empty")
            elif len(section.get("marin:items", [])) + (len(section.get("marin:code", [])) if rule["type"] == "examples" else 0) < rule.get("min", 0):
                problems.append(f"{label}: {rule['type']} needs at least {rule['min']} items")

    # Decks and quizzes may point at Notes and Note sections; the references must resolve.
    allowed = ("ContentUnit", "LearningMaterial", "Note", "NoteSection")
    for obj in graph:
        if _has_type(obj, "AssessmentItem") or _has_type(obj, "Presentation"):
            for ref in obj.get("isBasedOn", []):
                if isinstance(ref, dict) and "@id" in ref:
                    target = by_id.get(ref["@id"])
                    if target is None or not any(_has_type(target, name) for name in allowed):
                        problems.append(f"{obj.get('identifier')}: isBasedOn does not point at usable content ({ref['@id']})")
        if _has_type(obj, "Slide"):
            for entry in (obj.get("marin:contentSequence") or {}).get("itemListElement", []):
                target = by_id.get(entry["item"]["@id"])
                if target is None:
                    problems.append(f"Slide {obj.get('identifier')}: missing content {entry['item']['@id']}")
                    continue
                span = entry.get("marin:itemRange")
                code_span = entry.get("marin:codeRange")
                if _has_type(target, "NoteSection"):
                    if code_span and (target.get("marin:sectionType") != "examples" or code_span["first"] > code_span["last"] or code_span["last"] > len(target.get("marin:code", []))):
                        problems.append(f"Slide {obj.get('identifier')}: marin:codeRange is outside the code samples")
                    if entry.get("marin:displayMode") == "abstract":
                        problems.append(f"Slide {obj.get('identifier')}: cannot show the abstract of a Note section")
                    if span and (span["first"] > span["last"] or span["last"] > len(target.get("marin:items", []))):
                        problems.append(f"Slide {obj.get('identifier')}: marin:itemRange is outside the section")
                elif span or code_span:
                    problems.append(f"Slide {obj.get('identifier')}: marin:itemRange and marin:codeRange are only for Note sections")
    return problems


def validate_quizzes(graph: list[dict]) -> list[str]:
    """A quiz has at most as many questions as the schema allows."""
    limit = SCHEMA["$defs"]["assessmentItemSequence"]["properties"]["itemListElement"]["maxItems"]
    problems: list[str] = []
    for obj in graph:
        if _has_type(obj, "Assessment"):
            count = len(_ids(obj.get("marin:itemSequence")))
            if count > limit:
                problems.append(f"Quiz {obj.get('identifier')} has {count} questions; a quiz has at most {limit}")
    return problems
