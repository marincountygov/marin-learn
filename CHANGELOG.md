# Changelog

Tracks changes to `marin-app-template` itself — repository structure, starter shell, scaffolding, and documentation. This is separate from `platform.shell` in `marin.yml`, which pins the vendored Marin App Shell runtime.

Existing applications do not automatically inherit these changes. Template changes only affect projects created after the change; see `TEMPLATE_VERSION` and the README's "Project manifest and versions" section.

## Unreleased

- Clean up the Marin Learn catalog and course pages: `shapes` app icon, a Search heading and a Courses heading, MarinOS-style cards whose title is the link, no resource badges, and breadcrumbs (`Catalog / Course`) in place of back buttons.
- Course pages show **Notes**, **Deck**, and **Quiz** cards with icons. Every viewer page ends with a Help section (Coaching, Training, Workshops; placeholder links for now).
- Hide course levels for now (filter and badges). Rename the home list to Catalog, move the breadcrumb above the content on Notes, Deck, and Quiz pages, show "On this page" in a right-hand column on Notes, and add a Sources section from a material's `citation` or `isBasedOn` lists. Help cards have icons. Notes pages hide Download PDF for now, add a Share button that copies the link, and show Deck and Quiz cards below the notes. Notes are titled `<Course> notes` and their descriptions are general.
- Add theme pages (`?theme=data`) that list a theme's courses. Theme badges on course cards and course pages link to them, and the homepage has a Themes section with a badge for every theme.
- Refresh the quiz results card: `square-sparkles` icon and quiz name above the result, grade and percent as `A / 100%`, "You passed!" in a clear green (also used for Correct badges and correct choices) and "You did not pass" in red, no points line, no separate title box, and a Share button that copies the result with a link to the course page.
- Add seven themes in `themes.json`. A course names its themes in its `about` list; `scripts/publish.py` checks them and writes them to `catalog.json`. The catalog has a Theme filter and shows themes on each card.
- Retitle courses in sentence case, drop "County Leader's", rename MarinOS Foundations to MarinOS 101, and shorten card descriptions to 15 words or fewer.
- Fix project-status false positives for valid URL-valued licenses on learning resources and assets, and show a clear “No issues found” success state when validation is clean.
- Replace all browser-native JavaScript prompt, confirmation, and alert interactions in Marin Learn Authoring with one shared native HTML `<dialog>` and normal form component.
- Add inline required-field validation, safe destructive confirmations, deterministic keyboard/focus behavior, responsive light/dark styling, a native-dialog regression guard, browser coverage, and editor dialog documentation.
- Preserve existing model, persistence, package, Markdown, asset, quiz, slide, and export operations while converting affected UI control flow to asynchronous form results.

## 2.0.2

- Update `marin.yml`'s starter `project.status` from `prototype` to `alpha`, matching MarinOS's new app status enum (`alpha`/`beta`/`live`) — see `marin-os`'s `#status` page. `prototype` is no longer a recognized value.

## 2.0.1

- Update the vendored Marin App Shell from 1.0.1 to 1.1.1 and pin `platform.shell: 1.1.1`.
- Synchronize the shell-managed local font and Lucide icon assets using the App Shell installer while preserving template-owned assets and application scaffolding.
- Adopt the App Shell 1.1.1 installer behavior that updates an existing `marin.yml` `platform.shell` value as part of the validated, rollback-protected installation.
- Update starter and developer documentation to reflect the current shell installation and upgrade workflow.
- Keep the existing Marin App Shell component structure, starter placeholders, CSP/referrer-policy metadata, security tooling, and application-specific CSS/JavaScript unchanged.
- This is a maintenance update to the template. Existing applications continue to upgrade their pinned Marin App Shell independently.

## 2.0.0

- Replace copied banner, header, navigation, information sections, footer, and Feedback markup with the five Marin App Shell web components. Preserve the `APP_*` starter placeholders and app-owned About/Accessibility content.
- Vendor the unmodified Marin App Shell 1.0.1 distribution and pin `platform.shell: 1.0.1`. The shell includes the Pico/shared UI baseline and the header identity link to `./`.
- Remove the legacy `shared/` runtime, standalone Pico stylesheet, `BRAND_VERSION`, and unused starter icon files. Keep existing font assets and security reporting/review metadata unchanged.
- Load the shell before the app with deferred scripts. Keep `#start` as the default workflow, add a JavaScript-disabled message, and let the shell create standard navigation and status infrastructure.
- Rewrite starter/developer/agent guidance for component-owned markup and versioned shell upgrades. Add license notices and structural, integrity, and optional browser checks.
- Emit static CSP and referrer-policy meta tags from `security.json` before resource loading. Add explicit shell feed and data-image allowances, keep script/style/font sources local, and retain the documented header-only gaps.
- Add an idempotent security-meta emitter, read-only consistency checks, offline regression tests, and browser CSP enforcement probes.
- This is a breaking starter-layout change, not a required version migration for already deployed apps. Existing apps upgrade their pinned shell independently.

## 1.2.1

- Expand the standard footer into local-app navigation: plain-text app name plus **About**, **Security**, **Accessibility**, and **Updates**, with **MarinOS** on its own line.
- Keep the informational destinations as hash-routed sections within `index.html`; add the standard `#accessibility` section alongside the existing About, Updates, and Security sections.
- Keep **About** and **Updates** in the application header navigation and remove the default **Start** header item.
- Add responsive footer styles in `shared/app-brand.css`.

## 1.2.0

- Add security setup so new apps start compliant with the MarinOS security standard: a starter `security.json` (the `internal` profile, with `APP_OWNER` placeholders), `SECURITY.md`, a generated `.well-known/security.txt`, a `#security` section wired to the shared renderer in `marin-ui` 1.18.0, an About → Security link, and a README "Security" section. Nothing here needs `APP_NAME`-style identity fields — `marin.yml` already owns identity.
- Add an empty `.nojekyll` file. Apps deployed from a branch (GitHub Pages' default "legacy" build) otherwise skip dot-folders, so `.well-known/security.txt` returned 404. Do not delete it.

## 1.1.0

- Add `marin.yml`, a machine-readable project manifest (owner, status, `marin-ui`/template versions) using the same `APP_NAME`/`APP_DESCRIPTION`/`APP_OWNER`/`APP_REPO` placeholder convention as `index.html` and `README.md`.
- Add `AGENTS.md`, documenting the template repo itself for anyone or any agent working on the template directly. New apps get their own app-shaped `AGENTS.md` as part of the build workflow, not a copy of this one — see `marin-skills/marin-app-builder/SKILL.md`.

## 1.0.0

- Initial template: starter `index.html` shell, `assets/app.css` and `assets/app.js`, vendored `marin-ui` bundle, `docs/development.md`, PR template.
