# Marin Learn Viewer — SPEC.md

**Status:** Approved product decisions; phased implementation and review required  
**Target:** Marin Learn learner-facing viewer, v1; **new viewer-first build**  
**Suggested repository location:** `docs/viewer/SPEC.md`  
**Relationship to editor:** Preserve editor compatibility, but **do not incorporate the previously built editor until a separately authorized later integration phase**.

## 0. Mandatory implementation protocol (read first)

This specification describes the completed viewer, **not permission to implement it in one pass**. Development will take place in OpenCode Desktop as a new, reviewable MarinOS application. The developer/agent MUST implement **only the phase explicitly requested**, stop at its review gate, and await the user's approval before beginning another phase. A phase is not approved merely because automated tests pass.

### 0.1 Greenfield, template-first starting point

- Start with the **current MarinOS application template supplied in the working project**, using its prescribed App Shell installation/synchronization mechanism. The latest checked-out `marin-app-template`, `marin-app-shell`, `marin-ui`, and applicable Marin digital standards are implementation sources of truth. Record the actual versions/commits and `marin.yml` values before changing files.
- **Do not use `marin-learn-v0.1.0` or its editor as the project scaffold.** Do not relocate, copy, refactor, import, or silently reuse that editor during viewer phases. Treat it as a future integration source supplied by the user later.
- If the template, shell, UI dependencies, accessibility standards, approved schema, or reference fixture are not present in the workspace, identify the missing item and request it. Do not recreate MarinOS components from memory or fabricate versions, fonts, assets, or test results.
- Keep the deployed application static and independent of runtime Node.js, external CDNs, and backend services. Development/build tools MAY use Node.js where supported by the current template.
- Preserve the template's shell-owned header, identity, status indicator, navigation/footer mechanisms, font assets, Lucide icons, and standard informational destinations. Use existing MarinOS components and CSS tokens before writing new app-specific styles. Never replace managed shell files with a look-alike implementation.
- App-specific CSS MUST be scoped and minimal. Do not edit vendored libraries or duplicate `marin-ui` branding rules. Do not change shared shell/template sources to fix a viewer-local issue without a separately reviewed upstream change.

### 0.2 Review-and-approval contract

For **each** phase:

1. Before implementation, state the phase number, narrow scope, required inputs, files likely to change, and acceptance checks. Do not begin a later phase because it seems convenient.
2. Implement the smallest coherent slice that can be exercised independently. Temporary fixtures are permitted only when clearly labeled and removed/replaced at the appropriate phase; never create hidden alternate source formats.
3. Run relevant automated checks and inspect the result in a real browser. Check shell structure, rendering at desktop and narrow widths, keyboard navigation, semantic headings/landmarks, visible focus, and the browser-neutral accessibility tree for affected screens. Do not claim tests were run when they were not.
4. Return a review package: changed-file inventory, commands/results, screenshots or browser-review evidence, remaining limitations, and **precise steps for the user to reproduce the feature**. Cite actual versions and any deviations from the template.
5. **Stop.** Require explicit user acceptance before the next numbered phase. Fix findings within the current phase and repeat that phase's review gate.

Each phase MUST leave the repository buildable and the previously approved functionality working. Avoid wholesale rewrites after a phase has been approved. Make reviewable commits or changesets organized by phase; do not combine several phases into one large commit.

### 0.3 MarinOS visual acceptance gate

**MarinOS conformance is a gate, not a final polish task.** No functional viewer features should be developed atop a nonconforming shell. At the first shell-only review, and after every later phase that changes layout/navigation, verify:

- Actual current App Shell integration (including `marin.yml` shell version/status), not merely similar HTML/CSS.
- App identity/title behavior, top navigation, shell-provided status, and approved footer links (**About**, **Security**, **Accessibility**, **Updates**).
- Local Open Sans/Jost roles and licensed font assets; managed Lucide icons and shell-defined icon styling.
- Responsive content width, spacing, typography, focus/hover states, light/dark presentation, and high-zoom/reflow behavior.
- Semantic browser accessibility-tree structure, accessible names, keyboard reachability, and no shell overrides that regress other MarinOS behavior.

Any deviation from the supplied template MUST be documented with a reason and user approval. Do not invent new design patterns when an approved MarinOS pattern already fits.

### 0.4 Deferred editor integration

Viewer v1 is independently usable **without any editor code**. During viewer development, keep the graph loader, Markdown parser, renderers, and assessment evaluator in documented modules that an editor can later reuse. Do not introduce editor dependencies, editor navigation, WYSIWYG, ZIP authoring, or IndexedDB recovery into the learner bundle.

**Editor integration is an entirely separate final project phase** initiated only after the user reviews and accepts the standalone viewer and supplies the authoritative current editor. At that point, compare shared contracts, identify necessary adaptations, and request approval for the integration plan before changing either application. The viewer's release MUST NOT be blocked on obtaining the old editor.

---

## 1. Purpose

Build a read-only, static MarinOS learning library that lets County staff and other intended learners discover a learning set and consume its published **reading materials, slide decks, and quizzes**.

The primary experience is consumption, not authoring. The application's default route MUST open a learning catalog. Selecting a catalog entry MUST open a learning-set landing page from which the learner can choose an available reading material, slide deck, or quiz.

The viewer MUST use the approved Marin Learn v1 schema and **retain one Markdown file per ContentUnit**. It MUST NOT require Markdown-to-JSON compilation, a backend, database, authentication, or a runtime Node.js service.

**Build order matters:** The standalone viewer MUST be implemented and accepted in incremental phases before the user elects to integrate the separate, previously built editor. This file is the implementation handoff to OpenCode Desktop, not a request for a single-shot implementation.

## 2. Authoritative contracts

The following existing specifications remain authoritative and MUST NOT be silently modified by viewer development:

1. `schema/marin-learn-v1.schema.json` — structured JSON-LD-style object graph and vocabulary.
2. `docs/MARKDOWN.md` — supported Markdown, headings, links, image references, and rendering obligations.
3. `docs/PACKAGE.md` — canonical `learning.json`, `content/`, `assets/`, identity, reference, and security rules.
4. Existing editor `SPEC.md` — authoring and export behavior; **reference for later interoperability only, not a source of application scaffolding or an early-phase implementation dependency**.

The viewer is a consumer of those contracts, not another content format. New derived publication artifacts such as `catalog.json` MUST be documented separately from canonical content and MUST NOT be placed inside a conforming source package.

The key words **MUST**, **MUST NOT**, **SHOULD**, and **MAY** express normative requirements.

## 3. Confirmed product decisions

| Area | v1 decision |
| --- | --- |
| Catalog unit | **One catalog entry per LearningSet** |
| Catalog maintenance | **Generated automatically** from approved, published sets |
| Reading mode | **One continuous document** with a table of contents |
| View navigation | **Learning-set landing page** with contextual navigation among resources; not permanent Read / Slides / Quiz tabs |
| Source structure | One `learning.json` graph plus individual `content/*.md` files and packaged `assets/` |
| Application | Static, browser-only, MarinOS-styled; no production Node.js requirement |
| Authoring | **Deferred integration:** viewer starts independently; user supplies current editor for a later separately approved phase |
| Learner data | No accounts, grades database, completion records, or telemetry in v1 |

## 4. Scope and non-goals

### 4.1 Required capabilities

- Responsive catalog with text search, filtering, and empty/loading/error states.
- Learning-set landing pages based on graph metadata and resource availability.
- Continuous reading view with semantic headings, a table of contents, anchored navigation, and printing.
- Slide viewer for the approved six layouts and three display modes, including optional speaker notes.
- Quiz viewer for all three approved interaction types, the approved selection and feedback policies, weighted scoring, optional passing threshold, and grade scales.
- Deep links, browser Back/Forward support, and links between related canonical content.
- Static publication of validated learning packages without compiling Markdown content.
- Robust content loading, reference resolution, error reporting, accessibility, and security.

These are **end-state v1 requirements**. Each is delivered only in its assigned approved phase (Section 22); the agent MUST NOT attempt to complete all of them in one iteration.

### 4.2 Explicitly out of scope for v1

- Learner sign-in, enrollment, assignment, certification, transcripts, or persistent grades.
- LMS, SCORM, QTI, CASE, Common Cartridge, or xAPI integration.
- Collaboration, editing, or author controls in learner views.
- A site-wide Markdown full-text search index.
- Offline-first/service-worker synchronization.
- Server-rendered documents, precompiled runtime JSON, or precompiled Markdown HTML.
- Arbitrary slide animations, editable slide positioning, or a full presenter-console application.
- Protected quiz answer keys or high-stakes proctored testing.
- **Integrating, migrating, or rewriting the existing editor as part of the standalone viewer build.**

## 5. Information architecture

The top-level public application MUST offer the following flow:

```text
Marin Learn catalog
  └── LearningSet landing page
       ├── Read materials
       │    └── Continuous document reader
       ├── View slides
       │    └── Slide deck viewer
       └── Take quiz
            └── Quiz → Results
```

A learning set may contain zero, one, or multiple resources of any one kind. Only available kinds appear as actions; an unavailable resource kind MUST NOT appear as a dead link.

The landing page is always the default destination after clicking a catalog entry, even when `marin:startResource` is present. An optional **Start learning** action MAY lead to that schema-defined start resource. This behavior does not redefine `marin:startResource`.

On desktop, use the normal MarinOS application shell and compact navigation. Avoid IDE-like sidebars outside the reader. On narrow screens, controls MUST reflow rather than overflow horizontally.

## 6. Publication structure

A conforming ZIP package remains the publishing input. A publish-time script or GitHub Action validates and expands approved packages into static files, preserving the authored Markdown bytes and graph semantics. The reference ZIP can be supplied independently of the editor; no editor integration is required to publish it.

Illustrative deployed layout:

```text
dist/
├── index.html
├── catalog.json                 # generated discovery index
├── css/
├── js/
├── vendor/
└── learning/
    ├── marinos-foundations/
    │   ├── learning.json        # authoritative graph for this set
    │   ├── content/
    │   │   ├── what-is-marinos.md
    │   │   └── app-shell.md
    │   └── assets/
    │       └── app-shell.svg
    └── another-learning-set/
        ├── learning.json
        ├── content/
        └── assets/
```

`content/` and `assets/` are present only when required by the package. The deployed directory MUST preserve the package's relative paths as referenced by `learning.json`.

The ZIP is a source/interchange artifact; the viewer fetches the published files over HTTP and does not need to download or unzip a package to render it.

The publication step MAY use Node.js in CI. Node.js MUST NOT be required on the static production host.

The `/editor/` route is **not part of the initial viewer deployment**. It may be added only in the later editor-integration phase; no empty or nonfunctional editor link may appear in learner navigation.

## 7. Catalog: source, generation, and lifecycle

### 7.1 Catalog purpose

`catalog.json` is a small **generated index**, not a canonical learning object and not a replacement for any Markdown file. Its purpose is to display and search learning-set metadata without downloading every `learning.json` or every Markdown file.

One entry MUST correspond to exactly one published LearningSet. A catalog entry MUST NOT represent an individual ContentUnit, Material, Presentation, or Assessment.

### 7.2 Minimal catalog contract

The publisher MUST emit `catalog.json` with:

- `format` equal to `marin-learn-catalog/v1`;
- `items` as an array;
- one entry per published LearningSet;
- each entry's root `@id` as `setId`, root `identifier`, `name`, and a safe relative `graphUrl`;
- derived resource counts (`materials`, `presentations`, `assessments`);
- supported optional discovery fields copied or normalized from the root graph, including `abstract`, `educationalLevel`, `timeRequired`, `inLanguage`, `keywords`, `audience`, and `dateModified`;
- a deterministic per-set `revision` computed from the published source files for cache invalidation.

Illustrative shape (the hash value is illustrative):

```json
{
  "format": "marin-learn-catalog/v1",
  "items": [
    {
      "setId": "urn:uuid:10000000-0000-4000-8000-000000000001",
      "identifier": "marinos-foundations",
      "name": "MarinOS Foundations",
      "abstract": "An introduction to MarinOS principles and components.",
      "educationalLevel": "introductory",
      "inLanguage": "en-US",
      "keywords": ["MarinOS", "application development"],
      "graphUrl": "learning/marinos-foundations/learning.json",
      "resourceCounts": {
        "materials": 1,
        "presentations": 1,
        "assessments": 1
      },
      "revision": "9ae42b8f6d34"
    }
  ]
}
```

`revision` SHOULD be a deterministic, documented digest prefix (for example, the first 12 lowercase hexadecimal characters of a SHA-256 of sorted path-and-content records). A publisher MUST produce the same revision for identical source files and MUST update it when any published graph, Markdown, or asset bytes change. The digest is a cache identifier, **not a security signature**.

Unknown catalog formats MUST produce a recoverable catalog error, not best-effort interpretation of an incompatible format.

### 7.3 Eligibility and publication safeguards

- Only LearningSets whose root `creativeWorkStatus` is explicitly `published` are eligible.
- A draft, review, or retired LearningSet MUST NOT be copied into the public output directory; omitting it from the catalog alone is insufficient.
- A graph containing any explicitly draft, review, or retired object MUST fail publication of that set until the conflict is resolved or the set is safely repackaged and fully revalidated. Omitted object-level status is permitted by the canonical schema and does not itself block publication.
- The publisher MUST validate JSON Schema, reference integrity, Markdown, asset paths/types, and applicable package rules before copying any set into the publication directory.
- A failed validation MUST fail that set's publication; the build MUST NOT silently publish partial content.
- Published slugs (`identifier`) MUST be unique across sets. Duplicate slugs are build errors.
- The published output MUST be assembled from a clean directory so that removed/retired sets cannot remain publicly accessible from a previous deployment.

This is a **publication policy**, not an amendment to the canonical source schema. It protects against inadvertently disclosing draft materials and unreleased quiz questions. Drafts stored in a **public source-code repository** may still be accessible through that repository; such material must be stored privately regardless of what the static publisher excludes.

### 7.4 Determinism and sorting

The catalog generator MUST use stable, deterministic ordering; default display order is case-insensitive alphabetical order by `name`, with `identifier` as a tie-breaker. Do not add generated timestamps that change on otherwise identical builds.

The site MUST NOT require authors to manually update `catalog.json`. A publishing command, intended to run locally or in GitHub Actions, is responsible for creating it.

## 8. Catalog user interface

### 8.1 Default state

On the root route, show:

1. App title **Marin Learn** and concise introductory text.
2. A prominent catalog search input.
3. A responsive list/grid of LearningSet cards.
4. Filters for educational level, available audience/topic metadata, and optionally resource availability.
5. Clear zero-results, empty-catalog, load-error, and retry states.

Each card SHOULD show the LearningSet name, `abstract` (when available), educational level (when available), estimated time (when available), and availability labels such as **Read**, **Slides**, and **Quiz** derived from resource counts. Do not invent metadata or show empty placeholders for missing fields.

### 8.2 Searching and filtering

V1 search MUST be client-side and operate on catalog metadata only: name, abstract, keywords, and available audience/topic labels. It MUST NOT fetch all Markdown files merely to implement catalog search.

- Search MUST be case-insensitive and MUST combine with filters.
- `educationalLevel` options MUST be constrained to `introductory`, `intermediate`, `advanced` when that field exists.
- Audience and topic filters MUST be derived from actual published metadata, not hardcoded example labels.
- Filters MUST have accessible names and clear/reset behavior.
- The application SHOULD preserve useful filter state when users return from a learning set to the catalog.

## 9. LearningSet landing page

The landing page MUST present:

- link back to the learning catalog;
- LearningSet name and abstract/description where provided;
- optional level, audience, estimated duration, publisher, and publication/version metadata where relevant;
- the LearningSet's learning objectives, preserving their logical hierarchy when present;
- resource actions and, where necessary, lists of individual Materials, Presentations, and Assessments.

A resource kind with exactly one available item SHOULD open that item directly. A resource kind with multiple items MUST first present understandable, human-readable choices. A set with no resources MUST display a useful empty state without broken actions.

The page MUST NOT expose low-level UUIDs, graph nodes, or authoring controls. Learning objectives MUST come from canonical `DefinedTerm` relationships rather than inferred prose.

## 10. URL routing and navigation

The viewer MUST support direct links and browser Back/Forward navigation on static hosting with no special rewrite configuration.

Recommended route contract:

```text
/                                             catalog
/?set=marinos-foundations                     LearningSet landing
/?set=marinos-foundations&view=read            sole/default reading material
/?set=marinos-foundations&view=read&resource=marinos-foundations
/?set=marinos-foundations&view=slides&resource=marinos-foundations-slides
/?set=marinos-foundations&view=quiz&resource=marinos-foundations-quiz
```

Rules:

- `set` and `resource` are public `identifier` slugs; graph references continue to use immutable `@id` UUID URNs.
- `view` is one of `read`, `slides`, or `quiz`.
- If `resource` is omitted, the viewer MAY select the sole available resource of that kind. If multiple exist, it MUST display a selection page rather than guessing.
- Unknown sets, views, and resources MUST show recoverable not-found states with a catalog/landing link.
- Query values MUST be resolved against the loaded catalog/graph, never interpolated into arbitrary fetch URLs.
- The learning-set landing page MUST remain reachable from every view.
- Do not force a full page reload for ordinary in-app navigation; update URL history and handle `popstate`.
- Section/table-of-contents anchors SHOULD use stable identifiers; deep links to a ContentUnit MUST preserve its location in an actual Material. If the same unit is used in multiple materials, the URL MUST identify the containing Material.
- A published slug rename requires an explicit alias/redirect policy if older links must continue working; the editor's stable `@id` does not automatically preserve public slug URLs.

## 11. Continuous reading viewer

### 11.1 Presentation

A LearningMaterial MUST render as **one continuous document** in the authored `marin:contentSequence` order, with nested Sections and ContentUnits composed into a single semantic article.

The page SHOULD use a readable central text column with an on-page table of contents on desktop. On smaller screens, the table of contents SHOULD become a clearly labeled collapsible or otherwise compact control.

The viewer MUST display a title, relevant introductory metadata, the assembled narrative, and contextual navigation back to the LearningSet. A simple print action SHOULD be available.

### 11.2 Headings and table of contents

- The Material name supplies the document H1.
- Section and ContentUnit names supply their structural headings.
- Markdown headings are relative, exactly as defined in `MARKDOWN.md`; they MUST be shifted to the proper final HTML level without losing their hierarchy.
- The table of contents MUST be generated from the actual rendered heading structure, not independently handwritten.
- Publication validation MUST flag assemblies whose nesting and authored relative Markdown headings cannot be represented without exceeding HTML heading level 6; the renderer MUST NOT silently flatten or skip the required structure.
- Table-of-contents links MUST target unique anchors and support keyboard navigation and appropriate focus/scroll positioning.
- The current section MAY be indicated visually, but this cannot be the sole navigational affordance.
- Browser Find and ordinary text selection MUST work across the assembled document.

### 11.3 Markdown, links, and images

- Load ContentUnit narrative from the external path in `encoding.contentUrl`; no narrative prose may be copied into a parallel JSON document.
- Parse with the approved restricted Markdown profile and shared renderer.
- Resolve `marin-ref:<uuid>` through the current graph to a valid viewer destination; for ContentUnit links, navigate to its containing Material and anchored location when available.
- Resolve `marin-asset:<uuid>` to the packaged ImageObject/MediaObject and its safe relative `contentUrl`.
- Honor contextual alt text/decorative status from the Markdown usage, not an invented global alt field.
- Preserve proper semantics for lists, tables, quotations, headings, code blocks, and links.
- Unsupported, missing, or unsafe content MUST NOT be silently rendered as trusted HTML.

### 11.4 Loading and print behavior

The viewer SHOULD fetch all Markdown files required by the selected Material with bounded concurrency (initial limit: six in-flight requests), then assemble them in canonical sequence order regardless of arrival order. Requests for a repeated ContentUnit MUST be deduplicated in memory.

The page MAY progressively display finished content, but it MUST communicate incomplete loading and MUST NOT treat an incomplete document as fully ready to print. If a required Markdown file fails, show a clear error and retry option; do not quietly omit the affected unit.

Print CSS MUST exclude app navigation and controls, preserve semantic headings, show readable URLs where appropriate, and avoid gratuitous page breaks. PDF generation is out of scope; browser printing may offer Save as PDF.

## 12. Slide deck viewer

### 12.1 Default presentation

Render one Slide at a time in a consistently scaled 16:9 canvas. Preserve the approved layouts:

`title`, `section`, `content`, `split`, `media`, `quote`.

Preserve the approved referenced-content display modes:

`full`, `abstract`, `title`.

The viewer and editor preview MUST resolve presentation, slide, ordered content, display-mode, Markdown, and speaker-note semantics through the shared model in `js/core/presentation.js`. Their surrounding interface and CSS may differ, but shared slide content is rendered through `js/renderers/slides-html.js` or must pass explicit semantic-equivalence tests. A slide MUST use referenced canonical ContentUnits; slide-specific `name` and speaker notes remain separate metadata. An omitted `marin:displayMode` uses the schema default, `full`.

### 12.2 Controls

- Visible **Previous** and **Next** buttons, current slide number, total slide count, and link back to the LearningSet.
- Keyboard Left/Right arrows for slide navigation when focus is not inside an interactive element requiring those keys; Home/End support is recommended.
- Optional fullscreen mode using the Fullscreen API when available, with a non-fullscreen fallback.
- Speaker notes toggle; notes use the full approved Markdown profile.
- Respect reduced-motion preferences. Automatic transitions and autoplay are not required.
- A slide-list/navigation control MAY be provided but must not be essential to reach all slides.

### 12.3 Overflow and responsive behavior

The viewer MUST NOT arbitrarily truncate instructional text or shrink it to an unreadable size to force a fit. `abstract` mode requires an actual ContentUnit `abstract`, or publication validation MUST reject that slide reference. `full` mode may have lengthy content; display overflow in a readable, accessible manner and surface a presentational warning to authors in the editor/publisher tooling. Do not substitute an AI-generated summary.

Speaker notes MUST be excluded from the projected slide canvas by default and remain available through a separate, accessible presentation control. Fullscreen presentation MUST be operable without a mouse.

## 13. Quiz viewer

### 13.1 User experience

The default quiz experience is **one question at a time** with a question counter and visible progress. The learner MUST be able to review and change answers before final submission when the selected feedback timing allows it.

Supported interaction types:

- `single-select` — radio group;
- `multiple-select` — checkbox group;
- `true-false` — two-choice radio group.

Options and prompts MUST use accessible field grouping and the approved Markdown renderer. No learner-facing interface should expose correct-response metadata before the relevant feedback point.

### 13.2 Assessment selection

The engine MUST honor `marin:selectionPolicy` with `all` or `random`, optional question-order shuffling, and `marin:shuffleOptions` where declared.

Selection and option order MUST be fixed for the duration of one attempt. Moving backward and forward MUST NOT select a different random sample or reorder existing choices.

Each new attempt MAY produce a new random selection. No server interaction or authentication is required.

### 13.3 Submission and feedback

Honor the three approved `marin:feedbackPolicy.timing` values:

- `after-item`: the learner explicitly checks/submits an item, receives only the permitted feedback, and that item's answer is locked for the remainder of the attempt;
- `after-assessment`: learners may revise answers, then submit the entire quiz; permitted detailed feedback appears afterward;
- `none`: show the result summary but suppress detailed correctness/explanation disclosures according to the policy's flags.

Also honor `showCorrectResponses`, `showOptionFeedback`, and `showExplanation`, and display an optional `marin:hint` through a clearly labeled, accessible reveal control. Do not leak an answer through a hidden-but-focusable panel.

The viewer MUST guard against accidental premature submission and double submission. It SHOULD indicate unanswered questions before final scoring while allowing a learner to confirm submission if the product permits unanswered questions; unanswered items earn zero points.

### 13.4 Scoring and results

Use the approved `weighted-sum` model and the current shared scoring implementation. An item earns its entire assigned weight only if its submitted response set exactly matches the correct response set. No partial credit in v1.

Display:

- weighted earned/possible points and percentage;
- optional pass/fail if `passingPercent` exists;
- optional configured grade band and message;
- permitted detailed review/feedback after the configured feedback point;
- links to associated canonical source content where the source is reachable in a published Material;
- actions to return to the learning set or start a new attempt.

Round only displayed results; calculate pass thresholds and bands from the unrounded percentage. Do not invent a grade or passing threshold when the schema omits one.

Attempt state may live in application memory. V1 MUST NOT upload answers, scores, or identifying learner information. Reloading may reset the attempt and must not claim to preserve progress.

### 13.5 Assessment security expectation

A client-side quiz is a knowledge check, **not a secure examination**. Correct responses necessarily exist in the downloadable `learning.json` graph and can be inspected. The viewer MUST NOT imply that answer keys are confidential or that quiz completion is official proof of training or certification.

## 14. Data loading and shared runtime core

### 14.1 Loading lifecycle

1. On the catalog route, fetch only `catalog.json`.
2. On entry to a LearningSet, resolve its `graphUrl` from the catalog and fetch that set's `learning.json`.
3. Validate the required schema version and graph structure, build in-memory `@id` and `identifier` indexes, and resolve available resources.
4. For reading, request the Markdown files actually used by the selected Material.
5. For slides, request ContentUnit Markdown only for slides whose `full` display mode requires it; prefetch nearby slides opportunistically. `abstract` and `title` use graph metadata only.
6. For quizzes, use graph-based questions and fetch Markdown only when following source links to a Material; do not download the entire course solely to begin a quiz.
7. Fetch media assets only when referenced by the active rendering context, using safe resolved URLs.

The viewer MUST NOT fetch all learning graphs or all Markdown across the catalog on startup.

### 14.2 Shared core contract

The **viewer** MUST centralize the following functionality in documented reusable modules (rather than duplicate it between reading, slides, and quizzes):

- graph lookup, type detection, sequencing, and object-reference resolution;
- Markdown parsing, safety validation, and heading normalization;
- ContentUnit, Material, Slide, and question rendering;
- assessment selection, response evaluation, scoring, and grade-band resolution;
- asset-reference resolution.

A network-backed loader MAY populate an in-memory package shape (`graph` plus `contentFiles` and `assetFiles`/asset URLs) without changing the canonical schema. Any adapter must preserve `@id` identity and schema meaning.

The reusable module boundaries are an integration contract for the **future** editor, not a directive to bring editor files into the initial viewer repository. After separately approved editor integration, shared code or explicit semantic-equivalence tests MUST ensure both experiences interpret the same learning set consistently.

The viewer MUST NOT download editor-only rich-text, ZIP-authoring, or IndexedDB code merely to consume content.

### 14.3 Caching

- Cache fetched `learning.json` and Markdown in memory during navigation, keyed by LearningSet, revision, and canonical path.
- Deduplicate concurrent requests for the same path.
- Honor ordinary HTTP browser caching, but use the generated catalog revision to avoid stale graph/Markdown after a publish.
- On load, revalidate `catalog.json` (for example, `fetch` with `cache: 'no-cache'`) so updates become discoverable.
- A simple revision query parameter on static file requests MAY be used; it does not change source filenames or the package format.
- V1 MUST NOT require service workers or offline persistence.

## 15. MarinOS integration and visual standards

This is a **template-conformance requirement**, not merely a stylistic aspiration. The user is intentionally commissioning a new viewer-first build because the earlier editor did not sufficiently follow MarinOS patterns.

- Use the **current template and shell files actually supplied to OpenCode**. Do not rely on the previous Marin Learn implementation as evidence of MarinOS compliance.
- Inspect `marin.yml`, the App Shell installer/synchronization instructions, current `marin-ui` rules, and applicable Marin digital standards before writing page markup or CSS. Record the versions and actual source locations in the phase-0 review.
- Preserve shell-managed structure, approved local fonts, Lucide icon sourcing/styling, heading/body roles, application identity/title links, status indicators, header navigation, and footer composition.
- Required informational destinations remain **About**, **Security**, **Accessibility**, and **Updates**, implemented through the current App Shell mechanism, not one-off imitations. No editor link is required in the standalone viewer.
- Use existing MarinOS spacing, page widths, breakpoints, cards, form styles, and focus patterns. New styling MUST be minimal and scoped to viewer-specific elements such as the slide canvas and document table of contents.
- Follow the current app template's test and deployment conventions. Do not introduce a replacement CSS framework or a CDN.
- Compare browser-rendered output against the template's baseline at each visual review gate; include light/dark, desktop/narrow, keyboard focus, and accessibility-tree checks.

The agent MUST stop at the shell-only gate until the user confirms MarinOS fidelity. Correct shell divergences **before** adding catalog behavior; do not postpone them to a final styling phase.

## 16. Accessibility and inclusive UX

WCAG 2.2 AA is a release requirement. Include accessibility-tree inspection using browser-neutral browser developer tools in the test plan.

At minimum:

- Landmarks, headings, and accessible names must be correct in catalog, landing, reader, slides, quiz, and results views.
- Every control and every route/view transition must be keyboard-operable; focus must move to the new view's main heading or equivalent appropriate target when navigation changes context.
- Catalog filters and quiz answer choices must be correctly labeled and grouped.
- Table of contents and internal links must position both viewport and focus sensibly without hiding headings behind a fixed header.
- Slide changes must be announced in a useful, non-noisy way; avoid trapping keyboard focus in the slide viewer.
- Quiz correctness must not depend on color alone. Error and result messages require text and appropriate status semantics.
- 200%/400% zoom, reflow, touch targets, text spacing, forced colors, reduced motion, and mobile layouts must be tested.
- Tables, images, and code blocks must remain accessible at small widths; do not introduce fixed horizontal overflow for the entire page.
- Provide a non-drag, non-gesture path for all interaction.
- Print styles must preserve meaning and reading order.

The viewer MUST use actual semantic HTML appropriate to the content; semantic validity takes precedence over decorative fidelity.

## 17. Security and privacy

Treat catalog entries, JSON-LD graphs, Markdown, SVG, and all source URLs as untrusted data.

- Reject unknown/unsupported schema versions and unsafe or escaping local file paths. The known Schema.org/Marin JSON-LD context vocabulary is interpreted locally; the viewer MUST NOT dereference remote `@context` URLs as a condition of loading.
- Resolve static paths within the selected LearningSet base directory; query parameters cannot authorize arbitrary cross-origin fetches.
- Never execute scripts, raw Markdown HTML, event-handler attributes, or imported active content.
- Keep the approved Markdown URL-scheme restrictions; sanitize URLs and generated attributes before DOM insertion.
- Safely resolve `marin-ref:` and `marin-asset:` references to graph objects and approved local assets; do not use unchecked `innerHTML` with untrusted content.
- Enforce the established SVG sanitization/asset restrictions at publication and use the same safe rendering assumptions at runtime.
- Do not send content, learner responses, or identifiers to third-party services by default; no CDN requirement, analytics, or telemetry in v1.
- Apply a restrictive Content Security Policy where the host allows it; continue to work on ordinary static hosting.
- Public files cannot be made private merely by hiding navigation or catalog entries.

## 18. Error handling

The viewer MUST provide distinct recovery paths for:

- catalog unavailable or invalid;
- empty published catalog;
- unknown LearningSet or resource;
- unsupported or invalid graph version;
- missing ContentUnit Markdown;
- broken internal object/asset references;
- missing or blocked image asset;
- quiz configuration or rendering errors.

Errors SHOULD identify the affected resource in plain language, offer a retry where meaningful, and provide navigation back to a valid higher-level page. An error must not silently fall back to an unrelated resource or hide missing canonical content.

Operational diagnostics MAY be printed to the browser console without exposing learner responses or sensitive source content.

## 19. Recommended implementation organization

Start with the current `marin-app-template` structure rather than inventing a parallel app shell. This diagram is a **logical responsibility map**, not an instruction to create every directory in the first phase:

```text
marin-learn/
├── index.html                   # viewer / catalog entry
├── marin.yml                    # template- and shell-managed manifest
├── js/
│   ├── core/                    # reusable graph, Markdown, render, assessment
│   └── viewer/
│       ├── app.js
│       ├── router.js
│       ├── catalog.js
│       ├── loader.js
│       ├── reader.js
│       ├── slides.js
│       └── quiz.js
├── css/                         # scoped viewer additions only
├── scripts/
│   └── publish.mjs              # build-time ZIP validation/publication
├── schema/                       # canonical schema, unchanged
├── docs/
│   ├── MARKDOWN.md
│   ├── PACKAGE.md
│   └── viewer/
│       └── SPEC.md
├── tests/
└── examples/
    └── marinos-foundations.zip
```

Actual placement MUST follow the supplied MarinOS template where it differs. Managed shell/vendor files are not shown here but remain owned by the template/installer. Do not fork the renderer or copy the canonical schema into an incompatible replacement.

A future `editor/` directory will be planned **only after** the user supplies and approves integration of the current editor. The standalone viewer does not create placeholder editor routes or copy editor libraries.

The publisher SHOULD accept the existing editor-exported ZIP package as an input format and MAY accept an expanded conforming source directory. Publishing output MUST be equivalent either way; no editor code is required for either path.

## 20. Testing requirements

### 20.1 Automated

Minimum automated coverage:

1. Catalog generation: one card per published set, metadata fallback, deterministic sorting, duplicate slugs, revision stability, and publication gating.
2. Publishing: editor ZIP → validated expanded public files; all Markdown bytes preserved; assets preserved; invalid sets rejected; removed sets absent from clean output.
3. Routing: direct URL, missing resource, multiple resources, Back/Forward, deep-linked sections, nested hosting base path.
4. Loading: correct per-view fetches, out-of-order Markdown responses, fetch deduplication, cache refresh, and missing-file error recovery.
5. Reader: sequence order, nested sections, headings, table of contents, stable links, images, print output semantics.
6. Slides: six layouts, three display modes, notes, navigation, no truncation, fullscreen fallback.
7. Quizzes: three interaction types, `all` and `random`, fixed attempt selection, option shuffling, all feedback timings, correct response sets, weighted scoring, optional passing scores and grade scales.
8. Security: unsafe URLs, invalid paths, malformed JSON, raw HTML, active SVG, unexpected references, and no arbitrary graph URL fetches.
9. Source preservation: canonical graph and Markdown are not altered by publication; stable viewer rendering over the reference fixture. **Editor/viewer equivalence is deferred to the separate editor-integration phase.**

### 20.2 Manual accessibility and browser testing

Test keyboard-only use, accessible names/roles/states and accessibility tree, focus after navigation, reading order, table of contents, quiz controls and announcements, speaker notes and slides, 400% reflow, high contrast/forced colors, reduced motion, screen-reader smoke tests, and print styles.

Use a browser-neutral accessibility-tree review process; do not rely on one vendor's DevTools UI as the normative method.

### 20.3 Required reference fixture

The existing `marinos-foundations.zip` MUST be used as an end-to-end publication and viewer regression fixture. It must produce exactly one catalog entry, continuous documentation from its six ContentUnits, its defined quiz behavior, and its seven-slide presentation.

## 21. Acceptance criteria

V1 is acceptable when all of the following are demonstrably true:

1. Visiting the site root opens the catalog, not the editor.
2. The catalog is generated from published packages, with no manually duplicated narrative or metadata maintenance.
3. Unpublished content is absent from the deployed public file tree, not merely absent from the catalog.
4. Selecting a set opens its landing page, not an arbitrarily selected resource.
5. The landing page offers only resources actually present in its graph.
6. A selected Material renders as a complete, continuous, correctly ordered document with a functioning table of contents.
7. The reader requests separate canonical Markdown files and never requires a compiled master content JSON.
8. The slide viewer honors layouts, source display modes, notes, keyboard navigation, and accessible overflow handling.
9. The quiz viewer applies assessment selection, scoring, feedback, and grade policies faithfully and offers meaningful results and source links.
10. Resource and section URLs are shareable, refreshable, and compatible with browser history on static hosting.
11. The catalog does not download every learning graph or Markdown file; learner views load only what they use.
12. Reading, slide, and quiz views use consistent canonical ContentUnit semantics; slide viewer and editor preview share the presentation model and semantic slide renderer.
13. The standalone viewer installs from the current MarinOS template and passes the phase-1 shell-conformance review; it does not require editor code or an `/editor/` route.
14. The application uses approved MarinOS visual patterns and passes the required WCAG 2.2 AA verification.
15. Static deployment works on GitHub Pages or comparable hosting with no runtime backend, external CDN, or Node.js process.
16. Each implementation phase has a separate documented review package and explicit user approval before subsequent work.

## 22. Phased OpenCode Desktop implementation — mandatory review gates

**Do not treat these phases as one backlog to implement automatically.** Each phase is a separate user-initiated task. Complete only the currently authorized phase, demonstrate it in the browser, provide its evidence and changed-file list, then STOP for acceptance. Later-phase code, including editor integration, MUST NOT be added speculatively.

### Phase 0 — Inspect inputs and establish the compliance baseline (no feature implementation)

**Work:** Inspect the user-supplied current MarinOS template, shell, UI, digital/accessibility standards, the canonical schema, Markdown and package specs, and the example package. Report actual versions/commits and any conflicts or missing dependencies. Propose the smallest initial scaffold and commands to reproduce it. Do not transplant the old editor.

**Review gate:** User approves the concrete source versions, directory conventions, shell integration plan, and phase-1 file scope. **No coding begins before this gate** unless the user explicitly combines phases 0 and 1.

### Phase 1 — Shell-only Marin Learn homepage

**Work:** Produce the smallest possible deployable static MarinOS app, using the real App Shell and UI assets, with a correct `marin.yml`, app identity/status, required informational content, and a minimal learner-facing homepage. A neutral loading/empty state is acceptable; do not implement a fake functional catalog.

**Review gate:** Demonstrate actual browser output at desktop and narrow widths (including dark mode), shell/header/footer fidelity, local fonts and icons, keyboard focus, landmarks/headings, and accessibility-tree checks. Show changed files and template-version verification. **Do not add catalog logic until user approves this appearance.**

### Phase 2 — Standalone publication and generated catalog

**Work:** Implement one narrow CLI/build-time publishing path for a supplied conforming ZIP and clean static output. Validate publication eligibility, source graph, Markdown, assets, references, and clean-output rules. Generate deterministic `catalog.json` from the published set(s). Do not compile Markdown into a master JSON or import editor code.

**Review gate:** Supply successful publication output, repeatable commands, inspection of `learning.json` and individual `.md` files, catalog sample, rejection examples, and tests for reproducibility and unsafe/draft publication. User approves before connecting it to UI.

### Phase 3 — Functional catalog UI

**Work:** Load the generated catalog into the approved MarinOS shell. Implement responsive cards, metadata-only search, filters, loading/error/empty states, and navigation intent. No reader/slides/quiz engines yet; avoid active-looking controls that lead to nonimplemented views.

**Review gate:** Desktop/narrow screenshots, keyboard and accessibility-tree inspection of search/filters/cards, browser loading/error demonstrations, and catalog-only network inspection. User approves visual and interaction design.

### Phase 4 — LearningSet landing and routing

**Work:** Load only the selected `learning.json`, resolve graph objects and resource availability, implement query-parameter routing, landing page, nested objectives, resource selection, and Back/Forward behavior. Show real links only where an implemented destination exists; unreleased modes may be unavailable until their phase.

**Review gate:** Direct-link refresh, invalid set/resource handling, deep link/back navigation, multiple/single resources, source-object identity, keyboard/focus/accessibility-tree behavior, and visual consistency. User approves.

### Phase 5 — Continuous documentation reader

**Work:** Fetch individual canonical Markdown files on demand and render selected Materials in correct section/content sequence, with relative heading normalization, a table of contents, internal references, image assets/alt text, robust loading/retry, and print CSS. Preserve individual Markdown files on disk and in the browser fetch plan.

**Review gate:** Real reference package document output, request log showing separate `.md` files, TOC keyboard/focus testing, print preview, missing-file recovery, and heading/accessibility-tree inspection. User approves.

### Phase 6 — Slide viewer

**Work:** Implement approved six slide layouts and three content display modes, 16:9 presentation, navigation/fullscreen fallback, accessible overflow, and Markdown speaker notes. Reuse the viewer core built in earlier phases.

**Review gate:** Review all layout/display combinations that occur in fixtures, responsive/fullscreen behavior, no truncation, keyboard navigation, speaker-note semantics, and comparison of shared ContentUnit rendering. User approves.

### Phase 7 — Quiz viewer and results

**Work:** Implement all three interaction types, all/random selection, stable attempt state, option shuffling, weighted scoring, grade bands, pass threshold, feedback policies, hints, final review, results, and source links. Preserve the standalone, non-credentialing security model.

**Review gate:** Demonstrate single/multiple/true-false, selection stability, all feedback modes, scoring edge cases, accessible choice groups, keyboard-only completion, result announcements, and reference-package quiz. User approves.

### Phase 8 — Standalone viewer release gate

**Work:** Execute complete regression, publication security, performance/network, responsive visual, WCAG 2.2 AA, and cross-browser tests. Confirm clean static deployment, catalog discovery, deep-link operation, reading/slide/quiz completeness, and no editor-only dependencies.

**Review gate:** Deliver verified build, comprehensive changed-file list, automated test output, explicitly documented manual-test results and outstanding limitations. The user decides whether to accept the standalone viewer.

### Phase 9 — Editor integration (separate project; NOT part of viewer construction)

**Prerequisites:** The standalone viewer has been accepted, the user explicitly requests integration, and the user supplies the authoritative editor implementation at that time.

**First deliverable:** A comparison and integration plan, not immediate code. Review file structure, actual current App Shell versions, compatible/duplicated core modules, route ownership, dependency boundaries, and any migration/test implications. The user approves this plan before any integration modifications.

**Only then:** Integrate the editor under an agreed route (potentially `/editor/`), preserve its ZIP workflows, consolidate shared core safely, and test viewer/editor semantic equivalence and MarinOS fidelity. Do not let the editor introduce its heavyweight runtime into ordinary learner routes.

### Required phase completion report

Every phase handoff MUST contain:

1. **Phase completed / scope achieved** — what actually works; distinguish delivered functionality from future phases.
2. **Files changed** — complete inventory, including managed files if re-synced.
3. **Versions and commands** — template/shell/UI versions where relevant; exact build, test, and serve commands.
4. **Tests actually run** — results and uncovered checks; do not claim an unperformed manual audit.
5. **Review evidence** — browser screenshots, desktop/narrow/dark-mode observations when applicable, keyboard/accessibility-tree findings, and reproducible review URLs or local steps.
6. **Known limitations / deviations** — especially any departure from current MarinOS patterns.
7. **Stop for approval** — do not begin the next phase without explicit user acceptance.

## 23. Future extensions (not v1 commitments)

Full-text Markdown search, optional learner progress storage, named course sequences, additional languages, LMS interoperability, richer presenter tooling, offline caching, alternate publication destinations, and read-only API endpoints are possible future additions. None should change the canonical source package contract merely to serve the viewer.

**Editor integration is separately governed by Phase 9; it is not authorization for the standalone viewer agent to use or rewrite the earlier editor while completing Phases 0–8.**

---

**Design invariant:** A single published LearningSet has one authoritative `learning.json` graph and individually maintained Markdown/asset files. The catalog is generated discovery metadata; the document, slides, and quiz are three user experiences over the same source—not separately authored copies.
