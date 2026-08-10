#!/usr/bin/env node

const fs = require('fs');
const fsp = require('fs').promises;
const crypto = require('crypto');
const path = require('path');
const readline = require('readline');

let GraphService = null;

const DEFAULT_FILES = [
  'paper_metadata_v1.jsonl',
  'nph14079_table_s1_long.jsonl',
  'unified_models_v5.jsonl',
  'unified_equations_v5.jsonl',
  'validated_params_v6.jsonl',
  'refined_params_v4.jsonl',
  'suggested_params_v1.jsonl',
  'warn_params_v4.jsonl',
  'warn_params_v5.jsonl',
  'rejected_params_v4.jsonl',
  'rejected_params_v5.jsonl'
];

function sanitizeSegment(value) {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/<[^>]+>/g, ' ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return normalized || 'unknown';
}

function stripHtml(value) {
  return String(value ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function truncateText(value, maxLength = 280) {
  const text = stripHtml(value);
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}...`;
}

function normalizeList(value) {
  if (!value) {
    return [];
  }

  const items = Array.isArray(value)
    ? value.flatMap(item => normalizeList(item))
    : typeof value === 'string'
      ? value.split(/[;,|]/g)
      : [value];

  return items
    .map(item => {
      if (item === null || item === undefined) return '';
      if (typeof item === 'object') {
        return item.name || item.label || item.id || item.value || item.param || item.eq_id || '';
      }
      return String(item);
    })
    .map(item => stripHtml(item).trim())
    .filter(Boolean);
}

function uniqueList(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

function mergeAttributes(base = {}, incoming = {}) {
  const merged = { ...base };

  for (const [key, value] of Object.entries(incoming || {})) {
    if (value === undefined || value === null || value === '') {
      continue;
    }

    if (Array.isArray(value)) {
      const existing = Array.isArray(merged[key]) ? merged[key] : [];
      merged[key] = uniqueList([...existing, ...normalizeList(value)]);
      continue;
    }

    if (typeof value === 'object') {
      merged[key] = {
        ...(typeof merged[key] === 'object' && !Array.isArray(merged[key]) ? merged[key] : {}),
        ...value
      };
      continue;
    }

    if (merged[key] === undefined || merged[key] === null || merged[key] === '') {
      merged[key] = value;
    }
  }

  return merged;
}

function makeNodeKey(graphId, prefix, value) {
  return `${graphId}_${prefix}_${sanitizeSegment(value)}`;
}

function isPaperLabel(label) {
  return /^(paper\s+)?10\./i.test(String(label || '')) || /^paper_/i.test(String(label || ''));
}

class SciDataImporter {
  constructor(sourceDir, options = {}) {
    this.sourceDir = sourceDir;
    this.options = options;
    this.graphSource = 'scidata';
    this.dataset = 'ModelKG/SciData';
    this.graphId = options.graphId || `scidata_${crypto.randomUUID().replace(/-/g, '')}`;
    this.nodes = new Map();
    this.edges = new Map();
    this.stats = {
      files: 0,
      records: 0,
      papers: 0,
      models: 0,
      parameters: 0,
      equations: 0,
      species: 0,
      conditions: 0,
      sites: 0,
      edges: 0
    };
  }

  async run() {
    const stats = await fsp.stat(this.sourceDir);
    if (!stats.isDirectory()) {
      throw new Error(`Source path is not a directory: ${this.sourceDir}`);
    }

    const candidates = DEFAULT_FILES
      .map(fileName => path.join(this.sourceDir, fileName))
      .filter(filePath => fs.existsSync(filePath));

    if (!candidates.length) {
      throw new Error(`No SciData JSONL files were found in ${this.sourceDir}`);
    }

    console.log(`📚 SciData import starting from ${this.sourceDir}`);
    console.log(`🆔 Graph ID: ${this.graphId}`);

    for (const filePath of candidates) {
      await this.processJsonlFile(filePath);
    }

    const nodes = Array.from(this.nodes.values());
    const edges = Array.from(this.edges.values());

    if (this.options.dryRun) {
      return {
        graphId: this.graphId,
        nodes: nodes.length,
        edges: edges.length,
        stats: this.stats
      };
    }

    if (!GraphService) {
      GraphService = require('../services/GraphService');
    }

    const result = await GraphService.createGraph({
      nodes,
      edges,
      metadata: {
        graphId: this.graphId,
        graph_source: this.graphSource,
        dataset: this.dataset,
        title: 'SciData ModelKG import',
        description: 'Imported from SciData JSONL files',
        source_dir: this.sourceDir,
        source_files: candidates.map(filePath => path.basename(filePath)),
        import_type: 'scidata'
      }
    });

    return {
      ...result,
      stats: this.stats
    };
  }

  async processJsonlFile(filePath) {
    this.stats.files += 1;
    console.log(`📄 Processing ${path.basename(filePath)}`);

    const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    let lineNumber = 0;
    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      lineNumber += 1;
      this.stats.records += 1;

      let record;
      try {
        record = JSON.parse(trimmed);
      } catch (error) {
        console.warn(`⚠️ Skipping invalid JSON on ${path.basename(filePath)}:${lineNumber}`);
        continue;
      }

      this.ingestRecord(record, path.basename(filePath));
    }
  }

  ingestRecord(record, sourceFile) {
    const paperInfo = this.getPaperInfo(record, sourceFile);
    const paperAlreadyExists = this.nodes.has(paperInfo.key);
    const paperNode = this.upsertNode({
      id: paperInfo.key,
      label: paperInfo.label,
      type: 'concept',
      size: 26,
      attributes: {
        kind: 'paper',
        doi: paperInfo.doi || '',
        year: paperInfo.year || null,
        journal: paperInfo.journal || '',
        authors: paperInfo.authors || [],
        source_files: [sourceFile],
        species_list: paperInfo.speciesList || [],
        condition_tags: paperInfo.conditionTags || [],
        coverage: paperInfo.coverage || '',
        extraction_ts: paperInfo.extractionTs || '',
        graph_source: this.graphSource
      }
    });

    if (!paperAlreadyExists) {
      this.stats.papers += 1;
    }

    if (paperInfo.speciesList.length) {
      for (const species of paperInfo.speciesList) {
        const speciesNode = this.upsertNode({
          id: makeNodeKey(this.graphId, 'species', species),
          label: species,
          type: 'organism',
          size: 14,
          attributes: {
            kind: 'species',
            source_files: [sourceFile],
            graph_source: this.graphSource
          }
        });

        this.upsertEdge(paperNode.id, speciesNode.id, 'ASSOCIATED_WITH_SPECIES', 1, {
          source_file: sourceFile,
          graph_source: this.graphSource
        });

        this.stats.species += 1;
      }
    }

    if (paperInfo.conditionTags.length) {
      for (const condition of paperInfo.conditionTags) {
        const conditionNode = this.upsertNode({
          id: makeNodeKey(this.graphId, 'condition', condition),
          label: condition,
          type: 'condition',
          size: 14,
          attributes: {
            kind: 'condition',
            source_files: [sourceFile],
            graph_source: this.graphSource
          }
        });

        this.upsertEdge(paperNode.id, conditionNode.id, 'HAS_CONDITION', 1, {
          source_file: sourceFile,
          graph_source: this.graphSource
        });

        this.stats.conditions += 1;
      }
    }

    const siteCode = record.site_code || record.site || record.source_id;
    if (siteCode) {
      const siteNode = this.upsertNode({
        id: makeNodeKey(this.graphId, 'site', siteCode),
        label: String(siteCode),
        type: 'material',
        size: 14,
        attributes: {
          kind: 'site',
          source_files: [sourceFile],
          graph_source: this.graphSource
        }
      });

      this.upsertEdge(paperNode.id, siteNode.id, 'OBSERVED_AT_SITE', 1, {
        source_file: sourceFile,
        graph_source: this.graphSource
      });

      this.stats.sites += 1;
    }

    if (record.primary_type === 'model_mention' || record.model_name || record.model_family) {
      const modelLabel = stripHtml(record.model_name || record.model_family || record.model_type || record.primary_type || 'Model');
      const modelNode = this.upsertNode({
        id: makeNodeKey(this.graphId, 'model', record.model_name || record.model_family || modelLabel),
        label: modelLabel,
        type: 'method',
        size: 18,
        attributes: {
          kind: 'model',
          model_name: record.model_name || '',
          model_family: record.model_family || '',
          model_type: record.model_type || '',
          confidence: record.confidence ?? null,
          source_file: sourceFile,
          graph_source: this.graphSource
        }
      });

      this.upsertEdge(paperNode.id, modelNode.id, 'MENTIONS_MODEL', 2, {
        source_file: sourceFile,
        page_no: record.page_no ?? null,
        section_heading: record.section_heading || '',
        context: truncateText(record.context || ''),
        confidence: record.confidence ?? null,
        graph_source: this.graphSource
      });

      const linkedParameters = normalizeList(record.linked_parameter);
      for (const parameterName of linkedParameters) {
        const parameterNode = this.upsertNode({
          id: makeNodeKey(this.graphId, 'parameter', parameterName),
          label: stripHtml(parameterName),
          type: 'measurement',
          size: 16,
          attributes: {
            kind: 'parameter',
            source_files: [sourceFile],
            graph_source: this.graphSource
          }
        });

        this.upsertEdge(modelNode.id, parameterNode.id, 'LINKS_PARAMETER', 1, {
          source_file: sourceFile,
          graph_source: this.graphSource
        });
      }

      this.stats.models += 1;
    }

    if (record.primary_type === 'equation' || record.eq_id || record.latex) {
      const equationLabel = record.eq_no ? `Equation ${record.eq_no}` : stripHtml(record.eq_id || record.primary_type || 'Equation');
      const equationNode = this.upsertNode({
        id: makeNodeKey(this.graphId, 'equation', record.eq_id || equationLabel),
        label: equationLabel,
        type: 'formula',
        size: 18,
        attributes: {
          kind: 'equation',
          eq_id: record.eq_id || '',
          eq_no: record.eq_no || '',
          latex: record.latex || '',
          eq_text: truncateText(record.eq_text || ''),
          model_type: record.model_type || '',
          confidence: record.confidence ?? null,
          source_file: sourceFile,
          graph_source: this.graphSource
        }
      });

      this.upsertEdge(paperNode.id, equationNode.id, 'HAS_EQUATION', 2, {
        source_file: sourceFile,
        page_no: record.page_no ?? null,
        section_heading: record.section_heading || '',
        context: truncateText(record.eq_text || record.latex || ''),
        confidence: record.confidence ?? null,
        graph_source: this.graphSource
      });

      if (record.linked_model) {
        const linkedModelNode = this.upsertNode({
          id: makeNodeKey(this.graphId, 'model', record.linked_model),
          label: stripHtml(record.linked_model),
          type: 'method',
          size: 18,
          attributes: {
            kind: 'model',
            source_files: [sourceFile],
            graph_source: this.graphSource
          }
        });

        this.upsertEdge(equationNode.id, linkedModelNode.id, 'DESCRIBES_MODEL', 1, {
          source_file: sourceFile,
          graph_source: this.graphSource
        });
      }

      const linkedParameters = normalizeList(record.linked_parameter);
      for (const parameterName of linkedParameters) {
        const parameterNode = this.upsertNode({
          id: makeNodeKey(this.graphId, 'parameter', parameterName),
          label: stripHtml(parameterName),
          type: 'measurement',
          size: 16,
          attributes: {
            kind: 'parameter',
            source_files: [sourceFile],
            graph_source: this.graphSource
          }
        });

        this.upsertEdge(equationNode.id, parameterNode.id, 'USES_PARAMETER', 1, {
          source_file: sourceFile,
          graph_source: this.graphSource
        });
      }

      this.stats.equations += 1;
    }

    const parameterName = record.parameter_canonical || record.param || record.table_column_key;
    if (record.primary_type === 'parameter' || parameterName) {
      const resolvedParameter = stripHtml(parameterName || record.param || 'Parameter');
      const parameterNode = this.upsertNode({
        id: makeNodeKey(this.graphId, 'parameter', resolvedParameter),
        label: resolvedParameter,
        type: 'measurement',
        size: 16,
        attributes: {
          kind: 'parameter',
          unit: record.unit_canonical || record.unit || record.unit_raw || '',
          source_quality: record.source_quality || '',
          quality: record.quality || '',
          span_type: record.span_type || '',
          source_files: [sourceFile],
          graph_source: this.graphSource
        }
      });

      this.upsertEdge(paperNode.id, parameterNode.id, 'REPORTS_PARAMETER', 2, {
        source_file: sourceFile,
        page_no: record.page_no ?? null,
        context: truncateText(record.context || ''),
        value: record.value_numeric ?? record.value_raw ?? record.value ?? '',
        unit: record.unit_canonical || record.unit || record.unit_raw || '',
        confidence: record.confidence || '',
        source_quality: record.source_quality || '',
        graph_source: this.graphSource
      });

      if (record.linked_model) {
        const linkedModelNode = this.upsertNode({
          id: makeNodeKey(this.graphId, 'model', record.linked_model),
          label: stripHtml(record.linked_model),
          type: 'method',
          size: 18,
          attributes: {
            kind: 'model',
            source_files: [sourceFile],
            graph_source: this.graphSource
          }
        });

        this.upsertEdge(linkedModelNode.id, parameterNode.id, 'LINKS_PARAMETER', 1, {
          source_file: sourceFile,
          graph_source: this.graphSource
        });
      }

      if (record.linked_equation) {
        const linkedEquationNode = this.upsertNode({
          id: makeNodeKey(this.graphId, 'equation', record.linked_equation),
          label: stripHtml(record.linked_equation),
          type: 'formula',
          size: 18,
          attributes: {
            kind: 'equation',
            source_files: [sourceFile],
            graph_source: this.graphSource
          }
        });

        this.upsertEdge(linkedEquationNode.id, parameterNode.id, 'USES_PARAMETER', 1, {
          source_file: sourceFile,
          graph_source: this.graphSource
        });
      }

      this.stats.parameters += 1;
    }
  }

  getPaperInfo(record, sourceFile) {
    const doi = record.doi || record.paper_doi || '';
    const title = stripHtml(record.paper_title || record.title || doi || sourceFile || 'SciData paper');
    const keySeed = doi || record.record_id || title;

    return {
      key: makeNodeKey(this.graphId, 'paper', keySeed),
      label: title,
      doi,
      year: record.year || record.paper_year || '',
      journal: record.journal || record.paper_journal || '',
      authors: normalizeList(record.authors),
      speciesList: normalizeList(record.species_list || record.species),
      conditionTags: normalizeList(record.condition_tags),
      coverage: record.coverage || '',
      extractionTs: record.extraction_ts || ''
    };
  }

  upsertNode(node) {
    const existing = this.nodes.get(node.id);
    if (!existing) {
      this.nodes.set(node.id, {
        id: node.id,
        label: node.label,
        size: node.size || 20,
        type: node.type || 'concept',
        attributes: mergeAttributes({}, node.attributes || {})
      });
      return this.nodes.get(node.id);
    }

    if (node.label && (!existing.label || isPaperLabel(existing.label) || node.label.length > existing.label.length)) {
      existing.label = node.label;
    }

    existing.size = Math.max(existing.size || 0, node.size || 0);
    existing.type = existing.type || node.type || 'concept';
    existing.attributes = mergeAttributes(existing.attributes || {}, node.attributes || {});
    return existing;
  }

  upsertEdge(source, target, relationship_type, weight = 1, attributes = {}) {
    const edgeKey = `${source}__${target}__${relationship_type}`;
    const existing = this.edges.get(edgeKey);

    if (!existing) {
      this.edges.set(edgeKey, {
        source,
        target,
        relationship_type,
        weight,
        attributes: mergeAttributes({}, attributes)
      });
      this.stats.edges += 1;
      return this.edges.get(edgeKey);
    }

    existing.weight += weight;
    existing.attributes = mergeAttributes(existing.attributes || {}, attributes || {});
    return existing;
  }
}

function parseArgs(argv) {
  const options = {
    source: 'C:\\Users\\ISLab\\Desktop\\LLM\\5. Plant_microbiome_v2\\ModelKG\\SciData\\data',
    graphId: undefined,
    dryRun: false,
    help: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    if (arg === '-s' || arg === '--source') {
      options.source = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg === '--graph-id') {
      options.graphId = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg === '-h' || arg === '--help') {
      options.help = true;
      continue;
    }
  }

  return options;
}

function printHelp() {
  console.log('Usage: node scripts/import-scidata.js [options]');
  console.log('');
  console.log('Options:');
  console.log('  --source <path>   SciData data directory');
  console.log('  --graph-id <id>   Override the generated graph ID');
  console.log('  --dry-run         Parse and summarize without writing to the database');
}

async function main() {
  const options = parseArgs(process.argv);

  if (options.help) {
    printHelp();
    return;
  }

  const importer = new SciDataImporter(path.resolve(options.source), {
    graphId: options.graphId ? String(options.graphId) : undefined,
    dryRun: Boolean(options.dryRun)
  });

  const result = await importer.run();
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch(error => {
    console.error('SciData import failed:', error);
    process.exit(1);
  });
}

module.exports = SciDataImporter;
