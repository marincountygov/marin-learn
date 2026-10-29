// Marin Learn - Copy HTML and plain text to the clipboard through the shell's helpers
// (marinCopyRich, marinCopyText): clean HTML with no page styles. The caller shows a visible
// text box when this returns false, so the reader can copy by hand.
export async function copyRich(html, text) {
  return window.marinCopyRich(text, `<html><body>${html}</body></html>`);
}

export async function copyText(text) {
  return window.marinCopyText(text);
}
