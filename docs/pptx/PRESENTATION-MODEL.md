# Shared Presentation Model

**Status:** Implemented in PPTX-0

**Scope:** Presentation semantics shared by the public slide viewer and the PPTX renderer.

## Purpose

Marin Learn stores presentations as ordered graph references:

1. A `marin:Presentation` contains an ordered `marin:slideSequence`.
2. Each referenced `marin:Slide` has a layout and may contain an ordered `marin:contentSequence`.
3. Each content-sequence entry references a canonical `marin:ContentUnit` and chooses a display mode.
4. Speaker notes are authored with the full Marin Learn Markdown profile.

Before PPTX-0, the public viewer resolved and rendered those structures on its own. The shared model replaces that, so the viewer and the PowerPoint renderer read ordered content, display modes and notes the same way.

PPTX-0 establishes one renderer-neutral presentation model before PowerPoint generation is added. It does not add PptxGenJS, PowerPoint export controls, package-format changes, or schema changes.

## Canonical semantics

The shared implementation follows these rules:

- `ItemList.position` determines presentation, slide, and content order.
- An omitted `marin:displayMode` uses the schema default, `full`.
- `full` loads and parses the referenced ContentUnit Markdown.
- `abstract` uses the ContentUnit `abstract` and does not load its Markdown file.
- `title` uses the ContentUnit `name` and does not load its Markdown file.
- Speaker notes are retained as source Markdown and parsed to the same Markdown AST used for content.
- A missing or invalid layout falls back to `content` for rendering and produces a diagnostic.
- Unresolved slide or ContentUnit references produce diagnostics instead of being silently ignored.
- A title or section slide may omit `marin:contentSequence`. Other slide layouts require at least one content block.

## Core API

The implementation is in `js/core/presentation.js`.

### `buildPresentationModel(options)`

```js
const model = await buildPresentationModel({
  graphDocument,
  presentationId,
  getMarkdown: async ({ path, contentUnit }) => markdownSource
});
```

Inputs:

- `graphDocument`: the canonical JSON-LD-style Marin Learn graph document;
- `presentationId`: a presentation `@id` or identifier; when omitted, the first presentation is selected;
- `getMarkdown`: an asynchronous or synchronous source adapter used only for `full` entries.

The returned object contains:

```js
{
  learningSet: {
    id,
    identifier,
    name,
    inLanguage
  },
  presentation: {
    id,
    identifier,
    name,
    abstract,
    inLanguage
  },
  slides: [
    {
      id,
      identifier,
      name,
      layout,
      position,
      sourcePosition,
      content: [
        {
          position,
          sourcePosition,
          displayMode,
          unit: {
            id,
            identifier,
            name,
            abstract,
            learningResourceType,
            contentUrl
          },
          markdown,
          markdownAst,
          markdownStatus,
          markdownError
        }
      ],
      speakerNotes,
      speakerNotesAst
    }
  ],
  diagnostics: []
}
```

The model does not mutate the source graph.

## Shared HTML renderer

`js/renderers/slides-html.js` renders the normalized model rather than resolving graph objects itself.

It exports:

- `renderSlideCanvasInnerHtml(slide, options)`;
- `renderSlideContentHtml(slide, options)`;
- `renderSpeakerNotesHtml(slide, options)`.

The public viewer uses this semantic renderer, and the PowerPoint renderer reads the same model.

## Source adapters

### Public viewer

`js/viewer/slides.js` supplies a `getMarkdown` adapter that fetches package-relative Markdown from the published learning-set directory. It also supplies Markdown link and asset resolvers for the public viewer routes.

### PowerPoint renderer

PPTX-1 consumes this same model through `js/pptx/preflight.js`. It resolves package-local Markdown and assets from the working package, creates a deterministic presentation plan, and renders PowerPoint without independently reinterpreting graph order, display modes, or notes. It does not scrape rendered HTML.

## Verification

Automated coverage includes:

- schema-default display-mode handling;
- ordered multi-entry slide resolution;
- Markdown loading only for `full` entries;
- all three display modes;
- speaker-note parsing and rendering;
- unresolved-reference diagnostics;
- removal of an empty sequence for content-free title and section slides;
- resolution of every published presentation fixture through the shared model;
- representation of all six slide layouts and all three display modes across current fixtures.

The real-browser regression test `tests/browser_presentation_semantics.py` additionally covers public-viewer rendering of an existing two-entry split slide.

## PPTX integration

PPTX-1 adds the renderer-neutral PowerPoint core under `js/pptx/`, including preflight, fixed-size layout planning, PptxGenJS generation, OOXML remediation, structural validation, and a lazy same-origin browser runtime. PPTX-2, a Review and Download screen in the editor, was removed with the editor. PPTX-3 adds a hash-verified Node adapter and review workflow that import canonical package ZIPs and call that same exporter API.

None of these phases alter the shared model, v1 schema, or canonical package contract. Still deferred:

- public-viewer PowerPoint links;
- publication of PPTX files in `dist/`;
- automatic continuation slides;
- changes to the Marin Learn v1 schema or canonical package contract.
