#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const TYPE_ALIASES = new Map([
    ['gene identifier', 'gene'],
    ['gene', 'gene'],
    ['protein', 'protein'],
    ['protein complex', 'complex'],
    ['complex', 'complex'],
    ['organism', 'organism'],
    ['species', 'organism'],
    ['phenotype', 'phenotype'],
    ['trait', 'trait'],
    ['metabolite', 'metabolite'],
    ['chemical', 'metabolite'],
    ['molecule', 'molecule'],
    ['enzyme', 'enzyme'],
    ['process', 'process'],
    ['biological process', 'process'],
    ['pathway', 'pathway'],
    ['cell', 'cell'],
    ['tissue', 'tissue'],
    ['disease', 'disease'],
    ['regulation', 'regulation'],
    ['cellular component', 'cellular_component'],
    ['cellular_component', 'cellular_component'],
    ['anatomical structure', 'anatomy'],
    ['anatomy', 'anatomy'],
    ['location', 'location'],
    ['function', 'process']
]);

function normalizeText(value) {
    return String(value ?? '').trim();
}

function normalizeHeader(header) {
    return String(header || '')
        .replace(/^\uFEFF/, '')
        .trim()
        .toLowerCase()
        .replace(/['"]/g, '')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_');
}

function slugify(value) {
    return normalizeText(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
}

function normalizeType(value) {
    const raw = normalizeText(value).toLowerCase();
    if (!raw) {
        return 'concept';
    }
    return TYPE_ALIASES.get(raw) || raw.replace(/[^a-z0-9]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'concept';
}

function parseCSV(csvText) {
    const rows = [];
    let row = [];
    let cell = '';
    let inQuotes = false;

    const pushCell = () => {
        row.push(cell);
        cell = '';
    };

    const pushRow = () => {
        pushCell();
        if (row.some(value => String(value).trim() !== '')) {
            rows.push(row);
        }
        row = [];
    };

    for (let i = 0; i < csvText.length; i += 1) {
        const char = csvText[i];
        const next = csvText[i + 1];

        if (char === '"') {
            if (inQuotes && next === '"') {
                cell += '"';
                i += 1;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (char === ',' && !inQuotes) {
            pushCell();
            continue;
        }

        if ((char === '\n' || char === '\r') && !inQuotes) {
            if (char === '\r' && next === '\n') {
                i += 1;
            }
            if (row.length > 0 || cell.length > 0) {
                pushRow();
            }
            continue;
        }

        cell += char;
    }

    if (cell.length > 0 || row.length > 0) {
        pushRow();
    }

    if (!rows.length) {
        return [];
    }

    const headers = rows.shift().map(normalizeHeader);
    return rows.map(values => {
        const record = {};
        headers.forEach((header, index) => {
            record[header] = normalizeText(values[index] ?? '');
        });
        return record;
    });
}

function parseCSVFile(filePath) {
    return new Promise((resolve, reject) => {
        const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
        const records = [];
        let headers = null;
        let row = [];
        let cell = '';
        let inQuotes = false;
        let pendingCR = false;

        const pushCell = () => {
            row.push(cell);
            cell = '';
        };

        const finalizeRow = () => {
            pushCell();

            const hasContent = row.some(value => String(value).trim() !== '');
            if (!headers) {
                if (hasContent) {
                    headers = row.map(normalizeHeader);
                }
            } else if (hasContent) {
                const record = {};
                headers.forEach((header, index) => {
                    record[header] = normalizeText(row[index] ?? '');
                });
                records.push(record);
            }

            row = [];
        };

        stream.on('data', chunk => {
            for (let i = 0; i < chunk.length; i += 1) {
                const char = chunk[i];
                const next = chunk[i + 1];

                if (pendingCR) {
                    pendingCR = false;
                    if (char === '\n') {
                        continue;
                    }
                }

                if (char === '"') {
                    if (inQuotes && next === '"') {
                        cell += '"';
                        i += 1;
                    } else {
                        inQuotes = !inQuotes;
                    }
                    continue;
                }

                if (char === ',' && !inQuotes) {
                    pushCell();
                    continue;
                }

                if ((char === '\n' || char === '\r') && !inQuotes) {
                    if (char === '\r') {
                        pendingCR = true;
                    }
                    finalizeRow();
                    continue;
                }

                cell += char;
            }
        });

        stream.on('end', () => {
            if (cell.length > 0 || row.length > 0) {
                finalizeRow();
            }
            resolve(records);
        });

        stream.on('error', reject);
    });
}

function getValue(row, ...keys) {
    for (const key of keys) {
        const normalizedKey = normalizeHeader(key);
        if (row[normalizedKey] !== undefined && row[normalizedKey] !== null) {
            const value = normalizeText(row[normalizedKey]);
            if (value) {
                return value;
            }
        }
    }
    return '';
}

function buildGraph(records, fileName) {
    const nodes = new Map();
    const links = new Map();
    const speciesSet = new Set();
    const relationshipSet = new Set();
    const typeSet = new Set();

    const ensureNode = (label, type) => {
        const cleanLabel = normalizeText(label) || 'Unnamed Entity';
        const cleanType = normalizeType(type);
        const nodeId = `pc_${cleanType}_${slugify(cleanLabel)}`;

        if (!nodes.has(nodeId)) {
            nodes.set(nodeId, {
                id: nodeId,
                label: cleanLabel,
                type: cleanType,
                size: 12,
                attributes: {
                    source_count: 0,
                    target_count: 0,
                    relationship_count: 0,
                    pubmed_ids: new Set(),
                    species: new Set(),
                    basis: new Set(),
                    relationships: new Set(),
                    source_types: new Set(),
                    target_types: new Set(),
                    source_aliases: new Set(),
                    target_aliases: new Set(),
                    source_definitions: new Set(),
                    target_definitions: new Set(),
                    source_generated_definitions: new Set(),
                    target_generated_definitions: new Set(),
                    p_sources: new Set()
                },
                stats: {
                    degree: 0,
                    mentions: 0
                }
            });
        }

        return nodes.get(nodeId);
    };

    const mergeTextSet = (set, value) => {
        const cleanValue = normalizeText(value);
        if (cleanValue) {
            set.add(cleanValue);
        }
    };

    records.forEach((row, index) => {
        const sourceLabel = getValue(row, 'source_resolved', 'source') || `Source ${index + 1}`;
        const targetLabel = getValue(row, 'target_resolved', 'target') || `Target ${index + 1}`;
        const sourceType = getValue(row, 'source_type_resolved', 'source_type');
        const targetType = getValue(row, 'target_type_resolved', 'target_type');
        const sourceAlias = getValue(row, 'source_gene_alias');
        const targetAlias = getValue(row, 'target_gene_alias');
        const relationship = getValue(row, 'relationship_resolved', 'relationship') || 'related';
        const pubmedID = getValue(row, 'pubmedid', 'pubmed_id', 'pmid');
        const species = getValue(row, 'species');
        const basis = getValue(row, 'basis');
        const pSource = getValue(row, 'p_source');

        const sourceNode = ensureNode(sourceLabel, sourceType);
        const targetNode = ensureNode(targetLabel, targetType);

        sourceNode.attributes.source_count += 1;
        targetNode.attributes.target_count += 1;
        sourceNode.attributes.relationship_count += 1;
        targetNode.attributes.relationship_count += 1;
        sourceNode.stats.degree += 1;
        targetNode.stats.degree += 1;
        sourceNode.stats.mentions += 1;
        targetNode.stats.mentions += 1;

        mergeTextSet(sourceNode.attributes.pubmed_ids, pubmedID);
        mergeTextSet(targetNode.attributes.pubmed_ids, pubmedID);
        mergeTextSet(sourceNode.attributes.species, species);
        mergeTextSet(targetNode.attributes.species, species);
        mergeTextSet(sourceNode.attributes.basis, basis);
        mergeTextSet(targetNode.attributes.basis, basis);
        mergeTextSet(sourceNode.attributes.relationships, relationship);
        mergeTextSet(targetNode.attributes.relationships, relationship);
        mergeTextSet(sourceNode.attributes.source_types, sourceType);
        mergeTextSet(targetNode.attributes.target_types, targetType);
        mergeTextSet(sourceNode.attributes.source_aliases, sourceAlias);
        mergeTextSet(targetNode.attributes.target_aliases, targetAlias);
        mergeTextSet(sourceNode.attributes.source_definitions, getValue(row, 'source_extracted_definition'));
        mergeTextSet(targetNode.attributes.target_definitions, getValue(row, 'target_extracted_definition'));
        mergeTextSet(sourceNode.attributes.source_generated_definitions, getValue(row, 'source_generated_definition'));
        mergeTextSet(targetNode.attributes.target_generated_definitions, getValue(row, 'target_generated_definition'));
        mergeTextSet(sourceNode.attributes.p_sources, pSource);
        mergeTextSet(targetNode.attributes.p_sources, pSource);

        speciesSet.add(species || 'unspecified');
        relationshipSet.add(relationship);
        typeSet.add(sourceNode.type);
        typeSet.add(targetNode.type);

        const edgeKey = [
            sourceNode.id,
            targetNode.id,
            slugify(relationship),
            slugify(pubmedID || basis || species || 'evidence')
        ].join('__');

        if (!links.has(edgeKey)) {
            links.set(edgeKey, {
                source: sourceNode.id,
                target: targetNode.id,
                weight: 1,
                label: relationship,
                relationship_type: relationship,
                pubmedID: pubmedID,
                species: species,
                basis: basis,
                p_source: pSource,
                source_type: sourceNode.type,
                target_type: targetNode.type,
                source_resolved: sourceLabel,
                target_resolved: targetLabel,
                source_alias: sourceAlias,
                target_alias: targetAlias,
                source_extracted_definition: getValue(row, 'source_extracted_definition'),
                source_generated_definition: getValue(row, 'source_generated_definition'),
                target_extracted_definition: getValue(row, 'target_extracted_definition'),
                target_generated_definition: getValue(row, 'target_generated_definition'),
                relationship_resolved: getValue(row, 'relationship_resolved'),
                attributes: {
                    evidence: [{
                        pubmedID,
                        species,
                        basis,
                        p_source: pSource
                    }],
                    rows: [index]
                }
            });
        } else {
            const edge = links.get(edgeKey);
            edge.weight += 1;
            edge.attributes.evidence.push({
                pubmedID,
                species,
                basis,
                p_source: pSource
            });
            edge.attributes.rows.push(index);
        }
    });

    const nodesArray = Array.from(nodes.values()).map(node => {
        const degree = Math.max(node.stats.degree, 1);
        const mentions = Math.max(node.stats.mentions, 1);
        const size = Math.max(10, Math.min(48, 10 + Math.sqrt(degree) * 4 + Math.log(mentions + 1) * 2));

        return {
            id: node.id,
            label: node.label,
            type: node.type,
            size,
            attributes: {
                source_count: node.attributes.source_count,
                target_count: node.attributes.target_count,
                relationship_count: node.attributes.relationship_count,
                pubmed_ids: Array.from(node.attributes.pubmed_ids),
                species: Array.from(node.attributes.species),
                basis: Array.from(node.attributes.basis),
                relationships: Array.from(node.attributes.relationships),
                source_types: Array.from(node.attributes.source_types),
                target_types: Array.from(node.attributes.target_types),
                source_aliases: Array.from(node.attributes.source_aliases),
                target_aliases: Array.from(node.attributes.target_aliases),
                source_definitions: Array.from(node.attributes.source_definitions),
                target_definitions: Array.from(node.attributes.target_definitions),
                source_generated_definitions: Array.from(node.attributes.source_generated_definitions),
                target_generated_definitions: Array.from(node.attributes.target_generated_definitions),
                p_sources: Array.from(node.attributes.p_sources),
                degree
            }
        };
    });

    const linksArray = Array.from(links.values());
    return {
        nodes: nodesArray,
        links: linksArray,
        edges: linksArray,
        metadata: {
            source_format: 'plantconnectome_final_list_csv',
            file_name: fileName,
            row_count: records.length,
            node_count: nodesArray.length,
            edge_count: linksArray.length,
            species: Array.from(speciesSet).filter(Boolean),
            relationship_types: Array.from(relationshipSet).filter(Boolean),
            node_types: Array.from(typeSet).filter(Boolean)
        }
    };
}

function streamBuildGraph(filePath, fileName, maxRows = 20000) {
    return new Promise((resolve, reject) => {
        const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
        const nodes = new Map();
        const links = new Map();
        const speciesSet = new Set();
        const relationshipSet = new Set();
        const typeSet = new Set();

        let headers = null;
        let row = [];
        let cell = '';
        let inQuotes = false;
        let pendingCR = false;
        let rowIndex = 0;
        let truncated = false;
        let resolved = false;
        let stopProcessing = false;

        const addLimited = (set, value, limit = 20) => {
            const cleanValue = normalizeText(value);
            if (!cleanValue || set.size >= limit) {
                return;
            }
            set.add(cleanValue);
        };

        const ensureNode = (label, type) => {
            const cleanLabel = normalizeText(label) || 'Unnamed Entity';
            const cleanType = normalizeType(type);
            const nodeId = `pc_${cleanType}_${slugify(cleanLabel)}`;

            if (!nodes.has(nodeId)) {
                nodes.set(nodeId, {
                    id: nodeId,
                    label: cleanLabel,
                    type: cleanType,
                    size: 12,
                    attributes: {
                        source_count: 0,
                        target_count: 0,
                        relationship_count: 0,
                        pubmed_ids: new Set(),
                        species: new Set(),
                        basis: new Set(),
                        relationships: new Set(),
                        source_types: new Set(),
                        target_types: new Set(),
                        source_aliases: new Set(),
                        target_aliases: new Set(),
                        source_definitions: new Set(),
                        target_definitions: new Set(),
                        source_generated_definitions: new Set(),
                        target_generated_definitions: new Set(),
                        p_sources: new Set()
                    },
                    stats: {
                        degree: 0,
                        mentions: 0
                    }
                });
            }

            return nodes.get(nodeId);
        };

        const finalizeRow = () => {
            row.push(cell);
            const hasContent = row.some(value => String(value).trim() !== '');

            if (!headers) {
                if (hasContent) {
                    headers = row.map(normalizeHeader);
                }
            } else if (hasContent) {
                const record = {};
                headers.forEach((header, index) => {
                    record[header] = normalizeText(row[index] ?? '');
                });

                const sourceLabel = getValue(record, 'source_resolved', 'source') || `Source ${rowIndex + 1}`;
                const targetLabel = getValue(record, 'target_resolved', 'target') || `Target ${rowIndex + 1}`;
                const sourceType = getValue(record, 'source_type_resolved', 'source_type');
                const targetType = getValue(record, 'target_type_resolved', 'target_type');
                const sourceAlias = getValue(record, 'source_gene_alias');
                const targetAlias = getValue(record, 'target_gene_alias');
                const relationship = getValue(record, 'relationship_resolved', 'relationship') || 'related';
                const pubmedID = getValue(record, 'pubmedid', 'pubmed_id', 'pmid');
                const species = getValue(record, 'species');
                const basis = getValue(record, 'basis');
                const pSource = getValue(record, 'p_source');

                const sourceNode = ensureNode(sourceLabel, sourceType);
                const targetNode = ensureNode(targetLabel, targetType);

                sourceNode.attributes.source_count += 1;
                targetNode.attributes.target_count += 1;
                sourceNode.attributes.relationship_count += 1;
                targetNode.attributes.relationship_count += 1;
                sourceNode.stats.degree += 1;
                targetNode.stats.degree += 1;
                sourceNode.stats.mentions += 1;
                targetNode.stats.mentions += 1;

                addLimited(sourceNode.attributes.pubmed_ids, pubmedID);
                addLimited(targetNode.attributes.pubmed_ids, pubmedID);
                addLimited(sourceNode.attributes.species, species);
                addLimited(targetNode.attributes.species, species);
                addLimited(sourceNode.attributes.basis, basis);
                addLimited(targetNode.attributes.basis, basis);
                addLimited(sourceNode.attributes.relationships, relationship);
                addLimited(targetNode.attributes.relationships, relationship);
                addLimited(sourceNode.attributes.source_types, sourceType);
                addLimited(targetNode.attributes.target_types, targetType);
                addLimited(sourceNode.attributes.source_aliases, sourceAlias);
                addLimited(targetNode.attributes.target_aliases, targetAlias);
                addLimited(sourceNode.attributes.source_definitions, getValue(record, 'source_extracted_definition'));
                addLimited(targetNode.attributes.target_definitions, getValue(record, 'target_extracted_definition'));
                addLimited(sourceNode.attributes.source_generated_definitions, getValue(record, 'source_generated_definition'));
                addLimited(targetNode.attributes.target_generated_definitions, getValue(record, 'target_generated_definition'));
                addLimited(sourceNode.attributes.p_sources, pSource);
                addLimited(targetNode.attributes.p_sources, pSource);

                if (species) speciesSet.add(species);
                if (relationship) relationshipSet.add(relationship);
                typeSet.add(sourceNode.type);
                typeSet.add(targetNode.type);

                const edgeKey = [
                    sourceNode.id,
                    targetNode.id,
                    slugify(relationship)
                ].join('__');

                if (!links.has(edgeKey)) {
                    links.set(edgeKey, {
                        source: sourceNode.id,
                        target: targetNode.id,
                        weight: 1,
                        label: relationship,
                        relationship_type: relationship,
                        pubmedID: pubmedID,
                        species: species,
                        basis: basis,
                        p_source: pSource,
                        source_type: sourceNode.type,
                        target_type: targetNode.type,
                        source_resolved: sourceLabel,
                        target_resolved: targetLabel,
                        source_alias: sourceAlias,
                        target_alias: targetAlias,
                        source_extracted_definition: getValue(record, 'source_extracted_definition'),
                        source_generated_definition: getValue(record, 'source_generated_definition'),
                        target_extracted_definition: getValue(record, 'target_extracted_definition'),
                        target_generated_definition: getValue(record, 'target_generated_definition'),
                        relationship_resolved: getValue(record, 'relationship_resolved')
                    });
                } else {
                    const edge = links.get(edgeKey);
                    edge.weight += 1;
                    if (!edge.pubmedID && pubmedID) edge.pubmedID = pubmedID;
                    if (!edge.species && species) edge.species = species;
                    if (!edge.basis && basis) edge.basis = basis;
                    if (!edge.p_source && pSource) edge.p_source = pSource;
                }

                rowIndex += 1;
                if (rowIndex >= maxRows) {
                    truncated = true;
                    stopProcessing = true;
                    stream.destroy();
                    return;
                }
            }

            row = [];
            cell = '';
        };

        stream.on('data', chunk => {
            for (let i = 0; i < chunk.length; i += 1) {
                if (stopProcessing) {
                    break;
                }

                const char = chunk[i];
                const next = chunk[i + 1];

                if (pendingCR) {
                    pendingCR = false;
                    if (char === '\n') {
                        continue;
                    }
                }

                if (char === '"') {
                    if (inQuotes && next === '"') {
                        cell += '"';
                        i += 1;
                    } else {
                        inQuotes = !inQuotes;
                    }
                    continue;
                }

                if (char === ',' && !inQuotes) {
                    row.push(cell);
                    cell = '';
                    continue;
                }

                if ((char === '\n' || char === '\r') && !inQuotes) {
                    if (char === '\r') {
                        pendingCR = true;
                    }
                    finalizeRow();
                    continue;
                }

                cell += char;
            }
        });

        const finish = () => {
            if (resolved) {
                return;
            }
            resolved = true;

            if (cell.length > 0 || row.length > 0) {
                finalizeRow();
            }

            const nodesArray = Array.from(nodes.values()).map(node => {
                const degree = Math.max(node.stats.degree, 1);
                const mentions = Math.max(node.stats.mentions, 1);
                const size = Math.max(10, Math.min(48, 10 + Math.sqrt(degree) * 4 + Math.log(mentions + 1) * 2));

                return {
                    id: node.id,
                    label: node.label,
                    type: node.type,
                    size,
                    attributes: {
                        source_count: node.attributes.source_count,
                        target_count: node.attributes.target_count,
                        relationship_count: node.attributes.relationship_count,
                        pubmed_ids: Array.from(node.attributes.pubmed_ids),
                        species: Array.from(node.attributes.species),
                        basis: Array.from(node.attributes.basis),
                        relationships: Array.from(node.attributes.relationships),
                        source_types: Array.from(node.attributes.source_types),
                        target_types: Array.from(node.attributes.target_types),
                        source_aliases: Array.from(node.attributes.source_aliases),
                        target_aliases: Array.from(node.attributes.target_aliases),
                        source_definitions: Array.from(node.attributes.source_definitions),
                        target_definitions: Array.from(node.attributes.target_definitions),
                        source_generated_definitions: Array.from(node.attributes.source_generated_definitions),
                        target_generated_definitions: Array.from(node.attributes.target_generated_definitions),
                        p_sources: Array.from(node.attributes.p_sources),
                        degree
                    }
                };
            });

            const linksArray = Array.from(links.values());

            resolve({
                nodes: nodesArray,
                links: linksArray,
                edges: linksArray,
                metadata: {
                    source_format: 'plantconnectome_final_list_csv',
                    file_name: fileName,
                    row_count: rowIndex,
                    node_count: nodesArray.length,
                    edge_count: linksArray.length,
                    species: Array.from(speciesSet).filter(Boolean),
                    relationship_types: Array.from(relationshipSet).filter(Boolean),
                    node_types: Array.from(typeSet).filter(Boolean),
                    compact_export: true,
                    truncated,
                    max_rows: maxRows
                }
            });
        };

        stream.on('end', finish);
        stream.on('close', finish);

        stream.on('error', reject);
    });
}

async function main() {
    const inputPath = process.argv[2];
    const outputPath = process.argv[3];
    const maxRowsArg = process.argv[4];

    if (!inputPath || !outputPath) {
        console.error('Usage: node scripts/convert-plantconnectome-csv.js <input.csv> <output.json>');
        process.exit(1);
    }

    const resolvedInput = path.resolve(inputPath);
    const resolvedOutput = path.resolve(outputPath);

    if (!fs.existsSync(resolvedInput)) {
        console.error(`Input file not found: ${resolvedInput}`);
        process.exit(1);
    }

    const maxRows = Number.isFinite(Number(maxRowsArg)) && Number(maxRowsArg) > 0
        ? Number(maxRowsArg)
        : 20000;

    const graph = await streamBuildGraph(resolvedInput, path.basename(resolvedInput), maxRows);

    fs.writeFileSync(resolvedOutput, JSON.stringify(graph, null, 2), 'utf8');

    console.log(`Converted ${graph.metadata.row_count} rows${graph.metadata.truncated ? ' (truncated)' : ''}`);
    console.log(`Nodes: ${graph.nodes.length}`);
    console.log(`Edges: ${graph.links.length}`);
    console.log(`Output: ${resolvedOutput}`);
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
