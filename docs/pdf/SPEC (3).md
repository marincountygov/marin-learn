# Marin Learn - Accessible PDF Download

**Status:** Approved product decisions; implementation specification  
**Target location:** `docs/pdf/SPEC.md`  
**Target application:** Marin Learn learner-facing viewer  
**Implementation method:** Incremental OpenCode phases with mandatory review gates

## 1. Purpose

Replace the learner viewer's current **Print material / PDF** action, which opens a plain rendering and invokes the browser print dialog, with **Download PDF**. The new action MUST deliver a professionally formatted, accessible, MarinOS-branded PDF of the **entire selected Learning Material**.

A learner MUST NOT need to choose a printer, open a print dialog, or understand PDF export settings. The generated PDF is a stable document that can be saved and shared. The PDF MUST reflect the canonical learning content and sequence, not a screenshot or copy of the viewer interface.

This project is **PDF publication**, not a new content-authoring feature. The approved `marin-learn/v1` schema, the individual Markdown files, and the package contract remain authoritative and unchanged.

The words **MUST**, **MUST NOT**, **SHOULD**, and **MAY** are normative requirements.

## 2. Decisions already made

| Topic | Decision |
| --- | --- |
| Initial technical approach | Evaluate browser-only PDF generation first. Do not compromise accessibility; if it cannot satisfy the conformance gate, move to a build-time solution after user approval. |
| Accessibility | PDF/UA conformance is a hard release requirement; also evaluate applicable WCAG and Section 508 obligations. |
| Content | Export the complete selected `marin:LearningMaterial` in authored order; do not append quizzes or slides. |
| Visual approach | **Clean document**, not a formal publication: no cover page and no generated visible table of contents. |
| Delivery | **Download PDF** starts a direct file download, not a new browser tab or print dialog. |
| Metadata | Include truthful canonical publication metadata when supplied; omit missing values. |
| Data source | Use canonical `learning.json`, referenced Markdown, and approved assets through shared Marin Learn parsing and rendering semantics; do not scrape the live reader DOM. |
| Deployment | Preserve static hosting and individually maintained Markdown files; no new runtime backend. |

The new control replaces the existing export button, not the browser's ordinary Ctrl+P / system printing capability.

## 3. Authoritative project inputs and dependency order

Before writing or selecting PDF-generation code, the agent MUST read the current **local** versions of:

1. `docs/viewer/SPEC.md`, including its review/approval process, routing, loading, security, and shared-core constraints.
2. `schema/marin-learn-v1.schema.json`.
3. `docs/MARKDOWN.md`.
4. `docs/PACKAGE.md`.
5. Root `AGENTS.md` and applicable existing editor integration requirements.
6. Sibling `marin-app-template`, `marin-app-shell`, `marin-ui`, `marin-digital-standards`, and relevant `marin-skills` instructions for typography, brand, PDF/document accessibility, and quality assurance.

If a path has changed, locate the actual authoritative file and report the difference. Do not assume version numbers or copy visual tokens from a previous MarinOS release. Sibling repositories are read-only unless explicitly authorized otherwise.

**Precedence:** canonical content/schema rules > PDF accessibility correctness > MarinOS styling rules > optional visual refinements. This does not authorize silently ignoring a conflicting requirement; raise conflicts at the current review gate.

The publisher or PDF generator MAY create **derived PDF files**, but MUST NOT rewrite `learning.json`, alter authored Markdown, add a PDF to the canonical ZIP format, or introduce compiled master content JSON.

## 4. Scope

### 4.1 Included

- Replace the current button with **Download PDF** on a selected Material.
- Render **all** Sections and ContentUnits referenced by that Material, including repeated occurrences, in actual assembly order.
- Support the complete approved Markdown profile: paragraphs, headings, emphasis, lists, block quotations, links, images, code blocks, and supported simple tables.
- Resolve canonical internal content references and contextual image references safely.
- Render instructional `note`, `warning`, `example`, and other ContentUnit semantics using restrained, consistent document treatments.
- Include accessible PDF metadata, structure, outline/bookmarks where supportable, links, and sensible pagination.
- Embed the approved local font assets subject to their licenses and glyph coverage.
- Produce a direct PDF download with accessible progress, completion, and failure feedback.
- Validate the output both programmatically and manually before release.

### 4.2 Not included

- Quiz questions, answer keys, quiz results, or slide decks as appendices.
- A cover page, visible table of contents, elaborate report graphics, or new publication templates.
- User controls for font, colors, margins, page size, or arbitrary styling.
- User-supplied HTML/CSS, PDF editing, PDF form fields, annotations, signing, passwords, or watermarking.
- Authentication, storage of learner data, server-side generation on demand, or a paid remote PDF API.
- Changes to canonical schema, Markdown profile, packaging contract, or learner content.
- A client-side HTML-to-canvas/screenshot PDF that flattens content into images.

## 5. PDF accessibility policy and release gate

### 5.1 Concrete conformance profile

For v1, use **PDF/UA-1 (ISO 14289-1:2014)** as the named, testable PDF conformance target. This is a practical initial profile for tool evaluation, not a statement that PDF/UA-2 is unimportant. A switch to PDF/UA-2 requires a separate decision, tooling review, and revised tests.

The output MUST also meet applicable County accessibility standards, including WCAG 2.2 AA principles where relevant to non-web documents, and applicable Section 508 requirements. PDF/UA validation is **necessary but not sufficient** evidence of overall accessibility.

### 5.2 Mandatory semantic properties

Each emitted PDF MUST have:

- Tagged, selectable, searchable text (not page screenshots).
- One correct document title and natural-language metadata using the Material/Set `inLanguage` inheritance rules.
- A logical reading order corresponding to the canonical Material sequence, including multicolumn or wrapped content when applicable.
- A properly structured heading hierarchy based on Material, Section, ContentUnit, and relative Markdown headings.
- Semantic paragraphs, nested lists/list items, code/preformatted content where supportable, and quotations.
- Genuine table structures (`Table`, rows, header cells, data cells), with header relationships as required; NOT merely drawn gridlines.
- Meaningful image `Figure` tags and **contextual** alternative text; explicitly decorative images and repeated ornamental branding marked as artifacts.
- Tagged, keyboard-usable hyperlink annotations with valid destinations, including external URLs and internal document links when a destination is part of the exported Material.
- Proper reading text and glyph mapping for punctuation, symbols, and any supported non-ASCII characters.
- Document properties such as title and language; actual publisher, modification date, version, and subject only when supplied in canonical metadata.
- Pagination artifacts (e.g., page numbers, decorative rules) kept out of the meaningful content reading order.
- A document outline/bookmark structure from headings where it can be produced correctly without compromising conformance. A visible table of contents is **not** required.

Do not put a PDF/UA claim in PDF XMP metadata, user copy, or release notes until the produced PDFs have passed the applicable validation process. Merely setting a library option named `tagged` or `PDF/UA` is not proof of conformance.

### 5.3 Verification

Automated: Use **veraPDF** with the explicit PDF/UA-1 profile (e.g., `-f ua1`) in verification. Do not rely on default profile selection. Record its version, profile, commands, and validation report. Automated checks also MUST inspect document properties, font embedding, semantic tags, and links when feasible.

Manual: Review the PDF's structure tree and reading order, headings, lists, link behavior, meaningful/decorative figures, actual alternative-text quality, tables, contrast, page flow, and keyboard/screen-reader usability. **PAC** or equivalent independent PDF accessibility inspection MAY be used; accessibility tree/structure review MUST remain tool-neutral. An automatic validator cannot certify the semantic accuracy of the content.

**Hard gate:** No approach may be called complete or released with PDF/UA errors, known material reading-order/meaning defects, or unreviewed accessibility gaps. If browser-only output fails and cannot be made conformant, STOP and present a build-time alternative; do not silently degrade to an untagged PDF or the existing print dialog.

## 6. Document appearance: clean MarinOS publication

Use a restrained US Letter portrait document, white background, generous margins, legible text, and a clear type hierarchy. Values below are initial layout guidance to be verified against current MarinOS standards, not permission to invent a separate theme.

- **Page size:** US Letter portrait; do not add a UI page-size selector in v1.
- **Margins:** Comfortable print-safe margins (approximately 0.7-0.85 inch) adjusted to avoid clipping.
- **Typography:** Use local approved MarinOS body and heading families (currently Open Sans / Jost in MarinOS policy, but verify current repo), and embed permitted font subsets with verified glyph coverage. Never fetch fonts from a CDN.
- **Accent:** Derive restrained colors, spacing, and emphasis from current `marin-ui` / digital standards. No manually recreated brand palette.
- **First page:** Material title at the top, optional abstract/description, then begin the content. No empty cover or separate TOC page.
- **Subsequent pages:** Compact document header/footer with title/organization if appropriate and actual page numbers. Do not invent a County seal, department attribution, author, date, or license.
- **Structural elements:** Heading spacing, list indentation, callout treatment, table styling, captions, quotations, and code blocks must be consistent and never encode meaning by color alone.
- **Pagination:** Avoid orphan headings and widow lines when possible; keep captions with their figures; allow tables and long content to break accessibly, repeating visible column headers as practical; do not hide overflow to fit a page.
- **Links:** Distinguishable in monochrome printing, not by color alone. External links stay clickable. A print-friendly URL treatment MAY be used without duplicating confusing text in the reading order.
- **Contrast:** Check body, headings, rules, and callouts against County accessibility requirements, including usable grayscale output.
- **Decoration:** Minimal. Visual embellishments MUST be artifacts in the tag tree when they convey no content.

The PDF is a document, not a screenshot of the Marin Learn web UI. App Shell navigation, sidebar, viewer breadcrumbs, quiz controls, and other web furniture MUST NOT appear in the PDF.

## 7. Source interpretation and content fidelity

The selected Material is determined by the viewer's resolved, validated `marin:LearningMaterial` resource, not an arbitrary URL or CSS selector.

1. Load and validate the selected LearningSet graph from the existing static viewer source.
2. Resolve the Material's `marin:contentSequence` and nested `marin:Section` nodes in canonical order.
3. Resolve each `marin:ContentUnit` and read its own Markdown file from `encoding.contentUrl` using the viewer's safe path resolver.
4. Parse the Markdown through the shared, approved Marin Learn Markdown semantics. The PDF implementation may create an internal semantic/print intermediate representation; it MUST NOT require a new persisted content representation.
5. Resolve `marin-asset:<uuid>` to the appropriate locally published asset. Take alternative text from the image's Markdown usage (the same asset can have different alt text in different places).
6. Resolve `marin-ref:<uuid>` to an internal PDF destination when the target appears in the exported Material. If a target is external to the exported Material, link to a valid public Marin Learn URL if and only if one is deterministically resolvable from published information; otherwise retain descriptive text and omit the broken link. Do not guess URLs.
7. Generate the accessible PDF in the order of the resolved content. Preserve titles, prose, list numbering, tables, quoted text, code, captions, and meaningful emphasis.
8. Preserve the user's authored instructional claims without rewriting or summarizing them for pagination.

Duplicate occurrences of a reused ContentUnit MUST appear each time the Material explicitly references them; fetch caching may avoid redundant network requests. A ContentUnit missing from the selected Material MUST NOT be included merely because it belongs to the same LearningSet.

The shared parser, graph lookup, heading normalization, link/asset rules, and logical sequence MUST be reused rather than implemented independently where an existing reliable module is available. A PDF layout adapter is allowed; a second incompatible interpretation of Markdown is not.

### 7.1 Metadata mapping

| PDF field or display | Canonical source |
| --- | --- |
| Document title | Selected LearningMaterial `name` |
| Description/subject | Material `abstract`, if provided; otherwise omit unless an explicitly approved fallback is available |
| Document language | Material `inLanguage`, falling back to LearningSet `inLanguage` |
| Version / last updated | Material's value when present, otherwise applicable inherited/publisher-approved metadata; omit when unknown |
| Publisher attribution | Actual Material or LearningSet `publisher`, when provided and applicable |
| Copyright/license | Applicable canonical copyright/license metadata only |
| Source URL | Current validated public URL of this Material, if it can be resolved exactly |

`dateCreated`, `dateModified`, and `datePublished` have different meanings. Do not substitute a build timestamp or the learner's current date for an unknown publication date. Do not assert official County authorship from the app brand alone.

## 8. Technical strategy and feasibility rule

### 8.1 Preferred attempt: browser-only

The first investigation MUST attempt client-side generation from validated canonical data, with no print dialog and no server call. A candidate library MUST be locally vendorable, licensed for MarinOS, and capable of creating structurally tagged PDF content rather than merely drawing text to pages.

The Phase 1 prototype MUST prove: structure tree, document metadata and language, at least one link annotation, heading/list/table tags, meaningful and decorative image handling, font embedding, readable multi-page order, a usable direct download, and successful PDF/UA-1 validation. Test actual PDF output, not library marketing claims.

Use the actual content model and a deliberately difficult sample (Section nesting, multi-page content, link, list, table, image alt, decorative graphic, code, non-ASCII text). If a library has limitations in PDF link annotation tagging, figure semantics, language metadata, or font embedding, record them as blockers until proven resolved.

Do not introduce a runtime dependency on Node.js, a remote font server, an API key, or a CDN. Heavy PDF code SHOULD load only after the user chooses **Download PDF**.

### 8.2 Approved fallback in principle: build-time PDFs

If the browser-only proof cannot pass the accessibility gate, recommend a **build-time generator** to run during static publication, pending explicit approval of the approach at a review gate.

A build-time implementation:

- MUST read the same canonical `learning.json`, individual Markdown files, and assets; MAY use a semantic HTML/print layout intermediate generated from this source, but MUST NOT scrape the current learner UI;
- MUST emit one PDF per **published LearningMaterial**, not a site-wide combined PDF;
- MAY use local Node.js/headless browser or another maintained offline build tool in CI, but no Node process on the production static host;
- MUST run explicit PDF/UA validation against emitted files and fail publication on nonconforming required PDFs;
- MUST preserve the authored Markdown and canonical ZIP exactly;
- MUST use a documented, safe, deterministic mapping from the selected Material to its static PDF path (e.g., under that set's published directory), handle duplicate/renamed slugs safely, and update published files/cache consistently;
- MUST exclude draft, review, retired, invalid, or otherwise ineligible content at publication time, rather than merely hiding its download control;
- MUST keep the viewer's **Download PDF** action a direct file download with the same accessible labeling and error states.

A tagged PDF option from a headless browser is **not sufficient** to declare PDF/UA conformance; test the resulting output independently. Do not fall back to a remote on-demand service without a new user decision.

### 8.3 Strategy selection gate

Phase 1 ends with an explicit decision report: selected generator, exact version/license, sample PDF, accessibility validator report, human findings, supported source constructs, limitations, browser size/runtime cost, and recommendation to proceed or switch.

**Do not start full production implementation until the user approves this decision.**

## 9. Viewer integration and download UX

### 9.1 Control

- Replace the existing control's visible label with **Download PDF** and use an approved MarinOS download/file icon if appropriate.
- Place it with the selected Material's actions; do not add an authoring control, advanced settings form, or PDF-specific site navigation.
- Use a real button for browser-side generation or a properly configured download link for a prebuilt PDF. The action MUST be keyboard accessible.
- File name: derived from the validated Material `identifier`, for example `county-leaders-guide-to-schemas.pdf`; sanitize filenames and prevent path traversal. Do not expose raw UUIDs to readers.
- A click MUST initiate download directly. It MUST NOT invoke `window.print()`, open a blank print page, or silently navigate to an intermediate print view.

### 9.2 Progress and failure

- Before starting, confirm the selected Material is valid and its referenced source is available.
- During generation, disable duplicate submissions, show **Preparing PDF...**, and expose a polite accessible status message. Do not imply generation is finished until bytes/file availability is confirmed.
- On success, trigger a browser download, restore normal control state, and announce **PDF ready** or another accurate status.
- On error, explain the problem in plain language and offer **Try again** if recovery is feasible. Never download an incomplete or known-invalid PDF.
- If a browser lacks a required capability, do not pretend the PDF was generated; use the approved prebuilt fallback if implemented, otherwise show an actionable error.
- Avoid leaving Blob URLs, large in-memory PDFs, temporary objects, or event listeners behind after completion or cancellation.

The user's ordinary browser print function may remain available, but the old print-specific button and plain-view print route MUST NOT be the primary PDF generation workflow.

## 10. Content and layout edge cases

The implementation MUST explicitly test and handle:

- Blank or absent Material `abstract` and other optional metadata.
- Nested Sections and relative Markdown headings, including depth close to PDF heading-limit boundaries.
- Multiple occurrences of one ContentUnit and a link to such a unit.
- Material containing no images, and one containing multiple meaningful/decorative images.
- A complex-enough supported table to test header semantics, text wrapping, and multipage continuation.
- Long URLs, very long words, code fences with long lines, and fenced-code syntax characters.
- Bulleted and numbered lists, including nested lists and multi-paragraph list items where supported.
- Callouts/notes/warnings without reliance on color alone.
- A link target outside the selected Material.
- UTF-8 punctuation and supported symbols; missing glyphs must be detected and resolved, not replaced by empty squares.
- A long multi-page Material, a short single-page Material, and content with repeated headings.
- Missing Markdown and unavailable assets: fail gracefully, do not export a silently incomplete PDF.
- Failed PDF generation or accessibility validation: prevent false success notification.

## 11. Asset, link, and content security

- Keep the current safe loading boundary: the PDF generator can only read graph-authorized local Markdown and asset paths and allowed links; query parameters cannot authorize arbitrary fetches.
- Treat content, Markdown, SVG, links, catalog metadata, and JSON-LD properties as untrusted. Reuse established Markdown and asset sanitization and validation.
- Do not fetch remote scripts, fonts, images, or HTML as a side effect of PDF generation.
- SVGs MUST be handled using the project's validated sanitization and raster/vector conversion strategy, without active content; preservation of an image's meaning and alternate text is required.
- No analytics, external API uploads, or transfer of document content to third-party PDF conversion services.
- Respect the source package's public/private publication rules: downloading a generated PDF is not an access-control mechanism.
- No raw HTML-to-canvas or unchecked insertion of HTML into the export representation.

## 12. Performance and reliability

- Client-side generation MUST not load a heavy PDF engine on catalog startup or when viewing a quiz/slide deck.
- Reuse the existing viewer's cached graph, Markdown, and assets; deduplicate requests and limit concurrency to avoid unnecessary work.
- Export MUST operate on the complete selected Material, regardless of the reader's current scroll position or whether it has progressively rendered all sections.
- Show meaningful progress for long exports and avoid freezing normal navigation where practical; user-initiated cancellation MAY be supported if the chosen engine allows it safely.
- Define and measure realistic test bounds for pages, Markdown bytes, images, and client memory before release; report observed behavior rather than inventing an arbitrary universal limit.
- Verify both mainstream County desktop browsers supported by the current MarinOS standards. Any strategy failing one required browser needs an explicit product decision, not an undisclosed incompatibility.
- For build-time fallback, avoid unnecessary regeneration when the canonical inputs are unchanged, but ensure a published content change invalidates the associated PDF and download URL/cache.

## 13. Testing, evidence, and release qualification

### 13.1 Required fixtures

Use every existing, approved learning package available in the repository, especially:

- `marinos-foundations.zip`;
- `county-leaders-guide-to-data.zip`, if supplied;
- `county-leaders-guide-to-schemas.zip`, if supplied.

Add a small **purpose-built accessibility stress fixture** including heading nesting, list structures, meaningful/decorative images, a semantic table, at least one internal and external link, code, Unicode punctuation, and enough text for page breaks. Fixtures are test data; they MUST NOT introduce new canonical source fields.

### 13.2 Automated checks

Minimum test coverage:

1. The selection is tied to the actual selected Material; other materials and quizzes are excluded.
2. Ordering and text preservation across nested Sections and ContentUnits.
3. Markdown normalization/reference resolution and safe asset/link handling.
4. PDF opens in independent readers and has valid metadata/language, embedded fonts, selectable text, and a reasonable page count.
5. Explicit PDF/UA-1 validation with veraPDF; record evidence and fail tests on errors.
6. Detect missing Markdown/assets, malformed source, unsupported features, generator failures, duplicate clicks, and no accidental partial file download.
7. Regression checks for viewer navigation, reading, slides, quizzes, catalog, and existing editor as applicable.
8. No new persistent user data, telemetry, external network dependencies, or canonical content rewriting.
9. Direct-download button triggers no print dialog and uses the correct filename.
10. A baseline visual comparison across typical short, long, and image/table-heavy documents.

### 13.3 Manual document review

Review **each required fixture** in at least one independent PDF viewer and inspect:

- Complete and accurate reading order and heading structure;
- Logical tag tree (not only surface appearance);
- Links reachable and announced appropriately;
- Tables and lists announced as structures, not free-floating text;
- Images: accurate alt text, correct treatment of decorative assets;
- Embedded fonts and symbol rendering;
- Contrast, layout, margins, page numbers, wrapping, page breaks, and print quality;
- Keyboard navigation, screen reader behavior, and document language;
- Grayscale/monochrome legibility where meaningful.

Inspect the entire short fixture and representative pages/structural transitions in longer fixtures. A report of zero automated errors alone is not an acceptable sign-off.

### 13.4 Required output artifacts per checkpoint

For relevant implementation phases, provide the exact PDF used in testing, accessibility validation report, screenshots or page renders for visual review, list of changed files, test commands and results, and any deviations from current MarinOS standards. Failed checks must remain visibly reported.

## 14. Phased OpenCode implementation and mandatory stop points

**Global rule:** Perform only the explicitly authorized phase; at the end of every phase STOP and await the user's approval. Do not use phase completion as implied authorization for the next phase. Do not modify sibling repositories. Do not commit or push without permission. Avoid broad style refactors unrelated to PDF work.

### P0 - Repo and requirements assessment (no feature code)

- Inspect viewer architecture, existing print path/button, selected Material route, graph/Markdown loaders, current dependencies, and present tests.
- Read the required MarinOS repositories and accessibility/PDF skills. Extract current fonts, logo/brand assets if approved, palette tokens, footer/header conventions, licensing rules, and quality checkpoints.
- Identify PDF generator candidates and validation tooling, including their current capabilities, limits, license, and local vendoring requirements.
- Report where PDF features should live and how to share semantic content code with the existing renderer.

**Deliverable:** P0 findings, code integration plan, explicit open risks, recommended P1 experiment. **STOP.**

### P1 - Accessibility feasibility prototype (no full rollout)

- Create a minimal, isolated browser-only prototype from validated canonical inputs with heading, list, semantic table, image, alt text, link, local fonts, and multiple pages.
- Generate an actual PDF and run explicit PDF/UA-1 automated validation plus manual structure/reading-order inspection.
- Compare alternatives if the first candidate cannot represent necessary tagged structures. Benchmark download size/runtime cost.
- If browser-only cannot meet the hard gate, document the failure and propose a build-time proof of concept; do not implement the fallback yet.

**Deliverable:** prototype PDF, source diff, validator report, accessibility/manual review notes, candidate decision. **STOP for strategy approval.**

### P2 - MarinOS print design (approved generator only)

- Implement a reusable, clean print-document style using actual current MarinOS brand assets and font rules.
- Demonstrate first/subsequent pages, heading hierarchy, callouts, lists, footer/page numbering, and short/long material wrapping.
- Do not add a cover page or visible TOC.

**Deliverable:** styled sample PDFs, visual page renders, document structure check, changed files. **STOP.**

### P3 - Full content mapping and semantics

- Implement canonical sequence traversal, Markdown parsing, internal/external links, image/contextual alt, tables, code, quotations, notes/warnings, font coverage, and document metadata.
- Test supported source fixtures, repeated refs, missing assets, and pagination stressors.

**Deliverable:** full fixture PDFs and semantic/visual test report. **STOP.**

### P4 - Viewer control integration

- Replace existing Print material / PDF UI with **Download PDF** and wire it only to the approved PDF generator or approved static-PDF lookup.
- Implement loading, status, duplicate-click guards, error/retry flow, correct resource selection, filename, cleanup, and browser compatibility.
- Confirm ordinary reader/slides/quiz functions are unchanged.

**Deliverable:** working UI demonstration, accessibility-tree/control review, regression results. **STOP.**

### P5 - Release verification and cleanup

- Complete automated and manual PDF/UA, WCAG-relevant, and County accessibility review; verify named test browsers and all fixtures.
- Verify no unauthorized schema/package edits, no CDN or remote PDF service, and correct local asset licensing.
- Update documentation and dependency/license inventory as needed; identify any known residual limitations.

**Deliverable:** release-candidate PDFs, validation evidence, before/after UX review, test matrix and go/no-go recommendation. **STOP for final release approval.**

### Alternative path if P1 fails: B1-B3 (requires prior user authorization)

- **B1:** Prototype build-time tagged PDF generation, PDF/UA validation, and source fidelity from canonical Markdown/graph. STOP.
- **B2:** Integrate per-Material generation and safe download URL mapping into the existing publishing process, preserving published-only gates and cleaning old output. STOP.
- **B3:** Integrate direct download UX, cache invalidation, and all required verification. STOP.

Do not execute these alternative phases unless the user explicitly selects the build-time approach.

## 15. Acceptance criteria

The work is complete only when:

1. A learner viewing a Material sees **Download PDF**, not the old Print material / PDF action.
2. Activating Download PDF saves the complete selected Material directly, without a browser print dialog or a print-view page.
3. The generated file includes all referenced canonical content in correct order, including supported tables/images/code/notes, with no quiz or slides appended.
4. The PDF is a clear MarinOS-branded US Letter document with no cover page, no visible TOC, readable pagination, and correct metadata when present.
5. The PDF has semantic tagging, proper reading order, document language, headings, lists, tables, image alt/artifact treatment, and correctly accessible working links.
6. All designated acceptance fixtures pass the explicit PDF/UA-1 machine profile and manual accessibility review; accessibility shortcomings block release.
7. The generation process does not modify canonical `learning.json`, Markdown, packaged assets, or any schema/package specification.
8. Download failures are reported accurately and do not generate incomplete files or false success.
9. The static-hosted application continues to work with local/vendored dependencies and without a new runtime backend.
10. MarinOS shell/UI integration, supported-browser testing, existing viewer features, and required accessibility tests pass.
11. All implementation review gates were honored and source/library choices were expressly approved at P1.

## 16. Reference resources for technical verification

These references inform implementation and verification; they do not override current County / MarinOS standards:

- PDF Association, **PDF/UA-1 / ISO 14289-1**: https://pdfa.org/resource/iso-14289-pdfua/
- PDF Association, **PDF standards and PDF/UA-2 context**: https://pdfa.org/pdf-standards/
- veraPDF, **PDF/UA validation profiles and CLI**: https://docs.verapdf.org/cli/validation/
- PAC, **automated and manual PDF checks**: https://pac.pdf-accessibility.org/en/check
- PDFKit, **accessible PDF structural tagging reference**: https://pdfkit.org/docs/accessibility.html
- Puppeteer, **tagged PDF option for a possible build-time route**: https://github.com/puppeteer/puppeteer/blob/main/docs/api/puppeteer.pdfoptions.md

No library is mandated by this specification. Selection depends on the P1 proof of conformance using real output.

---

**Design invariant:** Marin Learn's source stays one approved JSON-LD graph plus individual Markdown and assets. The generated PDF is a branded, accessible derivative of one selected Learning Material, never an alternate canonical content source.
