# Marin Sortable

`marin-sortable.js` is a small app-local, dependency-free ES module for handle-based pointer and touch reordering. It is stored as a vendored helper so applications can load it directly without a CDN or build step.

The helper provides:

- Pointer Events support for mouse, pen, and touch input.
- Handle-only dragging.
- Shared and nested sortable lists.
- A visible insertion indicator and named drop target.
- Viewport auto-scroll while dragging.
- Escape and pointer-cancel handling.

The helper intentionally does **not** make drag-and-drop the only reordering method. Every consumer must provide visible, keyboard-operable move commands. It is covered by the repository's root MIT license.
