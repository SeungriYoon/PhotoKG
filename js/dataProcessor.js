// Data Processing Class
class DataProcessor {
    constructor() {
        this.currentData = null;
        this.csvData = null;
        this.jsonData = null;
    }

    // Parse CSV
    parseCSV(csvText) {
        const lines = csvText.split('\n').filter(line => line.trim());
        if (lines.length < 2) return [];

        // Process headers (case-insensitive, remove quotes)
        const headers = lines[0].split(',').map(h => 
            h.trim().toLowerCase().replace(/['"]/g, '').replace(/\s+/g, '_')
        );

        const data = [];
        for (let i = 1; i < lines.length; i++) {
            try {
                const values = this.parseCSVLine(lines[i]);
                if (values.length >= headers.length) {
                    const row = {};
                    headers.forEach((header, index) => {
                        row[header] = values[index] ? values[index].trim().replace(/['"]/g, '') : '';
                    });
                    data.push(row);
                }
            } catch (error) {
                // Ignore individual row errors
            }
        }

        return data;
    }

    // Parse CSV line (including quote handling)
    parseCSVLine(line) {
        const values = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                values.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        values.push(current);
        return values;
    }

    // Automatically extract keywords from text
    extractKeywords(text, maxKeywords = 10) {
        // Clean text
        const cleanText = text.toLowerCase()
            .replace(/[^\w\s\uac00-\ud7a3]/g, ' ') // Remove special characters (keeps Korean)
            .replace(/\s+/g, ' ')
            .trim();

        // Split and filter words
        const words = cleanText.split(/\s+/)
            .filter(word => {
                return word.length > 2 && 
                       !CONFIG.STOPWORDS.has(word) && 
                       !/^\d+$/.test(word) && // Exclude pure numbers
                       !word.match(/^[a-z]{1,2}$/); // Exclude 1-2 letter English words
            });

        // Calculate frequency
        const wordCount = {};
        words.forEach(word => {
            wordCount[word] = (wordCount[word] || 0) + 1;
        });

        // N-gram processing (2-gram)
        for (let i = 0; i < words.length - 1; i++) {
            const bigram = `${words[i]} ${words[i + 1]}`;
            if (bigram.length > 5 && bigram.length < 30) { // Appropriate length limit
                wordCount[bigram] = (wordCount[bigram] || 0) + 0.8; // Slightly lower weight for 2-grams
            }
        }

        // Sort by frequency and return top keywords
        return Object.entries(wordCount)
            .sort((a, b) => b[1] - a[1])
            .slice(0, maxKeywords)
            .map(([word, count]) => ({ word, count }));
    }

    // Convert CSV to Knowledge Graph
    async csvToKnowledgeGraph(papers, config) {
        const nodes = new Map();
        const edges = new Map();
        const paperKeywords = [];

        // Extract keywords from each paper
        papers.forEach((paper, index) => {
            const keywords = new Set();

            // Extract from existing keyword fields
            const keywordFields = ['keywords', 'keyword', 'tags', 'subjects'];
            keywordFields.forEach(field => {
                if (paper[field] && paper[field].trim()) {
                    paper[field].split(/[,;|]/)
                        .map(k => k.trim().toLowerCase())
                        .filter(k => k.length > 2 && !CONFIG.STOPWORDS.has(k))
                        .forEach(k => keywords.add(k));
                }
            });

            // Automatically extract keywords from title and abstract
            let titleText = '';
            let abstractText = '';
            
            CONFIG.CSV_FIELDS.TITLE.forEach(field => {
                if (paper[field]) titleText += ' ' + paper[field];
            });
            
            CONFIG.CSV_FIELDS.ABSTRACT.forEach(field => {
                if (paper[field]) abstractText += ' ' + paper[field];
            });

            const combinedText = (titleText + ' ' + abstractText).trim();
            if (combinedText) {
                const extractedKeywords = this.extractKeywords(combinedText, config.maxKeywords);
                extractedKeywords.forEach(kw => keywords.add(kw.word));
            }

            // Add author information
            if (config.includeAuthors) {
                CONFIG.CSV_FIELDS.AUTHORS.forEach(field => {
                    if (paper[field]) {
                        paper[field].split(/[,;]/)
                            .map(a => a.trim())
                            .filter(a => a.length > 2)
                            .forEach(a => keywords.add(`author:${a.toLowerCase()}`));
                    }
                });
            }

            // Add journal/conference information
            if (config.includeJournals) {
                CONFIG.CSV_FIELDS.JOURNAL.forEach(field => {
                    if (paper[field]) {
                        const journal = paper[field].trim();
                        if (journal.length > 2) {
                            keywords.add(`journal:${journal.toLowerCase()}`);
                        }
                    }
                });
            }

            paperKeywords.push({
                paper: paper,
                keywords: Array.from(keywords)
            });
        });

        // Calculate frequency and create nodes
        const keywordFreq = new Map();
        paperKeywords.forEach(pk => {
            pk.keywords.forEach(keyword => {
                keywordFreq.set(keyword, (keywordFreq.get(keyword) || 0) + 1);
            });
        });

        // Create nodes only for keywords above the minimum frequency
        Array.from(keywordFreq.entries())
            .filter(([keyword, freq]) => freq >= config.minFrequency)
            .forEach(([keyword, freq]) => {
                // Collect related paper information
                const relatedPapers = paperKeywords
                    .filter(pk => pk.keywords.includes(keyword))
                    .map(pk => pk.paper);

                // Sum of citations
                const citations = relatedPapers
                    .map(p => {
                        for (let field of CONFIG.CSV_FIELDS.CITATIONS) {
                            if (p[field]) return parseInt(p[field]) || 0;
                        }
                        return 0;
                    });

                // Year information
                const years = relatedPapers
                    .map(p => {
                        for (let field of CONFIG.CSV_FIELDS.YEAR) {
                            if (p[field]) {
                                const year = parseInt(p[field]);
                                if (year > 1900 && year <= new Date().getFullYear()) {
                                    return year;
                                }
                            }
                        }
                        return null;
                    })
                    .filter(y => y !== null);

                // Determine node type and label
                let nodeType = 'keyword';
                let label = keyword;
                let nodeId = keyword;

                if (keyword.startsWith('author:')) {
                    nodeType = 'author';
                    label = keyword.substring(7);
                    nodeId = `author_${label.replace(/\s+/g, '_')}`;
                } else if (keyword.startsWith('journal:')) {
                    nodeType = 'journal';
                    label = keyword.substring(8);
                    nodeId = `journal_${label.replace(/\s+/g, '_')}`;
                } else {
                    nodeId = `keyword_${keyword.replace(/\s+/g, '_')}`;
                }

                // Calculate node size
                const totalCitations = citations.reduce((a, b) => a + b, 0);
                const size = UTILS.calculateNodeSize(freq, totalCitations);

                nodes.set(nodeId, {
                    id: nodeId,
                    label: label,
                    type: nodeType,
                    size: size,
                    attributes: {
                        related_papers: relatedPapers.slice(0, 10).map(p => 
                            p.title || p.paper_title || p.article_title || 'Untitled'
                        ),
                        total_citations: totalCitations,
                        first_appeared: years.length > 0 ? Math.min(...years) : null,
                        last_appeared: years.length > 0 ? Math.max(...years) : null,
                        frequency: freq,
                        paper_count: relatedPapers.length
                    }
                });
            });

        // Create edges (based on co-occurrence)
        paperKeywords.forEach(pk => {
            const validKeywords = pk.keywords.filter(k => keywordFreq.get(k) >= config.minFrequency);
            
            for (let i = 0; i < validKeywords.length; i++) {
                for (let j = i + 1; j < validKeywords.length; j++) {
                    const kw1 = validKeywords[i];
                    const kw2 = validKeywords[j];
                    
                    // Convert to node ID
                    const id1 = kw1.startsWith('author:') ? `author_${kw1.substring(7).replace(/\s+/g, '_')}` :
                               kw1.startsWith('journal:') ? `journal_${kw1.substring(8).replace(/\s+/g, '_')}` :
                               `keyword_${kw1.replace(/\s+/g, '_')}`;
                    const id2 = kw2.startsWith('author:') ? `author_${kw2.substring(7).replace(/\s+/g, '_')}` :
                               kw2.startsWith('journal:') ? `journal_${kw2.substring(8).replace(/\s+/g, '_')}` :
                               `keyword_${kw2.replace(/\s+/g, '_')}`;
                    
                    const edgeKey = id1 < id2 ? `${id1}__${id2}` : `${id2}__${id1}`;
                    
                    if (edges.has(edgeKey)) {
                        edges.get(edgeKey).weight++;
                    } else {
                        edges.set(edgeKey, {
                            source: id1,
                            target: id2,
                            weight: 1
                        });
                    }
                }
            }
        });

        return {
            nodes: Array.from(nodes.values()),
            edges: Array.from(edges.values())
        };
    }

    // Validate and normalize JSON data
    validateAndNormalizeJSON(jsonData) {
        console.log('validateAndNormalizeJSON called:', jsonData);
        console.log('jsonData type:', typeof jsonData);
        console.log('jsonData keys:', jsonData ? Object.keys(jsonData) : 'null');
        
        if (!jsonData) {
            throw new Error('JSON data is empty');
        }
        
        // Validate nodes
        console.log('Checking nodes:', jsonData.nodes, typeof jsonData.nodes, Array.isArray(jsonData.nodes));
        if (!jsonData.nodes) {
            throw new Error('nodes property is missing');
        }
        if (!Array.isArray(jsonData.nodes)) {
            throw new Error(`nodes is not an array. Type: ${typeof jsonData.nodes}`);
        }
        
        // Validate edges/links (some JSON might use 'links')
        let edges = jsonData.edges || jsonData.links;
        console.log('Checking edges:', edges, typeof edges, Array.isArray(edges));
        if (!edges) {
            throw new Error('edges or links property is missing');
        }
        if (!Array.isArray(edges)) {
            throw new Error(`edges is not an array. Type: ${typeof edges}`);
        }

        console.log('JSON validation passed - nodes:', jsonData.nodes.length, 'edges:', edges.length);

        return {
            nodes: jsonData.nodes.map((node, index) => ({
                id: node.id || `node_${index}`,
                label: node.label || node.name || node.id || `Node ${index}`,
                size: Math.max(CONFIG.DEFAULTS.NODE_SIZE_MIN, 
                              Math.min(CONFIG.DEFAULTS.NODE_SIZE_MAX, 
                                      node.size || Math.random() * 20 + 10)),
                type: node.type || 'concept',
                attributes: node.attributes || {}
            })),
            edges: edges.map((edge, index) => ({
                source: edge.source || edge.from,
                target: edge.target || edge.to,
                weight: Math.max(1, edge.weight || edge.value || 1)
            }))
        };
    }

    // Detect file type
    detectFileType(fileName) {
        const lowerName = fileName.toLowerCase();
        if (lowerName.endsWith('.csv')) return 'csv';
        if (lowerName.endsWith('.json')) return 'json';
        return null;
    }

    // Handle file
    async handleFile(file) {
        const fileType = this.detectFileType(file.name);
        
        if (fileType === 'csv') {
            return await this.handleCSVFile(file);
        } else if (fileType === 'json') {
            return await this.handleJSONFile(file);
        } else {
            throw new Error('Only CSV or JSON files are supported');
        }
    }

    // Handle CSV file
    async handleCSVFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    this.csvData = e.target.result;
                    const lines = this.csvData.split('\n').filter(line => line.trim());
                    const estimatedRows = lines.length - 1;
                    
                    resolve({
                        type: 'csv',
                        data: this.csvData,
                        estimatedRows: estimatedRows,
                        fileName: file.name
                    });
                } catch (error) {
                    reject(new Error(`CSV read error: ${error.message}`));
                }
            };
            reader.onerror = () => reject(new Error('File read failed'));
            reader.readAsText(file);
        });
    }

    // Handle JSON file
    async handleJSONFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    console.log('JSON file read complete, size:', e.target.result.length);
                    this.jsonData = JSON.parse(e.target.result);
                    console.log('JSON parsing complete:', this.jsonData);
                    
                    const normalizedData = this.validateAndNormalizeJSON(this.jsonData);
                    console.log('Normalization complete:', normalizedData);
                    
                    resolve({
                        type: 'json',
                        data: normalizedData,
                        nodes: normalizedData.nodes.length,
                        edges: normalizedData.edges.length,
                        fileName: file.name
                    });
                } catch (error) {
                    console.error('JSON processing error:', error);
                    reject(new Error(`JSON parsing error: ${error.message}`));
                }
            };
            reader.onerror = (error) => {
                console.error('File read error:', error);
                reject(new Error('File read failed'));
            };
            reader.readAsText(file);
        });
    }
}