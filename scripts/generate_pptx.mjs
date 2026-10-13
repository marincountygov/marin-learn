#!/usr/bin/env node
/**
 * Generate review-grade PowerPoint derivatives from canonical Marin Learn packages.
 *
 * This is a Node adapter around the same exporter used by the browser. It loads the
 * reviewed vendored PptxGenJS bundle, applies mandatory OOXML remediation, and writes
 * only files that pass the production structural validator.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { TYPES } from '../js/core/constants.js';
import { getObjects, rootLearningSet } from '../js/core/model.js';
import { importLearningPackage } from '../js/core/package.js';
import { safeFilename, slugify } from '../js/core/utils.js';
import { exportPresentationToPptx } from '../js/pptx/index.js';
import { loadNodePptxRuntime } from '../js/pptx/runtime-node.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUT = path.join(ROOT, 'build', 'pptx-review');

export async function generatePptxArtifacts(options = {}) {
  const inputs = options.inputs?.length ? options.inputs : [path.join(ROOT, 'packages')];
  const outputDir = path.resolve(options.outputDir || DEFAULT_OUT);
  const summaryPath = path.resolve(options.summaryPath || path.join(outputDir, 'results.json'));
  const presentationSelectors = new Set((options.presentationSelectors || []).filter(Boolean));
  const failOnWarning = Boolean(options.failOnWarning);
  const clean = options.clean !== false;

  const packageFiles = await discoverPackageFiles(inputs);
  if (!packageFiles.length) throw new CliError('No Marin Learn package ZIP files were found.', 'pptx-no-packages');

  if (clean) {
    assertSafeCleanDirectory(outputDir, packageFiles);
    await rm(outputDir, { recursive: true, force: true });
  }
  await mkdir(outputDir, { recursive: true });

  const runtime = options.runtime || await loadNodePptxRuntime();
  const startedAt = new Date().toISOString();
  const artifacts = [];
  const packageResults = [];
  const failures = [];
  const matchedSelectors = new Set();

  for (const packageFile of packageFiles) {
    const packageResult = await generatePackage({
      packageFile,
      outputDir,
      runtime,
      presentationSelectors,
      matchedSelectors,
      failOnWarning
    });
    packageResults.push(packageResult);
    artifacts.push(...packageResult.artifacts);
    failures.push(...packageResult.failures);
  }

  for (const selector of presentationSelectors) {
    if (!matchedSelectors.has(selector)) {
      failures.push({
        stage: 'selection',
        code: 'pptx-presentation-not-found',
        message: `No presentation matched selector ${selector}.`,
        selector
      });
    }
  }

  const warningCount = artifacts.reduce((total, artifact) => total + artifact.warningCount, 0);
  const summary = {
    schema: 1,
    tool: 'Marin Learn PPTX Node generator',
    startedAt,
    completedAt: new Date().toISOString(),
    status: failures.length ? 'fail' : 'pass',
    runtime: {
      source: runtime.source,
      pptxGenJsVersion: runtime.pptxGenJsVersion,
      jsZipVersion: runtime.jsZipVersion,
      bundleSha256: runtime.bundleSha256,
      bundleBytes: runtime.bundleBytes,
      svgFallback: runtime.svgFallback || null
    },
    options: {
      failOnWarning,
      presentationSelectors: [...presentationSelectors],
      outputDir: portablePath(outputDir)
    },
    counts: {
      packages: packageResults.length,
      presentations: artifacts.length,
      warnings: warningCount,
      failures: failures.length
    },
    packages: packageResults,
    artifacts,
    failures
  };

  await writeJson(summaryPath, summary);
  return { summary, summaryPath, outputDir };
}

async function generatePackage({
  packageFile,
  outputDir,
  runtime,
  presentationSelectors,
  matchedSelectors,
  failOnWarning
}) {
  const sourcePath = path.resolve(packageFile);
  const result = {
    source: portablePath(sourcePath),
    sourceSha256: null,
    learningSet: null,
    presentationCount: 0,
    artifacts: [],
    failures: []
  };

  let bytes;
  let pkg;
  try {
    const buffer = await readFile(sourcePath);
    bytes = new Uint8Array(buffer);
    result.sourceSha256 = sha256(bytes);
    ({ pkg } = await importLearningPackage(bytes, {
      filename: path.basename(sourcePath),
      repair: false
    }));
  } catch (error) {
    result.failures.push(failureFromError(error, {
      stage: 'package-import',
      package: portablePath(sourcePath)
    }));
    return result;
  }

  const learningSet = rootLearningSet(pkg);
  const setIdentifier = slugify(learningSet?.identifier || learningSet?.name, 'learning-set');
  result.learningSet = {
    id: learningSet?.['@id'] || null,
    identifier: setIdentifier,
    name: learningSet?.name || setIdentifier,
    version: learningSet?.version || null,
    dateModified: learningSet?.dateModified || null,
    language: learningSet?.inLanguage || 'en-US'
  };

  let presentations = getObjects(pkg, TYPES.PRESENTATION);
  if (presentationSelectors.size) {
    presentations = presentations.filter((presentation) => {
      const values = [presentation['@id'], presentation.identifier, presentation.name].filter(Boolean);
      const matches = [...presentationSelectors].filter((selector) => values.includes(selector));
      for (const match of matches) matchedSelectors.add(match);
      return matches.length > 0;
    });
  }
  result.presentationCount = presentations.length;

  const setOutputDir = path.join(outputDir, safeFilename(setIdentifier, 'learning-set'));
  await mkdir(setOutputDir, { recursive: true });
  const usedNames = new Set();

  for (const presentation of presentations) {
    try {
      const exportResult = await exportPresentationToPptx(pkg, presentation['@id'], { runtime });
      const filename = uniqueOutputName(exportResult.filename, usedNames);
      const basename = filename.replace(/\.pptx$/i, '');
      const pptxPath = path.join(setOutputDir, filename);
      const manifestPath = path.join(setOutputDir, `${basename}.manifest.json`);
      const validationPath = path.join(setOutputDir, `${basename}.validation.json`);
      const buildPath = path.join(setOutputDir, `${basename}.build.json`);
      const outputSha256 = sha256(exportResult.bytes);

      const buildRecord = {
        schema: 1,
        generatedAt: new Date().toISOString(),
        exporterVersion: exportResult.exporterVersion,
        runtime: {
          source: runtime.source,
          pptxGenJsVersion: runtime.pptxGenJsVersion,
          jsZipVersion: runtime.jsZipVersion,
          bundleSha256: runtime.bundleSha256,
          svgFallback: runtime.svgFallback || null
        },
        source: {
          package: portablePath(sourcePath),
          packageSha256: result.sourceSha256,
          learningSet: result.learningSet,
          presentation: {
            id: presentation['@id'],
            identifier: presentation.identifier || basename,
            name: presentation.name || presentation.identifier || basename
          }
        },
        output: {
          file: normalizePath(path.relative(outputDir, pptxPath)),
          bytes: exportResult.bytes.byteLength,
          sha256: outputSha256,
          mimeType: exportResult.mimeType
        },
        warningCount: exportResult.warnings.length,
        warnings: exportResult.warnings,
        validation: exportResult.validation,
        postprocessAudit: exportResult.postprocessAudit
      };

      await Promise.all([
        writeFile(pptxPath, exportResult.bytes),
        writeJson(manifestPath, exportResult.manifest),
        writeJson(validationPath, exportResult.validation),
        writeJson(buildPath, buildRecord)
      ]);

      const artifact = {
        learningSetIdentifier: setIdentifier,
        presentationId: presentation['@id'],
        presentationIdentifier: presentation.identifier || basename,
        presentationName: presentation.name || presentation.identifier || basename,
        file: normalizePath(path.relative(outputDir, pptxPath)),
        manifest: normalizePath(path.relative(outputDir, manifestPath)),
        validation: normalizePath(path.relative(outputDir, validationPath)),
        buildRecord: normalizePath(path.relative(outputDir, buildPath)),
        bytes: exportResult.bytes.byteLength,
        sha256: outputSha256,
        slideCount: exportResult.manifest.slides.length,
        warningCount: exportResult.warnings.length,
        status: failOnWarning && exportResult.warnings.length ? 'fail' : 'pass'
      };
      result.artifacts.push(artifact);
      if (artifact.status === 'fail') {
        result.failures.push({
          stage: 'warnings',
          code: 'pptx-warning-policy-failed',
          message: `${artifact.presentationName} generated with ${artifact.warningCount} warning(s), and --fail-on-warning is enabled.`,
          presentationId: artifact.presentationId,
          warnings: exportResult.warnings
        });
      }
      process.stdout.write(`Generated ${artifact.file} (${artifact.slideCount} slides, ${artifact.warningCount} warnings)\n`);
    } catch (error) {
      result.failures.push(failureFromError(error, {
        stage: 'presentation-export',
        package: portablePath(sourcePath),
        presentationId: presentation['@id'],
        presentationIdentifier: presentation.identifier || null,
        presentationName: presentation.name || null
      }));
    }
  }

  return result;
}

export async function discoverPackageFiles(inputs) {
  const discovered = [];
  for (const input of inputs) {
    const resolved = path.resolve(input);
    let entries;
    try {
      entries = await readdir(resolved, { withFileTypes: true });
    } catch (error) {
      if (error?.code === 'ENOTDIR') {
        if (/\.zip$/i.test(resolved)) discovered.push(resolved);
        else throw new CliError(`Input file is not a ZIP package: ${input}`, 'pptx-input-not-zip');
        continue;
      }
      if (error?.code === 'ENOENT') throw new CliError(`Input path does not exist: ${input}`, 'pptx-input-missing');
      throw error;
    }
    for (const entry of entries) {
      if (entry.isFile() && /\.zip$/i.test(entry.name)) discovered.push(path.join(resolved, entry.name));
    }
  }
  return [...new Set(discovered)].sort((a, b) => a.localeCompare(b));
}


export function assertSafeCleanDirectory(outputDir, sourceFiles = []) {
  const target = path.resolve(outputDir);
  const forbidden = new Set([
    path.parse(target).root,
    path.resolve(ROOT),
    path.resolve(process.cwd())
  ]);
  if (forbidden.has(target)) {
    throw new CliError(
      `Refusing to recursively clean unsafe output directory: ${normalizePath(target)}`,
      'pptx-output-unsafe'
    );
  }
  for (const sourceFile of sourceFiles) {
    const source = path.resolve(sourceFile);
    const relative = path.relative(target, source);
    if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
      throw new CliError(
        `Refusing to clean output directory because it contains an input package: ${normalizePath(target)}`,
        'pptx-output-contains-input'
      );
    }
  }
  return target;
}

export function parseArgs(argv) {
  const options = {
    inputs: [],
    presentationSelectors: [],
    clean: true,
    failOnWarning: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--out') options.outputDir = requireValue(argv, ++index, '--out');
    else if (value === '--summary') options.summaryPath = requireValue(argv, ++index, '--summary');
    else if (value === '--presentation') options.presentationSelectors.push(requireValue(argv, ++index, '--presentation'));
    else if (value === '--fail-on-warning') options.failOnWarning = true;
    else if (value === '--no-clean') options.clean = false;
    else if (value === '--clean') options.clean = true;
    else if (value === '-h' || value === '--help') options.help = true;
    else if (value.startsWith('-')) throw new CliError(`Unknown option: ${value}`, 'pptx-option-unknown');
    else options.inputs.push(value);
  }
  return options;
}

function requireValue(argv, index, option) {
  const value = argv[index];
  if (!value || value.startsWith('-')) throw new CliError(`${option} requires a value.`, 'pptx-option-value-missing');
  return value;
}

function uniqueOutputName(filename, usedNames) {
  const normalized = safeFilename(filename, 'presentation.pptx');
  const extension = normalized.toLowerCase().endsWith('.pptx') ? '.pptx' : '';
  const base = extension ? normalized.slice(0, -5) : normalized;
  let candidate = extension ? normalized : `${normalized}.pptx`;
  let suffix = 2;
  while (usedNames.has(candidate.toLowerCase())) {
    candidate = `${base}-${suffix}.pptx`;
    suffix += 1;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
}

function failureFromError(error, details = {}) {
  const diagnostics = error?.details?.diagnostics || error?.validation?.diagnostics || null;
  return {
    ...details,
    code: error?.code || error?.name || 'pptx-generation-failed',
    message: error?.message || String(error),
    diagnostics,
    details: jsonSafe(error?.details || null)
  };
}

function jsonSafe(value) {
  if (value == null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function normalizePath(value) {
  return String(value).split(path.sep).join('/');
}

function portablePath(value) {
  const absolute = path.resolve(value);
  const relative = path.relative(ROOT, absolute);
  if (relative === '') return '.';
  if (!relative.startsWith('..') && !path.isAbsolute(relative)) return normalizePath(relative);
  return normalizePath(absolute);
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export class CliError extends Error {
  constructor(message, code = 'pptx-cli-error') {
    super(message);
    this.name = 'CliError';
    this.code = code;
  }
}

function usage() {
  return `Usage: node scripts/generate_pptx.mjs [package.zip | directory ...] [options]\n\n` +
    `Options:\n` +
    `  --out <directory>          Output directory (default: build/pptx-review)\n` +
    `  --summary <file>           Combined JSON results file (default: <out>/results.json)\n` +
    `  --presentation <value>     Export only a matching presentation ID, identifier, or exact name; repeatable\n` +
    `  --fail-on-warning          Return a failing status when a deck has nonblocking warnings\n` +
    `  --no-clean                 Preserve existing output before generation\n` +
    `  -h, --help                 Show this help\n`;
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
    if (options.help) {
      process.stdout.write(usage());
      return;
    }
    const { summary, summaryPath } = await generatePptxArtifacts(options);
    process.stdout.write(`PowerPoint review summary: ${normalizePath(summaryPath)}\n`);
    if (summary.status !== 'pass') process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`ERROR: ${error?.message || String(error)}\n`);
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) await main();
