# Marin Learn Editor Integration and UX Redesign - SPEC.md

**Status:** Proposed implementation contract; requires staged approval  
**Scope:** Integrate the existing functional authoring capabilities into the accepted learner-facing Marin Learn application, then redesign authoring for occasional, non-technical staff.  
**Suggested repository path:** `docs/editor/SPEC.md`  
**Applies after:** Standalone viewer Phase 8 has been accepted; editor work is viewer Phase 9, expanded into two independent stages.

## 1. Goal

The editor lets a County staff member create or open a **Learning Project**, write **Reading Materials**, define **Learning Objectives**, prepare **Quizzes** and **Slide Decks**, add **Images and Files**, preview the learner experience, and **Download Learning Package** - without understanding JSON-LD, ContentUnit objects, references, file paths, or Markdown.

The user-facing experience MUST be document-first: the author sees and edits a coherent reading document, not a database of objects. Reuse is supported and discoverable but secondary. The application MUST maintain the approved canonical object model, with one `learning.json` graph, individual Markdown files per ContentUnit, and separate asset files. The UI is an adapter to that model, not a replacement format.

This project has **two separate stages**:

- **Stage A - Functional integration:** preserve existing authoring behavior in the current MarinOS application, establish a tested functional baseline, and keep viewer behavior intact. Temporary UX is acceptable, but it MUST be accessible and use current MarinOS shell components. Do not copy legacy styling/layout wholesale.
- **Stage B - Business-user UX redesign:** implement document-first editing, simpler navigation and forms, robust paste from office/document sources, helpful language, progressive disclosure, and usability verification.

The developer MUST stop at every authorized subphase and receive approval before proceeding. Never combine A and B into a single implementation pass.

## 2. Source precedence and boundaries

Authority, in priority order:

1. Current MarinOS repository integration conventions and installed App Shell (`marin-app-template`, `marin-app-shell`, `marin-ui`, Marin Digital Standards), for shell-managed UI and security/accessibility behavior.
2. `schema/marin-learn-v1.schema.json` for structured data and identifiers.
3. `docs/MARKDOWN.md` and `docs/PACKAGE.md` for narrative/package semantics.
4. `docs/viewer/SPEC.md` for existing learner-facing experience and public publishing behavior.
5. This document, `UX-CONTENT.md`, `IMPLEMENTATION.md`, and `TESTING.md` for the authoring interface.
6. Existing v0.1.0 source, tests, and reference fixture as **migration evidence**, not design authority.

If existing implementation differs from a normative source contract, report the difference before altering code or specifications. Do not silently modify the approved schema, Markdown profile, package contract, or accepted viewer behavior. Do not rewrite a working viewer component merely to reuse the old editor version.

The latest sibling repositories are read-only references. Only the Marin Learn project may be edited.

## 3. Deployment and application separation

- The public root (`/`) remains the learner-facing catalog. Its views and URLs MUST continue to work.
- The authoring interface is available at `/editor/`. Its route and JS/CSS entry points MUST be isolated from the learner bundle.
- Shared parsing, rendering, validation, assessment, asset, and reference functions belong in common modules. Editor-specific dependencies MUST NOT load on the learner's initial visit.
- The application remains static HTML/CSS/JavaScript; there is no production Node runtime, backend, database, login, CDN, or remote content service.
- Node/build tooling MAY be used during development for a vendored rich-text editor or test runner; production output remains static and local-first.
- Showing or hiding a link to `/editor/` is NOT an access-control mechanism. Editor actions affect local browser data and exported files, not server content. Only the separate publication workflow changes the public catalog.
- Marin App Shell owns its standard header, navigation, identity, status, managed fonts/icons, footer, and required About, Security, Accessibility, and Updates destinations. Do not duplicate or override those components gratuitously.

## 4. Functional capabilities to preserve

Before Stage B, preserve and regression-test the following, using the approved current schema:

- Create an empty Learning Project with metadata; open a portable learning package by picker or drag-and-drop; recover a local browser working copy.
- Create, edit, duplicate, reuse, reorder, and safely remove content units; maintain stable IDs, content file associations, objective links, and reference integrity.
- Create hierarchical Learning Objectives; associate content and quiz questions with objectives as optional relationships.
- Create and assemble Reading Materials with nested Sections and referenced ContentUnits; reorder via keyboard-accessible controls.
- Create Quizzes, reusable questions, answers, weights, optional hints and explanations, scoring/grade scales, selection policies, feedback timing, and source links for all v1 interaction types.
- Create Slide Decks, slide layouts, ordered slide references, `full`/`abstract`/`title` display modes, and Markdown speaker notes.
- Add and manage approved image assets, contextual alternative text/decorative declarations, captions, and safe asset/reference links.
- Preview reading materials, quizzes, and slide decks with the same semantic renderers used by the public viewer.
- Validate errors/warnings with paths back to editable fields; inspect generated source read-only; export conforming ZIP packages.
- Save a recoverable working copy in IndexedDB; clearly distinguish that from an exported portable ZIP.
- Safely import untrusted archives and paste untrusted text without executing source content.

**Out of scope:** schema redesign; editing the public catalog directly; server-side publishing; collaborative editing; authentication; LMS tracking; AI generation; direct DOCX/PDF upload-conversion; full Word layout fidelity; replacing source Markdown files with compiled content JSON.

## 5. Authoring information architecture

The editor's user-facing labels are controlled by `UX-CONTENT.md`. They are independent of schema type names.

Recommended primary authoring navigation after a project is open:

```text
Learning Project: MarinOS Foundations
  Overview
  Reading Materials            <- primary content workspace
  Quizzes
  Slide Decks
  Images and Files
  Review and Download

Supporting destinations:
  Learning Objectives          <- visible in Overview and contextual settings
  Content Library             <- contextual reuse/browse, not the first page
  Advanced                   <- optional panel for metadata, source, references
```

Avoid top-level raw schema categories, overlapping sidebars, an IDE-style workspace, and full-screen forms for short edits. The editor MUST support a reliable return to project overview and back navigation without abandoning unsaved edits.

## 6. Document-first editing model (Stage B)

A Reading Material MUST be presented as one continuous editable document with a meaningful outline. The underlying structure remains an ordered Material/Section/ContentUnit assembly.

- The Reading Material title comes from the Material object. Section headings come from Sections; reusable narrative comes from ContentUnits and stays in separate Markdown files.
- The author works in place on a selected narrative block, with clear **Add content**, **Add section**, **Move**, and **Reuse existing content** actions.
- Do not create one ContentUnit per paragraph. A ContentUnit represents a coherent reusable section/topic, which may contain multiple paragraphs, lists, links, tables, and relative headings.
- The editor MUST NOT automatically divide pasted content into separate ContentUnits based solely on headings without an explicit user preview/choice. No opaque restructuring.
- The UI MUST preserve structural reading order, keyboard-reorder affordances, stable references, and atomic updates to assembly sequence + Markdown content.
- A content object shared by multiple materials MUST be visibly identified as shared when edited. Show where it is used. Offer **Edit everywhere** or **Make a separate copy** before changing a shared instance when the author might not expect cross-document effects.
- Removal from a document MUST NOT implicitly delete the underlying reusable ContentUnit. Deletion from the Content Library requires dependency visibility and confirmation.
- If the user renames a section/unit, referenced UUIDs and links MUST remain stable; path changes MUST be updated transactionally without orphaning files.
- Undo/redo MUST work for text edits; structural actions require undo or clear confirmation and a recoverable route.
- Do not flatten documents into a giant Markdown file or store a second competing copy of narrative content in the graph.

## 7. Rich-text editing and paste

The target is a constrained semantic WYSIWYG editor; the old `contenteditable` + `document.execCommand` implementation is a functional reference, **not** a final UX dependency. Before selecting/replacing it, document license, local vendoring, accessibility, browser support, editor-to-Markdown round trips, paste behavior, and bundle impact. Tiptap/ProseMirror is a candidate, not a mandated choice.

Required authoring features: paragraphs, relative headings, bold, italic, links, ordered/unordered lists, quotations, fenced code, simple accessible tables, images, and inline code where supported by `MARKDOWN.md`. Do not expose font families, colors, sizes, arbitrary HTML/CSS, or unconstrained alignment.

**Paste is a priority workflow.** Test separately from Microsoft Word, Google Docs, Outlook/Teams, and web pages, with HTML and plain-text clipboard variants. Preserve supported semantics; remove fonts/colors/office markup; map real lists/headings/tables where possible; validate/sanitize links and images; provide a clear warning and recoverable original clipboard text if significant unsupported constructs would be lost. Paste must be undoable. Never execute pasted HTML. Pasting an image or dragging a local image must route through the approved asset/alt-text workflow, not embed external data URIs silently.

Direct `*.docx`/PDF file conversion is NOT part of this agreement. It requires a separately approved phase and dependency/security evaluation. Do not imply the editor can open a Word file solely because it supports copy/paste from Word.

## 8. Forms, labels, and progressive disclosure

- Default fields MUST use task-focused labels, examples, and short actionable descriptions from `UX-CONTENT.md`.
- Required fields are prominent. Rarely used metadata and schema jargon belong under **Advanced** with human-readable explanations.
- Explain `abstract` as **Short summary (optional)**; note that it is commonly used for slide summaries and catalog/search descriptions. Never make it required.
- Learning Objectives are optional. Treat goal-writing as helpful guidance, not a prerequisite for saving content.
- Distinguish **Save locally** (automatic recovery) from **Download Learning Package** (portable export) and from **Publish** (not an editor action).
- Avoid UUID, `@id`, ContentUnit, graph, schema, encoding, or Markdown terminology in standard views. Source/code diagnostics may expose those under Advanced.
- Forms MUST associate labels, instructions, validation messages, and conditional controls semantically; error messages link or focus the affected field.
- Use small logical editing surfaces instead of pages with dozens of fields. Keep advanced validation/quiz options accessible, not removed.

## 9. Other authoring workflows

### 9.1 First run and project overview

Offer **Create learning project**, **Open learning package**, and **Continue working** (when a local recovery copy exists). Use the shortest possible create form (project title and optional description). Overview presents what exists and useful next actions, not raw object counts as the primary message.

### 9.2 Quizzes

Use a question-first form: **Question**, **Question type**, **Answer choices**, **Correct answer(s)**, optional **Feedback** and **Hint**. Hide weighting, shuffling, and feedback policies under **Quiz settings**. Avoid ambiguous required fields. Provide warnings when no correct answer is marked; preserve all v1 evaluation semantics and option-specific feedback.

### 9.3 Slide decks

Authors add one or more ordered content blocks from Reading Materials, select a layout and a `full`/`abstract`/`title` mode for each block, and optionally add speaker notes. Explain that an optional Short summary improves slides. A title or section slide may omit content. Up, Down, and Remove controls must provide keyboard alternatives for content-block ordering. Saving or editing one block must preserve every other ordered reference on the slide. Never duplicate canonical prose into slide-specific fields unless explicitly authored as presenter-only notes/title.

The editor preview and public viewer must resolve slides through the shared presentation model in `js/core/presentation.js`. Output renderers may use different surrounding UI and visual treatments, but they must not independently reinterpret slide order, content order, display-mode defaults, Markdown sources, or speaker notes.

### 9.4 Images and files

Add file, optional caption/credit, and accessible image description at the use location. Require meaningful alt text or an explicit decorative designation. Show where an asset is used before removal. Reject unsafe media. Do not show raw asset UUIDs or file paths by default.

### 9.5 Review and Download

Present errors and warnings as actionable, understandable tasks with **Fix** links. The canonical learning-package download continues to use full-package validation and one clear **Download Learning Package** control. After download, distinguish export success from any public publishing operation; do not display a misleading **Published** confirmation.

Provide a separate **Download PowerPoint** section for presentation derivatives. List canonical slide decks by accessible name and slide count. Preserve an explicit valid selection; otherwise prefer the active Slide Decks deck, then graph order. Run presentation-scoped preflight without loading PptxGenJS. Blocking presentation diagnostics disable download; warnings remain nonblocking. A **Fix** action returns to a known affected slide or deck.

Load the reviewed same-origin PowerPoint runtime only after author activation. During generation, set an accessible busy state, disable concurrent export, retain a stable busy label, announce progress politely, and restore focus deterministically. Download only bytes that pass the mandatory OOXML remediation and structural validation gate. Never add generated PPTX files to the canonical ZIP or IndexedDB workspace, and never require unrelated unfinished package content to pass PowerPoint preflight.

## 10. Persistence, integrity, and error recovery

- Maintain a current in-memory canonical working package; autosave a recoverable local snapshot (including asset bytes) in IndexedDB. Do not use the public catalog as editor storage.
- Imports must be transactional; a failed or malformed package must not overwrite the active project or recovery copy.
- Never silently discard user changes during route changes, imports, deletes, or storage failures. Indicate whether latest changes were saved locally.
- Export must preserve stable IDs and supported semantics across import -> edit -> export -> import; ensure no orphan Markdown/assets and no invalid assembly references.
- Implement meaningful progress, busy, validation, and failure states; maintain editability when one noncritical operation fails.
- Support an explicit **Create a copy** path when an imported package should not replace the current project.

## 11. MarinOS, accessibility, and security gates

All new authoring screens must use current Marin App Shell / marin-ui patterns; no copied legacy header, footer, font stacks, or decorative overrides. The shell integration must be verified visually before substantial UX redesign. Use managed local fonts and Lucide icons per the installed platform.

WCAG 2.2 AA is required. In every phase test at least: keyboard-only operation, focus visibility/order, accessible names/roles/states in browser-neutral accessibility-tree inspection, dialogs, errors, 200% and 400% zoom/reflow, drag alternatives, forced colors, and reduced motion where applicable. Stage B adds screen-reader testing of the rich-text editing surface and paste workflows.

Untrusted package content, Markdown, SVG, links, and pasted rich text MUST be sanitized and validated using approved restrictions. No external CDN or telemetry. Clipboard HTML may be used only as source input to a sanitized, constrained model. Enforce local-only data promises accurately.

## 12. Acceptance criteria

An occasional author, without schema training, can:

1. Start a project or open an existing package and understand the difference between local recovery and portable download.
2. Create and format a document in a continuous reading-oriented editor.
3. Paste real Word/Docs/website content and retain supported semantics without introducing invalid markup.
4. Add and reorder sections/content with keyboard and pointer controls.
5. Reuse an existing content block intentionally, understand the consequences of editing shared content, and create a separate copy when needed.
6. Optionally define learning goals without blocking ordinary drafting.
7. Create three supported quiz question types and verify feedback and scoring behavior.
8. Build a slide deck from canonical content using approved layouts and display modes.
9. Add accessible images, correct actionable validation issues, and see accurate learner previews.
10. Download a conforming ZIP and reopen it with the same supported content, references, and assets.
11. Complete the workflows within the installed MarinOS presentation and WCAG 2.2 AA requirements.
12. Do all of this without modifying the public catalog or disrupting the accepted viewer.

The implementer MUST use `IMPLEMENTATION.md` for staging and `TESTING.md` for verifiable gates. The interface copy in `UX-CONTENT.md` is the default wording unless user testing justifies a reviewed change.
