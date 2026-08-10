class PlantConnectomeLoader {
    constructor() {
        this.requiredHeaders = ['source', 'relationship', 'target', 'pubmedid'];
        this.typeAliases = new Map([
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
    }

    async canLoad(file) {
        if (!file || !file.name || !/\.csv$/i.test(file.name)) {
            return false;
        }

        if (/plantconnectome/i.test(file.name)) {
            return true;
        }

        try {
            const preview = await this.readTextSlice(file, 8192);
            const rows = this.parseCSV(preview);
            if (!rows.length) {
                return false;
            }

            const headerSet = new Set(Object.keys(rows[0]));
            return this.requiredHeaders.every(header => headerSet.has(header));
        } catch (error) {
            console.warn('PlantConnectome CSV detection failed:', error);
            return false;
        }
    }

    async load(file) {
        const text = await this.readFileText(file);
        const records = this.parseCSV(text);
        return this.buildGraph(records, file?.name || 'plantconnectome.csv');
    }

    async readTextSlice(file, size) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => resolve(event.target.result || '');
            reader.onerror = () => reject(new Error('Unable to read CSV preview'));
            reader.readAsText(file.slice(0, size));
        });
    }

    async readFileText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => resolve(event.target.result || '');
            reader.onerror = () => reject(new Error('Unable to read CSV file'));
            reader.readAsText(file);
        });
    }

    normalizeHeader(header) {
        return String(header || '')
            .replace(/^\uFEFF/, '')
            .trim()
            .toLowerCase()
            .replace(/['"]/g, '')
            .replace(/\s+/g, '_')
            .replace(/_+/g, '_');
    }

    normalizeText(value) {
        return String(value ?? '').trim();
    }

    slugify(value) {
        return this.normalizeText(value)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');
    }

    normalizeType(value) {
        const raw = this.normalizeText(value).toLowerCase();
        if (!raw) {
            return 'concept';
        }
        return this.typeAliases.get(raw) || raw.replace(/[^a-z0-9]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'concept';
    }

    parseCSV(csvText) {
        const rows = [];
        let row = [];
        let cell = '';
        let inQuotes = false;

        const pushCell = () => {
            row.push(cell);
            cell = '';
        };

        const pushRow = () => {
            if (row.length === 0 && !cell.trim()) {
                cell = '';
                return;
            }
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
                pushRow();
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

        const headers = rows.shift().map(header => this.normalizeHeader(header));
        return rows.map(values => {
            const record = {};
            headers.forEach((header, index) => {
                record[header] = this.normalizeText(values[index] ?? '');
            });
            return record;
        });
    }

    getValue(row, ...keys) {
        for (const key of keys) {
            const normalizedKey = this.normalizeHeader(key);
            if (row[normalizedKey] !== undefined && row[normalizedKey] !== null) {
                const value = this.normalizeText(row[normalizedKey]);
                if (value) {
                    return value;
                }
            }
        }
        return '';
    }

    ensureNode(nodes, label, type) {
        const cleanLabel = this.normalizeText(label) || 'Unnamed Entity';
        const cleanType = this.normalizeType(type);
        const nodeId = `pc_${cleanType}_${this.slugify(cleanLabel)}`;

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
    }

    mergeTextSet(set, value) {
        const cleanValue = this.normalizeText(value);
        if (cleanValue) {
            set.add(cleanValue);
        }
    }

    buildGraph(records, fileName) {
        const nodes = new Map();
        const links = new Map();
        const speciesSet = new Set();
        const relationshipSet = new Set();
        const typeSet = new Set();

        records.forEach((row, index) => {
            const sourceLabel = this.getValue(row, 'source_resolved', 'source') || `Source ${index + 1}`;
            const targetLabel = this.getValue(row, 'target_resolved', 'target') || `Target ${index + 1}`;
            const sourceType = this.getValue(row, 'source_type_resolved', 'source_type');
            const targetType = this.getValue(row, 'target_type_resolved', 'target_type');
            const sourceAlias = this.getValue(row, 'source_gene_alias');
            const targetAlias = this.getValue(row, 'target_gene_alias');
            const relationship = this.getValue(row, 'relationship_resolved', 'relationship') || 'related';
            const pubmedID = this.getValue(row, 'pubmedid', 'pubmed_id', 'pmid');
            const species = this.getValue(row, 'species');
            const basis = this.getValue(row, 'basis');
            const pSource = this.getValue(row, 'p_source');

            const sourceNode = this.ensureNode(nodes, sourceLabel, sourceType);
            const targetNode = this.ensureNode(nodes, targetLabel, targetType);

            sourceNode.attributes.source_count += 1;
            targetNode.attributes.target_count += 1;
            sourceNode.attributes.relationship_count += 1;
            targetNode.attributes.relationship_count += 1;
            sourceNode.stats.mentions += 1;
            targetNode.stats.mentions += 1;

            this.mergeTextSet(sourceNode.attributes.pubmed_ids, pubmedID);
            this.mergeTextSet(targetNode.attributes.pubmed_ids, pubmedID);
            this.mergeTextSet(sourceNode.attributes.species, species);
            this.mergeTextSet(targetNode.attributes.species, species);
            this.mergeTextSet(sourceNode.attributes.basis, basis);
            this.mergeTextSet(targetNode.attributes.basis, basis);
            this.mergeTextSet(sourceNode.attributes.relationships, relationship);
            this.mergeTextSet(targetNode.attributes.relationships, relationship);
            this.mergeTextSet(sourceNode.attributes.source_types, sourceType);
            this.mergeTextSet(targetNode.attributes.target_types, targetType);
            this.mergeTextSet(sourceNode.attributes.source_aliases, sourceAlias);
            this.mergeTextSet(targetNode.attributes.target_aliases, targetAlias);
            this.mergeTextSet(sourceNode.attributes.source_definitions, this.getValue(row, 'source_extracted_definition'));
            this.mergeTextSet(targetNode.attributes.target_definitions, this.getValue(row, 'target_extracted_definition'));
            this.mergeTextSet(sourceNode.attributes.source_generated_definitions, this.getValue(row, 'source_generated_definition'));
            this.mergeTextSet(targetNode.attributes.target_generated_definitions, this.getValue(row, 'target_generated_definition'));
            this.mergeTextSet(sourceNode.attributes.p_sources, pSource);
            this.mergeTextSet(targetNode.attributes.p_sources, pSource);

            speciesSet.add(species || 'unspecified');
            relationshipSet.add(relationship);
            typeSet.add(sourceNode.type);
            typeSet.add(targetNode.type);

            sourceNode.stats.degree += 1;
            targetNode.stats.degree += 1;

            const edgeKey = [
                sourceNode.id,
                targetNode.id,
                this.slugify(relationship),
                this.slugify(pubmedID || basis || species || 'evidence')
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
                    source_extracted_definition: this.getValue(row, 'source_extracted_definition'),
                    source_generated_definition: this.getValue(row, 'source_generated_definition'),
                    target_extracted_definition: this.getValue(row, 'target_extracted_definition'),
                    target_generated_definition: this.getValue(row, 'target_generated_definition'),
                    relationship_resolved: this.getValue(row, 'relationship_resolved'),
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
            const attributes = node.attributes;
            const degree = Math.max(node.stats.degree, 1);
            const mentionScore = Math.max(node.stats.mentions, 1);
            const baseSize = 10 + Math.sqrt(degree) * 4 + Math.log(mentionScore + 1) * 2;

            return {
                id: node.id,
                label: node.label,
                type: node.type,
                size: Math.max(10, Math.min(48, baseSize)),
                attributes: {
                    source_count: attributes.source_count,
                    target_count: attributes.target_count,
                    relationship_count: attributes.relationship_count,
                    pubmed_ids: Array.from(attributes.pubmed_ids),
                    species: Array.from(attributes.species),
                    basis: Array.from(attributes.basis),
                    relationships: Array.from(attributes.relationships),
                    source_types: Array.from(attributes.source_types),
                    target_types: Array.from(attributes.target_types),
                    source_aliases: Array.from(attributes.source_aliases),
                    target_aliases: Array.from(attributes.target_aliases),
                    source_definitions: Array.from(attributes.source_definitions),
                    target_definitions: Array.from(attributes.target_definitions),
                    source_generated_definitions: Array.from(attributes.source_generated_definitions),
                    target_generated_definitions: Array.from(attributes.target_generated_definitions),
                    p_sources: Array.from(attributes.p_sources),
                    degree
                }
            };
        });

        const linksArray = Array.from(links.values());
        const metadata = {
            source_format: 'plantconnectome_final_list_csv',
            file_name: fileName,
            row_count: records.length,
            node_count: nodesArray.length,
            edge_count: linksArray.length,
            species: Array.from(speciesSet).filter(Boolean),
            relationship_types: Array.from(relationshipSet).filter(Boolean),
            node_types: Array.from(typeSet).filter(Boolean)
        };

        return {
            nodes: nodesArray,
            links: linksArray,
            edges: linksArray,
            metadata
        };
    }
}

window.PlantConnectomeLoader = PlantConnectomeLoader;
