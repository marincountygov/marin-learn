# Marin Learn Editor - UX and Content Design Contract

**Audience:** Occasional, non-technical County staff.  
**Status:** Proposed v1 copy and interaction contract for Stage B.  
**Principle:** Expose the task; hide the data model. Text in this file is recommended product copy, not schema vocabulary.

## 1. Interaction principles

1. **Start with the document.** After creating/opening a project, make **Reading Materials** the obvious next step. Do not require the author to learn ContentUnits before writing.
2. **Show only what matters now.** Title, content, and most common choices appear first. Less common properties use contextual **Settings** or **Advanced** controls, never unexplained panels of raw metadata.
3. **Use verbs and direct consequences.** Prefer **Add section**, **Reuse content**, **Make a separate copy**, **Download Learning Package** over abstract operations.
4. **Explain reuse just in time.** Present impact and choices only when an action affects shared content.
5. **Keep content in place.** Editing should resemble the eventual reading material. Do not force users into unrelated object detail pages after each paragraph.
6. **Never lie about persistence.** Browser autosave is not publishing, sharing, or updating a ZIP already on disk.
7. **Use plain language with precise labels.** Avoid schema and implementation terminology in normal views.
8. **Provide keyboard equivalents.** Every reorder, open, insert, and dismiss operation must work without drag-and-drop.

## 2. Navigation vocabulary

| Canonical/technical meaning | User-facing label | Location |
| --- | --- | --- |
| LearningSet | **Learning Project** | Project header and picker |
| LearningMaterial | **Reading Material** (plural: **Reading Materials**) | Primary workspace |
| ContentUnit | **Content block** when explanation is needed; otherwise show content title | Document editor |
| List of reusable ContentUnits | **Content Library** | Reuse chooser and optional navigation |
| DefinedTerm objective | **Learning Objective** | Overview and contextual settings |
| Assessment | **Quiz** | Main project navigation |
| AssessmentItem | **Question** | Quiz editing |
| Presentation | **Slide Deck** | Main project navigation |
| Image/MediaObject | **Image** or **File** | **Images and Files** |
| Package export | **Download Learning Package** | Review and Download |
| Presentation derivative | **Download PowerPoint** | Review and Download |
| Validation | **Review** / **Things to fix** | Review and Download |
| Schema/JSON-LD/UUID | No default public label | Advanced/diagnostics only |

**Primary navigation:** Overview; Reading Materials; Quizzes; Slide Decks; Images and Files; Review and Download. **Secondary/contextual:** Learning Objectives; Content Library; Advanced.

The root of the public Marin Learn site remains the learner catalog. `/editor/` contains authoring.

## 3. Start / first run

### Main heading

**Create and update learning materials**

### Intro

Create reading materials, slide decks, and quizzes from one shared set of content. Your work stays in this browser until you download a learning package.

### Actions

- **Create learning project**
- **Open learning package**
- **Continue working** (only when local recovery exists)

### Create form

| Label | Required | Help | Example |
| --- | --- | --- | --- |
| Project title | Yes | Give your learning project a short, recognizable name. | MarinOS Foundations |
| What is this project about? | No | Briefly describe what someone will learn. You can change this later. | An introduction to shared MarinOS components. |

Primary action: **Create project**. Secondary: **Cancel**.

### Recovery

**Continue where you left off?**  
"A copy of this project was saved in this browser. You can continue editing or open another learning package."

Display title and saved timestamp where available. Do not call this a backup in shared storage. Require confirmation before discarding/replacing local recovery.

## 4. Project overview

**Project overview** should answer: What exists? What's next? What needs attention?

Show project title, optional description, a compact status such as **Saved in this browser**, and task cards:

- **Write reading materials** - "Create the information people will read."
- **Create a quiz** - "Help learners check what they understood."
- **Build a slide deck** - "Present the same information as slides."
- **Review and download** - "Check your work and download a portable package."

Display **Learning Objectives** as "Learning goals (optional)" on Overview with an action **Add learning goal**. The editor maps these to schema `DefinedTerm` records. The management view may retain the heading **Learning Objectives**.

An author MUST be able to start drafting without filling out every optional metadata field.

## 5. Reading Materials - main authoring experience

### Library/index page

Heading: **Reading Materials**  
Empty state: "No reading materials yet. Start with a topic your learners need to understand."  
Primary: **Create reading material**  
Secondary: **Reuse existing content** when applicable.

List existing materials by human title, short summary (if present), and edit action. Do not show UUIDs or number of schema nodes.

### Create/edit material

Label: **Title** - required, e.g. "Getting started with MarinOS".  
Label: **Description (optional)** - "A brief introduction for learners."  
Optional: **Estimated reading time** - "How long this usually takes."  
Primary editing area: a continuous document with outline/table of contents when needed.

Within the editor, contextual actions:

- **Add content** - create a new reusable ContentUnit under the current position.
- **Add section** - create a new section and move into it if needed.
- **Reuse existing content** - open title/search chooser and preview the selected block.
- **Move up**, **Move down** - keyboard-accessible counterparts to drag handles.
- **Remove from this material** - detach the reference, do not delete the source.
- **Edit content** - edit current ContentUnit body.
- **Content settings** - title, content type, optional short summary, goal associations.

### Content settings

| UI label | Maps to | Help text |
| --- | --- | --- |
| Content title | ContentUnit `name` | A short name for this topic or section. |
| Content type | `learningResourceType` | Choose what this part does, such as explaining a concept or showing a procedure. |
| Short summary (optional) | `abstract` | A brief version of this content. Often used in presentation slides and search results. |
| Learning goals (optional) | `teaches` | Choose any learning goals this content helps teach. |
| Where this is used | Derived references | Shows which reading materials or slides use this content. |

Allowed types, plain labels: **Topic**, **Overview**, **Concept**, **Procedure**, **Reference**, **Example**, **Key points**, **Summary**, **Note**, **Warning**. Show short contextual help for less familiar types.

### Shared content editing prompt

Title: **This content is used in more than one place**  
Body: "Changes to this content will also appear in [number] other materials or slides. What would you like to do?"  
Actions: **Edit everywhere** / **Make a separate copy** / **Cancel**.

**Make a separate copy** creates a new ID and file/path reference, updates only the selected assembly instance, and preserves all other usages. Do not silently detach or duplicate without a decision.

### Deletion terminology

- **Remove from this material** (preserve reusable source)
- **Delete from Content Library** (delete source and explain all existing uses)

For true deletion, require an explicit impact summary and confirmation.

## 6. Rich-text toolbar and paste

### Toolbar labels

**Undo**, **Redo**, **Paragraph style**, **Heading**, **Bold**, **Italic**, **Insert link**, **Bulleted list**, **Numbered list**, **Quote**, **Code block**, **Insert table**, **Insert image**. Use recognizable MarinOS/Lucide icons plus accessible names; avoid glyph-only controls without text alternatives.

Do not offer arbitrary fonts, colors, alignment, or raw HTML. Relative heading levels may be managed automatically from the document structure.

### Paste help

Near the editor (dismissible or compact):

"You can paste from Word, Google Docs, or a website. We'll keep headings, lists, links, and tables where possible and remove unrelated formatting."

On encountering content that cannot be represented:

"Some formatting cannot be used here. Review the pasted text before continuing."  
Actions: **Keep supported formatting**, **Paste as plain text**, **Undo paste** as appropriate to the editing library and clipboard data.

Avoid alarming users for routine removal of font faces/colors. Loss of table structure, images, meaningful links, or heading structure warrants an explicit alert or review.

### Images

Prompt for **Image description**: "Describe what the image shows or communicates for someone who cannot see it."  
Alternative **This image is decorative** checkbox (explicit choice).  
Optional **Caption**: "Visible text shown beneath the image."  
Forbid saving an inserted meaningful image without an adequate description; do not automatically infer or fabricate one.

## 7. Learning Objectives

Heading: **Learning Objectives**  
Helpful intro: "Learning objectives describe what someone should know or be able to do after reviewing the material. They are optional when you are getting started."  
Action: **Add learning objective**.

| Label | Maps to | Help |
| --- | --- | --- |
| Learning objective | `DefinedTerm.name` | Start with an action word, such as explain, identify, or demonstrate. |
| Parent objective (optional) | `marin:parentObjective` | Place this objective under a broader objective if helpful. |

Do not force authors to attach objectives to every content block or question. If attachments are missing, show a warning only where schema/policy requires.

## 8. Quizzes

Heading: **Quizzes**  
Empty state: "No quizzes yet. Add a few questions to help learners check their understanding."  
Primary: **Create quiz**.

Quiz form: **Quiz title**, **Description (optional)**, **Questions**, **Quiz settings** (collapsed).

Question editing:

| UI label | Maps to | Help |
| --- | --- | --- |
| Question | AssessmentItem `text` | Ask one clear question. |
| Question type | `marin:interactionType` | Choose one answer, multiple answers, or true/false. |
| Answer choices | Referenced ResponseOptions | Add the choices learners will see. |
| Correct answer / Correct answers | `marin:correctResponse` | Choose all answers that should receive credit. |
| Explain this answer (optional) | `marin:explanation` | Show a useful explanation when the learner receives feedback. |
| Hint (optional) | `marin:hint` | Help without giving away the answer. |
| Based on (optional) | `isBasedOn` | Link the question to reading material that teaches the answer. |
| Learning goals (optional) | `assesses` | Choose goals this question helps check. |
| Points | Sequence `marin:weight` | Advanced. Default 1 point. |

Quiz settings (advanced): **Questions to show: All / Random selection**, **Number of questions**, **Shuffle questions**, **Shuffle answer choices** (where supported per-item), **When to show feedback**, **Passing score (optional)**, **Grade scale (optional)**. These settings MUST map to the existing v1 schema; no new scoring methods.

Questions with no correct choice must show "Choose the correct answer before you download this learning package" with a direct Fix path. Do not prevent the author from saving a locally incomplete draft.

## 9. Slide Decks

Heading: **Slide Decks**  
Empty state: "Turn your reading materials into a presentation without rewriting the content."  
Action: **Create slide deck**.

Slide editing:

| Label | Maps to | Help |
| --- | --- | --- |
| Slide title | Slide `name` | A short heading for this slide. |
| Layout | `marin:layout` | Choose how the content is arranged. |
| Content blocks | Slide `marin:contentSequence` | Add one or more existing topics or sections and arrange them in slide order. A title or section slide may omit content. |
| Display mode for each block | ListItem `marin:displayMode` | Full content, Short summary, or Title only. |
| Speaker notes (optional) | `marin:speakerNotes` | Notes for the presenter; not shown on the slide itself. |

Display modes should read **Full content**, **Short summary**, **Title only**. If Short summary is selected but none exists: "This topic needs a short summary for this slide. Add one in Content settings." Include direct Fix action.

Each content block must have keyboard-operable **Up**, **Down**, and **Remove** actions. Saving a slide must preserve every ordered content reference; editing one block must never discard another block from an imported or existing slide.

Do not present separate slide body textboxes as the default source of instructional material.

## 10. Images and Files

Heading: **Images and Files**  
Empty state: "No images or files yet. Add an image when it helps explain the material."  
Action: **Add image or file**.

Show useful thumbnail, filename, display name/caption, and where used. Put MIME, content path, UUID, and raw image dimensions under Advanced. Ensure allowed asset type and SVG safety checks are surfaced as understandable errors.

## 11. Review and Download

Heading: **Review and Download**  
Intro: "Check for missing information, then download a portable learning package or an editable PowerPoint slide deck."

### Project status and learning-package download

Status grouping:

- **Things to fix** (blocking package errors)
- **Worth reviewing** (package warnings)
- **Ready to download** (no blocking package errors)

Action labels: **Fix**, **Review**, **Download Learning Package**.

After successful package export: "Learning package downloaded. This does not publish it to the catalog." Never say **Published** or **Shared**.

### PowerPoint download

Heading: **Download PowerPoint**

Description: "Create an editable PowerPoint presentation from one slide deck. The file is generated in this browser and is not added to the learning package."

Control labels:

- **Slide deck**
- **Download PowerPoint**
- **Open Slide Decks** when no deck exists

PowerPoint readiness language:

- **Ready to download** — the selected deck passed PowerPoint checks.
- **Ready with items to review** — the deck can be downloaded, but nonblocking warnings remain.
- **PowerPoint is not ready** — blocking presentation issues must be fixed.
- **Creating PowerPoint...** — controls are disabled while the browser generates and checks the file.
- **PowerPoint downloaded** — the validated file was generated and downloaded.

Use **Fix** for presentation diagnostics only when Marin Learn can return to a known affected deck or slide. Do not show schema codes, OOXML details, or internal validator terminology to authors. Internal exporter failures must state that no file was downloaded and the learning project was not changed.

While editing: **Saved in this browser** / **Saving in this browser...** / **Unable to save in this browser**. PowerPoint generation is a derivative download and must not change the local-save status.

## 12. Common errors, empty states, and confirmations

| Situation | Message | Action |
| --- | --- | --- |
| Invalid learning package | "This learning package could not be opened. Your current project was not changed." | View details / Try again |
| Missing Markdown file | "Part of this project is missing its content file." | View affected content |
| Broken reference | "This item points to content that is no longer available." | Fix link |
| Unusable external link | "Check this link. The address is not supported." | Edit link |
| Unsaved local state | "Changes could not be saved in this browser. Download a package to keep a copy." | Retry / Download |
| Deleting shared content | "This content is also used in other places." | Show uses / Cancel |
| Opening another package | "Opening another project will replace the one currently in this editor." | Cancel / Open |
| No content for slide | "Choose content for this slide." | Choose content |
| Learning-package download blocked | "Fix [n] problems before downloading a valid learning package." | View issues |
| No slide deck for PowerPoint | "Create a slide deck before downloading PowerPoint." | Open Slide Decks |
| PowerPoint download blocked | "Fix these slide-deck issues before downloading PowerPoint." | Fix |
| PowerPoint internal failure | "The PowerPoint file could not be created. Your learning project was not changed." | Reload / Try again |

Avoid unexplained codes such as `broken-ref`, `@id`, or `invalid-json` except in an expandable technical details view.

## 13. Mobile and accessibility behavior

- Desktop is primary, but all authoring tasks must reflow and remain operable with 400% zoom.
- A persistent project outline may collapse into a named navigation control on narrow screens.
- Editor toolbars must have visible keyboard focus and accessible name/pressed state; shortcuts are optional, not the only controls.
- Validation errors identify exact form fields and are announced appropriately without spamming live regions.
- Dialogs use meaningful titles and restore focus; the editor must retain selection safely when opening insert controls.
- Reordering supports Move up / Move down independently of pointer drag.
- Visual color alone must not communicate answer correctness or validation state.

## 14. Copy quality review

Before accepting Stage B, evaluate every first-run, empty, editing, import, quiz, slide, asset, validation, and export screen for:

- jargon that should be hidden or explained;
- missing or redundant labels;
- tasks that require knowing schema internals;
- misleading save/publish language;
- avoidable choice overload;
- unclear shared-content consequences;
- keyboard and screen-reader understandability.

Changes to this copy are allowed after user review; update this file alongside implementation to avoid drifting labels and help text.
