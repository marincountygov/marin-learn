#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
RUN_BROWSER=0
case "${1:-}" in
  '') ;;
  --browser) RUN_BROWSER=1 ;;
  -h|--help)
    printf 'Usage: bash scripts/check.sh [--browser]\n'
    exit 0
    ;;
  *) printf 'Unknown option: %s\n' "$1" >&2; exit 2 ;;
esac
if [[ $# -gt 1 ]]; then
  printf 'Usage: bash scripts/check.sh [--browser]\n' >&2
  exit 2
fi
command -v python3 >/dev/null 2>&1 || {
  printf 'ERROR: Python 3 is required for application checks.\n' >&2
  exit 1
}

bash -n "$ROOT_DIR/scripts/check.sh"
python3 "$ROOT_DIR/scripts/sync-security-meta.py" --check
python3 "$ROOT_DIR/tests/validate_template.py"
python3 "$ROOT_DIR/tests/test_brand_icons.py"
python3 "$ROOT_DIR/tests/test_security_meta.py"
python3 "$ROOT_DIR/tests/test_publish.py"
python3 "$ROOT_DIR/tests/test_notes_publish.py"
python3 "$ROOT_DIR/scripts/check_published.py"
python3 "$ROOT_DIR/tests/test_pptx_ci.py"

if command -v node >/dev/null 2>&1; then
  while IFS= read -r -d '' file; do
    node --check "$file"
  done < <(find "$ROOT_DIR/assets" "$ROOT_DIR/editor/assets" "$ROOT_DIR/js" "$ROOT_DIR/vendor/marinos" "$ROOT_DIR/vendor/marin-sortable" "$ROOT_DIR/vendor/pptxgenjs" -type f -name '*.js' -print0)
  node --test "$ROOT_DIR"/tests/*.test.mjs
  python3 "$ROOT_DIR/tests/test_pptx_release.py"
  printf 'JavaScript syntax and unit tests: PASS\n'
else
  printf 'SKIP: Node is unavailable; JavaScript syntax and unit tests were not checked.\n' >&2
fi

if [[ "$RUN_BROWSER" == 1 ]]; then
  python3 "$ROOT_DIR/tests/browser_editor_dialog_component.py"
  python3 "$ROOT_DIR/tests/browser_smoke.py"
  python3 "$ROOT_DIR/tests/browser_viewer_landing_cards.py"
  python3 "$ROOT_DIR/tests/browser_themes.py"
  python3 "$ROOT_DIR/tests/browser_quiz_results.py"
  python3 "$ROOT_DIR/tests/browser_notes.py"
  python3 "$ROOT_DIR/tests/browser_note_decks.py"
  python3 "$ROOT_DIR/tests/browser_security.py"
  python3 "$ROOT_DIR/tests/browser_editor_smoke.py"
  python3 "$ROOT_DIR/tests/browser_editor_dialogs.py"
  python3 "$ROOT_DIR/tests/browser_editor_reorder.py"
  python3 "$ROOT_DIR/tests/browser_presentation_semantics.py"
  python3 "$ROOT_DIR/tests/browser_pptx_export.py"
else
  printf 'SKIP: Browser tests not requested; run with --browser to include them.\n'
fi
printf 'Requested checks completed successfully.\n'
