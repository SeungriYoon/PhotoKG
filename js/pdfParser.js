/**
 * Advanced PDF Parser Module
 * Parses PDF files and converts them into a knowledge graph JSON.
 * Applies patterns from Parser_KG.py and Text_analyzer5_fast.py.
 * Supports AI-based keyword analysis.
 */

class PDFParser {
    constructor() {
        this.console = null;
        
        // BERT model status
        this.bertModels = {
            enabled: false,
            sciBert: null
        };
        
        // NER configuration
        this.nerConfig = {
            confidence_threshold: 0.6,
            max_entities_per_sentence: 5
        };
        
        // Regular expression patterns (based on Parser_KG.py)
        this.citationPatterns = [
            /\[(\d+(?:,\s*\d+)*)\]/g,  // [1], [1,2,3]
            /\((\d+)\)/g,              // (1)
            /(\w+\s+et\s+al\.?\s*\(\d{4}\))/g,  // Smith et al. (2000)
            /(\w+\s*\(\d{4}\))/g,      // Smith (2000)
        ];
        
        this.formulaPatterns = [
            /[A-Za-z]\s*=\s*[^,.\n]+/g,  // E = mc^2
            /\$[^$]+\$/g,                 // LaTeX math
            /[α-ωΑ-Ω]\s*=\s*[^,.\n]+/g,  // Greek letters
        ];
        
        this.valuePatterns = [
            /(\d+(?:\.\d+)?)\s*±\s*(\d+(?:\.\d+)?)\s*([a-zA-Z/°%μ]+)/g,  // 25.3 ± 2.1 mg/L
            /(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)\s*([a-zA-Z/°%μ]+)/g,        // 15-20%
            /(\d+(?:\.\d+)?)\s*×\s*10\^?(-?\d+)\s*([a-zA-Z/°%μ]+)/g,     // 3.14 × 10^-6 mol
            /(\d+(?:\.\d+)?)\s*([a-zA-Z/°%μ]+)/g,                        // 25.3 mg/L
        ];
        
        // Node type keywords (based on Parser_KG.py)
        this.nodeTypeKeywords = {
            'concept': ['theory', 'model', 'concept', 'principle', 'framework', 'hypothesis'],
            'process': ['process', 'procedure', 'mechanism', 'reaction', 'synthesis', 'pathway', 'cycle'],
            'material': ['compound', 'material', 'substance', 'chemical', 'polymer', 'enzyme', 'protein'],
            'measurement': ['measurement', 'value', 'result', 'data', 'analysis', 'concentration', 'rate'],
            'formula': ['equation', 'formula', 'expression', 'calculation', 'coefficient'],
            'method': ['method', 'technique', 'approach', 'protocol', 'procedure', 'assay'],
            'condition': ['condition', 'parameter', 'temperature', 'pressure', 'ph', 'humidity', 'intensity']
        };
        
        // Relationship type keywords (based on Parser_KG.py)
        this.relationshipKeywords = {
            'INFLUENCES': ['affects', 'influences', 'impacts', 'modifies', 'alters', 'changes'],
            'DEPENDS_ON': ['depends', 'relies on', 'requires', 'needs', 'based on'],
            'MEASURED_BY': ['measured by', 'determined by', 'quantified by', 'assessed by'],
            'CALCULATED_BY': ['calculated by', 'computed using', 'derived from', 'estimated by'],
            'PART_OF': ['part of', 'component of', 'element of', 'contains', 'includes'],
            'CAUSES': ['causes', 'leads to', 'results in', 'produces', 'generates'],
            'CORRELATES_WITH': ['correlates', 'associated with', 'related to', 'linked to'],
            'DEFINED_AS': ['defined as', 'is', 'equals', 'represents', 'means'],
            'INHIBITS': ['inhibits', 'blocks', 'prevents', 'reduces', 'decreases'],
            'ACTIVATES': ['activates', 'stimulates', 'enhances', 'increases', 'promotes']
        };
        
        // Keyword groups by scientific field (based on Text_analyzer5_fast.py)
        this.keywordGroups = {
            'photosynthesis': ['photosynthesis', 'photosynthetic', 'photosynthetic process'],
            'chlorophyll': ['chlorophyll', 'chlorophyll a', 'chlorophyll b', 'chlorophyll content'],
            'thylakoid': ['thylakoid', 'thylakoid membrane', 'thylakoid membranes', 'grana thylakoid'],
            'photosystem': ['photosystem', 'photosystem i', 'photosystem ii', 'psi', 'psii'],
            'heat stress': ['heat stress', 'heat', 'thermal stress', 'high temperature'],
            'drought': ['drought', 'drought stress', 'water stress', 'dehydration'],
            'salt stress': ['salt stress', 'salinity', 'salt tolerance'],
            'light stress': ['light stress', 'high light', 'excess light', 'photoinhibition'],
            'carbon fixation': ['carbon fixation', 'co2 fixation', 'calvin cycle'],
            'electron transport': ['electron transport', 'electron transport chain', 'etc'],
            'atp synthase': ['atp synthase', 'atpase', 'atp synthesis'],
            'chlorophyll fluorescence': ['chlorophyll fluorescence', 'fluorescence', 'npq'],
            'rubisco': ['rubisco', 'ribulose bisphosphate carboxylase', 'rbcl'],
            'c4': ['c4', 'c4 photosynthesis', 'c4 pathway'],
            'cam': ['cam', 'crassulacean acid metabolism'],
            'light harvesting': ['light harvesting', 'light harvesting complex', 'lhc']
        };
    }

    setConsole(consoleInstance) {
        this.console = consoleInstance;
    }

    log(message) {
        if (this.console) {
            this.console.log(message);
        } else {
            console.log(message);
        }
    }

    async parsePDF(file) {
        this.log('📄 Starting PDF parsing...');
        
        try {
            // Load PDF.js library
            const pdfjsLib = await this.loadPDFJS();
            
            // Read PDF file
            const arrayBuffer = await this.readFileAsArrayBuffer(file);
            
            // Load PDF document
            const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
            const pdfDocument = await loadingTask.promise;
            
            this.log(`📊 Number of PDF pages: ${pdfDocument.numPages}`);
            
            // Extract text per page
            const pagesText = {};
            for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
                const page = await pdfDocument.getPage(pageNum);
                const textContent = await page.getTextContent();
                const text = textContent.items.map(item => item.str).join(' ');
                pagesText[pageNum] = text;
                
                this.log(`📄 Text extraction complete for page ${pageNum}`);
            }
            
            // Create knowledge graph
            const knowledgeGraph = await this.extractKnowledgeGraph(pagesText, file.name);
            
            this.log('✅ PDF parsing complete');
            return knowledgeGraph;
            
        } catch (error) {
            this.log(`❌ PDF parsing error: ${error.message}`);
            throw error;
        }
    }

    async loadPDFJS() {
        // Check if PDF.js is already loaded
        if (window.pdfjsLib) {
            return window.pdfjsLib;
        }
        
        // Dynamically load PDF.js
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
            script.onload = () => {
                // Configure PDF.js worker
                window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                resolve(window.pdfjsLib);
            };
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    readFileAsArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    }

    async extractKnowledgeGraph(pagesText, fileName) {
        this.log('🔍 Starting knowledge graph extraction...');
        
        const fullText = Object.values(pagesText).join('\n');
        
        // Extract metadata
        const metadata = this.extractMetadata(fullText, fileName);
        
        // Extract nodes (BERT-based)
        const nodes = await this.extractNodes(pagesText);
        
        // Extract edges
        const edges = this.extractEdges(nodes, pagesText);
        
        // Extract references
        const references = this.extractReferences(fullText);
        
        const knowledgeGraph = {
            metadata,
            nodes,
            edges,
            references
        };
        
        this.log(`📊 Extraction complete: ${nodes.length} nodes, ${edges.length} edges, ${references.length} references`);
        
        return knowledgeGraph;
    }

    extractMetadata(text, fileName) {
        const lines = text.split('\n').slice(0, 20);
        
        const metadata = {
            title: '',
            authors: [],
            journal: '',
            year: '',
            doi: '',
            extraction_date: new Date().toISOString(),
            source_file: fileName
        };
        
        // Extract title (first long line)
        for (const line of lines) {
            if (line.trim().length > 20 && !metadata.title) {
                metadata.title = line.trim();
                break;
            }
        }
        
        // Extract DOI
        const doiPattern = /doi[:\s]*([0-9./a-zA-Z]+)/i;
        const doiMatch = text.match(doiPattern);
        if (doiMatch) {
            metadata.doi = doiMatch[1];
        }
        
        // Extract year
        const yearPattern = /(20\d{2})/;
        const yearMatch = text.match(yearPattern);
        if (yearMatch) {
            metadata.year = yearMatch[1];
        }
        
        return metadata;
    }

    async extractNodes(pagesText) {
        const nodes = [];
        let nodeCounter = 1;
        const processedConcepts = new Set();
        
        // BERT model DISABLED - using traditional NLP only
        this.bertModels.enabled = false;

        this.log('🤖 Starting traditional NLP-based node extraction...');
        
        for (const [pageNum, text] of Object.entries(pagesText)) {
            const sentences = text.split(/[.!?]+/);
            
            for (const sentence of sentences) {
                const trimmedSentence = sentence.trim();
                if (trimmedSentence.length < 10) continue;
                
                // 1. Extract nodes with numerical values (measurements)
                for (const pattern of this.valuePatterns) {
                    const matches = [...trimmedSentence.matchAll(pattern)];
                    for (const match of matches) {
                        const concept = this.extractConceptFromSentence(trimmedSentence, match.index);
                        if (concept && !processedConcepts.has(concept)) {
                            const node = {
                                id: `node${nodeCounter}`,
                                label: concept,
                                size: this.calculateNodeSize(trimmedSentence),
                                type: 'measurement',
                                value: match[0],
                                unit: this.extractUnit(match[0]),
                                citations: this.extractCitations(trimmedSentence),
                                page_reference: `p.${pageNum}`,
                                context: this.truncateContext(trimmedSentence),
                                attributes: {
                                    raw_value: match[0],
                                    context_sentence: trimmedSentence
                                }
                            };
                            nodes.push(node);
                            processedConcepts.add(concept);
                            nodeCounter++;
                        }
                    }
                }
                
                // 2. Extract nodes with formulas
                for (const pattern of this.formulaPatterns) {
                    const matches = [...trimmedSentence.matchAll(pattern)];
                    for (const match of matches) {
                        const concept = this.extractConceptFromSentence(trimmedSentence, match.index);
                        if (concept && !processedConcepts.has(concept)) {
                            const node = {
                                id: `node${nodeCounter}`,
                                label: concept,
                                size: this.calculateNodeSize(trimmedSentence),
                                type: 'formula',
                                formula: match[0],
                                citations: this.extractCitations(trimmedSentence),
                                page_reference: `p.${pageNum}`,
                                context: this.truncateContext(trimmedSentence),
                                attributes: {
                                    raw_formula: match[0],
                                    context_sentence: trimmedSentence
                                }
                            };
                            nodes.push(node);
                            processedConcepts.add(concept);
                            nodeCounter++;
                        }
                    }
                }
                
                // 3. BERT-based entity extraction (advanced NLP)
                try {
                    if (this.bertModels.enabled && this.bertModels.sciBert) {
                        this.log(`🔍 Extracting BERT entities: "${trimmedSentence.substring(0, 50)}..."`);
                        
                        const bertEntities = await this.bertModels.sciBert.extractEntities(trimmedSentence);
                        this.log(`📊 BERT entity extraction result: ${bertEntities.length} entities`);
                        
                        for (const entity of bertEntities) {
                            const entityText = entity.text.trim();
                            if (entityText && !processedConcepts.has(entityText) && entity.confidence >= 0.6) {
                                this.log(`✅ Adding BERT entity: "${entityText}" (${entity.label}, confidence: ${entity.confidence.toFixed(2)})`);
                                
                                const nodeType = this.mapBertEntityType(entity.label);
                                const node = {
                                    id: `node${nodeCounter}`,
                                    label: entityText,
                                    size: this.calculateNodeSize(trimmedSentence),
                                    type: nodeType,
                                    definition: this.extractDefinition(entityText, trimmedSentence),
                                    citations: this.extractCitations(trimmedSentence),
                                    page_reference: `p.${pageNum}`,
                                    context: this.truncateContext(trimmedSentence),
                                    attributes: {
                                        importance_score: this.calculateImportanceScore(entityText, trimmedSentence) + entity.confidence,
                                        bert_confidence: entity.confidence,
                                        bert_entity_type: entity.label,
                                        context_sentence: trimmedSentence
                                    }
                                };
                                nodes.push(node);
                                processedConcepts.add(entityText);
                                nodeCounter++;
                            }
                        }
                    } else {
                        this.log(`⚠️ BERT model disabled (enabled: ${this.bertModels.enabled}, sciBert: ${!!this.bertModels.sciBert})`);
                    }
                } catch (error) {
                    this.log(`❌ BERT entity extraction failed: ${error.message}`);
                    console.error('Detailed BERT entity extraction error:', error);
                }
                
                // 4. Extract key scientific concept keywords (keyword group-based - fallback)
                const extractedKeywords = this.extractKeywordsFromSentence(trimmedSentence);
                for (const keyword of extractedKeywords) {
                    if (!processedConcepts.has(keyword)) {
                        const nodeType = this.determineNodeType(keyword, trimmedSentence);
                        const node = {
                            id: `node${nodeCounter}`,
                            label: keyword,
                            size: this.calculateNodeSize(trimmedSentence),
                            type: nodeType,
                            definition: this.extractDefinition(keyword, trimmedSentence),
                            citations: this.extractCitations(trimmedSentence),
                            page_reference: `p.${pageNum}`,
                            context: this.truncateContext(trimmedSentence),
                            attributes: {
                                importance_score: this.calculateImportanceScore(keyword, trimmedSentence),
                                context_sentence: trimmedSentence
                            }
                        };
                        nodes.push(node);
                        processedConcepts.add(keyword);
                        nodeCounter++;
                    }
                }
            }
        }
        
        this.log(`🤖 BERT-based node extraction complete: ${nodes.length} nodes`);
        
        // 5. AI-based keyword grouping and importance recalculation
        return this.postProcessNodes(nodes, pagesText);
    }
    
    // Extract key keywords from a sentence (based on keyword groups)
    extractKeywordsFromSentence(sentence) {
        const lowerSentence = sentence.toLowerCase();
        const foundKeywords = new Set();
        
        // Find in keyword groups
        for (const [groupName, keywords] of Object.entries(this.keywordGroups)) {
            for (const keyword of keywords) {
                if (lowerSentence.includes(keyword.toLowerCase())) {
                    foundKeywords.add(this.capitalizeFirst(groupName));
                    break; // Add only one per group
                }
            }
        }
        
        // Additional noun phrase extraction (simple NLP-based implementation)
        const nounPhrases = this.extractNounPhrases(sentence);
        for (const phrase of nounPhrases) {
            if (this.isValidScientificConcept(phrase)) {
                foundKeywords.add(phrase);
            }
        }
        
        return Array.from(foundKeywords);
    }
    
    // Simple noun phrase extraction
    extractNounPhrases(sentence) {
        const words = sentence.split(/\s+/);
        const nounPhrases = [];
        
        for (let i = 0; i < words.length - 1; i++) {
            const word1 = words[i].toLowerCase().replace(/[^\w]/g, '');
            const word2 = words[i + 1].toLowerCase().replace(/[^\w]/g, '');
            
            if (this.isValidConcept(word1) && this.isValidConcept(word2)) {
                const phrase = this.capitalizeFirst(word1) + ' ' + this.capitalizeFirst(word2);
                if (phrase.length > 5 && phrase.length < 25) {
                    nounPhrases.push(phrase);
                }
            }
        }
        
        return nounPhrases;
    }
    
    // Determine if a term is scientific (new method)
    isScientificTerm(term) {
        const lowerTerm = term.toLowerCase();
        
        // Check scientific term patterns
        const scientificPatterns = [
            /\b(protein|enzyme|molecule|compound|acid|base|ion|reaction)\b/,
            /\b(temperature|pressure|concentration|rate|efficiency)\b/,
            /\b(photosynthesis|respiration|metabolism|synthesis)\b/,
            /\b(chlorophyll|thylakoid|chloroplast|mitochondria)\b/,
            /\b(carbon|nitrogen|oxygen|hydrogen|dioxide)\b/,
            /\b(atp|adp|nadph|fadh|rubisco|psii|psi)\b/,
            /\b(glucose|fructose|sucrose|starch|cellulose)\b/,
            /\b(photosystem|thylakoid|stroma|grana)\b/
        ];
        
        return scientificPatterns.some(pattern => pattern.test(lowerTerm));
    }
    
    // Determine if a concept is a valid scientific concept
    isValidScientificConcept(concept) {
        const lowerConcept = concept.toLowerCase();
        
        // Basic stopword check
        if (!this.isValidConcept(lowerConcept)) return false;
        
        // Check if it's a scientific term
        return this.isScientificTerm(lowerConcept);
    }
    
    // Determine node type
    determineNodeType(concept, context) {
        const lowerConcept = concept.toLowerCase();
        const lowerContext = context.toLowerCase();
        
        // Keyword-based type classification
        for (const [type, keywords] of Object.entries(this.nodeTypeKeywords)) {
            if (keywords.some(keyword => 
                lowerConcept.includes(keyword) || lowerContext.includes(keyword)
            )) {
                return type;
            }
        }
        
        // Default type is 'concept'
        return 'concept';
    }
    
    // Extract unit
    extractUnit(valueString) {
        const unitMatch = valueString.match(/([a-zA-Z/°%μ]+)$/);
        return unitMatch ? unitMatch[1] : '';
    }
    
    // Extract definition
    extractDefinition(keyword, sentence) {
        const definitionPatterns = [
            new RegExp(`${keyword.toLowerCase()}\\s+is\\s+([^.]+)`, 'i'),
            new RegExp(`${keyword.toLowerCase()}\\s+refers to\\s+([^.]+)`, 'i'),
            new RegExp(`${keyword.toLowerCase()}[,:]\\s+([^.]+)`, 'i')
        ];
        
        for (const pattern of definitionPatterns) {
            const match = sentence.match(pattern);
            if (match) {
                return match[1].trim();
            }
        }
        
        return '';
    }
    
    // Calculate importance score
    calculateImportanceScore(keyword, context) {
        let score = 1;
        
        // Bonus points if in a keyword group
        const inKeywordGroup = Object.values(this.keywordGroups)
            .some(group => group.some(k => k.toLowerCase() === keyword.toLowerCase()));
        if (inKeywordGroup) score += 2;
        
        // Bonus points for long context
        if (context.length > 100) score += 1;
        
        // Bonus points if citations are present
        if (this.extractCitations(context).length > 0) score += 1;
        
        return score;
    }
    
    // Post-process nodes (enhanced filtering)
    postProcessNodes(nodes, pagesText) {
        // Deduplicate and merge
        const mergedNodes = this.mergeRelatedNodes(nodes);
        
        // Enhanced importance-based filtering
        const filteredNodes = mergedNodes.filter(node => {
            const label = node.label.toLowerCase().trim();
            
            // Stricter check for measurements or formulas
            if (node.type === 'measurement' || node.type === 'formula') {
                // Measurements/formulas must also be valid concepts
                if (!this.isValidConcept(label)) {
                    return false;
                }
                return true;
            }
            
            // Basic validity check (using enhanced isValidConcept)
            if (!this.isValidConcept(label)) {
                return false;
            }
            
            // Importance score check (stricter criteria)
            const importanceScore = node.attributes?.importance_score || 0;
            const bertConfidence = node.attributes?.bert_confidence || 0;
            
            // More lenient if BERT confidence is high, stricter otherwise
            const minImportanceScore = bertConfidence > 0.7 ? 1.5 : 3;
            
            if (importanceScore < minImportanceScore) {
                return false;
            }
            
            // Apply higher standards for general terms that are not scientific
            if (!this.isScientificTerm(label)) {
                // Non-scientific terms need higher importance and BERT confidence
                if (importanceScore < 4 || bertConfidence < 0.8) {
                    return false;
                }
            }
            
            // Context quality check (stricter)
            const context = node.context || '';
            if (context.length < 30) {
                return false;
            }
            
            // Exclude single characters or meaningless patterns
            if (/^[a-z]$/.test(label) || /^\w{1,2}$/.test(label)) {
                return false;
            }
            
            // Exclude common English present/past participles (if not a scientific term)
            if (!this.isScientificTerm(label)) {
                const commonVerbPatterns = [
                    /^(showing|finding|using|making|getting|giving|taking|coming|going|looking|working|running|moving|living|reading|writing|speaking|thinking|feeling|knowing|seeing|hearing|being|having|doing)$/,
                    /^(showed|found|used|made|got|gave|took|came|went|looked|worked|ran|moved|lived|read|wrote|spoke|thought|felt|knew|saw|heard|was|were|had|did)$/
                ];
                
                if (commonVerbPatterns.some(pattern => pattern.test(label))) {
                    return false;
                }
            }
            
            return true;
        });
        
        // Normalize sizes
        return this.normalizeNodeSizes(filteredNodes);
    }
    
    // Merge related nodes
    mergeRelatedNodes(nodes) {
        const mergedNodes = [];
        const processed = new Set();
        
        for (const node of nodes) {
            if (processed.has(node.id)) continue;
            
            const similarNodes = nodes.filter(other => 
                other.id !== node.id && 
                !processed.has(other.id) &&
                this.areSimilarConcepts(node.label, other.label)
            );
            
            if (similarNodes.length > 0) {
                // Create merged node
                const mergedNode = {
                    ...node,
                    size: Math.max(node.size, ...similarNodes.map(n => n.size)),
                    citations: [...new Set([...node.citations, ...similarNodes.flatMap(n => n.citations)])],
                    context: [node.context, ...similarNodes.map(n => n.context)].join(' | ')
                };
                
                mergedNodes.push(mergedNode);
                processed.add(node.id);
                similarNodes.forEach(n => processed.add(n.id));
            } else {
                mergedNodes.push(node);
                processed.add(node.id);
            }
        }
        
        return mergedNodes;
    }
    
    // Determine if concepts are similar
    areSimilarConcepts(concept1, concept2) {
        const lower1 = concept1.toLowerCase();
        const lower2 = concept2.toLowerCase();
        
        // String similarity check (simple inclusion)
        return lower1.includes(lower2) || lower2.includes(lower1) ||
               this.calculateJaccardSimilarity(lower1.split(' '), lower2.split(' ')) > 0.5;
    }
    
    // Calculate Jaccard similarity
    calculateJaccardSimilarity(set1, set2) {
        const s1 = new Set(set1);
        const s2 = new Set(set2);
        const intersection = new Set([...s1].filter(x => s2.has(x)));
        const union = new Set([...s1, ...s2]);
        return intersection.size / union.size;
    }
    
    // Normalize node sizes
    normalizeNodeSizes(nodes) {
        if (nodes.length === 0) return nodes;
        
        const sizes = nodes.map(n => n.size);
        const minSize = Math.min(...sizes);
        const maxSize = Math.max(...sizes);
        const range = maxSize - minSize || 1;
        
        return nodes.map(node => ({
            ...node,
            size: Math.round(20 + ((node.size - minSize) / range) * 30) // Normalize to 20-50 range
        }));
    }
    
    // Truncate context
    truncateContext(text) {
        return text.length > 150 ? text.substring(0, 150) + '...' : text;
    }
    
    // Capitalize first letter
    capitalizeFirst(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    extractEdges(nodes, pagesText) {
        const edges = [];
        const edgeMap = new Map(); // Prevent duplicates
        
        for (const [pageNum, text] of Object.entries(pagesText)) {
            const sentences = text.split(/[.!?]+/);
            
            for (const sentence of sentences) {
                const trimmedSentence = sentence.trim();
                if (trimmedSentence.length < 20) continue;
                
                // Find nodes appearing in the sentence (exact match)
                const sentenceNodes = this.findNodesInSentence(nodes, trimmedSentence);
                
                // Extract relationships if 2 or more nodes are present
                if (sentenceNodes.length >= 2) {
                    for (let i = 0; i < sentenceNodes.length; i++) {
                        for (let j = i + 1; j < sentenceNodes.length; j++) {
                            const node1 = sentenceNodes[i];
                            const node2 = sentenceNodes[j];
                            
                            const edgeKey = `${node1.id}-${node2.id}`;
                            const reverseKey = `${node2.id}-${node1.id}`;
                            
                            // Check for duplicates
                            if (edgeMap.has(edgeKey) || edgeMap.has(reverseKey)) continue;
                            
                            const [relationshipType, weight, confidence] = this.determineAdvancedRelationship(
                                trimmedSentence, node1.label, node2.label
                            );
                            
                            if (relationshipType && confidence > 0.5) {
                                const edge = {
                                    source: node1.id,
                                    target: node2.id,
                                    weight: Math.round(weight),
                                    relationship_type: relationshipType,
                                    evidence: this.truncateContext(trimmedSentence),
                                    citations: this.extractCitations(trimmedSentence),
                                    page_reference: `p.${pageNum}`,
                                    confidence: confidence,
                                    attributes: {
                                        distance: this.calculateWordDistance(trimmedSentence, node1.label, node2.label),
                                        context_sentence: trimmedSentence
                                    }
                                };
                                
                                edges.push(edge);
                                edgeMap.set(edgeKey, edge);
                            }
                        }
                    }
                }
            }
        }
        
        // Post-process edges and normalize weights
        return this.postProcessEdges(edges);
    }
    
    // Find nodes in a sentence (improved version)
    findNodesInSentence(nodes, sentence) {
        const lowerSentence = sentence.toLowerCase();
        const foundNodes = [];
        
        for (const node of nodes) {
            const lowerLabel = node.label.toLowerCase();
            
            // Check for exact word boundaries
            const wordBoundaryPattern = new RegExp(`\\b${lowerLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
            if (wordBoundaryPattern.test(lowerSentence)) {
                foundNodes.push(node);
            }
        }
        
        return foundNodes;
    }
    
    // Determine advanced relationship (enhanced version)
    determineAdvancedRelationship(sentence, concept1, concept2) {
        const sentenceLower = sentence.toLowerCase();
        const pos1 = sentenceLower.indexOf(concept1.toLowerCase());
        const pos2 = sentenceLower.indexOf(concept2.toLowerCase());
        
        if (pos1 === -1 || pos2 === -1) {
            return ['CORRELATES_WITH', 1, 0.3];
        }
        
        // Calculate distance between words
        const distance = Math.abs(pos1 - pos2);
        let proximityScore = Math.max(0.3, 1 - (distance / sentence.length));
        
        // Relationship keyword-based analysis (enhanced version)
        let bestRelation = 'CORRELATES_WITH';
        let bestWeight = 2;
        let maxConfidence = 0.3;
        
        for (const [relType, keywords] of Object.entries(this.relationshipKeywords)) {
            for (const keyword of keywords) {
                if (sentenceLower.includes(keyword)) {
                    const keywordPos = sentenceLower.indexOf(keyword);
                    
                    // Check if the keyword is between the two concepts
                    const between = (keywordPos > Math.min(pos1, pos2) && keywordPos < Math.max(pos1, pos2));
                    const confidence = between ? 0.9 : 0.7;
                    
                    if (confidence > maxConfidence) {
                        bestRelation = relType;
                        maxConfidence = confidence;
                        
                        // Adjust weight based on relationship type
                        switch (relType) {
                            case 'CAUSES':
                            case 'INHIBITS':
                            case 'ACTIVATES':
                                bestWeight = 5;
                                break;
                            case 'INFLUENCES':
                            case 'MEASURED_BY':
                            case 'CALCULATED_BY':
                                bestWeight = 4;
                                break;
                            case 'PART_OF':
                            case 'DEPENDS_ON':
                                bestWeight = 3;
                                break;
                            default:
                                bestWeight = 2;
                        }
                    }
                }
            }
        }
        
        // Numerical relationship analysis
        if (this.hasNumericalRelation(sentence, concept1, concept2)) {
            bestRelation = 'MEASURED_BY';
            bestWeight = Math.max(bestWeight, 4);
            maxConfidence = Math.max(maxConfidence, 0.8);
        }
        
        // Formula relationship analysis
        if (this.hasFormulaRelation(sentence, concept1, concept2)) {
            bestRelation = 'CALCULATED_BY';
            bestWeight = Math.max(bestWeight, 5);
            maxConfidence = Math.max(maxConfidence, 0.9);
        }
        
        // Reflect proximity score
        const finalWeight = bestWeight * proximityScore;
        const finalConfidence = maxConfidence * proximityScore;
        
        return [bestRelation, finalWeight, finalConfidence];
    }
    
    // Check for numerical relationship
    hasNumericalRelation(sentence, concept1, concept2) {
        const numericalPatterns = [
            /\d+\.?\d*\s*[±×]\s*\d+\.?\d*/,
            /\d+\.?\d*\s*(mg|kg|g|ml|l|%|°c|°f)/i,
            /(\d+\.?\d*)\s*to\s*(\d+\.?\d*)/i
        ];
        
        return numericalPatterns.some(pattern => pattern.test(sentence));
    }
    
    // Check for formula relationship
    hasFormulaRelation(sentence, concept1, concept2) {
        const formulaPatterns = [
            /[a-zA-Z]\s*=\s*[^,.\n]+/,
            /\$[^$]+\$/,
            /[α-ωΑ-Ω]\s*=\s*[^,.\n]+/
        ];
        
        return formulaPatterns.some(pattern => pattern.test(sentence));
    }
    
    // Calculate word distance
    calculateWordDistance(sentence, word1, word2) {
        const words = sentence.toLowerCase().split(/\s+/);
        let pos1 = -1, pos2 = -1;
        
        for (let i = 0; i < words.length; i++) {
            if (words[i].includes(word1.toLowerCase()) && pos1 === -1) {
                pos1 = i;
            }
            if (words[i].includes(word2.toLowerCase()) && pos2 === -1) {
                pos2 = i;
            }
        }
        
        return pos1 !== -1 && pos2 !== -1 ? Math.abs(pos1 - pos2) : 999;
    }
    
    // Post-process edges
    postProcessEdges(edges) {
        // Merge redundant edges and sum weights
        const mergedEdges = this.mergeRedundantEdges(edges);
        
        // Normalize edge weights
        const normalizedEdges = this.normalizeEdgeWeights(mergedEdges);
        
        // Filter based on confidence
        return normalizedEdges.filter(edge => edge.confidence > 0.4);
    }
    
    // Merge redundant edges
    mergeRedundantEdges(edges) {
        const edgeGroups = new Map();
        
        for (const edge of edges) {
            const key = [edge.source, edge.target].sort().join('-');
            
            if (edgeGroups.has(key)) {
                const existing = edgeGroups.get(key);
                // Select the edge with higher confidence or sum weights
                if (edge.confidence > existing.confidence) {
                    edgeGroups.set(key, {
                        ...edge,
                        weight: Math.max(existing.weight, edge.weight),
                        citations: [...new Set([...existing.citations, ...edge.citations])]
                    });
                }
            } else {
                edgeGroups.set(key, edge);
            }
        }
        
        return Array.from(edgeGroups.values());
    }
    
    // Normalize edge weights
    normalizeEdgeWeights(edges) {
        if (edges.length === 0) return edges;
        
        const weights = edges.map(e => e.weight);
        const minWeight = Math.min(...weights);
        const maxWeight = Math.max(...weights);
        const range = maxWeight - minWeight || 1;
        
        return edges.map(edge => ({
            ...edge,
            weight: Math.round(1 + ((edge.weight - minWeight) / range) * 9) // Normalize to 1-10 range
        }));
    }

    extractReferences(text) {
        const references = [];
        
        // Find References section
        const refSectionMatch = text.match(/References?\s*\n(.*)/is);
        if (!refSectionMatch) {
            return references;
        }
        
        const refText = refSectionMatch[1];
        
        // Split each reference item
        const refItems = refText.split(/\n\s*\d+\.?\s+/);
        
        for (let i = 1; i < refItems.length; i++) {
            const item = refItems[i];
            const ref = {
                citation_id: `ref${i}`,
                authors: [],
                title: '',
                journal: '',
                year: '',
                volume: '',
                pages: '',
                doi: ''
            };
            
            // Extract authors
            const authorPattern = /^([^.]+(?:\.\s*[A-Z]\.?)*[^.]*\.)/;
            const authorMatch = item.match(authorPattern);
            if (authorMatch) {
                const authorsStr = authorMatch[1];
                ref.authors = authorsStr.split(',').map(name => name.trim());
            }
            
            // Extract title
            const titlePattern = /["\']([^"\']+)["\']|\.([^.]+)\./;
            const titleMatch = item.match(titlePattern);
            if (titleMatch) {
                ref.title = titleMatch[1] || titleMatch[2];
            }
            
            // Extract journal name
            const journalPattern = /([A-Z][^,\d]+)(?:,|\s+\d+)/;
            const journalMatch = item.match(journalPattern);
            if (journalMatch) {
                ref.journal = journalMatch[1].trim();
            }
            
            // Extract year
            const yearPattern = /(20\d{2})/;
            const yearMatch = item.match(yearPattern);
            if (yearMatch) {
                ref.year = yearMatch[1];
            }
            
            // Extract DOI
            const doiPattern = /doi[:\s]*([0-9./a-zA-Z]+)/i;
            const doiMatch = item.match(doiPattern);
            if (doiMatch) {
                ref.doi = doiMatch[1];
            }
            
            references.push(ref);
        }
        
        return references;
    }

    extractConceptFromSentence(sentence, matchPos) {
        const words = sentence.split(' ');
        const wordPositions = [];
        let currentPos = 0;
        
        for (const word of words) {
            wordPositions.push([currentPos, currentPos + word.length, word]);
            currentPos += word.length + 1;
        }
        
        // Find noun phrase around the match position
        for (const [startPos, endPos, word] of wordPositions) {
            if (startPos <= matchPos && matchPos <= endPos) {
                const wordIndex = wordPositions.findIndex(([s, e, w]) => s === startPos && e === endPos);
                const conceptWords = [];
                
                for (let i = Math.max(0, wordIndex - 2); i < Math.min(wordPositions.length, wordIndex + 3); i++) {
                    const w = wordPositions[i][2].toLowerCase().replace(/[^\w]/g, '');
                    
                    // Filter stopwords and short words
                    if (this.isValidConcept(w)) {
                        conceptWords.push(w);
                    }
                }
                
                if (conceptWords.length > 0) {
                    return this.cleanConcept(conceptWords.slice(0, 3).join(' ')); // Max 3 words
                }
            }
        }
        
        return null;
    }

    // Check if a concept is valid (enhanced version)
    isValidConcept(word) {
        if (!word || typeof word !== 'string') return false;
        
        const lowerWord = word.toLowerCase().trim();
        
        // Basic length and format check
        if (lowerWord.length < 3 || lowerWord.length > 25) return false;
        
        // Exclude pure numbers
        if (/^\d+$/.test(lowerWord)) return false;
        
        // Exclude if it contains non-alphabetic characters (special chars, mixed numbers, etc.)
        if (!/^[a-zA-Z]+$/.test(lowerWord)) return false;
        
        // Check against CONFIG.STOPWORDS
        const stopwords = window.CONFIG && window.CONFIG.STOPWORDS ? window.CONFIG.STOPWORDS : this.getDefaultStopwords();
        if (stopwords.has(lowerWord)) return false;
        
        // Enhanced filtering for problematic academic terms pointed out by user
        const problematicTerms = new Set([
            'range', 'ranges', 'ranging', 'respectively', 'represent', 'represents',
            'representing', 'represented', 'treatment', 'treatments', 'treat', 'treats',
            'treated', 'respect', 'respects', 'respected', 'respective', 'according',
            'accordingly', 'addition', 'additional', 'additionally', 'available',
            'availability', 'based', 'basis', 'basic', 'basically', 'common', 'commonly',
            'consider', 'considered', 'considering', 'consist', 'consists', 'consisted',
            'consisting', 'consistently', 'contain', 'contains', 'contained', 'containing',
            'content', 'describe', 'describes', 'described', 'describing', 'description',
            'develop', 'develops', 'developed', 'developing', 'development', 'different',
            'differently', 'difference', 'differences', 'differential', 'establish',
            'establishes', 'established', 'establishing', 'establishment', 'examine',
            'examines', 'examined', 'examining', 'examination', 'exist', 'exists',
            'existed', 'existing', 'existence', 'express', 'expresses', 'expressed',
            'expressing', 'expression', 'follow', 'follows', 'followed', 'following',
            'form', 'forms', 'formed', 'forming', 'formation', 'formal', 'function',
            'functions', 'functioned', 'functioning', 'functional', 'general', 'generally',
            'generate', 'generates', 'generated', 'generating', 'include', 'includes',
            'included', 'including', 'inclusion', 'indicate', 'indicates', 'indicated',
            'indicating', 'indication', 'individual', 'individually', 'influence',
            'influences', 'influenced', 'involve', 'involves', 'involved', 'involving',
            'involvement', 'maintain', 'maintains', 'maintained', 'maintaining',
            'maintenance', 'observe', 'observes', 'observed', 'observing', 'observation',
            'occur', 'occurs', 'occurred', 'occurring', 'occurrence', 'perform',
            'performs', 'performed', 'performing', 'performance', 'present', 'presents',
            'presented', 'presenting', 'presentation', 'produce', 'produces', 'produced',
            'producing', 'production', 'provide', 'provides', 'provided', 'providing',
            'provision', 'require', 'requires', 'required', 'requiring', 'requirement',
            'result', 'results', 'resulted', 'resulting', 'resultant', 'reveal',
            'reveals', 'revealed', 'revealing', 'revelation', 'serve', 'serves',
            'served', 'serving', 'service', 'similar', 'similarly', 'similarity',
            'similarities', 'specific', 'specifically', 'specification', 'specifications',
            'suggest', 'suggests', 'suggested', 'suggesting', 'suggestion', 'support',
            'supports', 'supported', 'supporting', 'supportive', 'various', 'variously',
            'variety', 'varieties', 'variation'
        ]);
        
        if (problematicTerms.has(lowerWord)) return false;
        
        // Exclude common verb, adjective, adverb patterns
        const genericPatterns = [
            /^.+ing$/, // -ing verb form
            /^.+ed$/, // -ed verb form
            /^.+ly$/, // -ly adverb form
            /^.+tion$/, // -tion noun form (common ones)
            /^.+ness$/, // -ness noun form
            /^.+ment$/, // -ment noun form (common ones)
            /^.+able$/, // -able adjective form
            /^.+ible$/, // -ible adjective form
        ];
        
        // Exclude common patterns that are not scientific terms
        const isGenericPattern = genericPatterns.some(pattern => pattern.test(lowerWord));
        if (isGenericPattern && !this.isScientificTerm(lowerWord)) {
            return false;
        }
        
        return true;
    }

    // Default stopword set
    getDefaultStopwords() {
        return new Set([
            'the', 'of', 'in', 'to', 'and', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
            'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
            'can', 'shall', 'must', 'for', 'with', 'by', 'from', 'on', 'at', 'as', 'but', 'or', 'nor',
            'if', 'then', 'than', 'when', 'where', 'why', 'how', 'all', 'any', 'both', 'each', 'few',
            'more', 'most', 'other', 'some', 'such', 'no', 'not', 'only', 'own', 'same', 'so', 'also',
            'just', 'now', 'here', 'there', 'very', 'well', 'too', 'much', 'many', 'little', 'large',
            'small', 'good', 'bad', 'new', 'old', 'first', 'last', 'long', 'short', 'high', 'low',
            'using', 'used', 'use', 'based', 'through', 'during', 'before', 'after', 'above', 'below',
            'between', 'among', 'into', 'upon', 'about', 'against', 'within', 'without', 'across'
        ]);
    }

    // Clean concept
    cleanConcept(concept) {
        // Capitalize the first letter of each word
        return concept.split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ')
            .trim();
    }

    calculateNodeSize(context) {
        let baseSize = 20;
        
        // Weight based on sentence length
        if (context.length > 100) {
            baseSize += 10;
        }
        
        // Weight based on number of citations
        const citationCount = this.extractCitations(context).length;
        baseSize += Math.min(citationCount * 5, 20);
        
        return Math.min(Math.max(baseSize, 10), 50);
    }

    extractCitations(text) {
        const citations = new Set();
        const citationPatterns = [
            /\[(\d+(?:,\s*\d+)*)\]/g,  // [1], [1,2,3]
            /\((\d+)\)/g,              // (1)
            /(\w+\s+et\s+al\.?\s*\(\d{4}\))/g,  // Smith et al. (2020)
            /(\w+\s*\(\d{4}\))/g,      // Smith (2020)
        ];
        
        for (const pattern of citationPatterns) {
            const matches = [...text.matchAll(pattern)];
            for (const match of matches) {
                citations.add(match[0]);
            }
        }
        
        return Array.from(citations);
    }

    determineRelationship(sentence, concept1, concept2) {
        const sentenceLower = sentence.toLowerCase();
        
        const relationshipKeywords = {
            'INFLUENCES': ['affects', 'influences', 'impacts', 'modifies'],
            'DEPENDS_ON': ['depends', 'relies on', 'requires', 'needs'],
            'MEASURED_BY': ['measured by', 'determined by', 'quantified by'],
            'CALCULATED_BY': ['calculated by', 'computed using', 'derived from'],
            'PART_OF': ['part of', 'component of', 'element of', 'contains'],
            'CAUSES': ['causes', 'leads to', 'results in', 'produces'],
            'CORRELATES_WITH': ['correlates', 'associated with', 'related to'],
            'DEFINED_AS': ['defined as', 'is', 'equals', 'represents']
        };
        
        for (const [relType, keywords] of Object.entries(relationshipKeywords)) {
            for (const keyword of keywords) {
                if (sentenceLower.includes(keyword)) {
                    // Calculate relationship strength
                    if (['CAUSES', 'CALCULATED_BY'].includes(relType)) {
                        return [relType, 5];
                    } else if (['INFLUENCES', 'MEASURED_BY'].includes(relType)) {
                        return [relType, 4];
                    } else if (['CORRELATES_WITH', 'PART_OF'].includes(relType)) {
                        return [relType, 3];
                    } else {
                        return [relType, 2];
                    }
                }
            }
        }
        
        // Default relationship (appears in the same sentence)
        return ['CORRELATES_WITH', 1];
    }
    
    // Initialize BERT models
    async initializeBertModels() {
        try {
            this.log('🤖 Initializing BERT models...');
            
            // Skip if already initialized
            if (this.bertModels.enabled && this.bertModels.sciBert) {
                this.log('✅ BERT models are already initialized.');
                return;
            }
            
            // Check for Transformers.js
            if (window.transformersJS) {
                this.log('✅ Transformers.js detected');
                
                // Load SciBERT model
                this.bertModels.sciBert = await this.loadSciBertModel();
                this.bertModels.enabled = true;
                
                this.log('✅ BERT models initialized successfully');
            } else if (window.bertModelManager) {
                this.log('✅ BERT model manager detected');
                
                const success = await window.bertModelManager.initialize();
                if (success) {
                    this.bertModels.sciBert = window.bertModelManager;
                    this.bertModels.enabled = true;
                    this.log('✅ BERT model manager initialized successfully');
                }
            } else if (window.bertAPI && window.bertAPI.isConnected) {
                this.log('✅ BERT API client detected');
                
                this.bertModels.sciBert = window.bertAPI;
                this.bertModels.enabled = true;
                this.log('✅ BERT API client initialized successfully');
            } else {
                this.log('⚠️ BERT models are not available. Using traditional NLP methods.');
                this.bertModels.enabled = false;
            }
        } catch (error) {
            this.log(`❌ BERT model initialization failed: ${error.message}`);
            this.bertModels.enabled = false;
        }
    }
    
    // Load SciBERT model (actual implementation)
    async loadSciBertModel() {
        try {
            // Use actual BERT model manager
            if (window.bertModelManager) {
                this.log('🔗 Integrating with actual BERT model...');
                
                const success = await window.bertModelManager.initialize();
                if (success) {
                    this.log('✅ Integration with actual BERT model successful');
                    return {
                        tokenize: async (text) => {
                            // Actual tokenization (currently simple split)
                            return text.toLowerCase().split(/\s+/);
                        },
                        
                        extractEntities: async (text) => {
                            // Priority: API client -> Browser model -> Fallback
                            if (window.bertAPI && window.bertAPI.isConnected) {
                                return await window.bertAPI.extractEntities(text);
                            } else if (window.bertModelManager) {
                                return await window.bertModelManager.extractEntities(text);
                            } else {
                                return this.extractBertEntities(text);
                            }
                        },
                        
                        getEmbedding: async (text) => {
                            if (window.bertAPI && window.bertAPI.isConnected) {
                                return await window.bertAPI.getEmbedding(text);
                            } else if (window.bertModelManager) {
                                return await window.bertModelManager.getEmbedding(text);
                            } else {
                                return this.generateMockEmbedding(text);
                            }
                        },
                        
                        calculateSimilarity: async (text1, text2) => {
                            if (window.bertAPI && window.bertAPI.isConnected) {
                                return await window.bertAPI.calculateSimilarity(text1, text2);
                            } else if (window.bertModelManager) {
                                const emb1 = await window.bertModelManager.getEmbedding(text1);
                                const emb2 = await window.bertModelManager.getEmbedding(text2);
                                return window.bertModelManager._cosineSimilarity(emb1, emb2);
                            } else {
                                const emb1 = this.generateMockEmbedding(text1);
                                const emb2 = this.generateMockEmbedding(text2);
                                return this.cosineSimilarity(emb1, emb2);
                            }
                        },
                        
                        extractRelationships: async (sentence, entity1, entity2) => {
                            if (window.bertAPI && window.bertAPI.isConnected) {
                                return await window.bertAPI.extractRelationships(sentence, entity1, entity2);
                            } else if (window.bertModelManager) {
                                return await window.bertModelManager.extractRelationships(sentence, entity1, entity2);
                            } else {
                                return { type: 'RELATED_TO', confidence: 0.5 };
                            }
                        }
                    };
                }
            }
            
            this.log('⚠️ Actual BERT model not available, switching to fallback mode');
            return this._createFallbackModel();
            
        } catch (error) {
            this.log(`❌ BERT model loading failed: ${error.message}`);
            return this._createFallbackModel();
        }
    }
    
    // Create fallback model
    _createFallbackModel() {
        return {
            tokenize: async (text) => {
                return text.toLowerCase().split(/\s+/);
            },
            
            extractEntities: async (text) => {
                return this.extractBertEntities(text);
            },
            
            getEmbedding: async (text) => {
                return this.generateMockEmbedding(text);
            },
            
            calculateSimilarity: (emb1, emb2) => {
                return this.cosineSimilarity(emb1, emb2);
            },
            
            extractRelationships: async (sentence, entity1, entity2) => {
                return { type: 'RELATED_TO', confidence: 0.5 };
            }
        };
    }
    
    // BERT-based entity extraction
    async extractBertEntities(text) {
        const entities = [];
        
        // More sophisticated scientific entity patterns
        const scientificPatterns = {
            'CHEMICAL': [
                /\b[A-Z][a-z]?(?:[0-9]+[A-Z][a-z]?)*[0-9]*\b/g, // H2O, CO2, C6H12O6
                /\b(?:chlorophyll|carotenoid|anthocyanin|flavonoid)\b/gi,
                /\b(?:glucose|fructose|sucrose|starch|cellulose)\b/gi,
                /\b(?:atp|adp|nadph?|fadh?)\b/gi
            ],
            'PROTEIN': [
                /\b(?:rubisco|psii?|psi?|cytochrome|ferredoxin)\b/gi,
                /\b\w+\s+(?:enzyme|protein|kinase|synthase|reductase)\b/gi,
                /\b(?:catalase|peroxidase|superoxide\s+dismutase)\b/gi
            ],
            'PROCESS': [
                /\b(?:photosynthesis|respiration|transpiration|photophosphorylation)\b/gi,
                /\b(?:calvin\s+cycle|krebs\s+cycle|electron\s+transport)\b/gi,
                /\b(?:carbon\s+fixation|light\s+reaction|dark\s+reaction)\b/gi
            ],
            'ORGANISM': [
                /\b(?:arabidopsis|spinacia|nicotiana|triticum|oryza)\b/gi,
                /\b[A-Z][a-z]+\s+[a-z]+\b/g // Latin species name
            ],
            'MEASUREMENT': [
                /\d+\.?\d*\s*±\s*\d+\.?\d*\s*[a-zA-Z%°/μ]+/g,
                /\d+\.?\d*\s*[a-zA-Z%°/μ]+/g
            ]
        };
        
        Object.entries(scientificPatterns).forEach(([entityType, patterns]) => {
            patterns.forEach(pattern => {
                const matches = [...text.matchAll(pattern)];
                matches.forEach(match => {
                    const entity = {
                        text: match[0],
                        label: entityType,
                        start: match.index,
                        end: match.index + match[0].length,
                        confidence: this.calculateEntityConfidence(match[0], entityType)
                    };
                    
                    if (entity.confidence >= this.nerConfig.confidence_threshold) {
                        entities.push(entity);
                    }
                });
            });
        });
        
        return entities;
    }
    
    // Calculate entity confidence
    calculateEntityConfidence(text, entityType) {
        let confidence = 0.5; // Base confidence
        
        // Adjust confidence based on string length
        if (text.length > 3 && text.length < 20) {
            confidence += 0.2;
        }
        
        // Adjust confidence based on capitalization patterns
        if (entityType === 'CHEMICAL' && /^[A-Z][a-z]*[0-9]*$/.test(text)) {
            confidence += 0.3;
        }
        
        // Check if it's a known scientific term
        const knownTerms = {
            'CHEMICAL': ['atp', 'adp', 'nadph', 'chlorophyll'],
            'PROTEIN': ['rubisco', 'psii', 'psi', 'cytochrome'],
            'PROCESS': ['photosynthesis', 'respiration', 'calvin cycle']
        };
        
        if (knownTerms[entityType]?.some(term => 
            text.toLowerCase().includes(term.toLowerCase()))) {
            confidence += 0.3;
        }
        
        return Math.min(1.0, confidence);
    }
    
    // Generate mock embedding
    generateMockEmbedding(text) {
        // In reality, this would use embeddings from a BERT model
        const words = text.toLowerCase().split(/\s+/);
        const embedding = new Array(768).fill(0); // BERT base dimension
        
        // Simple hashing-based embedding simulation
        words.forEach((word, idx) => {
            const hash = this.simpleHash(word);
            for (let i = 0; i < 768; i++) {
                embedding[i] += Math.sin((hash + i) * 0.01) * (1 / (idx + 1));
            }
        });
        
        // Normalization
        const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
        return embedding.map(val => val / norm);
    }
    
    // Simple hashing function
    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash);
    }
    
    // Map BERT entity types to node types
    mapBertEntityType(bertType) {
        const typeMapping = {
            'CHEMICAL': 'material',
            'PROTEIN': 'material',
            'PROCESS': 'process',
            'ORGANISM': 'concept',
            'MEASUREMENT': 'measurement',
            'METHOD': 'method',
            'CONDITION': 'condition'
        };
        
        return typeMapping[bertType] || 'concept';
    }
    
    // Calculate cosine similarity
    cosineSimilarity(vecA, vecB) {
        if (vecA.length !== vecB.length) return 0;
        
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        
        for (let i = 0; i < vecA.length; i++) {
            dotProduct += vecA[i] * vecB[i];
            normA += vecA[i] * vecA[i];
            normB += vecB[i] * vecB[i];
        }
        
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }
}