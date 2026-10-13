Accessibility and security are enforced throughout the workflow rather than treated as optional cleanup.

- The editor restricts unsupported formatting.
- Images require meaningful alternative text or an explicit decorative decision.
- Heading structure and references are validated.
- Imported ZIP files, Markdown, links, and SVG assets are treated as untrusted input.
- Export is blocked while errors would make the package invalid or unsafe.

> A stable renderer cannot compensate for unsafe or structurally invalid source content.
