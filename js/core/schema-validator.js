import { MARIN_LEARN_SCHEMA } from './schema-data.js';

export function validateJsonSchema(instance, schema = MARIN_LEARN_SCHEMA) {
  const errors = [];
  validateNode(instance, schema, '$', schema, errors);
  return errors;
}

function validateNode(value, schema, path, root, errors) {
  if (schema === true) return;
  if (schema === false) {
    errors.push(error(path, 'false-schema', 'Value is prohibited by the schema.'));
    return;
  }
  if (!schema || typeof schema !== 'object') return;

  if (schema.$ref) {
    const target = resolveRef(root, schema.$ref);
    if (!target) {
      errors.push(error(path, 'schema-ref', `Schema reference could not be resolved: ${schema.$ref}`));
      return;
    }
    validateNode(value, target, path, root, errors);
  }

  if (schema.allOf) {
    for (const child of schema.allOf) validateNode(value, child, path, root, errors);
  }

  if (schema.anyOf) {
    const matches = schema.anyOf.filter((child) => branchValid(value, child, path, root));
    if (!matches.length) errors.push(error(path, 'anyOf', 'Value does not match any allowed schema form.'));
  }

  if (schema.oneOf) {
    const matches = schema.oneOf.filter((child) => branchValid(value, child, path, root));
    if (matches.length !== 1) {
      errors.push(error(path, 'oneOf', matches.length === 0
        ? 'Value does not match any allowed object type.'
        : 'Value matches more than one mutually exclusive object type.'));
    } else {
      validateNode(value, matches[0], path, root, errors);
    }
  }

  if (schema.not && branchValid(value, schema.not, path, root)) {
    errors.push(error(path, 'not', 'Value matches a prohibited schema form.'));
  }

  if (schema.if && branchValid(value, schema.if, path, root)) {
    if (schema.then) validateNode(value, schema.then, path, root, errors);
  } else if (schema.else) {
    validateNode(value, schema.else, path, root, errors);
  }

  if (schema.const !== undefined && !deepEqual(value, schema.const)) {
    errors.push(error(path, 'const', `Value must equal ${display(schema.const)}.`));
  }

  if (schema.enum && !schema.enum.some((candidate) => deepEqual(value, candidate))) {
    errors.push(error(path, 'enum', `Value must be one of: ${schema.enum.map(display).join(', ')}.`));
  }

  if (schema.type && !matchesType(value, schema.type)) {
    errors.push(error(path, 'type', `Expected ${Array.isArray(schema.type) ? schema.type.join(' or ') : schema.type}.`));
    return;
  }

  if (typeof value === 'string') validateString(value, schema, path, errors);
  if (typeof value === 'number') validateNumber(value, schema, path, errors);
  if (Array.isArray(value)) validateArray(value, schema, path, root, errors);
  if (isPlainObject(value)) validateObject(value, schema, path, root, errors);
}

function validateString(value, schema, path, errors) {
  if (schema.minLength !== undefined && [...value].length < schema.minLength) {
    errors.push(error(path, 'minLength', `Text must contain at least ${schema.minLength} character(s).`));
  }
  if (schema.maxLength !== undefined && [...value].length > schema.maxLength) {
    errors.push(error(path, 'maxLength', `Text must contain no more than ${schema.maxLength} character(s).`));
  }
  if (schema.pattern) {
    try {
      if (!new RegExp(schema.pattern, 'u').test(value)) errors.push(error(path, 'pattern', 'Text does not match the required format.'));
    } catch {
      errors.push(error(path, 'schema-pattern', `Schema pattern is invalid: ${schema.pattern}`));
    }
  }
  if (schema.format && !validFormat(value, schema.format)) {
    errors.push(error(path, 'format', `Text is not a valid ${schema.format}.`));
  }
}

function validateNumber(value, schema, path, errors) {
  if (schema.type === 'integer' && !Number.isInteger(value)) errors.push(error(path, 'integer', 'Value must be an integer.'));
  if (schema.minimum !== undefined && value < schema.minimum) errors.push(error(path, 'minimum', `Value must be at least ${schema.minimum}.`));
  if (schema.maximum !== undefined && value > schema.maximum) errors.push(error(path, 'maximum', `Value must be no more than ${schema.maximum}.`));
  if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) errors.push(error(path, 'exclusiveMinimum', `Value must be greater than ${schema.exclusiveMinimum}.`));
  if (schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum) errors.push(error(path, 'exclusiveMaximum', `Value must be less than ${schema.exclusiveMaximum}.`));
}

function validateArray(value, schema, path, root, errors) {
  if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(error(path, 'minItems', `List must contain at least ${schema.minItems} item(s).`));
  if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(error(path, 'maxItems', `List must contain no more than ${schema.maxItems} item(s).`));
  if (schema.uniqueItems) {
    for (let i = 0; i < value.length; i += 1) {
      for (let j = i + 1; j < value.length; j += 1) {
        if (deepEqual(value[i], value[j])) {
          errors.push(error(`${path}[${j}]`, 'uniqueItems', 'List items must be unique.'));
          i = value.length;
          break;
        }
      }
    }
  }

  if (schema.prefixItems) {
    schema.prefixItems.forEach((child, index) => {
      if (index < value.length) validateNode(value[index], child, `${path}[${index}]`, root, errors);
    });
  }

  if (schema.items && typeof schema.items === 'object') {
    const start = schema.prefixItems?.length || 0;
    for (let index = start; index < value.length; index += 1) {
      validateNode(value[index], schema.items, `${path}[${index}]`, root, errors);
    }
  } else if (!schema.prefixItems && schema.items && typeof schema.items === 'object') {
    value.forEach((item, index) => validateNode(item, schema.items, `${path}[${index}]`, root, errors));
  }

  if (schema.contains) {
    const count = value.filter((item, index) => branchValid(item, schema.contains, `${path}[${index}]`, root)).length;
    const minimum = schema.minContains ?? 1;
    const maximum = schema.maxContains ?? Infinity;
    if (count < minimum) errors.push(error(path, 'minContains', `List must contain at least ${minimum} matching item(s).`));
    if (count > maximum) errors.push(error(path, 'maxContains', `List must contain no more than ${maximum} matching item(s).`));
  }
}

function validateObject(value, schema, path, root, errors) {
  if (schema.minProperties !== undefined && Object.keys(value).length < schema.minProperties) {
    errors.push(error(path, 'minProperties', `Object must contain at least ${schema.minProperties} properties.`));
  }
  for (const required of schema.required || []) {
    if (!Object.prototype.hasOwnProperty.call(value, required)) errors.push(error(path, 'required', `Required property is missing: ${required}.`));
  }
  for (const [key, childSchema] of Object.entries(schema.properties || {})) {
    if (Object.prototype.hasOwnProperty.call(value, key)) validateNode(value[key], childSchema, `${path}.${escapePath(key)}`, root, errors);
  }

  if (schema.additionalProperties === false) {
    const allowed = new Set(Object.keys(schema.properties || {}));
    for (const key of Object.keys(value)) {
      if (!allowed.has(key)) errors.push(error(`${path}.${escapePath(key)}`, 'additionalProperties', `Property is not allowed here: ${key}.`));
    }
  }

  if (schema.unevaluatedProperties === false) {
    const allowed = collectPropertyNames(schema, root, value);
    for (const key of Object.keys(value)) {
      if (!allowed.has(key)) errors.push(error(`${path}.${escapePath(key)}`, 'unevaluatedProperties', `Property is not defined for this object type: ${key}.`));
    }
  }
}

function collectPropertyNames(schema, root, value, seen = new Set()) {
  const names = new Set(Object.keys(schema.properties || {}));
  if (schema.$ref && !seen.has(schema.$ref)) {
    seen.add(schema.$ref);
    const target = resolveRef(root, schema.$ref);
    if (target) mergeSet(names, collectPropertyNames(target, root, value, seen));
  }
  for (const child of schema.allOf || []) mergeSet(names, collectPropertyNames(child, root, value, new Set(seen)));
  if (schema.if && branchValid(value, schema.if, '$', root)) {
    if (schema.then) mergeSet(names, collectPropertyNames(schema.then, root, value, new Set(seen)));
  } else if (schema.else) {
    mergeSet(names, collectPropertyNames(schema.else, root, value, new Set(seen)));
  }
  if (schema.oneOf) {
    for (const child of schema.oneOf) {
      if (branchValid(value, child, '$', root)) mergeSet(names, collectPropertyNames(child, root, value, new Set(seen)));
    }
  }
  return names;
}

function branchValid(value, schema, path, root) {
  const temporary = [];
  validateNode(value, schema, path, root, temporary);
  return temporary.length === 0;
}

function resolveRef(root, reference) {
  if (!reference.startsWith('#/')) return null;
  return reference.slice(2).split('/').reduce((value, part) => value?.[part.replace(/~1/g, '/').replace(/~0/g, '~')], root);
}

function validFormat(value, format) {
  if (format === 'uri') {
    try {
      const parsed = new URL(value);
      return Boolean(parsed.protocol);
    } catch {
      return false;
    }
  }
  if (format === 'uri-reference') return !/[\u0000-\u0020]/.test(value);
  if (format === 'date') return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
  if (format === 'date-time') return !Number.isNaN(Date.parse(value));
  return true;
}

function matchesType(value, type) {
  const types = Array.isArray(type) ? type : [type];
  return types.some((candidate) => {
    if (candidate === 'null') return value === null;
    if (candidate === 'array') return Array.isArray(value);
    if (candidate === 'object') return isPlainObject(value);
    if (candidate === 'integer') return typeof value === 'number' && Number.isInteger(value);
    return typeof value === candidate;
  });
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((item, index) => deepEqual(item, b[index]));
  if (isPlainObject(a) && isPlainObject(b)) {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    return aKeys.length === bKeys.length && aKeys.every((key) => Object.prototype.hasOwnProperty.call(b, key) && deepEqual(a[key], b[key]));
  }
  return false;
}

function display(value) {
  return typeof value === 'string' ? `“${value}”` : JSON.stringify(value);
}

function error(path, keyword, message) {
  return { path, keyword, message };
}

function escapePath(key) {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? key : `[${JSON.stringify(key)}]`;
}

function mergeSet(target, source) {
  for (const item of source) target.add(item);
}
