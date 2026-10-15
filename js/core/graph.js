// Marin Learn - Core Graph Loader and Indexer
export function hasType(obj, typeName) {
  const t = obj && obj['@type'];
  const matches = (item) => {
    if (!item || typeof item !== 'string') return false;
    const parts = item.split(':');
    const localName = parts[parts.length - 1];
    return localName === typeName;
  };
  if (typeof t === 'string') return matches(t);
  if (Array.isArray(t)) return t.some(matches);
  return false;
}

export async function loadLearningSetGraph(graphUrl) {
  const response = await fetch(graphUrl, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`Failed to load learning graph: HTTP ${response.status}`);
  }
  const data = await response.json();
  const graph = data['@graph'];
  if (!Array.isArray(graph)) {
    throw new Error('Invalid learning graph structure: missing @graph array');
  }

  const byId = new Map();
  const byIdentifier = new Map();
  const types = {
    learningSet: null,
    definedTermSet: null,
    objectives: [],
    audiences: [],
    contentUnits: [],
    materials: [],
    notes: [],
    noteSections: [],
    sections: [],
    assessments: [],
    gradeScales: [],
    presentations: [],
    imageAssets: [],
    mediaAssets: []
  };

  graph.forEach(obj => {
    if (!obj || typeof obj !== 'object') return;
    const id = obj['@id'];
    if (id) byId.set(id, obj);
    const ident = obj['identifier'];
    if (ident) byIdentifier.set(ident, obj);

    if (hasType(obj, 'LearningSet')) types.learningSet = obj;
    else if (hasType(obj, 'DefinedTermSet')) types.definedTermSet = obj;
    else if (hasType(obj, 'LearningObjective')) types.objectives.push(obj);
    else if (hasType(obj, 'EducationalAudience')) types.audiences.push(obj);
    else if (hasType(obj, 'ContentUnit')) types.contentUnits.push(obj);
    else if (hasType(obj, 'LearningMaterial')) types.materials.push(obj);
    else if (hasType(obj, 'NoteSection')) types.noteSections.push(obj);
    else if (hasType(obj, 'Note')) types.notes.push(obj);
    else if (hasType(obj, 'Section')) types.sections.push(obj);
    else if (hasType(obj, 'Assessment')) types.assessments.push(obj);
    else if (hasType(obj, 'GradeScale')) types.gradeScales.push(obj);
    else if (hasType(obj, 'Presentation')) types.presentations.push(obj);
    else if (hasType(obj, 'ImageObject')) types.imageAssets.push(obj);
    else if (hasType(obj, 'MediaObject')) types.mediaAssets.push(obj);
  });

  if (!types.learningSet) {
    throw new Error('Graph does not contain a LearningSet');
  }

  return {
    raw: data,
    graph,
    byId,
    byIdentifier,
    ...types
  };
}
