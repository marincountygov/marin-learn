# Marin Learn Notes - SPEC.md

**Status:** Approved plan. Phases 2 (schema and validation), 3 (viewer), and the Data 101 Note from phase 6 are implemented. Problem and Solution sections were added after Why it matters. The editor (phase 4), re-basing the Data 101 deck and quiz, and final testing are not.
**Pilot:** Data 101. Schema 101 and MarinOS 101 keep their current notes until Notes content is supplied for them.

The Note's title is stored without the word notes (limit 60). The page heading and the copied title add it: a Note titled "Data 101" is headed "Data 101 notes".

A **Note** is a short, structured brief that helps County executives and staff understand a topic, ask better questions, and apply what they learn. A Note replaces the old free-form Reading Material as the thing a course's **Notes** card opens. The Reading Material type stays valid so existing packages keep working.

## 1. Structure

Thirteen parts: the title, then twelve sections in this order. All character limits count characters (code points) including spaces.

| Part | Content | Limit | Items |
|---|---|---|---|
| Title (`name`) | Text | 60 | |
| Short description (`abstract`) | Card text | 120 | |
| Overview | Plain text | 600 | |
| Why it matters | Points | 150 each | 3 to 5 |
| Problem | Plain text | 300 | |
| Solution | Plain text | 300 | |
| User stories | Stories | 200 each | 3 to 4 |
| Key terms | Term (50), definition (120) | | 6 to 10 |
| Do's and don'ts | Do (100), don't (100) | | 4 to 6 |
| Questions to ask | Questions | 150 each | 5 to 8 |
| Examples | Title (100), HTTPS URL; optional Code subsection of up to 3 samples (title 100, language 20, code 1,500) | | 1 to 6 links or samples, or hidden |
| Checklist | Items | 125 each | 5 to 8 |
| Mantras | Statements | 60 each | 3 to 5 |
| Sources (`learnMore`) | Title (100), HTTPS URL | | 1 to 5, or hidden |

Examples and Sources are optional. An absent section is hidden. URLs must be valid HTTPS URLs with no length limit.

### Section standards

Every section follows the writing standards: plain language at grade 6 or lower, active voice, sentence case, and a reader who is a County executive or staff member. Name unfamiliar terms the first time they appear. Prefer government examples.

| Section | Purpose | Standard |
|---|---|---|
| Overview | Say what the topic is and why a busy reader should care | Short paragraphs. Define the topic in the first sentence. No more than 600 characters. |
| Why it matters | Give the benefits | 3 to 5 points. Each states a result for people or for government. Do not repeat the Problem. |
| Problem | Name the gap or risk the topic addresses | One to three plain sentences, up to 300 characters. Say who is affected and what goes wrong. Describe the situation, not a person to blame. Do not include the answer. Back any figure with a link under Sources. |
| Solution | Say how the topic closes that gap | One to three plain sentences, up to 300 characters. Answer the Problem directly. Start with an action and use active voice. Do not promise results. It should match the Do's and don'ts and the Checklist. |
| User stories | Show who benefits | 3 to 4 stories in the form "As a [role], I want [need], so I can [result]." |
| Key terms | Teach the words the reader will hear | 6 to 10 terms. Define each in plain words, in 120 characters or fewer. No term in its own definition. |
| Do's and don'ts | Give clear actions | 4 to 6 pairs. Each Do and Don't is about the same action. Start Do with a verb. |
| Questions to ask | Equip the reader to ask | 5 to 8 questions a leader could ask in a meeting. Each is open and answerable. |
| Examples | Show real use | 1 to 6 real examples that the owner supplies, each with a title and an HTTPS link. When code helps the reader, add a Code subsection of up to 3 samples. Code is a short, accurate sample in a County setting (for example a service request), uses sample data and never real records, states its language, and is checked: a sample record must follow the sample schema next to it. Hidden when empty. Real examples are never invented. |
| Checklist | Let the reader check their work | 5 to 8 items. Each is a statement the reader can mark true or false. |
| Mantras | Make the point memorable | 3 to 5 statements of 60 characters or fewer. Each is an imperative. |
| Sources | Point to the pages the Note is based on | Up to 5 links to authoritative pages. Reference material, not implementations. Hidden when empty. |

### Code samples

Only the Examples section may hold code (`marin:code`). Each sample has a title, an optional language label such as `json`, and the code as plain text. On the page the samples sit under a Code heading, scroll sideways when a line is long, can be reached with the keyboard, and have a Copy code button. Copy note includes them. On slides they come before the links because the Markdown list parser swallows anything that follows a list. A section needs at least one link or one sample.

## 2. Graph model

A Note is two kinds of object in the existing `@graph`. Nothing here replaces the package schema.

- `marin:Note` (a `LearningResource`): `name`, `abstract`, `audience`, `inLanguage`, `creativeWorkStatus`, and `marin:sectionSequence`, an ordered list of references to its sections.
- `marin:NoteSection` (a `CreativeWork`): a stable UUID, `name`, `marin:sectionType`, and either `marin:text` (the overview) or `marin:items`.

The overview, problem, and solution are plain text (`marin:text`); every other section holds `marin:items`. Note text is short plain strings in the graph, not Markdown. This is allowed because the text is limited and not narrative.

## 3. How Notes tie into quizzes and decks

| From | Property | To |
|---|---|---|
| Learning set | `hasPart`, `marin:startResource` | Note |
| Note | `marin:sectionSequence` | its NoteSections |
| Deck (`Presentation`) | `isBasedOn` | the Note |
| Slide | `marin:contentSequence` | NoteSections, display mode `full` or `title` |
| Slide | `marin:itemRange` (`first`, `last`, 1-based) | splits a long section across slides |
| Slide | `marin:codeRange` (`first`, `last`, 1-based) | shows chosen code samples of an Examples section |
| Quiz (`Assessment`) | `isBasedOn` | the Note |
| Quiz question | `isBasedOn` | one or more NoteSections |

References, never copies, so editing a Note updates its deck and quiz sources. `abstract` display mode is not allowed for a NoteSection. `marin:itemRange` is allowed only for a NoteSection and must stay inside it.

Schema.org: `name` is the title. Examples and Sources are authored once, inside their sections. At publication they can be written out as `mentions` and `citation`; they are not authored twice.

## 3A. Building a deck from a Note

`node scripts/build_note_deck.mjs packages/<name>.zip` replaces the package's slide deck with slides built from its Note, and `js/core/note-deck.js` holds the rules. The deck points at the Note's sections. It never copies Note text, so run the script again after the Note changes. The result is the same every time, with stable slide IDs.

- **Word budget:** 45 words per slide. A section that needs more than one slide is split into slides of about the same size. Key terms and Do's and don'ts take at most 4 items per slide, and other sections at most 6. A single long item still gets its own slide.
- **One slide only:** the Checklist, User stories, and Questions to ask each stay on one slide, whatever the word budget.
- **Key terms** use at most three slides. If the word budget would need more, the terms are spread evenly over three.
- **Slides:** a title slide with the Note's title, then each section in order. Problem and Solution share one split slide. Empty sections are skipped. There are no divider slides, and no slide of its own for Examples links and code unless the section has them. Sources comes last.
- **Titles:** the section name in sentence case, with the part when a section splits, such as "Key terms (2 of 4)". Titles are unique.
- **Mantras** use the content layout. The quote layout reads as one large quotation and suits a list poorly.
- **Code:** Examples links and each code sample get their own slides. A slide shows one sample with `marin:codeRange`. A range on either `marin:itemRange` or `marin:codeRange` shows only the chosen parts. Code samples must stay within about 14 lines so they fit a slide.
- **Speaker notes** start empty.
- **Coverage:** every item, text block, and code sample appears on exactly one slide.
- The deck's `isBasedOn` points at the Note.

## 3B. Quizzes from a Note

A quiz has **at most 10 questions** in total. The JSON Schema, the validator, and the publish script all enforce it, and the editor will stop adding questions at 10. A quiz therefore asks every question, in a shuffled order, and the old random subset from a larger bank is no longer used. A quiz of 10 or fewer that still sets a random pick gets a warning.

The Data 101 and Schema 101 quizzes are authored in `source/quizzes/*.json` and built with `node scripts/build_note_quiz.mjs packages/<name>.zip source/quizzes/<name>.json`, which also removes the earlier reading material, content blocks, objectives, and Markdown files that nothing refers to any more.

- **Size and score:** exactly 10 questions, 1 point each, passing at 70%. Named "<title> — quiz".
- **Blueprint:** Why it matters 1, Problem 1, Solution 1, Key terms 3, Do's and don'ts 2, Questions to ask 1, Checklist 1. Overview, User stories, Examples, Mantras, and Sources are not quizzed.
- **Mix:** 8 single-choice and 2 true or false (one true, one false). No multiple-choice (select all) questions.
- **Source:** each question points at exactly one Note section, and the quiz points at the Note. Questions need no learning objective because Notes have none.
- **Standards for a question:** the question, its hint, and its choices talk about the topic ("data", "a schema"), never about "the notes" or a section; plain language at grade 6 or lower (checked as a warning); four choices for single-choice; no "all of the above"; the right answer is not always in the same place; answers come only from the Note's own text; a hint, and an explanation that names the section.
- **Results page:** each question's Source links to that section of the notes, and a Sections to review list links to the sections of the questions that were missed.

## 4. Validation

- **JSON Schema** enforces character limits, maximum item counts, HTTPS URLs, complete pairs, and which fields each section may have.
- **The validator** (`js/core/validate.js`) and **the publish script** (`scripts/publish.py` with `scripts/note_validate.py`) enforce section order, one section per type, required sections, and minimum counts. These are errors on a published Note and warnings on a draft. Limit messages name the field and how far over it is.
- **Writing advice** is a warning, never an error: reading level above grade 6 and Title Case in the Note title.
- **Coverage** is one warning per quiz or deck listing the Note sections it does not use.
- The limits live in the schema. `NOTE_SECTIONS` in `js/core/constants.js` mirrors them, and a test keeps the two in step. Python reads the schema directly.

## 5. Decisions

- The schema version stays 1.0.0. Notes are an additive type.
- Reading level target: grade 6.
- The checklist is interactive but keeps nothing. Checked items are not saved, and nothing says "completed". (Local storage was approved and then removed.)
- Examples are provided by the Marin Learn owner. With none, the section is hidden. No examples or citations are invented.
- Build order: schema, viewer, editor, catalog, Data 101 content, testing.
- There is no PDF export for Notes.

## 6. Phases

1. Assessment (done).
2. Schema and validation (done): schema types, validator, publish checks, sample Note, tests.
3. Viewer (done): the Note page on the Notes layout, checklist, copy and print, slide and PowerPoint conversion for sections (a section becomes generated Markdown), quiz source names, Notes counts in the catalog, and the course Notes card showing the Note instead of old reading material.
4. Editor: the Note form, "Create deck from this Note", and a source-section picker for quiz questions.
5. Catalog: the Notes card opens a Note when the course has one.
6. Data 101 content: the Note, then a deck and quiz re-based on its sections. The owner approves the text and the old-block-to-new-section mapping. The old Data 101 notes text is archived outside the package.
7. Testing and documentation.
