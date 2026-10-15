# Marin Learn Package v1

## 1. Status and purpose

This document defines the normative package format for Marin Learn v1.

A Marin Learn package is a portable ZIP archive containing:

- one authoritative structured metadata file named `learning.json`;
- zero or more Markdown narrative files under `content/`;
- zero or more binary or static media assets under `assets/`.

The package is designed to be:

- self-contained for Marin Learn instructional content;
- portable between conforming Marin Learn editors and renderers;
- independent of server-side storage;
- safe to inspect and validate before content is rendered;
- stable when human-readable filenames change;
- compatible with the Marin Learn v1 JSON Schema and Markdown profile.

This specification does not define the learner-facing HTML, quiz UI, slide UI, PDF output, or editor working-state format.

---

## 2. Normative language

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**, **SHOULD**, **SHOULD NOT**, **RECOMMENDED**, **MAY**, and **OPTIONAL** are normative requirements when written in uppercase.

Text that does not use those terms is explanatory unless the surrounding section states otherwise.

---

## 3. Companion specifications

A conforming Marin Learn v1 package MUST conform to all applicable requirements in:

1. `marin-learn-v1.schema.json`;
2. `MARKDOWN.md` for Marin Learn Markdown v1;
3. this package specification.

When requirements overlap, the more specific package-level rule applies to package structure, file resolution, ZIP handling, and import/export behavior.

This specification does not replace the JSON Schema or Markdown specification.

---

## 4. Package version

Marin Learn Package v1 corresponds to:

```text
schemaVersion: 1.0.0
```

The single `marin:LearningSet` object in `learning.json` MUST contain:

```json
"schemaVersion": "1.0.0"
```

A v1 consumer MUST reject a package whose declared `schemaVersion` is not supported.

A consumer MUST NOT silently interpret a newer schema version as v1.

An editor MAY offer a future migration workflow, but migration is outside this specification.

---

## 5. Package media and filename

The physical package format is a ZIP archive.

A canonical Marin Learn v1 package SHOULD use the filename extension:

```text
.zip
```

Example:

```text
marinos-foundations.zip
```

Marin Learn v1 does not define a custom package filename extension.

A future specification MAY define one without changing the internal package structure.

The package filename is not semantic and MUST NOT be used as the LearningSet identifier, title, or stable identity.

---

## 6. Canonical package structure

A canonical package has this structure:

```text
learning-set.zip
├── learning.json
├── content/
│   ├── content-unit-a.md
│   └── content-unit-b.md
└── assets/
    ├── image-a.png
    └── diagram.svg
```

`learning.json` is REQUIRED.

`content/` is REQUIRED only when one or more `marin:ContentUnit` objects reference Markdown files.

`assets/` is REQUIRED only when one or more packaged asset objects reference asset files.

Empty `content/` and `assets/` directories SHOULD NOT be emitted.

Directory entries themselves are not semantically significant. A ZIP archive MAY omit explicit directory entries as long as file paths are correct.

---

## 7. Root-level entries

The only canonical root-level entries in v1 are:

```text
learning.json
content/
assets/
```

A conforming v1 producer MUST NOT add unrelated files at the package root.

Examples of noncanonical root entries include:

```text
README.md
manifest.json
schema.json
preview.html
index.html
.DS_Store
__MACOSX/
```

The structured manifest is `learning.json`; no separate manifest file exists in v1.

Rendered derivatives such as HTML pages, PDFs, PowerPoint files, quiz result files, thumbnails, or cached previews MUST NOT be placed in the canonical package unless a future Marin Learn specification explicitly defines them.

---

## 8. Repair mode versus conforming packages

An editor MAY provide a non-normative repair mode for common user-created ZIP problems, such as:

- a single wrapping directory around the package;
- `.DS_Store` files;
- `__MACOSX/` metadata;
- harmless empty directories.

For example, an editor MAY recognize:

```text
marinos-foundations/
├── learning.json
├── content/
└── assets/
```

inside a ZIP and offer to import it after removing the wrapper.

Such an archive is not a conforming Marin Learn package until normalized.

A repaired export MUST use the canonical structure in this specification.

Repair mode MUST NOT be used to bypass security, schema, reference, or content-validation errors.

---

## 9. `learning.json`

`learning.json` is the authoritative structured metadata file for the package.

It MUST:

- appear at the ZIP root;
- be named exactly `learning.json`;
- be encoded as UTF-8;
- contain a JSON object;
- conform to `marin-learn-v1.schema.json`;
- contain the required `@context` and `@graph` properties;
- contain exactly one `marin:LearningSet` object;
- declare `schemaVersion` as `1.0.0`.

Canonical exports MUST use LF line endings.

Canonical exports SHOULD omit a UTF-8 byte order mark.

Canonical exports SHOULD end the file with one LF character.

---

## 10. JSON-LD context

For Marin Learn v1, `learning.json` MUST use the context required by the JSON Schema:

```json
"@context": [
  "https://schema.org",
  {
    "marin": "https://marincountygov.github.io/marin-learn/ns#"
  }
]
```

A Marin Learn editor or renderer MUST NOT require network access to resolve these contexts in order to open a package.

The application is expected to understand the Marin Learn v1 vocabulary locally.

A general-purpose JSON-LD processor MAY dereference remote contexts according to its own configuration, but that behavior is not required by Marin Learn.

---

## 11. Single graph model

All structured Marin Learn objects MUST reside in the single `@graph` array in `learning.json`.

The graph contains the authoritative structured representation of:

- the LearningSet;
- objective sets;
- learning objectives;
- educational audiences;
- ContentUnits;
- LearningMaterials;
- Sections;
- Assessments;
- AssessmentItems;
- ResponseOptions;
- GradeScales;
- Presentations;
- Slides;
- ImageObjects;
- MediaObjects.

V1 MUST NOT split those objects into additional structured JSON files.

---

## 12. Internal identity

Every graph object that requires an `@id` MUST use a valid UUID URN as defined by `marin-learn-v1.schema.json`.

Example:

```text
urn:uuid:550e8400-e29b-41d4-a716-446655440000
```

Canonical producers SHOULD serialize UUID hexadecimal digits in lowercase.

UUID identity is independent of:

- package filename;
- JSON array position;
- human-readable `identifier`;
- Markdown filename;
- asset filename.

Renaming a file MUST NOT cause the stable `@id` of the corresponding semantic object to change.

---

## 13. Human-readable identifiers

Schema-defined `identifier` values are human-readable lowercase slugs.

Example:

```text
app-shell
```

Identifiers are intended for:

- authoring interfaces;
- troubleshooting;
- debugging;
- readable filenames where practical.

They are not substitutes for `@id` references.

A producer SHOULD derive readable content filenames from the object's `identifier` where this does not create a collision.

Example:

```text
identifier: app-shell
contentUrl: content/app-shell.md
```

The filename MAY differ from the identifier.

---

## 14. Package paths

All package paths MUST:

- be relative to the ZIP root;
- use `/` as the path separator;
- use the ASCII path vocabulary permitted by the JSON Schema for `contentUrl`;
- contain no leading `/`;
- contain no backslash `\\`;
- contain no `.` or `..` path segment;
- contain no empty path segment;
- contain no drive-letter prefix;
- contain no NUL character;
- resolve within the package root.

Examples of invalid paths:

```text
/content/app-shell.md
content/../app-shell.md
content//app-shell.md
content\\app-shell.md
C:/content/app-shell.md
assets/../../outside.png
```

Package path comparison is case-sensitive at the semantic level.

However, a conforming producer MUST NOT create two paths that differ only by ASCII letter case.

This prevents collisions on case-insensitive filesystems.

An importer MUST treat case-only collisions as an error.

---

## 15. Duplicate ZIP entry names

A ZIP archive MUST NOT contain duplicate file-entry names.

A ZIP archive MUST NOT contain names that normalize to the same canonical package path.

A ZIP archive MUST NOT contain both a file and directory entry that conflict at the same path.

An importer MUST reject ambiguous duplicate entries rather than selecting one arbitrarily.

---

## 16. `content/` directory

All canonical narrative Markdown files MUST be stored under:

```text
content/
```

Nested directories MAY be used.

Examples:

```text
content/introduction.md
content/marinos/app-shell.md
content/accessibility/keyboard.md
```

Every ContentUnit Markdown path MUST:

- begin with `content/`;
- end with `.md`;
- satisfy the `safeContentPath` rule in the JSON Schema.

No other file type may be stored under `content/` in v1.

---

## 17. One ContentUnit per Markdown file

V1 uses this normative relationship:

> One `marin:ContentUnit` equals one canonical Markdown file.

Each `marin:ContentUnit` MUST have exactly one Schema.org `encoding` object whose:

```text
@type = MediaObject
encodingFormat = text/markdown
contentUrl = content/...md
```

The referenced Markdown file MUST exist in the ZIP.

A single Markdown file MUST NOT be the `contentUrl` of more than one ContentUnit.

Two ContentUnits that happen to contain identical prose still require distinct files unless they are in fact the same reusable ContentUnit.

---

## 18. Orphan Markdown files

Every `.md` file under `content/` MUST be referenced by exactly one ContentUnit in `learning.json`.

An unreferenced Markdown file under `content/` is a package validation error.

This rule prevents stale or accidental narrative files from becoming ambiguous package content.

---

## 19. Markdown conformance

Every ContentUnit Markdown file MUST conform to `MARKDOWN.md` for Marin Learn Markdown v1.

The package layer MUST NOT weaken Markdown rules.

In particular:

- raw HTML is prohibited;
- H1 headings are prohibited in ContentUnit files;
- internal object references use `marin-ref:<uuid>`;
- packaged image references use `marin-asset:<uuid>`;
- external image URLs are prohibited;
- Markdown frontmatter is prohibited.

---

## 20. `assets/` directory

All packaged asset bytes MUST be stored under:

```text
assets/
```

Nested directories MAY be used.

Examples:

```text
assets/app-shell.png
assets/diagrams/app-architecture.svg
assets/reference/policy.pdf
```

Every graph asset `contentUrl` MUST:

- begin with `assets/`;
- satisfy the `safeAssetPath` rule in the JSON Schema;
- resolve to a file that exists in the ZIP.

---

## 21. Asset graph objects

Every file under `assets/` MUST be represented by exactly one graph object that is a Schema.org `ImageObject` or `MediaObject` permitted by the v1 schema.

One asset graph object MUST reference exactly one packaged asset file through `contentUrl`.

Two graph asset objects MUST NOT reference the same packaged file.

An asset MAY exist in the package without being used by a ContentUnit, slide, or other resource.

Unused assets SHOULD produce a validation warning, not an error.

---

## 22. Orphan asset files

An asset file under `assets/` that is not represented by a graph ImageObject or MediaObject is a package validation error.

The editor SHOULD offer to remove such a file during repair or cleanup.

The editor MUST NOT silently promote an unknown asset file into the graph without creating explicit metadata for it.

---

## 23. Asset filenames and identity

Asset filenames are storage locations, not stable semantic identifiers.

For example:

```text
assets/app-shell-diagram.svg
```

may later become:

```text
assets/diagrams/app-shell.svg
```

without changing the asset object's `@id`.

Any rename MUST update the graph object's `contentUrl`.

Markdown content SHOULD continue to refer to the asset by stable `marin-asset:<uuid>` reference rather than by filename.

---

## 24. `marin-asset:` resolution

Markdown packaged-image references use:

```text
marin-asset:<uuid>
```

Example:

```markdown
![Diagram showing shared application structure](marin-asset:550e8400-e29b-41d4-a716-446655440000)
```

Resolution is:

```text
marin-asset:550e8400-e29b-41d4-a716-446655440000
        ↓
urn:uuid:550e8400-e29b-41d4-a716-446655440000
        ↓
matching ImageObject in @graph
        ↓
ImageObject.contentUrl
        ↓
assets/...
```

A `marin-asset:` reference MUST resolve to exactly one graph object.

That object MUST be an ImageObject.

Its `contentUrl` MUST resolve to exactly one packaged file.

---

## 25. `marin-ref:` resolution

Markdown internal links use:

```text
marin-ref:<uuid>
```

Example:

```markdown
Review the [App Shell concept](marin-ref:550e8400-e29b-41d4-a716-446655440000).
```

Resolution is:

```text
marin-ref:550e8400-e29b-41d4-a716-446655440000
        ↓
urn:uuid:550e8400-e29b-41d4-a716-446655440000
        ↓
matching object in @graph
```

The target object MUST exist and MUST be a type that the renderer can navigate to or represent meaningfully.

A broken `marin-ref:` is a validation error.

---

## 26. UUID reference normalization

A conforming exporter SHOULD emit lowercase UUID hexadecimal digits in:

- `@id` UUID URNs;
- `marin-ref:` values;
- `marin-asset:` values.

An importer MAY accept uppercase hexadecimal digits when they otherwise form a valid UUID and SHOULD normalize them on export.

Reference comparison SHOULD compare the UUID value rather than relying on source-text casing.

---

## 27. Media type metadata

Every graph ImageObject or MediaObject MUST declare `encodingFormat`.

`encodingFormat` SHOULD contain an IANA-style media type.

Examples:

```text
image/png
image/jpeg
image/webp
image/svg+xml
application/pdf
```

An importer MUST NOT rely solely on the filename extension to determine the media type.

Where practical, the importer SHOULD verify the declared type against file signatures or parsed content.

A known mismatch between declared `encodingFormat`, filename extension, and actual bytes is a validation error.

---

## 28. Core v1 image support

Conforming Marin Learn v1 editors and renderers SHOULD support these image media types:

```text
image/png
image/jpeg
image/gif
image/webp
image/svg+xml
```

Support for animated image behavior is not required. A renderer MAY display only the first frame or otherwise constrain animation for accessibility and usability.

Generic MediaObjects may use other safe static media types, but an implementation is not required to preview every media type.

A consumer that cannot render a recognized package asset SHOULD preserve it during load/export unless the user explicitly removes it.

---

## 29. Prohibited active asset content

A Marin Learn v1 package MUST NOT use an asset as a mechanism for packaged executable web content.

The following asset forms are prohibited as active package content:

- HTML documents intended to execute in the application origin;
- JavaScript or ECMAScript files intended for execution;
- WebAssembly modules intended for execution;
- browser extensions;
- executable binaries;
- script-bearing embedded documents intended to execute in an application frame.

A generic MediaObject MAY represent a safe downloadable document if the editor supports that workflow, but loading such a file MUST NOT grant it application-origin execution privileges.

---

## 30. SVG security

SVG is permitted because it is useful for diagrams, but it MUST be treated as untrusted active-capable content.

An importer or renderer MUST NOT insert untrusted SVG source directly into the application DOM using `innerHTML` or equivalent unsafe mechanisms.

Before an SVG is rendered, the implementation MUST either:

1. sanitize it using an allowlist appropriate for static images; or
2. render it through an isolation mechanism that prevents script execution, HTML embedding, and unsafe external resource loading.

A sanitizer MUST reject or remove at minimum:

- `script` elements;
- event-handler attributes such as `onclick`;
- `foreignObject`;
- unsafe external resource references;
- `javascript:` URLs;
- other executable or document-embedding constructs.

A producer MUST NOT export an SVG that fails the application's SVG safety validation.

Preserving a malicious SVG byte-for-byte and merely avoiding preview is not sufficient for a package that the editor declares valid for export.

---

## 31. External network dependencies

A Marin Learn package MUST be self-contained for:

- ContentUnit Markdown;
- packaged images referenced through `marin-asset:`;
- graph objects required to assemble materials, assessments, and presentations.

A package MAY contain ordinary external links, citations, `sameAs` relationships, license URLs, and other Schema.org properties whose semantics point to external resources.

Those links MUST NOT be required merely to parse, validate, or render the core packaged learning content.

A renderer MUST NOT automatically download arbitrary remote images or scripts from content.

---

## 32. LearningSet membership

The graph MUST contain exactly one `marin:LearningSet`.

The LearningSet represents the package as a semantic collection.

All canonical package objects MUST be reachable as members or dependencies of that LearningSet according to the Marin Learn object model, directly or indirectly.

A validator SHOULD warn about graph objects that are valid but unreachable from the LearningSet's effective content structure.

The package MUST NOT depend on ZIP directory location to determine semantic membership.

---

## 32A. Notes

A package MAY contain `marin:Note` and `marin:NoteSection` objects. A Note is a short, structured brief: a title, a short description, and ten ordered sections held as `marin:NoteSection` objects, listed in `marin:sectionSequence`. A deck or quiz points at a Note, or at one of its sections, with `isBasedOn` or `marin:contentSequence`. Character limits, item counts, section order, and the other rules are in `docs/notes/SPEC.md` and `schema/marin-learn-v1.schema.json`. Packages without Notes are unchanged.

## 33. Start resource

`marin:startResource` is optional.

When present, it MUST resolve to one of:

- `marin:LearningMaterial`;
- `marin:Assessment`;
- `marin:Presentation`.

When absent, a consumer SHOULD open the package collection overview or resource index.

A missing `marin:startResource` is not an error.

---

## 34. Graph reference integrity

Every internal `@id` reference MUST resolve according to the v1 schema and object model.

The importer MUST validate cross-object integrity after JSON Schema validation.

Examples include:

- `marin:startResource`;
- objective relationships;
- parent objectives;
- material sequences;
- nested sections;
- assessment item sequences;
- response options;
- correct responses;
- grade scales;
- slide sequences;
- slide content references;
- asset references.

A reference that resolves to the wrong object type is an error even if the UUID exists.

---

## 35. Object identity uniqueness

Every `@id` that identifies an internal graph object MUST be unique within the package.

A duplicate `@id` is an error.

`identifier` uniqueness MUST follow the category-specific validation rules in the JSON Schema and Marin Learn validator.

A producer MUST NOT rely on JSON object order to disambiguate duplicate identity.

---

## 36. ZIP compression methods

A canonical producer MUST use one of these ZIP entry compression methods:

- Stored / no compression;
- Deflate.

A producer SHOULD use Deflate for text and other compressible content.

A producer MAY store already-compressed media without additional compression.

Encrypted ZIP entries are prohibited.

Password-protected ZIP packages are not Marin Learn v1 packages.

---

## 37. ZIP encryption

A Marin Learn v1 package MUST NOT use:

- traditional ZIP encryption;
- AES ZIP encryption;
- encrypted filenames;
- any other archive-level encryption.

Confidentiality, when required, must be provided by the storage or transport environment rather than by the Marin Learn package format.

An importer MUST reject encrypted entries.

---

## 38. ZIP entry types

A Marin Learn package may contain regular files and optional directory entries only.

It MUST NOT contain:

- symbolic links;
- hard-link entries;
- device files;
- named pipes;
- sockets;
- filesystem metadata that causes extraction outside the package root.

An importer MUST reject such entries.

---

## 39. ZIP path traversal protection

An importer MUST validate every ZIP entry path before reading or extracting the entry.

It MUST reject any path that could escape the logical package root, including paths containing:

```text
..
absolute paths
backslashes used as separators
drive prefixes
NUL bytes
ambiguous encoded traversal forms
```

The importer MUST perform this validation before writing any extracted file to disk.

Browser-only implementations SHOULD process package entries in memory or isolated browser storage rather than extracting them to arbitrary filesystem locations.

---

## 40. ZIP bomb and resource-exhaustion protection

Importers MUST treat archive contents as untrusted.

An importer MUST enforce implementation-defined safety limits for at least:

- total number of ZIP entries;
- total uncompressed size;
- per-entry uncompressed size;
- excessive compression ratios;
- nested or malformed archive structures;
- JSON parse size;
- Markdown parse size;
- image dimensions where decoding could exhaust memory.

A package may be semantically valid yet exceed a particular implementation's safe resource limits.

In that case the importer MUST stop safely and report that the package exceeds supported limits.

The importer MUST NOT continue partial loading after a safety limit has been exceeded.

---

## 41. Nested archives

ZIP files or other archive files MAY exist as opaque MediaObject assets only if the application explicitly supports them as downloadable files.

They MUST NOT be recursively interpreted as part of the Marin Learn package structure.

The importer MUST NOT automatically extract nested archives.

---

## 42. ZIP metadata is non-semantic

The following ZIP metadata is not part of Marin Learn semantics:

- entry modification timestamps;
- archive comments;
- filesystem permissions;
- operating-system origin fields;
- compression level;
- entry ordering.

Consumers MUST NOT use ZIP metadata as authoritative learning-content metadata.

Dates such as `dateCreated`, `dateModified`, and `datePublished` belong in `learning.json`.

---

## 43. File ordering in the ZIP

ZIP entry order is non-semantic.

A producer SHOULD emit entries in this order for readability and deterministic tooling:

1. `learning.json`;
2. `content/` files sorted by package path;
3. `assets/` files sorted by package path.

A consumer MUST NOT depend on that physical order.

---

## 44. JSON serialization

JSON object property order is non-semantic.

Canonical Marin Learn exports SHOULD:

- use UTF-8;
- use two spaces for indentation;
- use LF line endings;
- avoid trailing whitespace;
- end with one LF;
- use lowercase UUID hexadecimal digits;
- serialize graph objects in a stable, implementation-defined order.

A RECOMMENDED graph order is:

1. LearningSet;
2. DefinedTermSet;
3. LearningObjectives;
4. EducationalAudiences;
5. ContentUnits;
6. LearningMaterials;
7. Sections;
8. Assessments;
9. AssessmentItems;
10. ResponseOptions;
11. GradeScales;
12. Presentations;
13. Slides;
14. ImageObjects;
15. MediaObjects.

Within a type, sorting by `identifier` is RECOMMENDED.

A consumer MUST NOT depend on graph order.

---

## 45. Markdown serialization

Canonical Markdown serialization is defined by `MARKDOWN.md`.

The package exporter MUST use that serialization when writing files under `content/`.

The package importer MUST treat the Markdown semantics, rather than original byte formatting, as authoritative.

Import followed by export may normalize whitespace, list markers, fenced-code delimiters, and other non-semantic Markdown details.

---

## 46. Asset byte preservation

Except where security normalization is explicitly required, a conforming editor SHOULD preserve asset bytes unchanged across import and export.

Examples where modification MAY be necessary include:

- SVG sanitization;
- explicit user image editing;
- file replacement;
- format conversion requested by the user.

If asset bytes change, metadata such as `contentSize`, dimensions, or `encodingFormat` MUST be updated when applicable.

---

## 47. `contentSize`

Schema.org `contentSize` is optional.

When a producer supplies it for a packaged asset, it SHOULD represent the actual packaged file size in bytes using a human-readable value.

Example:

```text
18432 bytes
```

A known mismatch SHOULD produce a warning and SHOULD be corrected on export.

`contentSize` MUST NOT be used as a security substitute for inspecting the actual ZIP entry size.

---

## 48. File-extension consistency

A producer SHOULD use conventional filename extensions consistent with `encodingFormat`.

Examples:

```text
image/png       → .png
image/jpeg      → .jpg or .jpeg
image/webp      → .webp
image/svg+xml   → .svg
application/pdf → .pdf
text/markdown   → .md
```

A known inconsistency between the declared media type, the actual bytes, and the filename extension MUST be reported during validation.

---

## 49. Package import transaction

Import MUST be transactional.

A failed import MUST NOT partially replace the currently open learning set.

The importer SHOULD use this sequence:

```text
select or drop ZIP
→ inspect archive metadata
→ enforce archive safety limits
→ validate entry paths and entry types
→ locate learning.json
→ parse learning.json
→ verify schema version
→ validate JSON Schema
→ index graph IDs and object types
→ validate cross-object references
→ validate contentUrl paths
→ load and validate Markdown
→ resolve marin-ref references
→ load and validate asset metadata
→ verify asset files and media types
→ resolve marin-asset references
→ perform SVG and active-content safety validation
→ perform semantic/package validation
→ report errors and warnings
→ commit the complete normalized package to editor state
```

The current learning set MUST remain unchanged until the import reaches the commit step.

---

## 50. Import error behavior

If any required import stage produces an error, the package MUST NOT become the active editable learning set as though it were valid.

The editor MAY offer:

- a read-only inspection mode;
- a repair workflow;
- detailed diagnostics.

It MUST clearly distinguish repaired or partially inspected content from a successfully imported conforming package.

---

## 51. Import warnings

Warnings MAY permit import.

Examples include:

- unused graph asset;
- ContentUnit without an objective mapping;
- ContentUnit without an `abstract`;
- missing optional duration;
- unrecognized but safe MediaObject preview type;
- noncanonical UUID letter casing;
- noncanonical but repairable ZIP wrapper directory.

Warnings MUST NOT be used for conditions that compromise security, reference integrity, or required content.

---

## 52. Package validation stages

A conforming validator SHOULD report failures by stage.

Recommended stages are:

```text
ZIP
Structure
JSON
Schema
Graph
Markdown
Assets
Security
Semantics
```

Example:

```text
Error [Assets]: assets/app-shell.png is referenced by no graph asset object.
```

This makes errors actionable for both business users and developers.

---

## 53. Package-level errors

The following are package errors:

- missing `learning.json`;
- more than one candidate `learning.json` at the root;
- unsupported schema version;
- invalid JSON;
- JSON Schema failure;
- more or fewer than one LearningSet;
- duplicate `@id`;
- unresolved required internal reference;
- internal reference resolving to an invalid object type;
- missing ContentUnit Markdown file;
- multiple ContentUnits referencing one Markdown file;
- orphan Markdown file;
- invalid Marin Learn Markdown;
- missing asset file;
- multiple asset graph objects referencing one asset file;
- orphan asset file;
- unresolved `marin-asset:`;
- `marin-asset:` resolving to a non-ImageObject;
- unsafe or prohibited active asset content;
- unsafe SVG that cannot be sanitized;
- ZIP path traversal;
- duplicate or ambiguous ZIP entries;
- encrypted ZIP entry;
- symbolic-link or device entry;
- active-content execution attempt;
- known media-type mismatch;
- case-only package-path collision.

---

## 54. Package-level warnings

The following are normally warnings:

- unused but properly represented graph asset;
- ContentUnit without an `abstract`;
- ContentUnit without `teaches`;
- objective without assessment coverage;
- optional metadata omitted;
- safe MediaObject that the current implementation cannot preview;
- noncanonical UUID hex casing;
- metadata such as `contentSize` that can be recomputed;
- recoverable OS-generated ZIP cruft discovered in repair mode.

Specific semantic warnings may also be defined by `marin-learn-v1.schema.json` and the Marin Learn validator.

---

## 55. Export preconditions

A producer MUST NOT label or export a package as conforming Marin Learn v1 if package validation contains errors.

Warnings MAY permit export.

Immediately before export, the producer MUST validate:

- the current normalized graph;
- all ContentUnit Markdown;
- all object references;
- all asset references;
- all asset files;
- package paths;
- media types;
- SVG safety;
- required schema and package invariants.

---

## 56. Package export algorithm

A canonical exporter SHOULD use this sequence:

```text
normalized editor model
→ normalize IDs and references
→ validate graph
→ serialize canonical learning.json
→ serialize canonical Markdown
→ validate Markdown output
→ collect referenced asset bytes
→ sanitize or reject unsafe SVG
→ update applicable asset metadata
→ verify path uniqueness
→ verify no orphan files
→ create ZIP using stored/deflate entries
→ run final package validation
→ provide ZIP to the user
```

The exported ZIP MUST be independently re-importable without relying on editor-local state.

---

## 57. Export filename

The editor SHOULD derive the suggested package filename from the LearningSet `identifier`.

Example:

```text
identifier: marinos-foundations
```

Suggested filename:

```text
marinos-foundations.zip
```

The user MAY choose another package filename without changing package semantics.

---

## 58. Editor-only state

Editor working state MUST NOT be serialized into the canonical package unless it is part of the Marin Learn schema.

Examples of editor-only state include:

- currently selected navigation item;
- expanded/collapsed panels;
- cursor position;
- editor undo stack;
- browser-local recovery timestamps;
- IndexedDB record identifiers;
- temporary upload state;
- unsaved dialogs;
- drag-and-drop state;
- preview zoom level.

Such state may be stored locally by the editor but is not portable Marin Learn content.

---

## 59. Runtime learner data

Learner-specific runtime data MUST NOT be written into the canonical package.

Examples include:

- learner names;
- quiz attempts;
- scores;
- completion status;
- answer selections;
- timestamps of learner activity;
- xAPI statements;
- enrollment information.

The package contains learning content, not learner records.

---

## 60. Derived rendering output

The following are derived outputs and are not canonical package source:

- rendered HTML;
- generated navigation;
- generated tables of contents;
- quiz interface HTML;
- calculated score maxima;
- rendered slide HTML;
- PDFs;
- PowerPoint files;
- image thumbnails;
- search indexes;
- public Schema.org metadata projections.

A tool MAY generate these from a package, but MUST NOT treat them as replacements for the canonical graph, Markdown, and assets.

---

## 61. Canonical versus physical identity

Semantic identity MUST remain stable when physical storage changes.

For example, this rename:

```text
content/app-shell.md
→
content/platform/app-shell.md
```

requires updating only the ContentUnit's `encoding.contentUrl`.

It MUST NOT require changing:

- the ContentUnit `@id`;
- assessment `isBasedOn` references;
- objective mappings;
- `marin-ref:` links that target the ContentUnit;
- slides that reference the ContentUnit.

The same rule applies to asset filename changes.

---

## 62. Package updates

A tool updating an existing package SHOULD preserve stable `@id` values for existing semantic objects.

It MUST NOT regenerate all UUIDs merely because the package was imported and re-exported.

New objects receive new UUIDs.

Deleted objects MUST NOT have their UUIDs reassigned to unrelated future objects.

This identity rule is required for durable reuse and cross-object references.

---

## 63. Content deletion

When a referenced semantic object is deleted, the exporter MUST NOT leave broken references.

The editor must resolve deletion through one of these approaches before export:

- prevent deletion while references remain;
- remove the references explicitly;
- replace the references with another valid target.

Silent creation of broken references is prohibited.

---

## 64. Asset deletion

An asset file and its graph object are one package-level resource pair.

Deleting an asset through the editor SHOULD remove both after references have been resolved.

An exporter MUST NOT leave:

- an asset graph object whose file is missing; or
- an asset file whose graph object is missing.

---

## 65. Package renaming and copying

Copying or renaming the ZIP file does not create a new semantic LearningSet.

If a user explicitly duplicates a learning set in the editor to create a distinct learning resource, the editor SHOULD generate a new LearningSet `@id` and SHOULD provide a deliberate policy for whether nested object identities are reused or duplicated.

That duplication workflow is an editor function and is not defined by Package v1.

---

## 66. No implicit filesystem semantics

Folder names under `content/` and `assets/` are organizational only.

They MUST NOT implicitly define:

- learning hierarchy;
- material sections;
- objective hierarchy;
- slide grouping;
- audience;
- status;
- publication order.

Those relationships belong in `learning.json`.

---

## 67. No implicit filename semantics

A consumer MUST NOT infer object type or instructional meaning from filenames.

For example:

```text
content/summary.md
```

is not necessarily a `learningResourceType` of `summary` unless the corresponding ContentUnit says so.

Filenames are storage labels only.

---

## 68. Unknown package entries

A strict v1 validator MUST report unknown canonical-package entries as errors unless they are explicitly handled by repair mode.

A future package version may define new top-level locations.

A v1 consumer MUST NOT assume that unknown files are harmless merely because they are not referenced by `learning.json`.

---

## 69. Forward compatibility

The `schemaVersion` is authoritative for determining the content model version.

A v1 consumer encountering a later version MUST:

1. avoid destructive interpretation;
2. report the unsupported version;
3. leave the package unchanged unless an explicit migration process is available.

Unknown future properties MUST NOT simply be deleted and re-exported as v1.

---

## 70. Backward compatibility

A future schema version may define a migration from v1.

V1 itself does not define historical predecessor formats.

Import from non-Marin formats such as arbitrary Markdown, DITA, QTI, H5P, or office documents is an editor conversion workflow, not Marin Learn package conformance.

---

## 71. Integrity and checksums

Marin Learn v1 does not define a separate package checksum manifest.

ZIP entry integrity metadata may be used by the ZIP implementation to detect corruption but is not a Marin Learn semantic field.

A future version MAY define signed manifests or cryptographic package integrity if required.

---

## 72. Digital signatures

Marin Learn v1 does not define a package-signing format.

A package MAY be distributed through an externally signed or authenticated transport, repository, or document-management system.

Such signatures are outside the package semantics.

---

## 73. Licensing

Licensing information belongs in Schema.org metadata in `learning.json`.

A v1 package does not require a separate `LICENSE` file.

A producer SHOULD populate applicable `license`, copyright, credit, and attribution fields when source or asset licensing requires them.

A separate `LICENSE` file at the ZIP root is noncanonical in v1.

---

## 74. Accessibility metadata

Accessibility claims belong in the appropriate CreativeWork objects in `learning.json`.

The package itself MUST NOT infer accessibility claims merely because it passed structural validation.

For example, an exporter MUST NOT automatically assert:

```text
accessibilityFeature: alternativeText
```

unless the relevant content has actually been checked to support that claim.

Package validation and accessibility conformance are related but distinct.

---

## 75. Image alternative text

Alternative text for a packaged image is contextual and belongs in the Markdown usage, not the asset object's global metadata.

The same ImageObject MAY be used in multiple ContentUnits with different appropriate alternative text.

The package validator MUST therefore validate each Markdown image usage independently.

An empty alt value is valid only when the authoring workflow explicitly established that the specific image usage is decorative according to `MARKDOWN.md`.

---

## 76. Presentation assets

A Presentation or Slide may reference ContentUnits and packaged media according to the Marin Learn object model.

Presentation-specific rendering MUST NOT require a second copy of an image or ContentUnit merely because it appears in slides.

The same graph asset object and asset file SHOULD be reused when the underlying media is identical.

---

## 77. Assessment content

Assessment prompts, option text, feedback, hints, explanations, and speaker notes that use Markdown are stored inside `learning.json` as strings according to the schema.

They MUST conform to the applicable Markdown profile in `MARKDOWN.md`.

They do not receive separate Markdown files in Package v1.

Only ContentUnit narrative bodies are externalized into `content/*.md`.

---

## 78. Package portability

A conforming package MUST be portable without preserving the original host filesystem.

It MUST NOT contain references such as:

```text
C:\\Users\\...
/home/user/...
file:///...
../outside-package/...
```

for canonical ContentUnit or asset storage.

Local source paths used during authoring must be removed before export.

---

## 79. Browser-only operation

Package v1 is intentionally compatible with browser-only tools.

A browser editor must be able to:

- read the ZIP;
- validate `learning.json`;
- parse Markdown;
- load assets;
- edit the normalized model;
- export a new ZIP;

without a backend service.

The package format MUST NOT require POSIX permissions, symbolic links, filesystem extended attributes, or server-side processing.

---

## 80. Conformance classes

This specification defines three conformance roles.

### 80.1 Producer

A conforming Producer creates Marin Learn v1 packages.

It MUST:

- emit the canonical package structure;
- validate before export;
- produce schema-conforming `learning.json`;
- produce conforming Markdown;
- emit safe package paths;
- avoid orphan files;
- preserve reference integrity;
- reject unsafe exported content.

### 80.2 Consumer

A conforming Consumer reads Marin Learn v1 packages.

It MUST:

- treat input as untrusted;
- validate ZIP safety before use;
- validate the schema version;
- validate `learning.json`;
- validate cross-object references;
- validate Markdown and assets before rendering;
- avoid partial transactional import;
- reject unsafe active content.

### 80.3 Validator

A conforming Validator evaluates a package against:

- ZIP/container rules;
- path rules;
- JSON Schema;
- graph integrity;
- Markdown conformance;
- asset/file correspondence;
- media-type consistency;
- security requirements;
- Marin Learn semantic rules.

One application may implement all three roles.

---

## 81. Minimal valid package

A minimal package may contain only:

```text
minimal.zip
└── learning.json
```

provided that `learning.json` contains a valid graph with exactly one valid LearningSet and no objects that require external ContentUnit or asset files.

This can represent an initially empty learning set being authored.

---

## 82. Typical package example

```text
marinos-foundations.zip
├── learning.json
├── content/
│   ├── what-is-marinos.md
│   ├── core-principles.md
│   └── app-shell.md
└── assets/
    ├── marinos-overview.svg
    └── app-shell-diagram.png
```

`learning.json` contains, for example:

```text
1 LearningSet
1 DefinedTermSet
3 LearningObjectives
3 ContentUnits
1 LearningMaterial
10 AssessmentItems
40 ResponseOptions
1 Assessment
12 Slides
1 Presentation
2 ImageObjects
```

The Markdown and image bytes are physically separate, while all semantic relationships remain in one graph.

---

## 83. Content path example

Graph object:

```json
{
  "@type": [
    "LearningResource",
    "marin:ContentUnit"
  ],
  "@id": "urn:uuid:550e8400-e29b-41d4-a716-446655440000",
  "identifier": "app-shell",
  "name": "The Marin App Shell",
  "learningResourceType": "concept",
  "encoding": {
    "@type": "MediaObject",
    "contentUrl": "content/app-shell.md",
    "encodingFormat": "text/markdown"
  }
}
```

Package entry:

```text
content/app-shell.md
```

The physical path and semantic identity are related only through `encoding.contentUrl`.

---

## 84. Asset path example

Graph object:

```json
{
  "@type": [
    "MediaObject",
    "ImageObject"
  ],
  "@id": "urn:uuid:6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  "identifier": "app-shell-diagram",
  "name": "App Shell diagram",
  "contentUrl": "assets/app-shell-diagram.png",
  "encodingFormat": "image/png"
}
```

Package entry:

```text
assets/app-shell-diagram.png
```

Markdown usage:

```markdown
![Diagram showing the App Shell around shared application components](marin-asset:6ba7b810-9dad-11d1-80b4-00c04fd430c8)
```

---

## 85. Canonical import/export round trip

A required regression scenario is:

```text
valid package A
→ import
→ normalize
→ export package B
→ import package B
→ compare semantic model
```

Package A and B do not need to be byte-identical.

They MUST be semantically equivalent for supported v1 content except for intentionally normalized representation such as:

- Markdown whitespace;
- UUID letter casing;
- ZIP metadata;
- JSON property order;
- JSON indentation;
- safe SVG normalization;
- recomputed metadata such as `contentSize`.

---

## 86. Required package conformance tests

A Marin Learn implementation SHOULD include automated tests for at least:

1. valid minimal package;
2. valid package with content and assets;
3. missing `learning.json`;
4. unsupported schema version;
5. malformed JSON;
6. JSON Schema failure;
7. duplicate LearningSet;
8. duplicate `@id`;
9. unresolved graph reference;
10. wrong-type graph reference;
11. missing Markdown file;
12. orphan Markdown file;
13. two ContentUnits sharing one Markdown file;
14. invalid Markdown;
15. raw HTML in Markdown;
16. unresolved `marin-ref:`;
17. missing asset file;
18. orphan asset file;
19. two graph assets sharing one asset path;
20. unresolved `marin-asset:`;
21. `marin-asset:` pointing to a non-ImageObject;
22. declared media-type mismatch;
23. unsafe SVG;
24. ZIP path traversal;
25. duplicate ZIP entry;
26. case-only path collision;
27. encrypted ZIP entry;
28. symbolic-link ZIP entry;
29. wrapper-directory repair mode;
30. OS-cruft repair mode;
31. package resource-limit failure;
32. transactional import rollback;
33. import/export semantic round trip;
34. stable UUID preservation after rename;
35. stable asset reference after asset filename change;
36. stable ContentUnit reference after Markdown filename change.

---

## 87. Recommended package diagnostics

Diagnostics SHOULD identify:

- severity;
- validation stage;
- package path where applicable;
- graph object `@id` where applicable;
- human-readable object `identifier` or `name` where available;
- concise problem description;
- suggested correction where safe to provide.

Example:

```text
Error [Markdown]
ContentUnit: app-shell
File: content/app-shell.md
The file contains an H1 heading. ContentUnit titles are stored in learning.json; begin internal headings at H2.
```

---

## 88. Security boundary

Opening a Marin Learn package is a data-import operation, not a code-installation operation.

No package file may be granted code execution merely because it appears in a valid ZIP or is referenced by valid graph metadata.

Consumers must maintain this boundary for:

- Markdown;
- SVG;
- generic MediaObjects;
- links;
- future extension data.

---

## 89. Versioning this specification

This document defines Package v1 for Marin Learn schema version `1.0.0`.

Editorial corrections that do not change conformance behavior MAY be made without changing the schema version.

A change that alters any of the following requires an explicit versioning decision:

- required package paths;
- required files;
- ZIP security requirements;
- path semantics;
- `learning.json` model;
- ContentUnit file relationship;
- asset relationship;
- compatibility guarantees.

---

## 90. Summary of normative invariants

A conforming Marin Learn v1 package has these core invariants:

1. It is a non-encrypted ZIP archive.
2. `learning.json` exists at the archive root.
3. Structured metadata exists in one JSON-LD-style `@graph`.
4. Exactly one `marin:LearningSet` exists.
5. The LearningSet declares `schemaVersion: 1.0.0`.
6. Every internal object identity is stable and references resolve.
7. Each ContentUnit has exactly one packaged Markdown file.
8. Each packaged Markdown file belongs to exactly one ContentUnit.
9. Markdown conforms to Marin Learn Markdown v1.
10. Each packaged asset file has exactly one graph asset object.
11. Each graph asset object resolves to exactly one packaged asset file.
12. Markdown uses stable `marin-ref:` and `marin-asset:` UUID references.
13. Package paths are safe, relative, and collision-free.
14. Unsafe executable content is prohibited.
15. Import is transactional and treats package contents as untrusted.
16. Export occurs only after required validation passes.
17. ZIP metadata and filenames are not semantic identity.
18. Learner state and editor-local state are not part of the package.
19. Derived renderings are not canonical source content.
20. The package can be re-imported without relying on the original editor or filesystem.
