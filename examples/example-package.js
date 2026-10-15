import { JSONLD_CONTEXT, SCHEMA_VERSION } from '../js/core/constants.js';
import { ref } from '../js/core/utils.js';

const id = (number) => `urn:uuid:10000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const assetUuid = '10000000-0000-4000-8000-000000000090';

export function createExamplePackage() {
  const objects = [];
  const push = (object) => { objects.push(object); return object; };

  const root = push({
    '@id': id(1),
    '@type': ['LearningResource', 'marin:LearningSet'],
    identifier: 'marinos-foundations',
    name: 'MarinOS Foundations',
    abstract: 'A concise introduction to MarinOS principles, shared components, accessibility, and maintainable delivery.',
    description: 'Reference learning set demonstrating the complete Marin Learn v1 package model.',
    schemaVersion: SCHEMA_VERSION,
    inLanguage: 'en-US',
    version: '1.0.0',
    dateCreated: '2026-10-08',
    dateModified: '2026-10-08',
    creativeWorkStatus: 'published',
    educationalLevel: 'introductory',
    educationalUse: ['orientation', 'self-study'],
    publisher: { '@type': 'Organization', name: 'County of Marin' },
    license: 'CC BY 4.0'
  });

  const objectiveSet = push({
    '@id': id(2),
    '@type': ['DefinedTermSet'],
    identifier: 'learning-objectives',
    name: 'Learning objectives',
    description: 'Objectives for the MarinOS Foundations learning set.',
    hasDefinedTerm: [ref(id(3)), ref(id(4)), ref(id(5)), ref(id(6))]
  });

  const objectives = [
    push({ '@id': id(3), '@type': ['DefinedTerm'], identifier: 'explain-marinos', name: 'Explain what MarinOS is and why it exists.', inDefinedTermSet: ref(objectiveSet['@id']) }),
    push({ '@id': id(4), '@type': ['DefinedTerm'], identifier: 'explain-app-shell', name: 'Explain the role of the Marin App Shell.', inDefinedTermSet: ref(objectiveSet['@id']), 'marin:parentObjective': ref(id(3)) }),
    push({ '@id': id(5), '@type': ['DefinedTerm'], identifier: 'apply-single-source', name: 'Apply the single-source principle to documents, quizzes, and slides.', inDefinedTermSet: ref(objectiveSet['@id']), 'marin:parentObjective': ref(id(3)) }),
    push({ '@id': id(6), '@type': ['DefinedTerm'], identifier: 'recognize-quality-standards', name: 'Recognize accessibility, security, and maintainability as default quality requirements.', inDefinedTermSet: ref(objectiveSet['@id']), 'marin:parentObjective': ref(id(3)) })
  ];

  const contentDefinitions = [
    [10, 'what-is-marinos', 'What is MarinOS?', 'overview', 'MarinOS is a shared approach for building small, consistent, maintainable County web applications.', [3]],
    [11, 'core-principles', 'Core principles', 'key-points', 'MarinOS favors focused applications, shared standards, open technologies, and content that can be maintained.', [3, 5, 6]],
    [12, 'app-shell', 'The Marin App Shell', 'concept', 'The App Shell provides shared application structure, identity, navigation, status, and policy links.', [4]],
    [13, 'single-source-content', 'Single-source learning content', 'concept', 'Canonical content is written once and assembled into reading, quiz, and presentation experiences.', [5]],
    [14, 'accessibility-security', 'Accessibility and security by default', 'concept', 'Accessibility and security are built into authoring, validation, rendering, and package handling.', [6]],
    [15, 'authoring-workflow', 'A practical authoring workflow', 'procedure', 'Authors create objectives, reusable content, materials, questions, and slides, then validate and export one package.', [3, 4, 5, 6]]
  ];
  const contentUnits = contentDefinitions.map(([number, identifier, name, type, abstract, teaches]) => push({
    '@id': id(number),
    '@type': ['LearningResource', 'marin:ContentUnit'],
    identifier,
    name,
    abstract,
    learningResourceType: type,
    teaches: teaches.map((objective) => ref(id(objective))),
    encoding: { '@type': 'MediaObject', contentUrl: `content/${identifier}.md`, encodingFormat: 'text/markdown' }
  }));

  const sectionOverview = push({
    '@id': id(20), '@type': ['CreativeWork', 'marin:Section'], identifier: 'foundations', name: 'Foundations',
    'marin:contentSequence': list([10, 11, 12])
  });
  const sectionPractice = push({
    '@id': id(21), '@type': ['CreativeWork', 'marin:Section'], identifier: 'putting-it-into-practice', name: 'Putting it into practice',
    'marin:contentSequence': list([13, 14, 15])
  });
  const material = push({
    '@id': id(22),
    '@type': ['LearningResource', 'marin:LearningMaterial'],
    identifier: 'marinos-foundations-guide',
    name: 'MarinOS Foundations Guide',
    abstract: 'A short guide to the architecture and working methods used by MarinOS.',
    learningResourceType: 'guide',
    educationalUse: ['instruction', 'self-study'],
    educationalLevel: 'introductory',
    timeRequired: 'PT15M',
    teaches: objectives.map((objective) => ref(objective['@id'])),
    'marin:contentSequence': list([20, 21])
  });

  const gradeScale = push({
    '@id': id(30), '@type': ['marin:GradeScale'], identifier: 'standard-letter-grade', name: 'Standard letter grade',
    'marin:gradeBands': [
      { name: 'A', minPercent: 90, 'marin:message': 'Excellent. You can now explain MarinOS without using the phrase “it is basically a website template.”' },
      { name: 'B', minPercent: 80, 'marin:message': 'Strong work. A brief review will close the remaining gaps.' },
      { name: 'C', minPercent: 70, 'marin:message': 'You passed. Review the explanations before presenting this material to others.' },
      { name: 'D', minPercent: 60, 'marin:message': 'Close, but the shared architecture deserves another look.' },
      { name: 'F', minPercent: 0, 'marin:message': 'Review the guide and try again. The App Shell has not taken this personally.' }
    ]
  });

  const questionDefinitions = [
    { n: 40, key: 'marinos-definition', prompt: 'Which statement best describes MarinOS?', objective: 3, source: 10, correct: 0, options: ['A shared approach for building consistent County web applications', 'A commercial learning-management platform', 'A replacement for the County network operating system', 'A collection of unrelated design mockups'] },
    { n: 41, key: 'app-shell-purpose', prompt: 'What is the primary purpose of the Marin App Shell?', objective: 4, source: 12, correct: 1, options: ['Store every application’s data in one central database', 'Provide shared application structure and interface behavior', 'Replace accessibility testing', 'Generate County policies automatically'] },
    { n: 42, key: 'single-source-result', prompt: 'What is the main benefit of single-source learning content?', objective: 5, source: 13, correct: 2, options: ['Every output can use a different visual identity', 'Authors can bypass validation', 'Documents, quizzes, and slides reuse the same canonical material', 'The package no longer needs stable identifiers'] },
    { n: 43, key: 'formatting-control', prompt: 'Why does Marin Learn restrict fonts, colors, and arbitrary layout controls?', objective: 5, source: 13, correct: 0, options: ['Presentation belongs to stable renderers rather than individual content copies', 'Browsers cannot display custom colors', 'Markdown does not support words', 'Quiz questions require plain text only'] },
    { n: 44, key: 'accessibility-default', prompt: 'Which practice best reflects accessibility by default?', objective: 6, source: 14, correct: 3, options: ['Add alt text only after publication', 'Use drag-and-drop with no keyboard alternative', 'Permit arbitrary heading levels', 'Require accessible image decisions and validate heading structure during authoring'] },
    { n: 45, key: 'package-processing', prompt: 'Where does Marin Learn package processing occur in the initial implementation?', objective: 6, source: 14, correct: 1, options: ['On an external content-processing service', 'Locally in the user’s browser', 'Only in a learning-management system', 'Inside a proprietary desktop program'] },
    { n: 46, key: 'workflow-order', prompt: 'Which sequence best matches the recommended authoring workflow?', objective: 3, source: 15, correct: 2, options: ['Export, create content, add objectives, validate', 'Create slides first, then copy their text into documents', 'Create objectives and content, assemble outputs, validate, and export', 'Publish first and resolve broken references later'] }
  ];

  const questionIds = [];
  let optionCounter = 100;
  for (const definition of questionDefinitions) {
    const optionIds = [];
    definition.options.forEach((text, index) => {
      const optionId = id(optionCounter++);
      optionIds.push(optionId);
      push({
        '@id': optionId,
        '@type': ['CreativeWork', 'marin:ResponseOption'],
        identifier: `${definition.key}-${String.fromCharCode(97 + index)}`,
        text,
        'marin:feedback': index === definition.correct ? 'Correct.' : 'Not quite. Review the linked source content.'
      });
    });
    const question = push({
      '@id': id(definition.n),
      '@type': ['CreativeWork', 'marin:AssessmentItem'],
      identifier: definition.key,
      name: definition.prompt,
      text: definition.prompt,
      assesses: [ref(id(definition.objective))],
      isBasedOn: [ref(id(definition.source))],
      'marin:interactionType': 'single-select',
      'marin:options': listIds(optionIds),
      'marin:correctResponse': [ref(optionIds[definition.correct])],
      'marin:explanation': 'The source material explains the principle and how it is applied in MarinOS.',
      'marin:shuffleOptions': true
    });
    questionIds.push(question['@id']);
  }

  const trueOption = push({ '@id': id(150), '@type': ['CreativeWork', 'marin:ResponseOption'], identifier: 'true', text: 'True', 'marin:feedback': 'Correct. Canonical content is reused through references.' });
  const falseOption = push({ '@id': id(151), '@type': ['CreativeWork', 'marin:ResponseOption'], identifier: 'false', text: 'False', 'marin:feedback': 'Incorrect. Reuse is a primary Marin Learn design goal.' });
  const trueFalse = push({
    '@id': id(47), '@type': ['CreativeWork', 'marin:AssessmentItem'], identifier: 'reuse-true-false', name: 'Reuse principle',
    text: 'True or false: A slide deck should normally reference canonical ContentUnits instead of maintaining a separate copy of the instructional text.',
    assesses: [ref(id(5))], isBasedOn: [ref(id(13))],
    'marin:interactionType': 'true-false',
    'marin:options': listIds([trueOption['@id'], falseOption['@id']]),
    'marin:correctResponse': [ref(trueOption['@id'])],
    'marin:explanation': 'True. Presentation-specific notes and layout metadata are separate, but the instructional content remains canonical.',
    'marin:shuffleOptions': false
  });
  questionIds.push(trueFalse['@id']);

  const quiz = push({
    '@id': id(31),
    '@type': ['LearningResource', 'marin:Assessment'],
    identifier: 'marinos-foundations-quiz',
    name: 'MarinOS Foundations Quiz',
    abstract: 'A scored knowledge check covering the core MarinOS principles.',
    learningResourceType: 'quiz',
    educationalUse: ['assessment'],
    interactivityType: 'active',
    isBasedOn: [ref(material['@id'])],
    assesses: objectives.map((objective) => ref(objective['@id'])),
    'marin:itemSequence': weightedList(questionIds),
    'marin:selectionPolicy': { mode: 'all', shuffle: true },
    'marin:scoringPolicy': { method: 'weighted-sum', passingPercent: 70, gradeScale: ref(gradeScale['@id']) },
    'marin:feedbackPolicy': { timing: 'after-assessment', showCorrectResponses: true, showOptionFeedback: true, showExplanation: true }
  });

  const slides = [
    push({ '@id': id(60), '@type': ['CreativeWork', 'marin:Slide'], identifier: 'title-slide', name: 'MarinOS Foundations', 'marin:layout': 'title', 'marin:speakerNotes': 'Open by asking participants where inconsistent application behavior creates avoidable work.' }),
    push(slide(61, 'what-is-marinos-slide', 'What is MarinOS?', 'content', [[10, 'abstract']], 'Emphasize that MarinOS is an operating model and shared platform, not a commercial product.')),
    push(slide(62, 'core-principles-slide', 'Core principles', 'content', [[11, 'full']], 'Connect each principle to reduced maintenance and clearer governance.')),
    push(slide(63, 'app-shell-slide', 'The Marin App Shell', 'media', [[12, 'abstract']], 'Use the diagram to distinguish shared shell behavior from app-specific content and logic.')),
    push(slide(64, 'single-source-slide', 'Write once, assemble many ways', 'content', [[13, 'abstract']], 'Point out that quizzes reference the source rather than repeating the answer text.')),
    push(slide(65, 'quality-slide', 'Quality is part of the workflow', 'split', [[14, 'abstract']], 'Accessibility and security checks belong before export, not after publication.')),
    push(slide(66, 'workflow-slide', 'Author, validate, export', 'content', [[15, 'full']], 'Close with the practical workflow and show the package as the portable source of truth.'))
  ];
  const presentation = push({
    '@id': id(67),
    '@type': ['PresentationDigitalDocument', 'marin:Presentation'],
    identifier: 'marinos-foundations-slides',
    name: 'MarinOS Foundations Slides',
    abstract: 'Presentation version of the MarinOS Foundations Guide.',
    learningResourceType: 'presentation',
    isBasedOn: [ref(material['@id'])],
    'marin:slideSequence': listIds(slides.map((entry) => entry['@id']))
  });

  const asset = push({
    '@id': `urn:uuid:${assetUuid}`,
    '@type': ['MediaObject', 'ImageObject'],
    identifier: 'marin-learn-flow',
    name: 'Marin Learn single-source flow',
    description: 'Diagram showing canonical content flowing to reading, quiz, and slide renderers.',
    contentUrl: 'assets/marin-learn-flow.svg',
    encodingFormat: 'image/svg+xml',
    width: 960,
    height: 480,
    license: 'CC BY 4.0'
  });

  root['marin:startResource'] = ref(material['@id']);
  root.hasPart = objects.filter((object) => object !== root).map((object) => ref(object['@id']));

  const contentFiles = {
    'content/what-is-marinos.md': `MarinOS is a shared approach for building small County web applications that are consistent, accessible, secure, and maintainable.\n\nIt combines reusable interface components, technical standards, documented practices, and a common delivery model. Each application remains focused on a specific business need.\n\n![Canonical content flows to reading, quiz, and slide experiences](marin-asset:${assetUuid})\n`,
    'content/core-principles.md': `MarinOS applications follow a small set of practical principles:\n\n- Build focused applications around a clear user need.\n- Reuse shared interface and policy components.\n- Prefer open, vendorable technologies.\n- Keep deployment simple and predictable.\n- Treat accessibility, security, and plain language as default requirements.\n- Store canonical content once and assemble it into different experiences.\n`,
    'content/app-shell.md': `The Marin App Shell supplies common application structure and behavior. It establishes recognizable identity while leaving application-specific content and workflows under the application's control.\n\n## Shared responsibilities\n\nThe shell can provide navigation, application identity, release status, standard informational links, managed icons, and common visual behavior.\n\n## Application responsibilities\n\nEach application still owns its business rules, data handling, content, validation, and security decisions. Shared structure does not remove application accountability.\n`,
    'content/single-source-content.md': `Marin Learn stores instructional narrative in reusable ContentUnits. A learning material, quiz, or slide deck references those units rather than maintaining an independent copy.\n\n| Output | How it uses canonical content |\n| --- | --- |\n| Reading view | Renders the full ordered material |\n| Quiz | Links questions to the source content and objective |\n| Slides | Uses a ContentUnit title, abstract, or full body |\n\nThis does not prohibit presentation-specific information. Speaker notes, slide layouts, and question feedback have distinct purposes and remain separate.\n`,
    'content/accessibility-security.md': `Accessibility and security are enforced throughout the workflow rather than treated as optional cleanup.\n\n- The editor restricts unsupported formatting.\n- Images require meaningful alternative text or an explicit decorative decision.\n- Heading structure and references are validated.\n- Imported ZIP files, Markdown, links, and SVG assets are treated as untrusted input.\n- Export is blocked while errors would make the package invalid or unsafe.\n\n> A stable renderer cannot compensate for unsafe or structurally invalid source content.\n`,
    'content/authoring-workflow.md': `1. Define what the learner should know or be able to do.\n2. Create focused reusable ContentUnits.\n3. Assemble the ContentUnits into a learning material.\n4. Create questions that assess objectives and identify their source content.\n5. Assemble slides from the same ContentUnits.\n6. Resolve validation errors and review warnings.\n7. Export the portable Marin Learn package.\n`
  };

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 480" role="img" aria-labelledby="title desc"><title id="title">Marin Learn single-source flow</title><desc id="desc">Canonical learning content flows to reading, quiz, and slide renderers.</desc><rect width="960" height="480" rx="32" fill="#f4f7f9"/><rect x="70" y="145" width="250" height="190" rx="24" fill="#ffffff" stroke="#123b5d" stroke-width="6"/><text x="195" y="215" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="#123b5d">Canonical</text><text x="195" y="255" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="#123b5d">content</text><text x="195" y="300" text-anchor="middle" font-family="Arial, sans-serif" font-size="20" fill="#34495e">Markdown + JSON-LD</text><path d="M335 240H470" stroke="#123b5d" stroke-width="8" stroke-linecap="round"/><path d="M450 218l28 22-28 22" fill="none" stroke="#123b5d" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/><rect x="500" y="45" width="390" height="100" rx="20" fill="#ffffff" stroke="#2d6a4f" stroke-width="5"/><rect x="500" y="190" width="390" height="100" rx="20" fill="#ffffff" stroke="#2d6a4f" stroke-width="5"/><rect x="500" y="335" width="390" height="100" rx="20" fill="#ffffff" stroke="#2d6a4f" stroke-width="5"/><text x="695" y="107" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="#2d6a4f">Reading view</text><text x="695" y="252" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="#2d6a4f">Quiz</text><text x="695" y="397" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="#2d6a4f">Slides</text><path d="M480 240C465 170 475 100 500 95M480 240H500M480 240c-15 70-5 140 20 145" fill="none" stroke="#123b5d" stroke-width="6"/></svg>`;
  const svgBytes = new TextEncoder().encode(svg);
  asset.contentSize = String(svgBytes.byteLength);

  return {
    editorStateVersion: 1,
    graphDocument: { '@context': structuredClone(JSONLD_CONTEXT), '@graph': objects },
    contentFiles,
    assetFiles: { 'assets/marin-learn-flow.svg': { bytes: svgBytes, type: 'image/svg+xml', originalName: 'marin-learn-flow.svg' } },
    packageWarnings: [],
    packageName: 'marinos-foundations.zip'
  };
}

function list(numbers) {
  return listIds(numbers.map(id));
}

function listIds(ids) {
  return { '@type': 'ItemList', itemListElement: ids.map((value, index) => ({ '@type': 'ListItem', position: index + 1, item: ref(value) })) };
}

function weightedList(ids) {
  return { '@type': 'ItemList', itemListElement: ids.map((value, index) => ({ '@type': 'ListItem', position: index + 1, item: ref(value), 'marin:weight': index % 3 === 0 ? 2 : 1 })) };
}

function slide(number, identifier, name, layout, content, notes) {
  return {
    '@id': id(number), '@type': ['CreativeWork', 'marin:Slide'], identifier, name, 'marin:layout': layout,
    'marin:contentSequence': {
      '@type': 'ItemList',
      itemListElement: content.map(([contentId, mode], index) => ({ '@type': 'ListItem', position: index + 1, item: ref(id(contentId)), 'marin:displayMode': mode }))
    },
    'marin:speakerNotes': notes
  };
}
