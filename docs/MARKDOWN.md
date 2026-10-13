# Marin Learn Markdown v1

## 1. Status and purpose

This document defines the normative Markdown profile used by Marin Learn v1.

It is the companion specification to `marin-learn-v1.schema.json`.

Marin Learn Markdown is intentionally constrained. It provides enough structure for accessible instructional content, assessments, feedback, speaker notes, and presentation reuse while avoiding arbitrary presentation markup, executable content, and Markdown extensions that are difficult to render consistently.

The goals of this profile are:

- stable and normalized rendering across Marin Learn implementations;
- predictable round-trip editing through the Marin Learn editor;
- accessible semantic output;
- deterministic serialization;
- safe import of authored content;
- minimal dependence on renderer-specific Markdown behavior;
- clean separation of content from presentation.

This specification defines source syntax and processing behavior. It does not define the visual appearance of rendered content.

---

## 2. Normative language

The terms **MUST**, **MUST NOT**, **REQUIRED**, **SHOULD**, **SHOULD NOT**, **RECOMMENDED**, **MAY**, and **OPTIONAL** are normative requirements in this document.

---

## 3. Base specifications

Marin Learn Markdown v1 is based on:

1. **CommonMark 0.31.2** for the core Markdown parsing model.
2. The **GitHub Flavored Markdown table extension** for pipe tables.

Marin Learn does not adopt GitHub Flavored Markdown as a whole.

Where this specification differs from CommonMark or GFM, this specification takes precedence.

A Marin Learn implementation SHOULD configure its Markdown parser so unsupported extensions are disabled rather than parsing them and attempting to remove them later.

---

## 4. Where Marin Learn Markdown is used

The full Marin Learn Markdown profile applies to:

- Markdown files referenced by a `marin:ContentUnit` through Schema.org `encoding`;
- `marin:AssessmentItem.text`;
- `marin:AssessmentItem.marin:hint`;
- `marin:AssessmentItem.marin:explanation`;
- `marin:ResponseOption.text`;
- `marin:ResponseOption.marin:feedback`;
- `marin:Slide.marin:speakerNotes`;
- `marin:GradeBand.marin:message`;
- any future property explicitly defined by the Marin Learn schema as using the Marin Learn Markdown profile.

An editor MAY expose a smaller toolbar in contexts such as response options or grade messages, but it MUST preserve all valid Marin Learn Markdown syntax encountered on import unless the schema for that context is later made more restrictive.

---

## 5. Character encoding and line endings

Markdown files MUST be UTF-8.

Canonical exported Markdown files MUST:

- use UTF-8 without a byte order mark;
- use LF (`U+000A`) line endings;
- contain no trailing spaces;
- end with exactly one line ending;
- contain no tab characters outside fenced code blocks.

Importers SHOULD accept CRLF and CR line endings and normalize them to LF internally.

Importers SHOULD accept a UTF-8 byte order mark but MUST remove it during canonical serialization.

Text content MUST NOT contain NUL characters or other control characters that are unsafe or unnecessary for normal text content. Tab characters MAY occur inside fenced code blocks and inline code spans.

---

## 6. ContentUnit files

A `marin:ContentUnit` stores its primary narrative in a Markdown file referenced by:

```json
{
  "encoding": {
    "@type": "MediaObject",
    "contentUrl": "content/app-shell.md",
    "encodingFormat": "text/markdown"
  }
}
```

The Markdown file MUST contain narrative content only.

It MUST NOT contain:

- YAML frontmatter;
- JSON metadata;
- an object identifier declaration;
- a title duplicating the ContentUnit `name` property;
- embedded schema metadata.

The JSON-LD graph is authoritative for metadata and identity.

---

## 7. ContentUnit title handling

A ContentUnit's `name` property is its canonical title.

The corresponding Markdown file MUST NOT contain an H1 heading.

Example JSON-LD metadata:

```json
{
  "name": "The Marin App Shell",
  "encoding": {
    "@type": "MediaObject",
    "contentUrl": "content/app-shell.md",
    "encodingFormat": "text/markdown"
  }
}
```

Valid `content/app-shell.md`:

```markdown
The Marin App Shell provides shared application structure and interface behavior.

## Why it exists

Applications can reuse common behavior rather than rebuilding it independently.
```

The renderer creates the appropriate heading for `The Marin App Shell` from the object metadata.

---

## 8. Supported block syntax

Marin Learn Markdown v1 supports these block structures:

- paragraphs;
- ATX headings from `##` through `######`;
- unordered lists;
- ordered lists;
- block quotations;
- fenced code blocks;
- simple GFM-style pipe tables.

No other block syntax is part of the v1 profile.

---

## 9. Paragraphs

Paragraphs follow CommonMark paragraph semantics except where this specification restricts line breaks.

Canonical serialization MUST emit each paragraph as a single physical source line.

A blank line MUST separate adjacent block elements where CommonMark permits ambiguity without one.

Example:

```markdown
MarinOS applications use shared standards and components.

This reduces unnecessary differences between applications.
```

Manual hard wrapping of prose SHOULD NOT be used in canonical output.

---

## 10. Headings

Only ATX headings using `#` characters are supported.

Allowed heading levels are:

```markdown
## Level 2
### Level 3
#### Level 4
##### Level 5
###### Level 6
```

The following are prohibited:

- H1 headings using `#`;
- Setext headings using `===` or `---`;
- closing ATX hash sequences such as `## Heading ##` in canonical output.

### 10.1 Relative heading model

Headings inside Marin Learn Markdown are relative to the resource containing the Markdown.

For a ContentUnit, its `name` is considered the logical level-1 heading of that unit. Therefore the first child section normally begins with `##`.

Renderers MAY shift the final HTML heading level according to where the resource is embedded, but MUST preserve the relative hierarchy.

For example, this source:

```markdown
## Security

### Content Security Policy
```

may render as `h3` followed by `h4` when the ContentUnit is nested beneath a material section whose heading already occupies `h2`.

### 10.2 Heading hierarchy

Within one Markdown value:

- heading levels MUST NOT skip downward levels;
- a first heading MUST be `##`;
- after `##`, `###` is valid;
- after `##`, `####` without an intervening `###` is invalid;
- returning to any previously established shallower level is valid.

This rule is intended to guarantee that renderers can produce a valid accessible heading hierarchy.

---

## 11. Unordered lists

Unordered lists are supported.

Canonical serialization MUST use `-` as the list marker.

Example:

```markdown
- Consistent interfaces
- Shared standards
- Reusable components
```

`*` and `+` list markers MAY be accepted on import but MUST be normalized to `-` on export.

Nested lists are supported under CommonMark list rules.

Authors SHOULD avoid unnecessary deep nesting. Authoring interfaces SHOULD warn when list nesting becomes difficult to understand, generally beyond three levels.

---

## 12. Ordered lists

Ordered lists are supported.

Canonical serialization SHOULD use sequential decimal numbering beginning with `1.` unless preservation of a meaningful starting number is necessary.

Example:

```markdown
1. Open the application.
2. Select the learning set.
3. Review the validation results.
```

Ordered list starting values MAY be preserved when the number itself carries meaning.

Nested ordered and unordered lists are supported.

---

## 13. Task lists

GFM task-list syntax is not supported in v1.

The following is invalid Marin Learn Markdown:

```markdown
- [ ] Review the draft
- [x] Publish the material
```

Interactive completion state belongs to an application or learning-delivery model, not to canonical narrative Markdown.

---

## 14. Block quotations

Block quotations are supported for quoted material.

Example:

```markdown
> Reuse canonical content instead of maintaining multiple independent copies.
```

Block quotations MUST NOT be used as a substitute for semantic callouts such as notes or warnings. Those concepts are represented by ContentUnit types such as `note` and `warning`.

Nested block quotations are not supported in v1.

A block quotation MAY contain paragraphs, emphasis, strong emphasis, inline code, links, and simple lists.

A block quotation MUST NOT contain:

- headings;
- tables;
- images;
- fenced code blocks;
- another block quotation.

---

## 15. Fenced code blocks

Fenced code blocks are supported.

Canonical serialization MUST use backtick fences.

Example:

````markdown
```json
{
  "status": "published"
}
```
````

An optional information string MAY contain one language identifier.

The language identifier MUST match:

```text
[A-Za-z0-9_+-]+
```

Attributes, classes, filenames, or additional metadata MUST NOT be appended to the information string.

Example of invalid syntax:

````markdown
```javascript {.numberLines}
```
````

A serializer MUST choose a fence length longer than any uninterrupted run of backticks contained in the code block.

Code block contents are opaque text. Markdown syntax inside a fenced code block MUST NOT be interpreted.

Indented code blocks are not supported.

Rendered code MUST never execute.

---

## 16. Tables

Marin Learn supports a constrained form of the GFM pipe-table extension.

Example:

```markdown
| Term | Meaning |
| --- | --- |
| Material | An ordered assembly of reusable content |
| ContentUnit | A reusable instructional unit |
```

### 16.1 Table requirements

A table MUST:

- contain a header row;
- contain a delimiter row;
- have the same number of cells in every row;
- contain at least one column;
- have a non-empty header for every column;
- use leading and trailing pipes in canonical serialization.

Alignment markers using `:` are not supported because visual alignment is controlled by the renderer.

Invalid:

```markdown
| Name | Score |
| :--- | ---: |
| A | 90 |
```

Canonical:

```markdown
| Name | Score |
| --- | --- |
| A | 90 |
```

### 16.2 Table cell content

Table cells may contain:

- plain text;
- emphasis;
- strong emphasis;
- inline code;
- links.

Table cells MUST NOT contain:

- block-level content;
- images;
- line breaks;
- nested tables.

A literal pipe in a cell MUST be escaped as `\|`.

### 16.3 Accessibility

The first row is the column-header row and MUST render as semantic column headers.

Marin Learn v1 does not define Markdown syntax for row headers, merged cells, multi-level headers, or table captions.

Content requiring those structures SHOULD be represented using another content pattern instead of a v1 Markdown table.

Tables MUST represent data, not visual layout.

---

## 17. Supported inline syntax

Marin Learn Markdown v1 supports:

- emphasis;
- strong emphasis;
- combined emphasis and strong emphasis;
- inline code;
- inline links;
- images;
- CommonMark backslash escaping where required.

---

## 18. Emphasis and strong emphasis

Canonical serialization MUST use asterisks.

Emphasis:

```markdown
*important*
```

Strong emphasis:

```markdown
**required**
```

Combined emphasis and strong emphasis:

```markdown
***very important***
```

Underscore delimiters MAY be accepted on import but MUST be normalized to asterisks on export.

Formatting MUST be semantic. Authors should not use strong emphasis as a substitute for headings.

---

## 19. Inline code

Inline code spans are supported.

Example:

```markdown
The package uses `learning.json` as its structured metadata file.
```

A serializer MUST use a backtick delimiter long enough to contain the literal code safely according to CommonMark rules.

Inline code is text only and MUST never execute.

---

## 20. Links

Only inline link syntax is supported.

Example:

```markdown
[Review the County website](https://example.gov/)
```

Reference-style links are not supported.

Invalid:

```markdown
Review the [County website][county].

[county]: https://example.gov/
```

### 20.1 External links

External link destinations may use these schemes:

- `https:`;
- `http:`;
- `mailto:`;
- `tel:`.

`https:` SHOULD be used instead of `http:` whenever the destination supports HTTPS.

Renderers and validators MUST reject unsafe schemes, including but not limited to:

- `javascript:`;
- `data:`;
- `vbscript:`;
- `file:`.

An `http:` link MAY be valid but SHOULD produce an authoring warning.

### 20.2 Internal Marin Learn links

A link to another referenceable Marin Learn object MUST use the stable form:

```text
marin-ref:<uuid>
```

Example:

```markdown
[Review the App Shell concept](marin-ref:550e8400-e29b-41d4-a716-446655440000)
```

The UUID resolves to the graph object whose `@id` is:

```text
urn:uuid:550e8400-e29b-41d4-a716-446655440000
```

A `marin-ref:` destination MUST resolve to an object in the current learning-set graph.

Renderers determine the final navigation URL.

Relative package paths MUST NOT be used as substitutes for stable internal object references.

### 20.3 Link text

Link text SHOULD describe the link purpose without requiring surrounding text for interpretation.

Authors SHOULD avoid ambiguous text such as:

```text
click here
read more
this link
```

when more descriptive wording is practical.

### 20.4 Link titles

Markdown link-title syntax is not supported in v1.

---

## 21. Autolinks and bare URLs

CommonMark autolink syntax is not supported.

Invalid:

```markdown
<https://example.gov/>
```

GFM automatic URL linking is not part of this profile.

A bare URL is ordinary text unless the editor deliberately converts it into an inline Markdown link.

---

## 22. Images

Markdown image syntax is supported only for packaged Marin Learn image assets.

An image destination MUST use:

```text
marin-asset:<uuid>
```

Example:

```markdown
![Diagram showing the App Shell surrounding shared application components](marin-asset:550e8400-e29b-41d4-a716-446655440000)
```

The UUID MUST resolve to the graph object whose `@id` is:

```text
urn:uuid:550e8400-e29b-41d4-a716-446655440000
```

That object MUST be a Schema.org `ImageObject` and its `contentUrl` MUST resolve to a packaged asset under `assets/`.

This indirection is REQUIRED so narrative content does not depend on an asset filename. An asset file may be renamed without changing the Markdown reference as long as its object identity remains unchanged.

### 22.1 Remote images

Remote image destinations are prohibited.

Invalid:

```markdown
![Example](https://example.gov/example.png)
```

Relative image paths are also prohibited.

Invalid:

```markdown
![Example](../assets/example.png)
```

All rendered image bytes MUST come from a referenced packaged ImageObject.

### 22.2 Alternative text

Meaningful images MUST include non-empty alternative text.

Alternative text MUST be plain text. It MUST NOT contain Markdown formatting, links, inline code, or nested images.

Example:

```markdown
![Flow from source content to reading view, quiz, and slides](marin-asset:550e8400-e29b-41d4-a716-446655440000)
```

### 22.3 Decorative images

An empty Markdown image description is the canonical declaration that this particular image use is decorative:

```markdown
![](marin-asset:550e8400-e29b-41d4-a716-446655440000)
```

The Marin Learn editor MUST require the author to explicitly select **Decorative image** before serializing an empty alternative-text value.

On import, an empty image description MUST be interpreted as an intentional decorative declaration for that usage.

Alternative text is contextual. It belongs to the Markdown image usage rather than globally to the ImageObject.

### 22.4 Image titles and captions

Markdown image-title syntax is not supported.

An ImageObject may contain Schema.org `caption` metadata, but the existence of that metadata does not require a Markdown renderer to display it as a figure caption.

Marin Learn v1 does not define a Markdown figure-caption syntax.

---

## 23. Line breaks

Explicit hard line breaks are not supported in v1.

Authors MUST NOT create hard breaks using:

- two trailing spaces;
- a backslash before a line ending;
- HTML `<br>`.

Use a new paragraph or another semantic block instead.

Canonical serialization MUST NOT emit hard-break syntax.

---

## 24. Raw HTML

Raw HTML is prohibited.

This includes both inline HTML and HTML blocks.

Examples of invalid Marin Learn Markdown:

```markdown
<span class="important">Important</span>
```

```markdown
<div>
Custom content
</div>
```

```markdown
<!-- hidden comment -->
```

HTML comments are also prohibited.

Importers MUST NOT preserve raw HTML as executable or renderable markup.

An importer MAY reject the content or convert safely representable HTML into supported Markdown through an explicit import-normalization process. It MUST NOT silently retain unsupported HTML.

---

## 25. Unsupported Markdown features

The following are not part of Marin Learn Markdown v1:

- H1 headings inside Markdown content;
- Setext headings;
- thematic breaks;
- indented code blocks;
- raw HTML;
- HTML comments;
- reference-style links;
- CommonMark autolinks;
- GFM automatic URL linking;
- GFM strikethrough;
- GFM task lists;
- GFM alignment markers in tables;
- footnotes;
- definition lists;
- superscript or subscript extensions;
- emoji shortcodes;
- Markdown attributes or attribute lists;
- custom classes or IDs;
- directives;
- admonition extensions;
- Mermaid or other executable diagram syntax;
- TeX/LaTeX math extensions;
- MDX;
- embedded JavaScript;
- iframes;
- audio or video embed syntax;
- arbitrary renderer-specific extensions.

A future Marin Learn schema version may add features explicitly. Implementations MUST NOT assume that a popular Markdown extension is valid merely because an underlying parser supports it.

---

## 26. Markdown in JSON string properties

Some Marin Learn Markdown is stored directly in JSON-LD string properties rather than external `.md` files.

Example:

```json
{
  "text": "Which statement **best** describes the Marin App Shell?"
}
```

These strings use exactly the same Markdown profile defined in this document.

Newlines are represented according to normal JSON string escaping when serialized as JSON.

After JSON decoding, the Markdown processor MUST treat the resulting string exactly as it would the contents of a Markdown file.

---

## 27. Stable references

Marin Learn defines two Markdown-specific stable-reference URI schemes.

### 27.1 `marin-ref:`

References another object in the current JSON-LD graph.

Syntax:

```text
marin-ref:<uuid>
```

Resolution:

```text
marin-ref:550e8400-e29b-41d4-a716-446655440000
```

maps to:

```text
urn:uuid:550e8400-e29b-41d4-a716-446655440000
```

### 27.2 `marin-asset:`

References an ImageObject in the current JSON-LD graph.

Syntax:

```text
marin-asset:<uuid>
```

Resolution uses the same UUID-to-URN rule.

### 27.3 UUID syntax

The UUID portion MUST use the canonical lowercase hyphenated form:

```text
xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

Serializers MUST emit lowercase UUIDs.

Importers MAY accept uppercase hexadecimal UUID characters but MUST normalize them to lowercase.

---

## 28. Reference validation

The Markdown validator MUST inspect links and images after parsing.

For each `marin-ref:` reference it MUST verify that:

1. the UUID is syntactically valid;
2. the corresponding `urn:uuid:` object exists in the current graph;
3. the target is a referenceable object appropriate for navigation.

For each `marin-asset:` reference it MUST verify that:

1. the UUID is syntactically valid;
2. the corresponding object exists;
3. the object is an `ImageObject`;
4. the object's `contentUrl` resolves to a packaged file;
5. the asset's declared `encodingFormat` is consistent with the packaged file.

Broken stable references are validation errors.

---

## 29. Parsing requirements

A conforming implementation MUST parse Marin Learn Markdown into a structured representation before rendering.

It MUST NOT implement Markdown rendering through ad hoc regular-expression replacement.

The parsing pipeline SHOULD be conceptually:

```text
UTF-8 source
→ CommonMark parse with approved extensions
→ Marin Learn profile validation
→ stable-reference resolution
→ semantic AST
→ target renderer
```

Unsupported parser extensions MUST be disabled where practical.

A parser MAY accept non-canonical but semantically equivalent supported syntax during import, such as `*` unordered-list markers or underscore emphasis. The normalizer MUST then emit canonical syntax on export.

---

## 30. Canonical serialization

A Marin Learn serializer MUST produce normalized Markdown.

Canonical serialization rules include:

- UTF-8 without BOM;
- LF line endings;
- one final line ending;
- no trailing spaces;
- no tabs outside code;
- one physical source line per prose paragraph;
- blank lines between adjacent block structures where appropriate;
- `##` through `######` ATX headings only;
- no closing heading hashes;
- `-` unordered-list markers;
- sequential decimal ordered-list markers by default;
- asterisks for emphasis and strong emphasis;
- backticks for inline and fenced code;
- inline links rather than reference-style links;
- `marin-ref:<uuid>` for internal graph links;
- `marin-asset:<uuid>` for images;
- leading and trailing pipes in tables;
- `---` table delimiters without alignment colons;
- no hard-break syntax;
- no raw HTML.

Serialization MUST preserve semantic meaning rather than source typography.

Therefore these inputs may legitimately serialize differently after import:

```markdown
* item
```

and:

```markdown
+ item
```

Both canonicalize to:

```markdown
- item
```

Likewise:

```markdown
_emphasis_
```

canonicalizes to:

```markdown
*emphasis*
```

Byte-for-byte round-trip preservation is not a Marin Learn requirement.

Semantic round-trip preservation is required.

---

## 31. Editor behavior

A Marin Learn WYSIWYG editor MUST treat this profile as its serialization contract.

The editor MUST NOT expose formatting controls for syntax that the profile prohibits.

The editor MUST NOT store its vendor-specific document JSON as canonical Marin Learn content.

The recommended editing pipeline is:

```text
Marin Learn Markdown
→ parser
→ normalized Marin Learn/editor AST
→ WYSIWYG editing
→ normalized AST
→ Marin Learn serializer
→ canonical Markdown
```

Paste operations SHOULD convert supported semantic structures and discard unsupported presentation styling.

Examples:

```text
Word bold
→ strong emphasis

Word bullet list
→ Markdown unordered list

font-family styling
→ discarded

font size
→ discarded

text color
→ discarded

arbitrary HTML class
→ discarded
```

The editor SHOULD surface a validation message rather than silently discard unsupported semantic content that cannot be represented in the Marin Learn Markdown profile.

---

## 32. Accessibility requirements

Markdown syntax is only an authoring representation. Renderers MUST create accessible semantic output.

At minimum:

- headings MUST render as a valid hierarchical heading structure;
- unordered lists MUST render as semantic lists;
- ordered lists MUST render as semantic ordered lists;
- block quotations MUST render as quotations;
- code blocks MUST remain text and must not execute;
- table headers MUST render as semantic column headers;
- images MUST render with the authored contextual `alt` value;
- decorative images MUST render with an empty `alt` attribute and MUST NOT acquire an accessible name from unrelated asset metadata;
- links MUST have the authored link text as their accessible name unless the target format requires an equivalent accessible treatment.

A renderer MUST NOT infer missing alternative text from the asset filename, title, caption, or surrounding text.

---

## 33. Security requirements

Markdown source, including imported Markdown, MUST be treated as untrusted input.

Renderers MUST NOT rely solely on a Markdown library's default safety behavior.

Implementations MUST:

- disable or reject raw HTML;
- validate link schemes;
- resolve packaged assets rather than loading arbitrary image URLs;
- reject executable URL schemes;
- prevent script execution from code blocks;
- escape rendered text appropriately for the output target;
- avoid assigning untrusted rendered strings directly to `innerHTML` unless the complete rendering pipeline is designed and audited for safe HTML output;
- sanitize any HTML encountered during import before attempting conversion to supported Markdown.

SVG image assets require separate package-level sanitization and security rules. The fact that an SVG is referenced through valid Markdown does not make the SVG payload trusted.

---

## 34. Validation severity

### 34.1 Errors

The following MUST be validation errors:

- raw HTML;
- H1 headings;
- Setext headings;
- skipped heading levels;
- unsupported Markdown extensions that parse as structural content;
- unsafe link schemes;
- malformed `marin-ref:` references;
- unresolved `marin-ref:` references;
- malformed `marin-asset:` references;
- unresolved `marin-asset:` references;
- `marin-asset:` references to objects that are not ImageObjects;
- remote or relative Markdown image destinations;
- meaningful images with no alternative text;
- invalid table structure;
- table alignment markers;
- hard line-break syntax;
- frontmatter in ContentUnit Markdown files.

An empty image description is not an error; it is the explicit decorative-image representation.

### 34.2 Warnings

Implementations SHOULD warn about:

- `http:` links where HTTPS may be expected;
- excessive list nesting;
- unusually long content that may be better divided into multiple reusable ContentUnits;
- empty tables;
- link text that is likely ambiguous, such as `click here` or `read more`;
- Markdown constructs that are supported but likely inappropriate for the particular field being edited.

---

## 35. Valid example

````markdown
MarinOS applications use shared standards and components so applications behave consistently.

## Core principles

- Use common interface patterns.
- Reuse shared components.
- Prefer small, focused applications.

## App Shell example

The **Marin App Shell** supplies common application structure. Review the [App Shell concept](marin-ref:550e8400-e29b-41d4-a716-446655440000) for more detail.

![Diagram showing shared shell components surrounding an application](marin-asset:6ba7b810-9dad-11d1-80b4-00c04fd430c8)

| Element | Purpose |
| --- | --- |
| Header | Identifies the application |
| Footer | Provides standard informational links |

```text
Application
→ App Shell
→ shared MarinOS behavior
```
````

---

## 36. Invalid example

The following source contains multiple Marin Learn violations:

```markdown
# App Shell

<div class="callout">Important</div>

### Skipped heading

- [x] Complete this task

[More][more]

[more]: https://example.gov/

![Remote image](https://example.gov/image.png)

| Name | Value |
| :--- | ---: |
| A | 1 |

Text with a hard break.\
Next line.
```

Violations include:

- H1 heading;
- raw HTML;
- heading hierarchy skip;
- task-list extension;
- reference-style link;
- remote image;
- table alignment syntax;
- explicit hard line break.

---

## 37. ContentUnit authoring guidance

Although the Markdown profile can represent substantial documents, a ContentUnit SHOULD remain a focused reusable instructional object.

A ContentUnit SHOULD generally:

- address one concept, task, example, reference topic, summary, note, or warning;
- make sense when rendered outside the material where it was first created;
- avoid dependencies on phrases such as `as noted above` or `in the next section` unless the relationship is genuinely stable;
- use internal `marin-ref:` links when an explicit relationship to another reusable object is necessary;
- keep its canonical title in JSON-LD `name`, not in the Markdown file;
- provide a Schema.org `abstract` when practical, particularly when the content may be reused in presentation slides.

The `abstract` is not part of the Markdown body and is governed by `marin-learn-v1.schema.json`.

---

## 38. Presentation use

A Slide may reference a ContentUnit using one of the schema-defined display modes:

```text
full
abstract
title
```

For `full`, the presentation renderer consumes the ContentUnit's Marin Learn Markdown.

For `abstract`, it consumes the ContentUnit's Schema.org `abstract`, not an automatically truncated Markdown body.

For `title`, it consumes the ContentUnit's `name`.

The Markdown serializer MUST NOT create separate presentation-specific copies of canonical narrative solely to shorten slide content.

Speaker notes use the full Marin Learn Markdown profile defined here.

---

## 39. Assessment use

Assessment prompts, options, hints, explanations, and feedback use this same Markdown profile.

Renderers MUST preserve the semantics of allowed formatting without permitting Markdown to interfere with assessment mechanics.

For example:

- links inside an answer option do not change the option's identifier;
- images inside an option resolve through `marin-asset:` like any other image;
- formatting does not determine correctness;
- `marin:correctResponse` in the JSON-LD graph remains the sole source of truth for correctness.

---

## 40. Conformance requirements

A **Marin Learn Markdown parser** conforms to v1 when it:

1. implements the supported syntax in this specification;
2. rejects or reports prohibited structural syntax;
3. validates stable references;
4. does not enable undeclared Markdown extensions;
5. produces a semantic structure suitable for normalized rendering.

A **Marin Learn Markdown serializer** conforms to v1 when it:

1. emits only syntax allowed by this specification;
2. follows the canonical serialization rules;
3. preserves supported semantics;
4. emits stable `marin-ref:` and `marin-asset:` references;
5. produces repeatable output for the same normalized content model.

A **Marin Learn Markdown renderer** conforms to v1 when it:

1. renders only supported semantic structures;
2. resolves graph and asset references safely;
3. produces accessible target-format semantics;
4. does not execute authored content;
5. does not depend on arbitrary HTML embedded in Markdown.

A **Marin Learn editor** conforms to v1 when it:

1. can import and preserve valid Marin Learn Markdown;
2. prevents or clearly reports creation of invalid syntax;
3. treats the editor's internal format as non-canonical;
4. exports canonical Marin Learn Markdown;
5. handles meaningful and decorative image alternative text according to this specification.

---

## 41. Recommended conformance test areas

Automated tests SHOULD cover at least:

- paragraphs;
- each heading level;
- heading-level validation;
- nested ordered and unordered lists;
- emphasis and strong emphasis;
- inline code containing Markdown punctuation;
- fenced code containing backticks;
- block quotations;
- table parsing and normalization;
- escaped table pipes;
- safe external links;
- rejected unsafe links;
- `marin-ref:` resolution;
- `marin-asset:` resolution;
- meaningful image alternative text;
- decorative images;
- rejected remote images;
- rejected raw HTML;
- rejected task lists;
- rejected reference links;
- rejected table alignment;
- rejected hard breaks;
- JSON-string Markdown;
- Markdown-file round trips;
- deterministic serialization.

A key round-trip test is:

```text
valid source
→ parse
→ normalize
→ serialize
→ parse
→ compare semantic trees
```

The semantic trees MUST be equivalent.

---

## 42. Versioning

This document defines the Markdown profile for `marin-learn/v1`.

A package declaring the Marin Learn v1 schema MUST be interpreted using this Markdown v1 profile.

Backward-incompatible Markdown changes require a new Marin Learn schema/profile version.

A future version may add syntax such as additional media or structured educational elements, but a v1 implementation MUST NOT silently enable those features in advance.

---

## 43. Reference specifications

Marin Learn Markdown v1 uses these specifications as reference material:

- CommonMark 0.31.2: `https://spec.commonmark.org/0.31.2/`
- GitHub Flavored Markdown specification, specifically the table extension: `https://github.github.com/gfm/`
- Marin Learn v1 JSON Schema: `marin-learn-v1.schema.json`

CommonMark and GFM define parsing behavior where incorporated by this profile. Marin Learn defines the narrower allowed feature set, stable-reference rules, normalization requirements, accessibility requirements, and security requirements.
