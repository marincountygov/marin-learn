#!/usr/bin/env python3
"""Independent OOXML validator for Marin Learn-generated PowerPoint files.

This validator intentionally does not import the JavaScript exporter. It inspects the
ZIP/XML package with Python's standard library and optionally compares the result with
the adjacent generation manifest produced by scripts/generate_pptx.mjs.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import pathlib
import re
import sys
import zipfile
from dataclasses import asdict, dataclass, field
from typing import Any, Iterable
from xml.etree import ElementTree as ET

P = "http://schemas.openxmlformats.org/presentationml/2006/main"
A = "http://schemas.openxmlformats.org/drawingml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
CP = "http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
DC = "http://purl.org/dc/elements/1.1/"
EP = "http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"
ADEC = "http://schemas.microsoft.com/office/drawing/2017/decorative"
REL = "http://schemas.openxmlformats.org/package/2006/relationships"
NS = {"p": P, "a": A, "r": R, "cp": CP, "dc": DC, "ep": EP, "adec": ADEC, "rel": REL}
EMU_PER_INCH = 914400
APPROVED_FONTS = {"Jost", "Open Sans"}
APPROVED_COLORS = {
    "0777CF", "6F6F6F", "A9A9A9", "B45340", "73784A", "A2662B",
    "000000", "E5B53B", "FFFFFF", "EAF4FC", "F3F3F3"
}
MAX_ENTRIES = 2000
MAX_UNCOMPRESSED_BYTES = 250 * 1024 * 1024


@dataclass
class Check:
    id: str
    name: str
    status: str
    severity: str = "error"
    evidence: list[str] = field(default_factory=list)
    details: dict[str, Any] = field(default_factory=dict)


class PptxValidation:
    def __init__(self, pptx: pathlib.Path, manifest: dict[str, Any] | None):
        self.pptx = pptx
        self.manifest = manifest
        self.parts: dict[str, bytes] = {}
        self.xml: dict[str, ET.Element] = {}
        self.checks: list[Check] = []
        self.slide_size = (0, 0)
        self.slide_titles: list[str] = []
        self.evidence: dict[str, Any] = {
            "slideParts": 0,
            "notesParts": 0,
            "titlePlaceholders": 0,
            "titleTextMatches": 0,
            "informativeImages": 0,
            "decorativeObjects": 0,
            "tables": 0,
            "hyperlinks": 0,
            "duplicateIdParts": 0,
            "runLanguageMismatches": 0,
            "automaticFitObjects": 0,
            "explicitTypefaceElements": 0,
            "explicitColorElements": 0,
            "geometryElements": 0,
            "widescreen": False,
        }

    def add(
        self,
        check_id: str,
        name: str,
        ok: bool | None,
        evidence: Iterable[str] = (),
        *,
        severity: str = "error",
        details: dict[str, Any] | None = None,
    ) -> None:
        status = "manual" if ok is None else "pass" if ok else "fail"
        self.checks.append(Check(check_id, name, status, severity, list(evidence), details or {}))

    def run(self) -> dict[str, Any]:
        if self.load_package():
            self.check_metadata()
            self.check_slide_size()
            self.check_titles()
            self.check_nonvisual_ids()
            self.check_images_and_decorative_objects()
            self.check_language()
            self.check_tables_and_text_behavior()
            self.check_brand_and_motion()
            self.check_layout_and_editability()
            self.check_links_and_security()
            self.check_notes()
            self.check_manifest()
            self.add_manual_reminders()
        return self.report()

    def load_package(self) -> bool:
        try:
            with zipfile.ZipFile(self.pptx, "r") as archive:
                infos = archive.infolist()
                names = [item.filename for item in infos]
                encrypted = [item.filename for item in infos if item.flag_bits & 0x1]
                unsafe = [item.filename for item in infos if unsafe_zip_name(item.filename)]
                duplicates = sorted({name for name in names if names.count(name) > 1})
                folded: dict[str, list[str]] = {}
                for name in names:
                    folded.setdefault(name.casefold(), []).append(name)
                case_collisions = sorted(
                    ", ".join(sorted(set(values)))
                    for values in folded.values()
                    if len(set(values)) > 1
                )
                total_size = sum(item.file_size for item in infos)
                too_many = len(infos) > MAX_ENTRIES
                too_large = total_size > MAX_UNCOMPRESSED_BYTES
                required = {"[Content_Types].xml", "docProps/core.xml", "docProps/app.xml", "ppt/presentation.xml"}
                missing = sorted(required - set(names))
                preliminary_ok = not (
                    encrypted or unsafe or duplicates or case_collisions or too_many or too_large or missing
                )
                bad_member = None
                if preliminary_ok:
                    bad_member = archive.testzip()
                    if bad_member is None:
                        self.parts = {item.filename: archive.read(item) for item in infos if not item.is_dir()}
            ok = preliminary_ok and bad_member is None
            self.add(
                "PPTX-CI-001",
                "Valid, bounded, unencrypted Open XML package",
                ok,
                [
                    f"ZIP members: {len(infos)}",
                    f"Uncompressed bytes: {total_size}",
                    f"Bad member: {bad_member or 'none'}",
                    f"Encrypted members: {encrypted or 'none'}",
                    f"Unsafe names: {unsafe or 'none'}",
                    f"Duplicate names: {duplicates or 'none'}",
                    f"Case-only collisions: {case_collisions or 'none'}",
                    f"Missing required parts: {missing or 'none'}",
                    f"Entry limit exceeded: {too_many}",
                    f"Uncompressed-size limit exceeded: {too_large}",
                ],
            )
            if not ok:
                return False
        except Exception as exc:  # pragma: no cover - exercised through CLI failure behavior
            self.add("PPTX-CI-001", "Valid, bounded, unencrypted Open XML package", False, [str(exc)])
            return False

        malformed: list[str] = []
        for name, data in self.parts.items():
            if not name.endswith((".xml", ".rels")):
                continue
            try:
                self.xml[name] = ET.fromstring(data)
            except ET.ParseError as exc:
                malformed.append(f"{name}: {exc}")
        self.add(
            "PPTX-CI-002",
            "All XML and relationship parts are well formed",
            not malformed,
            malformed or [f"Parsed {len(self.xml)} XML/relationship parts."],
        )
        return not malformed

    def check_metadata(self) -> None:
        core = self.xml.get("docProps/core.xml")
        app = self.xml.get("docProps/app.xml")
        expected_language = self.expected_language()
        values = {
            "title": find_text(core, f"{{{DC}}}title"),
            "subject": find_text(core, f"{{{DC}}}subject"),
            "creator": find_text(core, f"{{{DC}}}creator"),
            "language": find_text(core, f"{{{DC}}}language"),
            "company": find_text(app, f"{{{EP}}}Company"),
        }
        missing = [name for name, value in values.items() if not value]
        mismatches: list[str] = []
        expected = self.manifest.get("presentation", {}) if self.manifest else {}
        mapping = {
            "title": expected.get("title"),
            "subject": expected.get("subject"),
            "creator": expected.get("author"),
            "company": expected.get("company"),
            "language": expected_language,
        }
        for field_name, expected_value in mapping.items():
            if expected_value and normalize_space(values[field_name]) != normalize_space(expected_value):
                mismatches.append(f"{field_name}: expected {expected_value!r}; found {values[field_name]!r}")
        self.add(
            "PPTX-CI-003",
            "Required document metadata is present and matches the build manifest",
            not missing and not mismatches,
            [f"{key}: {value or '[missing]'}" for key, value in values.items()] + mismatches,
            details={"missing": missing, "mismatches": mismatches},
        )

    def check_slide_size(self) -> None:
        presentation = self.xml.get("ppt/presentation.xml")
        node = presentation.find(f"{{{P}}}sldSz") if presentation is not None else None
        if node is None:
            self.add("PPTX-CI-004", "Widescreen 16:9 slide size", False, ["p:sldSz is missing."])
            return
        cx, cy = int(node.get("cx", "0")), int(node.get("cy", "0"))
        self.slide_size = (cx, cy)
        ratio = cx / cy if cy else 0
        self.evidence["widescreen"] = abs(ratio - 16 / 9) < 0.002
        self.add(
            "PPTX-CI-004",
            "Widescreen 16:9 slide size",
            self.evidence["widescreen"],
            [f"{cx / EMU_PER_INCH:.4f} x {cy / EMU_PER_INCH:.4f} inches; ratio {ratio:.6f}"],
        )

    def slide_parts(self) -> list[tuple[str, ET.Element]]:
        names = sorted(
            (name for name in self.xml if re.fullmatch(r"ppt/slides/slide\d+\.xml", name)),
            key=natural_part_key,
        )
        return [(name, self.xml[name]) for name in names]

    def check_titles(self) -> None:
        missing: list[str] = []
        multiple: list[str] = []
        order_warnings: list[str] = []
        titles: list[str] = []
        expected_slides = self.manifest.get("slides", []) if self.manifest else []
        mismatches: list[str] = []

        for index, (part, root) in enumerate(self.slide_parts(), 1):
            title_shapes = [shape for shape in root.findall(".//p:sp", NS) if is_title_shape(shape)]
            self.evidence["titlePlaceholders"] += len(title_shapes)
            if not title_shapes:
                missing.append(f"Slide {index} ({part})")
                title = ""
            else:
                if len(title_shapes) > 1:
                    multiple.append(f"Slide {index}: {len(title_shapes)} title placeholders")
                title = shape_text(title_shapes[0])
            titles.append(title)

            sp_tree = root.find(".//p:spTree", NS)
            if title_shapes and sp_tree is not None:
                slide_objects = [child for child in list(sp_tree) if local_name(child.tag) in {"sp", "pic", "graphicFrame", "cxnSp", "grpSp"}]
                if slide_objects and slide_objects[0] is not title_shapes[0]:
                    try:
                        position = slide_objects.index(title_shapes[0]) + 1
                    except ValueError:
                        position = -1
                    order_warnings.append(f"Slide {index}: title object is position {position} of {len(slide_objects)}")

            if index <= len(expected_slides):
                expected_title = normalize_space(expected_slides[index - 1].get("title", ""))
                if normalize_space(title) == expected_title:
                    self.evidence["titleTextMatches"] += 1
                else:
                    mismatches.append(f"Slide {index}: expected {expected_title!r}; found {title!r}")

        self.slide_titles = titles
        self.evidence["slideParts"] = len(titles)
        duplicates = sorted({title for title in titles if title and titles.count(title) > 1})
        expected_count_mismatch = bool(expected_slides) and len(expected_slides) != len(titles)
        self.add(
            "PPTX-CI-005",
            "Each slide has one unique title matching the build manifest",
            not missing and not multiple and not duplicates and not mismatches and not expected_count_mismatch,
            [
                f"Slides: {len(titles)}",
                f"Missing: {missing or 'none'}",
                f"Multiple: {multiple or 'none'}",
                f"Duplicate titles: {duplicates or 'none'}",
                f"Manifest mismatches: {mismatches or 'none'}",
                f"Manifest slide count mismatch: {expected_count_mismatch}",
            ],
        )
        self.add(
            "PPTX-CI-006",
            "Title is first in generated object order",
            not order_warnings,
            order_warnings or ["Title is the first slide-specific object on every slide."],
            severity="warning",
        )

    def check_nonvisual_ids(self) -> None:
        duplicates: list[str] = []
        inspected = 0
        for name, root in self.xml.items():
            if not re.match(r"ppt/(slides|slideLayouts|slideMasters)/.*\.xml$", name):
                continue
            values = [node.get("id") for node in root.findall(".//p:cNvPr", NS) if node.get("id")]
            inspected += 1
            repeated = sorted({value for value in values if values.count(value) > 1})
            if repeated:
                self.evidence["duplicateIdParts"] += 1
                duplicates.append(f"{name}: {', '.join(repeated)}")
        self.add(
            "PPTX-CI-007",
            "Nonvisual object IDs are unique within each presentation part",
            not duplicates,
            duplicates or [f"Checked {inspected} slide, layout, and master parts."],
        )

    def check_images_and_decorative_objects(self) -> None:
        missing_alt: list[str] = []
        bad_decorative: list[str] = []
        bad_sources: list[str] = []
        missing_markers: list[str] = []
        for name, root in self.xml.items():
            if not re.match(r"ppt/(slides|slideLayouts|slideMasters)/.*\.xml$", name):
                continue
            for cnv in root.findall(".//p:cNvPr", NS):
                object_name = (cnv.get("name") or "").strip()
                description = (cnv.get("descr") or "").strip()
                title = (cnv.get("title") or "").strip()
                decorative = any(node.get("val") == "1" for node in cnv.findall(".//adec:decorative", NS))
                if object_name.startswith("Decorative:"):
                    self.evidence["decorativeObjects"] += 1
                    if not decorative:
                        missing_markers.append(f"{name}: {object_name}")
                    if description or title:
                        bad_decorative.append(f"{name}: {object_name} retains title/description")
                if object_name.startswith("Informative image:"):
                    self.evidence["informativeImages"] += 1
                    if not description:
                        missing_alt.append(f"{name}: {object_name}")
                if description and re.search(r"^(?:data:|file:|/|[A-Za-z]:\\)|(?:^|/)assets/|\.(?:png|jpe?g|gif|webp|svg)$", description, re.I):
                    bad_sources.append(f"{name}: {object_name or '(unnamed)'} descr={description!r}")
        self.add(
            "PPTX-CI-008",
            "Informative images have alt text and decorative objects use native decorative metadata",
            not missing_alt and not bad_decorative and not missing_markers and not bad_sources,
            [
                f"Informative images: {self.evidence['informativeImages']}",
                f"Decorative objects: {self.evidence['decorativeObjects']}",
                f"Missing alt text: {missing_alt or 'none'}",
                f"Missing decorative markers: {missing_markers or 'none'}",
                f"Decorative descriptions: {bad_decorative or 'none'}",
                f"Path/data leaks: {bad_sources or 'none'}",
            ],
        )

    def check_language(self) -> None:
        expected = self.expected_language()
        mismatches: list[str] = []
        checked = 0
        for name, root in self.xml.items():
            if not re.match(r"ppt/(slides|slideLayouts|slideMasters|notesSlides)/.*\.xml$", name):
                continue
            for tag_name in ("rPr", "endParaRPr", "defRPr"):
                for node in root.findall(f".//a:{tag_name}", NS):
                    checked += 1
                    if node.get("lang") != expected:
                        mismatches.append(f"{name}: a:{tag_name} lang={node.get('lang')!r}")
        self.evidence["runLanguageMismatches"] = len(mismatches)
        self.add(
            "PPTX-CI-009",
            "DrawingML text properties declare the presentation language",
            not mismatches,
            mismatches[:40] or [f"Checked {checked} text property elements for {expected}."],
            details={"expectedLanguage": expected, "mismatchCount": len(mismatches)},
        )

    def check_tables_and_text_behavior(self) -> None:
        unmarked: list[str] = []
        autofit: list[str] = []
        for name, root in self.xml.items():
            if not re.match(r"ppt/(slides|slideLayouts|slideMasters|notesSlides)/.*\.xml$", name):
                continue
            for table in root.findall(".//a:tbl", NS):
                self.evidence["tables"] += 1
                table_props = table.find("./a:tblPr", NS)
                if table_props is None or table_props.get("firstRow") != "1":
                    unmarked.append(name)
            count = len(root.findall(".//a:normAutofit", NS)) + len(root.findall(".//a:spAutoFit", NS))
            if count:
                self.evidence["automaticFitObjects"] += count
                autofit.append(f"{name}: {count}")
        self.add(
            "PPTX-CI-010",
            "Tables mark the first row and text does not use automatic fitting",
            not unmarked and not autofit,
            [
                f"Tables: {self.evidence['tables']}",
                f"Unmarked tables: {unmarked or 'none'}",
                f"Automatic-fit objects: {autofit or 'none'}",
            ],
        )

    def check_brand_and_motion(self) -> None:
        unapproved_fonts: list[str] = []
        unapproved_colors: list[str] = []
        gradients: list[str] = []
        motion: list[str] = []
        for name, root in self.xml.items():
            if not re.match(r"ppt/(slides|slideLayouts|slideMasters)/.*\.xml$", name):
                continue
            for node in root.findall(".//a:latin", NS):
                face = (node.get("typeface") or "").strip()
                if not face or face.startswith("+"):
                    continue
                self.evidence["explicitTypefaceElements"] += 1
                if face not in APPROVED_FONTS:
                    unapproved_fonts.append(f"{name}: {face}")
            for node in root.findall(".//a:srgbClr", NS):
                color = normalize_hex(node.get("val"))
                if not color:
                    continue
                self.evidence["explicitColorElements"] += 1
                if color not in APPROVED_COLORS:
                    unapproved_colors.append(f"{name}: #{color}")
            if root.findall(".//a:gradFill", NS):
                gradients.append(name)
            if root.findall(".//p:transition", NS) or root.findall(".//p:timing", NS):
                motion.append(name)
        self.add(
            "PPTX-CI-011",
            "OOXML uses approved fonts, approved colors, and no gradients or motion timelines",
            not unapproved_fonts and not unapproved_colors and not gradients and not motion,
            [
                f"Unapproved fonts: {sorted(set(unapproved_fonts)) or 'none'}",
                f"Unapproved colors: {sorted(set(unapproved_colors)) or 'none'}",
                f"Gradient parts: {gradients or 'none'}",
                f"Transition/timing parts: {motion or 'none'}",
            ],
        )

    def check_layout_and_editability(self) -> None:
        cx, cy = self.slide_size
        out_of_bounds: list[str] = []
        full_slide_images: list[str] = []
        if cx and cy:
            for index, (name, root) in enumerate(self.slide_parts(), 1):
                for xfrm in positioned_transforms(root):
                    off = xfrm.find(f"{{{A}}}off")
                    ext = xfrm.find(f"{{{A}}}ext")
                    if off is None or ext is None:
                        continue
                    x, y = int(off.get("x", "0")), int(off.get("y", "0"))
                    w, h = int(ext.get("cx", "0")), int(ext.get("cy", "0"))
                    if x < 0 or y < 0 or x + w > cx + 100 or y + h > cy + 100:
                        out_of_bounds.append(
                            f"Slide {index}: x={x/EMU_PER_INCH:.2f}, y={y/EMU_PER_INCH:.2f}, "
                            f"w={w/EMU_PER_INCH:.2f}, h={h/EMU_PER_INCH:.2f}"
                        )
                for picture in root.findall(".//p:pic", NS):
                    xfrm = picture.find("./p:spPr/a:xfrm", NS)
                    ext = xfrm.find("./a:ext", NS) if xfrm is not None else None
                    if ext is None:
                        continue
                    area_ratio = (int(ext.get("cx", "0")) * int(ext.get("cy", "0"))) / (cx * cy)
                    if area_ratio > 0.88:
                        full_slide_images.append(f"Slide {index}: image covers {area_ratio:.0%} of canvas")
        self.add(
            "PPTX-CI-012",
            "Objects stay within the slide canvas and slides are not flattened into full-slide images",
            not out_of_bounds and not full_slide_images,
            [
                f"Out-of-bounds objects: {out_of_bounds[:40] or 'none'}",
                f"Full-slide images: {full_slide_images or 'none'}",
            ],
        )

    def check_links_and_security(self) -> None:
        bad_targets: list[str] = []
        external_targets = 0
        for name, root in self.xml.items():
            if not name.endswith(".rels"):
                continue
            for relationship in root.findall(f"{{{REL}}}Relationship"):
                target = (relationship.get("Target") or "").strip()
                if relationship.get("TargetMode") == "External":
                    external_targets += 1
                    if re.match(r"^(?:javascript|data|file):", target, re.I):
                        bad_targets.append(f"{name}: {target}")
        self.evidence["hyperlinks"] = external_targets
        prohibited_parts = [
            name for name in self.parts
            if not name.endswith("/") and (
                re.search(r"(?:vbaProject|activeX|oleObject)", name, re.I)
                or ("/embeddings/" in name and not name.lower().endswith(".xlsx"))
            )
        ]
        protection_parts = [
            name for name, root in self.xml.items()
            if any(local_name(node.tag) in {"modifyVerifier", "documentProtection"} for node in root.iter())
        ]
        self.add(
            "PPTX-CI-013",
            "No active content, unsafe external targets, or editing protection",
            not prohibited_parts and not protection_parts and not bad_targets,
            [
                f"External relationships: {external_targets}",
                f"Unsafe targets: {bad_targets or 'none'}",
                f"Prohibited parts: {prohibited_parts or 'none'}",
                f"Protection markup: {protection_parts or 'none'}",
            ],
        )

    def check_notes(self) -> None:
        note_parts = sorted(
            (name for name in self.xml if re.fullmatch(r"ppt/notesSlides/notesSlide\d+\.xml", name)),
            key=natural_part_key,
        )
        self.evidence["notesParts"] = len(note_parts)
        nonempty = 0
        for name in note_parts:
            root = self.xml[name]
            body_text: list[str] = []
            for shape in root.findall(".//p:sp", NS):
                placeholder = shape.find("./p:nvSpPr/p:nvPr/p:ph", NS)
                if placeholder is not None and placeholder.get("type") == "body":
                    body_text.extend(node.text or "" for node in shape.findall(".//a:t", NS))
            if normalize_space(" ".join(body_text)):
                nonempty += 1
        expected_notes = 0
        if self.manifest:
            expected_notes = sum(1 for slide in self.manifest.get("slides", []) if normalize_space(slide.get("notes", "")))
        ok = len(note_parts) >= expected_notes and nonempty >= expected_notes
        self.add(
            "PPTX-CI-014",
            "Authored speaker notes are preserved in real notes parts",
            ok,
            [f"Notes parts: {len(note_parts)}", f"Nonempty notes bodies: {nonempty}", f"Expected from manifest: {expected_notes}"],
        )

    def check_manifest(self) -> None:
        if not self.manifest:
            self.add(
                "PPTX-CI-015",
                "Generation manifest is available for independent geometry and contrast checks",
                False,
                ["No manifest was provided."],
            )
            return

        problems: list[str] = []
        page = self.manifest.get("page", {})
        page_width = number(page.get("width"))
        page_height = number(page.get("height"))
        if not page_width or not page_height or abs(page_width / page_height - 16 / 9) >= 0.002:
            problems.append("Manifest page size is not 16:9.")

        brand = self.manifest.get("brand", {})
        brand_fonts = set((brand.get("fonts") or {}).values())
        brand_colors = {normalize_hex(value) for value in (brand.get("colors") or {}).values()}
        if not brand_fonts.issubset(APPROVED_FONTS):
            problems.append(f"Manifest contains unapproved brand fonts: {sorted(brand_fonts - APPROVED_FONTS)}")
        if not brand_colors.issubset(APPROVED_COLORS):
            problems.append(f"Manifest contains unapproved brand colors: {sorted(brand_colors - APPROVED_COLORS)}")

        for slide in self.manifest.get("slides", []):
            elements = slide.get("elements", [])
            for element in elements:
                self.evidence["geometryElements"] += 1
                x, y, width, height = (number(element.get(key)) for key in ("x", "y", "w", "h"))
                if None not in (x, y, width, height) and page_width and page_height:
                    if x < -0.001 or y < -0.001 or x + width > page_width + 0.001 or y + height > page_height + 0.001:
                        problems.append(f"Slide {slide.get('number')} object {element.get('name')!r} is outside the manifest canvas.")
                if element.get("type") == "text":
                    face = element.get("fontFace")
                    if face and face not in APPROVED_FONTS:
                        problems.append(f"Slide {slide.get('number')} object {element.get('name')!r} uses unapproved font {face}.")
                    font_size = number(element.get("fontSize"))
                    if font_size is not None and font_size < 12 and element.get("semantic") != "footer":
                        problems.append(f"Slide {slide.get('number')} object {element.get('name')!r} is below 12 pt.")
                    foreground = normalize_hex(element.get("foreground"))
                    background = normalize_hex(element.get("background"))
                    if foreground and foreground not in APPROVED_COLORS:
                        problems.append(f"Slide {slide.get('number')} object {element.get('name')!r} uses unapproved foreground #{foreground}.")
                    if background and background not in APPROVED_COLORS:
                        problems.append(f"Slide {slide.get('number')} object {element.get('name')!r} uses unapproved background #{background}.")
                    if foreground and background and font_size is not None:
                        ratio = contrast_ratio(foreground, background)
                        threshold = 3.0 if font_size >= 18 or (font_size >= 14 and element.get("bold")) else 4.5
                        if ratio + 0.001 < threshold:
                            problems.append(
                                f"Slide {slide.get('number')} object {element.get('name')!r} has contrast {ratio:.2f}:1; {threshold}:1 required."
                            )
            problems.extend(severe_overlap_problems(slide))

        self.add(
            "PPTX-CI-015",
            "Generation manifest passes independent geometry, typography, color, contrast, and overlap checks",
            not problems,
            problems[:80] or [f"Checked {self.evidence['geometryElements']} manifest elements."],
            details={"problemCount": len(problems)},
        )

    def add_manual_reminders(self) -> None:
        reminders = [
            ("PPTX-MANUAL-001", "Microsoft PowerPoint Accessibility Checker", "Run the County-supported desktop PowerPoint Accessibility Checker."),
            ("PPTX-MANUAL-002", "Reading Order and Selection panes", "Confirm title, content, media/table, and footer order on representative slides."),
            ("PPTX-MANUAL-003", "Screen-reader and keyboard traversal", "Test high-risk slides in desktop PowerPoint with the supported assistive-technology environment."),
            ("PPTX-MANUAL-004", "Font substitution and edit/save/reopen", "Test with and without Jost/Open Sans installed, then edit, save, close, and reopen."),
            ("PPTX-MANUAL-005", "Official County template and identity review", "Compare output with the authoritative County presentation assets when supplied."),
        ]
        for check_id, name, message in reminders:
            self.add(check_id, name, None, [message], severity="manual")

    def expected_language(self) -> str:
        return str((self.manifest or {}).get("presentation", {}).get("language") or "en-US")

    def report(self) -> dict[str, Any]:
        failed = [check for check in self.checks if check.status == "fail"]
        counts = {status: sum(1 for check in self.checks if check.status == status) for status in ("pass", "fail", "manual")}
        return {
            "schema": 1,
            "file": self.pptx.name,
            "path": self.pptx.as_posix(),
            "sha256": file_sha256(self.pptx) if self.pptx.is_file() else None,
            "manifest": bool(self.manifest),
            "overallAutomatedStatus": "fail" if failed else "pass",
            "counts": counts,
            "evidence": self.evidence,
            "checks": [asdict(check) for check in self.checks],
        }


def discover_pptx(inputs: list[pathlib.Path]) -> list[pathlib.Path]:
    files: list[pathlib.Path] = []
    for input_path in inputs:
        resolved = input_path.resolve()
        if resolved.is_dir():
            files.extend(sorted(resolved.rglob("*.pptx")))
        elif resolved.is_file() and resolved.suffix.lower() == ".pptx":
            files.append(resolved)
        else:
            raise ValueError(f"PPTX input does not exist or is not a .pptx file: {input_path}")
    return sorted(set(files), key=lambda item: item.as_posix())


def adjacent_manifest(pptx: pathlib.Path) -> pathlib.Path:
    return pptx.with_suffix(".manifest.json")


def load_manifest(path: pathlib.Path | None) -> dict[str, Any] | None:
    if path is None or not path.is_file():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def positioned_transforms(root: ET.Element) -> list[ET.Element]:
    transforms: list[ET.Element] = []
    for shape in root.findall(".//p:sp", NS):
        node = shape.find("./p:spPr/a:xfrm", NS)
        if node is not None:
            transforms.append(node)
    for picture in root.findall(".//p:pic", NS):
        node = picture.find("./p:spPr/a:xfrm", NS)
        if node is not None:
            transforms.append(node)
    for frame in root.findall(".//p:graphicFrame", NS):
        node = frame.find("./p:xfrm", NS)
        if node is not None:
            transforms.append(node)
    for connector in root.findall(".//p:cxnSp", NS):
        node = connector.find("./p:spPr/a:xfrm", NS)
        if node is not None:
            transforms.append(node)
    return transforms


def is_title_shape(shape: ET.Element) -> bool:
    placeholder = shape.find("./p:nvSpPr/p:nvPr/p:ph", NS)
    return placeholder is not None and placeholder.get("type") in {"title", "ctrTitle"}


def shape_text(shape: ET.Element) -> str:
    return normalize_space("".join(node.text or "" for node in shape.findall(".//a:t", NS)))


def find_text(root: ET.Element | None, tag: str) -> str:
    if root is None:
        return ""
    node = root.find(f".//{tag}")
    return normalize_space(node.text if node is not None else "")


def severe_overlap_problems(slide: dict[str, Any]) -> list[str]:
    elements = []
    for element in slide.get("elements", []):
        if element.get("decorative") or element.get("semantic") == "footer":
            continue
        geometry = [number(element.get(key)) for key in ("x", "y", "w", "h")]
        if None in geometry or geometry[2] <= 0.05 or geometry[3] <= 0.05:
            continue
        elements.append(element)
    problems: list[str] = []
    for index, first in enumerate(elements):
        for second in elements[index + 1:]:
            if "slide-title-placeholder" in {first.get("semantic"), second.get("semantic")}:
                continue
            area = intersection_area(first, second)
            minimum = min(float(first["w"]) * float(first["h"]), float(second["w"]) * float(second["h"]))
            if minimum > 0 and area / minimum > 0.45:
                problems.append(
                    f"Slide {slide.get('number')} objects {first.get('name')!r} and {second.get('name')!r} substantially overlap."
                )
    return problems


def intersection_area(first: dict[str, Any], second: dict[str, Any]) -> float:
    left = max(float(first["x"]), float(second["x"]))
    top = max(float(first["y"]), float(second["y"]))
    right = min(float(first["x"]) + float(first["w"]), float(second["x"]) + float(second["w"]))
    bottom = min(float(first["y"]) + float(first["h"]), float(second["y"]) + float(second["h"]))
    return max(0.0, right - left) * max(0.0, bottom - top)


def normalize_hex(value: Any) -> str:
    text = str(value or "").strip().lstrip("#").upper()
    return text if re.fullmatch(r"[0-9A-F]{6}", text) else ""


def relative_luminance(value: str) -> float:
    channels = [int(value[index:index + 2], 16) / 255 for index in (0, 2, 4)]
    converted = [channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4 for channel in channels]
    return 0.2126 * converted[0] + 0.7152 * converted[1] + 0.0722 * converted[2]


def contrast_ratio(foreground: str, background: str) -> float:
    high, low = sorted((relative_luminance(foreground), relative_luminance(background)), reverse=True)
    return (high + 0.05) / (low + 0.05)


def number(value: Any) -> float | None:
    try:
        converted = float(value)
        return converted if math.isfinite(converted) else None
    except (TypeError, ValueError):
        return None


def normalize_space(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def natural_part_key(value: str) -> int:
    match = re.search(r"(\d+)\.xml$", value)
    return int(match.group(1)) if match else 10**9


def unsafe_zip_name(name: str) -> bool:
    path = pathlib.PurePosixPath(name)
    return (
        not name
        or name.startswith(("/", "\\"))
        or "\x00" in name
        or ":" in name
        or any(part == ".." for part in path.parts)
    )


def file_sha256(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description="Independently validate Marin Learn-generated PPTX files.")
    parser.add_argument("inputs", nargs="+", type=pathlib.Path, help="PPTX file(s) or directories containing PPTX files")
    parser.add_argument("--manifest", type=pathlib.Path, help="Manifest for a single PPTX input")
    parser.add_argument("--out", type=pathlib.Path, help="Write a combined JSON report")
    parser.add_argument("--require-manifest", action="store_true", help="Fail when an adjacent manifest is unavailable")
    parser.add_argument("--write-sidecars", action="store_true", help="Write <deck>.independent-validation.json beside each PPTX")
    args = parser.parse_args()

    try:
        files = discover_pptx(args.inputs)
    except ValueError as exc:
        parser.error(str(exc))
    if not files:
        parser.error("No PPTX files were found.")
    if args.manifest and len(files) != 1:
        parser.error("--manifest may be used only with one PPTX file.")

    reports: list[dict[str, Any]] = []
    for pptx in files:
        manifest_path = args.manifest.resolve() if args.manifest else adjacent_manifest(pptx)
        manifest = load_manifest(manifest_path)
        report = PptxValidation(pptx, manifest).run()
        if args.require_manifest and manifest is None:
            report["overallAutomatedStatus"] = "fail"
            report["counts"]["fail"] += 1
            report["checks"].append(asdict(Check(
                "PPTX-CI-016",
                "Adjacent generation manifest is required",
                "fail",
                "error",
                [f"Expected manifest: {manifest_path.as_posix()}"],
            )))
        report["manifestPath"] = manifest_path.as_posix() if manifest_path else None
        reports.append(report)
        if args.write_sidecars:
            sidecar = pptx.with_suffix(".independent-validation.json")
            sidecar.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"{report['overallAutomatedStatus'].upper()}: {pptx}")

    combined = {
        "schema": 1,
        "tool": "Marin Learn independent PPTX validator",
        "overallAutomatedStatus": "pass" if all(item["overallAutomatedStatus"] == "pass" for item in reports) else "fail",
        "counts": {
            "files": len(reports),
            "passed": sum(1 for item in reports if item["overallAutomatedStatus"] == "pass"),
            "failed": sum(1 for item in reports if item["overallAutomatedStatus"] == "fail"),
        },
        "files": reports,
    }
    output = json.dumps(combined, indent=2, ensure_ascii=False) + "\n"
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(output, encoding="utf-8")
    else:
        print(output, end="")
    raise SystemExit(0 if combined["overallAutomatedStatus"] == "pass" else 1)


if __name__ == "__main__":
    main()
