/**
 * Simple Analysis Service (ArangoDB-free)
 * Provides knowledge graph analysis without database dependency
 * Uses in-memory processing and OpenAI API integration
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const OpenAI = require('openai');

class SimpleAnalysisService {
  constructor() {
    this.cache = new Map(); // In-memory cache for analysis results
    this.pythonPath = 'python'; // Adjust if needed
    this.analyzerScript = path.join(__dirname, '..', '..', 'openai_analyzer.py');
    this.maxCacheSize = 10; // Limit cache size to prevent memory issues

    // Validate environment variables
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your-openai-api-key-here') {
      console.warn('⚠️ OpenAI API key not properly configured. Please set OPENAI_API_KEY in .env file.');
    }

    // Initialize OpenAI client
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || 'your-openai-api-key-here',
      timeout: 300000 // 5 minutes timeout for complex operations
    });
  }

  /**
   * Helper to return a sample graph on failure
   */
  _getSampleGraph() {
    console.log('⚠️ Analysis failed or produced no data. Returning sample graph.');
    const sampleGraph = {
        nodes: [
            {id: 'ai', label: 'Artificial Intelligence', size: 50, type: 'concept'},
            {id: 'ml', label: 'Machine Learning', size: 45, type: 'concept'},
            {id: 'dl', label: 'Deep Learning', size: 40, type: 'concept'}
        ],
        links: [ // Changed from edges to links
            {source: 'ai', target: 'ml', weight: 8, label: 'is_subfield_of'},
            {source: 'ml', target: 'dl', weight: 7, label: 'is_subfield_of'}
        ]
    };
    return {
        id: uuidv4(),
        type: 'fallback_analysis',
        timestamp: new Date().toISOString(),
        knowledgeGraph: sampleGraph,
        peoAnalysis: this.simplePEOClassification(sampleGraph),
        networkMetrics: this.calculateNetworkMetrics(sampleGraph),
        originalData: {
          type: 'fallback',
          message: 'Could not generate graph from source, displaying sample data.'
        }
      };
  }

  /**
   * Analyze CSV file with OpenAI
   */
  async analyzeCSVWithAI(csvText) {
    try {
      console.log('🤖 Calling OpenAI service for CSV analysis...');

      if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your-openai-api-key-here') {
        throw new Error('OpenAI API key not configured. Please set OPENAI_API_KEY environment variable.');
      }

      if (!csvText || csvText.trim().length === 0) {
        throw new Error('CSV file is empty or contains no data');
      }

      // Prepare different data for different analyses
      const sampledCsvText = this.sampleCsvText(csvText); // 1% for knowledge graph
      const fullCsvData = csvText; // Full dataset for PEO analysis

      console.log(`📊 Starting analysis of CSV file: ${csvText.split('\n').length - 1} rows`);
      console.log(`🔬 Knowledge Graph: Using ${Math.round((sampledCsvText.length / csvText.length) * 100)}% sample`);
      console.log(`📈 PEO Analysis: Using 100% of dataset for comprehensive analysis`);

      // Start parallel processing immediately
      console.log('⚡ Starting Knowledge Graph generation and PEO analysis in parallel...');
      const [analysisResult, peoAnalysisResult] = await Promise.all([
        this.analyzeWithOpenAI(sampledCsvText, 'csv_metadata_analysis', fullCsvData),
        this.performFullPEOAnalysis(fullCsvData) // Direct analysis of full CSV
      ]);

      const knowledgeGraph = this.buildKnowledgeGraph(analysisResult);

      if (knowledgeGraph.nodes.length === 0) {
        return this._getSampleGraph();
      }

      // Network metrics can use the knowledge graph (already optimized)
      const networkMetrics = await this.calculateNetworkMetrics(knowledgeGraph);
      console.log('✅ All analyses completed in parallel');

      const result = {
        id: uuidv4(),
        type: 'csv_analysis',
        timestamp: new Date().toISOString(),
        knowledgeGraph,
        peoAnalysis: peoAnalysisResult,
        networkMetrics,
        originalData: {
          type: 'csv',
          size: csvText.length,
          rows: csvText.split('\n').length - 1,
          sampled: sampledCsvText.length < csvText.length
        }
      };

      this.cache.set(result.id, result);
      console.log(`✅ CSV analysis complete: ${knowledgeGraph.nodes?.length || 0} nodes and ${knowledgeGraph.links?.length || 0} links created`);
      return result;

    } catch (error) {
      console.error('CSV analysis failed:', error);
      return this._getSampleGraph();
    }
  }

  /**
   * Dynamically and robustly sample CSV text based on character count to fit token limits.
   */
  sampleCsvText(csvText) {
    // Target ~75k tokens, leaving a generous buffer for the prompt and response within a 128k context window.
    const TARGET_CHAR_COUNT = 300000; 
    const totalChars = csvText.length;

    if (totalChars <= TARGET_CHAR_COUNT) {
        console.log('📝 CSV content size is within limits. No sampling needed.');
        return csvText;
    }

    console.log(`🔬 Total characters (${totalChars}) exceed target (${TARGET_CHAR_COUNT}). Applying robust sampling.`);
    
    const lines = csvText.split('\n');
    const header = lines[0];
    const dataRows = lines.slice(1);

    if (dataRows.length === 0) return csvText;

    // Shuffle rows to get a representative sample
    const shuffledRows = dataRows.sort(() => 0.5 - Math.random());
    
    const sampledRows = [];
    let currentChars = header.length;

    for (const row of shuffledRows) {
        if (currentChars + row.length + 1 <= TARGET_CHAR_COUNT) {
            sampledRows.push(row);
            currentChars += row.length + 1; // +1 for the newline character
        } else {
            // Stop adding rows once we are near the limit to guarantee size
            break; 
        }
    }

    // Handle edge case where even the first row is too long
    if (sampledRows.length === 0 && shuffledRows.length > 0) {
        sampledRows.push(shuffledRows[0].substring(0, TARGET_CHAR_COUNT - header.length - 1));
        console.warn('⚠️ First data row was too long and has been truncated.');
    }
    
    const newCsvText = [header, ...sampledRows].join('\n');
    console.log(`📝 Original rows: ${dataRows.length}, Sampled rows: ${sampledRows.length}. New char count: ${newCsvText.length}`);
    
    return newCsvText;
  }

  /**
   * Analyze PDF file with OpenAI, using chunking for large files.
   */
  async analyzePDFWithAI(pdfBuffer) {
    try {
      console.log('🤖 Calling OpenAI service for PDF analysis...');

      if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your-openai-api-key-here') {
        throw new Error('OpenAI API key not configured.');
      }

      const pdfText = await this.extractTextFromPDF(pdfBuffer);
      if (!pdfText || pdfText.trim().length === 0) {
        throw new Error('No readable text found in PDF file');
      }
      
      console.log(`📄 Extracted ${pdfText.length} characters of text from PDF`);
      
      const CHAR_LIMIT_SINGLE_CALL = 300000;
      let analysisResult;

      if (pdfText.length > CHAR_LIMIT_SINGLE_CALL) {
          console.warn(`⚠️ PDF text is too long (${pdfText.length} chars). Initiating chunk-based analysis.`);
          analysisResult = await this._processLongText(pdfText);
      } else {
          analysisResult = await this.analyzeWithOpenAI(pdfText, 'knowledge_graph', pdfText);
      }

      const knowledgeGraph = this.buildKnowledgeGraph(analysisResult);
      
      if (knowledgeGraph.nodes.length === 0) {
        return this._getSampleGraph();
      }

      console.log('⚡ Starting PEO and Network analysis in parallel...');
      const [peoAnalysis, networkMetrics] = await Promise.all([
        this.performPEOAnalysis(knowledgeGraph),
        this.calculateNetworkMetrics(knowledgeGraph)
      ]);
      console.log('✅ PEO and Network analysis completed concurrently');

      const result = {
        id: uuidv4(),
        type: 'pdf_analysis',
        timestamp: new Date().toISOString(),
        knowledgeGraph,
        peoAnalysis,
        networkMetrics,
        originalData: {
          type: 'pdf',
          size: pdfBuffer.length,
          textLength: pdfText.length
        }
      };

      this.cache.set(result.id, result);
      console.log(`✅ PDF analysis complete: ${knowledgeGraph.nodes?.length || 0} nodes and ${knowledgeGraph.links?.length || 0} links created`);
      return result;

    } catch (error) {
      console.error('PDF analysis failed:', error);
      return this._getSampleGraph();
    }
  }

  /**
   * [NEW] Process long text by splitting into chunks, analyzing each, and merging results.
   */
  async _processLongText(text) {
    const CHUNK_SIZE = 280000; // Slightly smaller than limit to leave space for prompt
    const CHUNK_OVERLAP = 20000;  // Overlap to maintain context between chunks
    const chunks = [];

    for (let i = 0; i < text.length; i += CHUNK_SIZE - CHUNK_OVERLAP) {
        chunks.push(text.substring(i, i + CHUNK_SIZE));
    }
    console.log(`Splitting text into ${chunks.length} chunks for parallel processing.`);

    const analysisPromises = chunks.map(chunk => 
        this.analyzeWithOpenAI(chunk, 'knowledge_graph_chunk', text)
    );

    const partialGraphs = await Promise.all(analysisPromises);
    console.log(`✅ All ${partialGraphs.length} chunks analyzed. Merging results...`);

    return this._mergeGraphs(partialGraphs);
  }

  /**
   * [NEW] Merges multiple partial knowledge graphs into a single graph.
   */
  _mergeGraphs(graphs) {
      const mergedNodes = new Map();
      const mergedLinks = new Map(); // Using 'links' for consistency

      graphs.forEach(graph => {
          const nodes = graph.nodes || [];
          const links = graph.links || graph.edges || []; // Accept both for backward compatibility

          nodes.forEach(node => {
              const nodeId = node.id || node.label.toLowerCase().replace(/\s+/g, '_');
              if (mergedNodes.has(nodeId)) {
                  const existingNode = mergedNodes.get(nodeId);
                  existingNode.size = Math.max(existingNode.size, node.size);
                  if (node.description && !existingNode.description.includes(node.description)) {
                      existingNode.description += `\n${node.description}`;
                  }
              } else {
                  mergedNodes.set(nodeId, { ...node, id: nodeId });
              }
          });

          links.forEach(link => {
              const sourceId = link.source;
              const targetId = link.target;
              const linkLabel = link.label || 'related';
              const linkKey = `${sourceId}->${targetId}[${linkLabel}]`;

              if (mergedLinks.has(linkKey)) {
                  mergedLinks.get(linkKey).weight += link.weight;
              } else {
                  mergedLinks.set(linkKey, { ...link });
              }
          });
      });

      console.log(`Merged graph contains ${mergedNodes.size} unique nodes and ${mergedLinks.size} unique links.`);
      return {
          nodes: Array.from(mergedNodes.values()),
          links: Array.from(mergedLinks.values())
      };
  }

  /**
   * Analyze existing graph data with OpenAI
   */
  async analyzeGraphWithAI(graphData) {
    try {
      console.log('🤖 Calling OpenAI service for graph analysis...');
      const graphText = this.graphToText(graphData);
      const analysisResult = await this.callPythonAnalyzer({
        type: 'graph',
        content: graphText,
        graph_data: graphData,
        analysis_type: 'graph_analysis'
      });
      const [peoAnalysis, networkMetrics, communities] = await Promise.all([
        this.performPEOAnalysis(graphData),
        this.calculateNetworkMetrics(graphData),
        this.detectCommunitiesSimple(graphData)
      ]);
      const result = {
        id: uuidv4(),
        type: 'graph_analysis',
        timestamp: new Date().toISOString(),
        originalGraph: graphData,
        aiInsights: analysisResult,
        peoAnalysis,
        networkMetrics,
        communities,
        recommendations: this.generateRecommendations(graphData, analysisResult)
      };
      this.cache.set(result.id, result);
      this.manageCache();
      return result;
    } catch (error) {
      console.error('Graph analysis failed:', error);
      throw new Error(`Graph analysis failed: ${error.message}`);
    }
  }

  /**
   * Analyze text with OpenAI API directly, with dynamic entity goals.
   */
  /**
   * Generate context-aware prompts for different analysis types
   */
  generateAnalysisPrompt(textToAnalyze, analysisType) {
    const promptTemplates = {
      'csv_metadata_analysis': `
TASK: Analyze the following CSV metadata from scientific literature and create a comprehensive knowledge graph.

CONTEXT: This is a representative sample from a larger dataset of photosynthesis and plant science research papers. Extract the most significant research concepts, methodologies, and relationships.

DATA CHARACTERISTICS:
- Contains titles, abstracts, keywords, and metadata from peer-reviewed research
- Focuses on photosynthesis, plant physiology, and related fields
- Represents current research trends and established knowledge domains

ANALYSIS REQUIREMENTS:
1. Identify MAJOR RESEARCH THEMES across the papers
2. Extract METHODOLOGICAL APPROACHES and experimental techniques
3. Map BIOLOGICAL SYSTEMS, organisms, and molecular components
4. Detect RESEARCH PARAMETERS and measurement variables
5. Find TECHNOLOGICAL TOOLS and analytical platforms
6. Establish CONCEPTUAL RELATIONSHIPS between research areas

QUALITY STANDARDS:
- Prioritize concepts that appear in multiple papers (high frequency)
- Focus on photosynthesis-specific terminology and processes
- Create meaningful scientific hierarchies (general → specific)
- Establish strong evidence-based relationships
- Ensure biological accuracy and scientific validity

CSV METADATA TO ANALYZE:
${textToAnalyze}

Extract a sophisticated knowledge graph that captures the essence of this research corpus.`,

      'knowledge_graph': `
TASK: Create a comprehensive scientific knowledge graph from the following research content.

ANALYSIS FOCUS: Extract the deepest scientific insights, mechanisms, and relationships from this text. Prioritize biological processes, molecular interactions, and theoretical frameworks.

CONTENT TO ANALYZE:
${textToAnalyze}

Generate a rich, hierarchical knowledge graph that captures the essential scientific knowledge.`,

      'knowledge_graph_chunk': `
TASK: Extract entities and relationships from this text chunk for subsequent merging.

TEXT CHUNK:
${textToAnalyze}

Extract all relevant scientific entities and their direct relationships within this chunk.`
    };

    return promptTemplates[analysisType] || promptTemplates['knowledge_graph'];
  }

  async analyzeWithOpenAI(textToAnalyze, analysisType = 'knowledge_graph', originalText = null) {
    try {
        const sourceText = originalText || textToAnalyze;
        const dataRows = sourceText.split('\n')[0].includes(',') ? sourceText.split('\n').length - 1 : (sourceText.length / 500);
        const targetEntities = Math.min(100, Math.max(10, Math.floor(dataRows * 0.2)));

        if(analysisType !== 'knowledge_graph_chunk') {
            console.log(`Dynamic Target: Requesting approximately ${targetEntities} entities for ${dataRows} data rows/equivalents.`);
        }

        const targetRelationships = Math.max(10, Math.floor(targetEntities * 0.7));

        const systemPrompts = {
            knowledge_graph: `Extract a scientific knowledge graph from the provided text. Focus on key concepts and their relationships.

REQUIREMENTS:
- Extract ${targetEntities} most significant scientific entities
- Identify relationships between entities
- Use precise scientific terminology
- Every node you output MUST appear in at least one relationship

RELATIONSHIP COVERAGE:
- Provide at least ${targetRelationships} relationships (≈70% of node count)
- Each relationship must include "source", "target" and "label" referencing node IDs exactly as declared in the nodes list
- If you cannot identify a valid relationship for a concept, omit that concept from the output

OUTPUT FORMAT (JSON only):
{
  "nodes": [
    { "id": "snake_case_id", "label": "Entity Name", "size": 30-60, "type": "process|concept|structure|parameter" }
  ],
  "links": [
    { "source": "node_id", "target": "node_id", "weight": 1-10, "label": "relationship_type" }
  ]
}

RELATIONSHIP TYPES: regulates, catalyzes, produces, requires, controls, influences, part_of, interacts_with, promotes, inhibits, activates, converts, uses

GOOD OUTPUT EXAMPLE:
{
  "nodes": [
    { "id": "leaf_hydraulics", "label": "Leaf Hydraulics", "size": 45, "type": "concept" },
    { "id": "stomatal_conductance", "label": "Stomatal Conductance", "size": 40, "type": "process" }
  ],
  "links": [
    { "source": "leaf_hydraulics", "target": "stomatal_conductance", "weight": 7, "label": "regulates" }
  ]
}

BAD OUTPUT EXAMPLE (DO NOT DO THIS):
{ "links": [ { "label": "related" } ] }  ← Missing source/target so the relationship is invalid.

CRITICAL: Use 'label' for nodes, 'links' for relationships. Return ONLY valid JSON.`,
            csv_metadata_analysis: `Extract a knowledge graph from CSV metadata (titles, abstracts, keywords). Identify research concepts and their relationships.

REQUIREMENTS:
- Extract ${targetEntities} most significant research concepts from the metadata
- Identify relationships between concepts
- Focus on photosynthesis, plant science, and related fields
- Every node must belong to at least one relationship

RELATIONSHIP COVERAGE:
- Provide at least ${targetRelationships} relationships (or as many as the data supports if fewer nodes exist)
- Always include "source", "target", "label" using node IDs
- If a relationship cannot be determined, do not output the node

OUTPUT FORMAT (JSON only):
{
  "nodes": [
    { "id": "snake_case_id", "label": "Concept Name", "size": 30-60, "type": "research_topic|methodology|organism|parameter" }
  ],
  "links": [
    { "source": "node_id", "target": "node_id", "weight": 1-10, "label": "relationship_type" }
  ]
}

RELATIONSHIP TYPES: includes, studies, uses, applies, investigates, develops, compares, influences, related_to

CRITICAL: Use 'label' for nodes, 'links' for relationships. Return ONLY valid JSON.`,
            knowledge_graph_chunk: `Extract entities and relationships from this text chunk. Use snake_case for node IDs to enable merging.

OUTPUT FORMAT (JSON only):
{
  "nodes": [
    { "id": "snake_case_id", "label": "Entity Name", "size": 30, "type": "concept|process|structure" }
  ],
  "links": [
    { "source": "node_id", "target": "node_id", "weight": 1-10, "label": "relationship_type" }
  ]
}

RELATIONSHIP COVERAGE:
- For each node you include, attach at least one relationship
- Always reference node IDs exactly as declared above

CRITICAL: Return ONLY valid JSON. Use 'links' not 'edges'.`
        };

      const response = await this.openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4.1-nano',
        messages: [
          {
            role: 'system',
            content: systemPrompts[analysisType] || systemPrompts.knowledge_graph
          },
          {
            role: 'user',
            content: this.generateAnalysisPrompt(textToAnalyze, analysisType)
          }
        ],
        temperature: 0.0, // Deterministic extraction for reproducibility
        max_tokens: 4000, // Increased for complex graphs
        top_p: 0.9,
        frequency_penalty: 0.1,
        presence_penalty: 0.1,
        response_format: { type: "json_object" }
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No content received from OpenAI API');
      }

      let parsedContent;
      try {
        parsedContent = JSON.parse(content);
      } catch (parseError) {
        console.error('Failed to parse OpenAI JSON response:', parseError.message);
        console.error('Raw response snippet:', content.slice(0, 1000));
        throw new Error(`OpenAI JSON parse error: ${parseError.message}`);
      }

      if (analysisType !== 'knowledge_graph_chunk') {
        console.log(`✅ OpenAI analysis complete: ${parsedContent.nodes?.length || 0} nodes, ${(parsedContent.edges || parsedContent.links)?.length || 0} relationships extracted`);

        // Debug: Log first few nodes and edges to understand structure
        if (parsedContent.nodes && parsedContent.nodes.length > 0) {
          console.log('Sample nodes:', JSON.stringify(parsedContent.nodes.slice(0, 2), null, 2));
        }
        if ((parsedContent.edges || parsedContent.links) && (parsedContent.edges || parsedContent.links).length > 0) {
          console.log('Sample edges:', JSON.stringify((parsedContent.edges || parsedContent.links).slice(0, 2), null, 2));
        }
      }

      return parsedContent;

    } catch (error) {
      console.error('OpenAI API error:', error);
      throw new Error(`OpenAI API call failed: ${error.message}`);
    }
  }

  /**
   * Call Python OpenAI analyzer (fallback method)
   */
  async callPythonAnalyzer(data) {
    return new Promise((resolve, reject) => {
      const python = spawn(this.pythonPath, [this.analyzerScript]);
      let stdout = '';
      let stderr = '';

      python.stdin.write(JSON.stringify(data));
      python.stdin.end();

      python.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      python.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      python.on('close', (code) => {
        if (code !== 0) {
          console.error('Python analyzer error:', stderr);
          reject(new Error(`Python analyzer failed with code ${code}: ${stderr}`));
        } else {
          try {
            const result = JSON.parse(stdout);
            resolve(result);
          } catch (error) {
            console.error('Failed to parse Python output:', stdout);
            reject(new Error(`Failed to parse analysis result: ${error.message}`));
          }
        }
      });

      python.on('error', (error) => {
        reject(new Error(`Failed to start Python analyzer: ${error.message}`));
      });
    });
  }

  /**
   * Extract text from PDF buffer
   */
  async extractTextFromPDF(pdfBuffer) {
    try {
      let pdfParse;
      try {
        pdfParse = require('pdf-parse');
      } catch (moduleError) {
        console.warn('pdf-parse module not found, using basic text extraction');
        return this.extractTextFromPDFBasic(pdfBuffer);
      }

      const data = await pdfParse(pdfBuffer);

      if (!data.text || data.text.trim().length === 0) {
        console.warn('No text extracted from PDF, trying basic method');
        return this.extractTextFromPDFBasic(pdfBuffer);
      }

      return data.text;
    } catch (error) {
      console.error('PDF text extraction failed:', error);
      return this.extractTextFromPDFBasic(pdfBuffer);
    }
  }

  /**
   * Basic PDF text extraction fallback
   */
  extractTextFromPDFBasic(pdfBuffer) {
    try {
      let text = pdfBuffer.toString('utf8');
      text = text.replace(/[ --]/g, ' ');
      text = text.replace(/\s+/g, ' ').trim();

      if (text.length < 100) {
        text = pdfBuffer.toString('latin1');
        text = text.replace(/[ --]/g, ' ');
        text = text.replace(/\s+/g, ' ').trim();
      }

      return text;
    } catch (error) {
      console.error('Basic PDF extraction failed:', error);
      return 'Unable to extract text from PDF file. The file may be corrupted or contain only images.';
    }
  }

  /**
   * Build knowledge graph from OpenAI analysis result
   */
  buildKnowledgeGraph(analysisResult) {
    try {
        console.log('Building knowledge graph from structured analysis result...');
        console.log('Raw analysis result:', JSON.stringify(analysisResult, null, 2));

        const nodeCollections = this.collectGraphEntriesByType(analysisResult, new Set(['nodes']));
        const linkCollections = this.collectGraphEntriesByType(analysisResult, new Set(['links', 'edges', 'relationships']));

        const nodes = nodeCollections.length > 0 ? nodeCollections : (analysisResult.nodes || []);
        const links = linkCollections.length > 0 ? linkCollections : (analysisResult.links || analysisResult.edges || analysisResult.$links$ || []); // Accept multiple formats for backward compatibility

        console.log(`Processing ${nodes.length} raw nodes and ${links.length} raw links`);

        const nodeMap = new Map();
        const validNodes = [];
        let autoGeneratedNodes = 0;
        let autoGeneratedEdges = 0;

        const prettifyLabel = (text) => {
            if (!text) return 'Unknown';
            return text
                .toString()
                .replace(/[_]+/g, ' ')
                .replace(/\s+/g, ' ')
                .trim()
                .replace(/\b\w/g, (c) => c.toUpperCase());
        };

        const registerNode = (nodeObj) => {
            if (!nodeObj || !nodeObj.id) return null;

            if (nodeMap.has(nodeObj.id)) {
                return nodeMap.get(nodeObj.id);
            }

            validNodes.push(nodeObj);
            nodeMap.set(nodeObj.id, nodeObj);
            nodeMap.set(nodeObj.label, nodeObj);
            nodeMap.set(this.generateNodeId(nodeObj.label), nodeObj);
            nodeMap.set(this.normalizeIdentifier(nodeObj.id), nodeObj);
            nodeMap.set(this.normalizeIdentifier(nodeObj.label), nodeObj);
            return nodeObj;
        };

        const ensureNodeExists = (identifier) => {
            const node = this.findNodeMatch(identifier, nodeMap);
            if (node) return node;

            if (!identifier || !identifier.toString().trim()) return null;
            const raw = identifier.toString().trim();
            const normalized = this.generateNodeId(raw);

            const autoNode = registerNode({
                id: normalized || `auto_node_${nodeMap.size}`,
                label: prettifyLabel(raw),
                size: 28,
                type: 'concept',
                attributes: {
                    description: 'Auto-generated from relationship reference',
                    auto_generated: true
                }
            });

            autoGeneratedNodes++;
            return autoNode;
        };

        // More lenient node validation - accept both 'label' and 'name' fields
        nodes.filter(n => n && (n.id || n.label || n.name)).forEach(rawNode => {
            const normalizedNode = this.normalizeGraphObject(rawNode, 'node');
            const nodeLabel = normalizedNode.label || rawNode.label || rawNode.name || rawNode.id || 'Unknown';
            const nodeId = normalizedNode.id || rawNode.id || this.generateNodeId(nodeLabel);

            registerNode({
                id: nodeId,
                label: nodeLabel,
                size: normalizedNode.size || rawNode.size || rawNode.frequency || 30,
                type: normalizedNode.type || rawNode.type || 'concept',
                attributes: {
                    description: normalizedNode.description || rawNode.description || '',
                    traits: normalizedNode.traits || rawNode.traits || [],
                    components: normalizedNode.components || rawNode.components || [],
                    formula: normalizedNode.formula || rawNode.formula || '',
                    domain: normalizedNode.domain || rawNode.domain || rawNode.domain_specificity || '',
                    scale: normalizedNode.scale || rawNode.scale || '',
                    quantification: normalizedNode.quantification || rawNode.quantification || '',
                    frequency: normalizedNode.frequency || rawNode.frequency || 0,
                    research_maturity: normalizedNode.research_maturity || rawNode.research_maturity || '',
                    citation_potential: normalizedNode.citation_potential || rawNode.citation_potential || ''
                }
            });
        });

        console.log(`Valid nodes after processing: ${validNodes.length}`);

        // Ensure every edge reference has a node
        links.forEach(edge => {
            if (!edge) return;
            ensureNodeExists(edge.source);
            ensureNodeExists(edge.target);
        });

        const makeEdgeKey = (source, target) => {
            if (!source || !target) return '';
            return source < target ? `${source}__${target}` : `${target}__${source}`;
        };

        const normalizeLabel = (label) => {
            const clean = label && label.toString().trim();
            return clean && clean.length > 0 ? clean : 'related_to';
        };

        const relationKeywords = this.getRelationKeywordSet();
        const existingEdgeKeys = new Set();
        const validLinks = [];

        const pushEdge = (edgeObj) => {
            if (!edgeObj || !edgeObj.source || !edgeObj.target) return;
            if (edgeObj.source === edgeObj.target) return;
            const edgeKey = makeEdgeKey(edgeObj.source, edgeObj.target);
            if (existingEdgeKeys.has(edgeKey)) return;
            existingEdgeKeys.add(edgeKey);
            validLinks.push(edgeObj);
        };

        links.forEach(rawEdge => {
            const extracted = this.extractEdgesFromEntry(rawEdge, ensureNodeExists, normalizeLabel, relationKeywords);
            extracted.forEach(edge => {
                if (edge.attributes?.auto_generated) {
                    autoGeneratedEdges++;
                }
                pushEdge(edge);
            });
        });

        // Fallback edges if graph is too sparse
        const maxPossibleLinks = (validNodes.length * (validNodes.length - 1)) / 2;
        const desiredLinkCount = Math.min(
            Math.ceil(validNodes.length * 0.6),
            maxPossibleLinks
        );

        if (validLinks.length < desiredLinkCount) {
            const sortedNodes = [...validNodes].sort((a, b) => (b.size || 0) - (a.size || 0));

            for (let i = 0; i < sortedNodes.length; i++) {
                for (let j = i + 1; j < sortedNodes.length; j++) {
                    if (validLinks.length >= desiredLinkCount) break;

                    const source = sortedNodes[i];
                    const target = sortedNodes[j];
                    const edgeKey = makeEdgeKey(source.id, target.id);

                    if (existingEdgeKeys.has(edgeKey)) continue;

                    validLinks.push({
                        source: source.id,
                        target: target.id,
                        weight: 2,
                        label: 'related_to',
                        attributes: {
                            description: 'Auto-generated fallback relationship based on topical proximity',
                            auto_generated: true
                        }
                    });

                    existingEdgeKeys.add(edgeKey);
                    autoGeneratedEdges++;
                }
                if (validLinks.length >= desiredLinkCount) break;
            }

            if (autoGeneratedEdges > 0) {
                console.log(`⚙️ Added ${autoGeneratedEdges} fallback relationships to improve graph connectivity.`);
            }
        }

        // Bridge fragmented components by linking to the largest component
        const components = this.computeComponents(validNodes, validLinks);
        if (components.length > 1) {
            const sortedComponents = components.sort((a, b) => b.length - a.length);
            const mainComponentIds = new Set(sortedComponents[0]);
            const mainComponentNodes = sortedComponents[0].map(id => nodeMap.get(id)).filter(Boolean);

            let bridgeEdges = 0;

            for (let i = 1; i < sortedComponents.length; i++) {
                const componentIds = sortedComponents[i];
                const componentNodes = componentIds.map(id => nodeMap.get(id)).filter(Boolean);
                if (componentNodes.length === 0 || mainComponentNodes.length === 0) continue;

                let bestPair = null;
                let bestScore = -1;

                componentNodes.forEach(nodeA => {
                    mainComponentNodes.forEach(nodeB => {
                        const similarity = this.calculateLabelSimilarity(nodeA.label, nodeB.label);
                        if (similarity > bestScore) {
                            bestScore = similarity;
                            bestPair = { source: nodeA, target: nodeB };
                        }
                    });
                });

                if (!bestPair) {
                    bestPair = { source: componentNodes[0], target: mainComponentNodes[0] };
                }

                const edgeKey = makeEdgeKey(bestPair.source.id, bestPair.target.id);
                if (existingEdgeKeys.has(edgeKey)) {
                    continue;
                }

                validLinks.push({
                    source: bestPair.source.id,
                    target: bestPair.target.id,
                    weight: Math.max(2, Math.round((bestScore || 0.3) * 10)),
                    label: 'contextual_link',
                    attributes: {
                        description: 'Auto-bridged component link based on semantic similarity',
                        auto_generated: true,
                        similarity: Number((bestScore || 0).toFixed(3))
                    }
                });

                existingEdgeKeys.add(edgeKey);
                bridgeEdges++;
                autoGeneratedEdges++;
            }

            if (bridgeEdges > 0) {
                console.log(`🔗 Added ${bridgeEdges} component-bridging links to reduce fragmentation.`);
            }
        }

        console.log(`Graph built: ${validNodes.length} valid nodes, ${validLinks.length} valid links.`);

        if (validNodes.length === 0) {
            console.warn('No valid nodes created - checking input data structure...');
            console.log('Sample node data:', nodes.slice(0, 3));
        }

        return {
            nodes: validNodes || [],
            links: validLinks || [], // Ensure the final property is 'links' and never undefined
            metadata: {
                extraction_method: 'openai_structured_analysis',
                timestamp: new Date().toISOString(),
                total_entities: (validNodes || []).length,
                total_relationships: (validLinks || []).length,
                auto_generated_nodes: autoGeneratedNodes,
                auto_generated_edges: autoGeneratedEdges,
                desired_relationships: desiredLinkCount
            }
        };
    } catch (error) {
        console.error('Error building knowledge graph:', error);
        console.error('Analysis result that caused error:', analysisResult);
        return {
            nodes: [],
            links: [], // Always return empty array, never undefined
            metadata: {
                error: error.message,
                extraction_method: 'error_fallback',
                timestamp: new Date().toISOString(),
                total_entities: 0,
                total_relationships: 0
            }
        };
    }
  }

  /**
   * Generate a valid node ID from a label
   */
  generateNodeId(label) {
    if (!label) return 'unknown_node';
    return label.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 50); // Limit length
  }

  normalizeIdentifier(value) {
    if (!value) return '';
    return value.toString().toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  normalizeKeyName(key) {
    if (!key) return '';
    const lower = key.toString().toLowerCase();
    if (lower.includes('source')) return 'source';
    if (lower.includes('target')) return 'target';
    if (lower.includes('weight')) return 'weight';
    if (lower.includes('label')) return 'label';
    if (lower.includes('type')) return 'type';
    if (lower.includes('size')) return 'size';
    if (lower.includes('id')) return 'id';
    if (lower.includes('nodes')) return 'nodes';
    if (lower.includes('links')) return 'links';
    if (lower.includes('edges')) return 'links';
    if (lower.includes('relationship')) return 'links';
    if (lower.includes('description')) return 'description';
    if (lower.includes('domain')) return 'domain';
    if (lower.includes('component')) return 'components';
    if (lower.includes('trait')) return 'traits';
    if (lower.includes('formula')) return 'formula';
    if (lower.includes('quantification')) return 'quantification';
    if (lower.includes('frequency')) return 'frequency';
    if (lower.includes('maturity')) return 'research_maturity';
    if (lower.includes('citation')) return 'citation_potential';
    return lower.replace(/[^a-z0-9]+/g, '');
  }

  normalizeGraphObject(obj, kind) {
    if (!obj || typeof obj !== 'object') return {};
    const normalized = {};

    Object.entries(obj).forEach(([key, value]) => {
      const normKey = this.normalizeKeyName(key);
      switch (normKey) {
        case 'id':
          normalized.id = value;
          break;
        case 'label':
          normalized.label = value;
          break;
        case 'size':
          normalized.size = Number(value) || normalized.size;
          break;
        case 'type':
          normalized.type = value;
          break;
        case 'description':
          normalized.description = value;
          break;
        case 'traits':
          normalized.traits = value;
          break;
        case 'components':
          normalized.components = value;
          break;
        case 'formula':
          normalized.formula = value;
          break;
        case 'domain':
          normalized.domain = value;
          break;
        case 'quantification':
          normalized.quantification = value;
          break;
        case 'frequency':
          normalized.frequency = Number(value) || 0;
          break;
        case 'research_maturity':
          normalized.research_maturity = value;
          break;
        case 'citation_potential':
          normalized.citation_potential = value;
          break;
        case 'source':
          normalized.source = value;
          break;
        case 'target':
          normalized.target = value;
          break;
        case 'weight':
          normalized.weight = Number(value) || normalized.weight;
          break;
        case 'links':
          if (kind === 'edge' && Array.isArray(value)) {
            normalized.links = value;
          }
          break;
        default:
          break;
      }
    });

    return normalized;
  }

  collectGraphEntriesByType(data, targetTypes) {
    const results = [];
    if (!data || typeof data !== 'object') {
      return results;
    }

    Object.entries(data).forEach(([key, value]) => {
      const normKey = this.normalizeKeyName(key);
      if (targetTypes.has(normKey) && Array.isArray(value)) {
        results.push(...value);
      }
    });

    return results;
  }

  findNodeMatch(identifier, nodeMap) {
    if (!identifier) return null;
    if (typeof identifier === 'object' && identifier.id) {
      return nodeMap.get(identifier.id);
    }
    const raw = identifier.toString().trim();
    if (!raw) return null;
    const normalized = this.normalizeIdentifier(raw);
    return nodeMap.get(raw) ||
      nodeMap.get(this.generateNodeId(raw)) ||
      nodeMap.get(normalized) ||
      null;
  }

  getRelationKeywordSet() {
    const keywords = [
      'regulates', 'regulate', 'controls', 'control', 'influences', 'influence',
      'affects', 'affect', 'drives', 'drive', 'depends', 'depend', 'requires',
      'require', 'produces', 'produce', 'induces', 'induce', 'limits', 'limit',
      'includes', 'include', 'spans', 'span', 'relates', 'relate', 'correlates',
      'correlate', 'connects', 'connect', 'balances', 'balance', 'integrates',
      'integrate', 'couples', 'couple', 'determines', 'determine', 'predicts',
      'predict', 'links', 'link', 'validates', 'validate', 'explains', 'explain',
      'causes', 'cause', 'precedes', 'precede', 'describes', 'describe',
      'models', 'model', 'aims', 'aim', 'characterizes', 'characterize'
    ];
    return new Set(keywords);
  }

  isRelationKeyword(token, relationSet) {
    if (!token) return false;
    return relationSet.has(token);
  }

  makeEdgeObject(sourceNode, targetNode, label, weight = 3, autoGenerated = false, extraAttributes = {}) {
    if (!sourceNode || !targetNode) return null;
    return {
      source: sourceNode.id,
      target: targetNode.id,
      weight,
      label: label || 'related_to',
      attributes: {
        auto_generated: autoGenerated,
        ...extraAttributes
      }
    };
  }

  extractEdgesFromEntry(rawEdge, ensureNodeExists, normalizeLabel, relationKeywords) {
    const edges = [];
    if (!rawEdge) return edges;

    const canonical = this.normalizeGraphObject(rawEdge, 'edge');
    if (canonical.source && canonical.target) {
      const sourceNode = ensureNodeExists(canonical.source);
      const targetNode = ensureNodeExists(canonical.target);
      if (sourceNode && targetNode) {
        const edge = this.makeEdgeObject(
          sourceNode,
          targetNode,
          normalizeLabel(canonical.label),
          canonical.weight || 3,
          false,
          {
            description: canonical.description || '',
            direction: canonical.direction || 'unidirectional',
            evidence_level: canonical.evidence_level || 'moderate'
          }
        );
        if (edge) edges.push(edge);
        return edges;
      }
    }

    const canonicalSource = ensureNodeExists(rawEdge.source);
    const canonicalTarget = ensureNodeExists(rawEdge.target);

    if (canonicalSource && canonicalTarget) {
      edges.push(this.makeEdgeObject(
        canonicalSource,
        canonicalTarget,
        normalizeLabel(rawEdge.label || rawEdge.relationship),
        rawEdge.weight || 3,
        false,
        {
          description: rawEdge.description || '',
          direction: rawEdge.direction || 'unidirectional',
          evidence_level: rawEdge.evidence_level || 'moderate'
        }
      ));
      return edges;
    }

    const entries = Object.entries(rawEdge);
    if (!entries.length) return edges;

    let currentSource = canonicalSource;
    let pendingLabel = null;

    const processValueNodes = (value) => {
      const values = Array.isArray(value) ? value : [value];
      return values
        .map(v => ensureNodeExists(v))
        .filter(Boolean);
    };

    entries.forEach(([rawKey, rawValue]) => {
      const keyNode = ensureNodeExists(rawKey);
      const valueNodes = processValueNodes(rawValue);
      const keyToken = this.normalizeIdentifier(rawKey);

      if (keyNode && valueNodes.length > 0) {
        currentSource = keyNode;
        valueNodes.forEach(targetNode => {
          const edge = this.makeEdgeObject(
            keyNode,
            targetNode,
            pendingLabel || 'related_to',
            3,
            true,
            { description: 'Auto-derived from malformed relationship key' }
          );
          if (edge) edges.push(edge);
        });
        pendingLabel = null;
        return;
      }

      if (keyNode) {
        currentSource = keyNode;
        pendingLabel = null;
        return;
      }

      if (this.isRelationKeyword(keyToken, relationKeywords)) {
        pendingLabel = keyToken;
        if (currentSource && valueNodes.length > 0) {
          valueNodes.forEach(targetNode => {
            const edge = this.makeEdgeObject(
              currentSource,
              targetNode,
              pendingLabel,
              3,
              true,
              { description: 'Auto-derived relation label from malformed entry' }
            );
            if (edge) edges.push(edge);
          });
          pendingLabel = null;
        }
        return;
      }

      if (currentSource && valueNodes.length > 0) {
        valueNodes.forEach(targetNode => {
          const edge = this.makeEdgeObject(
            currentSource,
            targetNode,
            pendingLabel || 'related_to',
            3,
            true,
            { description: 'Auto-derived fallback relationship' }
          );
          if (edge) edges.push(edge);
        });
        pendingLabel = null;
      }
    });

    return edges;
  }

  tokenizeLabel(label) {
    if (!label) return [];
    return label
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
  }

  calculateLabelSimilarity(labelA, labelB) {
    const tokensA = new Set(this.tokenizeLabel(labelA));
    const tokensB = new Set(this.tokenizeLabel(labelB));

    if (tokensA.size === 0 || tokensB.size === 0) return 0;

    let intersection = 0;
    tokensA.forEach(token => {
      if (tokensB.has(token)) intersection++;
    });

    const union = tokensA.size + tokensB.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }

  computeComponents(nodes, links) {
    const adjacency = new Map();
    nodes.forEach(node => {
      adjacency.set(node.id, new Set());
    });

    links.forEach(link => {
      const sourceSet = adjacency.get(link.source);
      const targetSet = adjacency.get(link.target);
      if (sourceSet && targetSet) {
        sourceSet.add(link.target);
        targetSet.add(link.source);
      }
    });

    const visited = new Set();
    const components = [];

    adjacency.forEach((neighbors, nodeId) => {
      if (visited.has(nodeId)) return;
      const stack = [nodeId];
      const component = [];

      while (stack.length) {
        const current = stack.pop();
        if (visited.has(current)) continue;
        visited.add(current);
        component.push(current);

        const currentNeighbors = adjacency.get(current) || [];
        currentNeighbors.forEach(neighbor => {
          if (!visited.has(neighbor)) stack.push(neighbor);
        });
      }

      components.push(component);
    });

    return components;
  }

  // --- Other methods remain unchanged as requested ---

  /**
   * Perform PEO (Process, Entity, Outcome) Analysis
   */
  async performPEOAnalysis(graphData) {
    try {
      if (!graphData || !graphData.nodes || !Array.isArray(graphData.nodes)) {
        console.warn('Invalid graph data for PEO analysis');
        return this.simplePEOClassification(graphData || { nodes: [], links: [] });
      }

      const processes = [];
      const entities = [];
      const outcomes = [];

      graphData.nodes.forEach(node => {
        if (!node) return;

        const peoType = this.classifyNodePEO(node, null);

        const classified = {
          ...node,
          peo_type: peoType,
          peo_confidence: 0.8
        };

        switch (peoType) {
          case 'process':
            if (processes) processes.push(classified);
            break;
          case 'entity':
            if (entities) entities.push(classified);
            break;
          case 'outcome':
            if (outcomes) outcomes.push(classified);
            break;
        }
      });

      const nodeCount = graphData.nodes.length;
      const safeDivision = (num, den) => den > 0 ? ((num / den) * 100).toFixed(2) : '0.00';

      return {
        processes: processes || [],
        entities: entities || [],
        outcomes: outcomes || [],
        statistics: {
          total_processes: processes ? processes.length : 0,
          total_entities: entities ? entities.length : 0,
          total_outcomes: outcomes ? outcomes.length : 0,
          peo_distribution: {
            processes: safeDivision(processes ? processes.length : 0, nodeCount),
            entities: safeDivision(entities ? entities.length : 0, nodeCount),
            outcomes: safeDivision(outcomes ? outcomes.length : 0, nodeCount)
          }
        },
        relationships: this.analyzePEORelationships(graphData, {
          processes: processes || [],
          entities: entities || [],
          outcomes: outcomes || []
        })
      };

    } catch (error) {
      console.error('PEO analysis failed:', error);
      return this.simplePEOClassification(graphData || { nodes: [], links: [] });
    }
  }

  /**
   * Calculate basic network metrics
   */
  calculateNetworkMetrics(graphData) {
    const nodes = graphData.nodes || [];
    const links = graphData.links || [];

    const nodeCount = nodes.length;
    const linkCount = links.length;
    const density = nodeCount > 1 ? (linkCount * 2) / (nodeCount * (nodeCount - 1)) : 0;

    const degreeMap = new Map();
    links.forEach(link => {
      degreeMap.set(link.source, (degreeMap.get(link.source) || 0) + 1);
      degreeMap.set(link.target, (degreeMap.get(link.target) || 0) + 1);
    });

    const degrees = Array.from(degreeMap.values());
    const avgDegree = degrees.length > 0 ? degrees.reduce((a, b) => a + b, 0) / degrees.length : 0;
    const maxDegree = degrees.length > 0 ? Math.max(...degrees) : 0;

    const topNodes = nodes
      .map(node => ({
        ...node,
        degree: degreeMap.get(node.id) || 0
      }))
      .sort((a, b) => b.degree - a.degree)
      .slice(0, 10);

    return {
      basic_metrics: {
        node_count: nodeCount,
        edge_count: linkCount, // Use consistent naming
        density: density.toFixed(4),
        average_degree: avgDegree.toFixed(2),
        max_degree: maxDegree
      },
      centrality: {
        top_nodes: topNodes,
        degree_distribution: this.calculateDegreeDistribution(degrees)
      },
      connectivity: {
        connected: linkCount > 0,
        estimated_components: this.estimateComponents(graphData)
      }
    };
  }

  /**
   * Simple community detection
   */
  detectCommunitiesSimple(graphData) {
    const visited = new Set();
    const communities = [];
    const adjList = this.buildAdjacencyList(graphData);

    (graphData.nodes || []).forEach(node => {
      if (!visited.has(node.id)) {
        const community = [];
        this.dfsComponent(node.id, adjList, visited, community);
        if (community.length > 1) {
          communities.push({
            id: `community_${communities.length}`,
            nodes: community,
            size: community.length
          });
        }
      }
    });

    return {
      communities,
      total_communities: communities.length,
      modularity: this.calculateModularity(graphData, communities)
    };
  }

  // Helper methods
  calculateNodeSize(entity) {
    const confidence = entity.confidence || 0.8;
    const mentions = entity.mentions || 1;
    return Math.max(10, Math.min(50, confidence * mentions * 20));
  }

  findNodeId(nodes, label) {
    const node = (nodes || []).find(n => n.label === label || n.id === label);
    return node ? node.id : null;
  }

  classifyNodePEO(node, peoResult) {
    if (!node || !node.label) {
      return 'entity';
    }

    const label = node.label.toLowerCase();
    const type = (node.type || '').toLowerCase();

    if (type.includes('process') || label.includes('process') ||
        label.includes('reaction') || label.includes('synthesis')) {
      return 'process';
    } else if (type.includes('outcome') || label.includes('outcome') ||
               label.includes('result') || label.includes('product')) {
      return 'outcome';
    } else {
      return 'entity';
    }
  }

  simplePEOClassification(graphData) {
    const classified = {
      processes: [],
      entities: [],
      outcomes: []
    };

    if (!graphData || !graphData.nodes || !Array.isArray(graphData.nodes)) {
      console.warn('Invalid graph data for simple PEO classification');
      return {
        processes: [],
        entities: [],
        outcomes: [],
        statistics: { total_processes: 0, total_entities: 0, total_outcomes: 0 }
      };
    }

    graphData.nodes.forEach(node => {
      if (!node) return;
      const peoType = this.classifyNodePEO(node);
      const targetArray = classified[peoType + 's'];
      if (targetArray) {
        targetArray.push({ ...node, peo_type: peoType, peo_confidence: 0.6 });
      }
    });

    return {
      ...classified,
      statistics: {
        total_processes: classified.processes.length,
        total_entities: classified.entities.length,
        total_outcomes: classified.outcomes.length
      }
    };
  }

  graphToText(graphData) {
    let text = "Graph structure:\n";
    (graphData.nodes || []).forEach(node => {
      text += `Node: ${node.label} (${node.type || 'unknown'})\n`;
    });
    (graphData.links || []).forEach(edge => {
      const source = (graphData.nodes || []).find(n => n.id === edge.source);
      const target = (graphData.nodes || []).find(n => n.id === edge.target);
      if (source && target) {
        text += `Relationship: ${source.label} -> ${target.label} (${edge.label || 'related'})\n`;
      }
    });
    return text;
  }

  buildAdjacencyList(graphData) {
    const adjList = new Map();
    (graphData.nodes || []).forEach(node => {
      adjList.set(node.id, []);
    });
    (graphData.links || []).forEach(edge => {
      if (adjList.has(edge.source)) adjList.get(edge.source).push(edge.target);
      if (adjList.has(edge.target)) adjList.get(edge.target).push(edge.source);
    });
    return adjList;
  }

  dfsComponent(nodeId, adjList, visited, community) {
    visited.add(nodeId);
    community.push(nodeId);
    (adjList.get(nodeId) || []).forEach(neighbor => {
      if (!visited.has(neighbor)) {
        this.dfsComponent(neighbor, adjList, visited, community);
      }
    });
  }

  calculateDegreeDistribution(degrees) {
    const distribution = {};
    degrees.forEach(degree => {
      distribution[degree] = (distribution[degree] || 0) + 1;
    });
    return distribution;
  }

  estimateComponents(graphData) {
    const visited = new Set();
    let components = 0;
    const adjList = this.buildAdjacencyList(graphData);
    (graphData.nodes || []).forEach(node => {
      if (!visited.has(node.id)) {
        const community = [];
        this.dfsComponent(node.id, adjList, visited, community);
        components++;
      }
    });
    return components;
  }

  calculateModularity(graphData, communities) {
    const m = (graphData.links || []).length;
    if (m === 0) return 0;

    let modularity = 0;
    communities.forEach(community => {
      const nodeSet = new Set(community.nodes);
      let internalEdges = 0;
      let totalDegree = 0;

      (graphData.links || []).forEach(edge => {
        if (nodeSet.has(edge.source) && nodeSet.has(edge.target)) {
          internalEdges++;
        }
      });

      community.nodes.forEach(nodeId => {
        const degree = (graphData.links || []).filter(e => e.source === nodeId || e.target === nodeId).length;
        totalDegree += degree;
      });

      const expectedEdges = (totalDegree * totalDegree) / (4 * m);
      modularity += (internalEdges / m) - (expectedEdges / m);
    });

    return modularity.toFixed(4);
  }

  generateRecommendations(graphData, analysisResult) {
    const recommendations = [];
    const degreeMap = new Map();
    (graphData.links || []).forEach(edge => {
      degreeMap.set(edge.source, (degreeMap.get(edge.source) || 0) + 1);
      degreeMap.set(edge.target, (degreeMap.get(edge.target) || 0) + 1);
    });
    const topNodes = Array.from(degreeMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
    topNodes.forEach(([nodeId, degree]) => {
      const node = (graphData.nodes || []).find(n => n.id === nodeId);
      if (node) {
        recommendations.push({
          type: 'high_centrality',
          node: node.label,
          reason: `High connectivity (${degree} connections) suggests important role`,
          priority: 'high'
        });
      }
    });
    return recommendations;
  }

  analyzePEORelationships(graphData, peoData) {
    const relationships = { process_to_entity: 0, entity_to_outcome: 0, process_to_outcome: 0, other: 0 };
    if (!graphData || !peoData) return relationships;
    const peoMap = new Map();
    [...(peoData.processes || []), ...(peoData.entities || []), ...(peoData.outcomes || [])].forEach(node => {
      if (node && node.id && node.peo_type) peoMap.set(node.id, node.peo_type);
    });
    (graphData.links || []).forEach(edge => {
      if (!edge || !edge.source || !edge.target) return;
      const sourceType = peoMap.get(edge.source);
      const targetType = peoMap.get(edge.target);
      if (sourceType && targetType) {
        if (sourceType === 'process' && targetType === 'entity') relationships.process_to_entity++;
        else if (sourceType === 'entity' && targetType === 'outcome') relationships.entity_to_outcome++;
        else if (sourceType === 'process' && targetType === 'outcome') relationships.process_to_outcome++;
        else relationships.other++;
      }
    });
    return relationships;
  }

  manageCache() {
    if (this.cache.size > this.maxCacheSize) {
      const keysToDelete = Array.from(this.cache.keys()).slice(0, this.cache.size - this.maxCacheSize);
      keysToDelete.forEach(key => this.cache.delete(key));
      console.log(`🧹 Cache cleaned: removed ${keysToDelete.length} old entries`);
    }
  }

  getCachedResult(id) {
    return this.cache.get(id);
  }

  getAllResults() {
    return Array.from(this.cache.values());
  }

  clearCache() {
    this.cache.clear();
    console.log('🗑️ Cache cleared');
  }

  forceGC() {
    if (global.gc) {
      global.gc();
      console.log('♻️ Garbage collection forced');
    }
  }

  /**
   * Perform PEO analysis on full CSV dataset without sampling
   */
  async performFullPEOAnalysis(csvText) {
    console.log('📈 Starting comprehensive PEO analysis on full dataset...');

    try {
      // Parse CSV headers and data rows
      const lines = csvText.trim().split('\n');
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const dataRows = lines.slice(1);

      console.log(`📊 PEO Analysis: Processing ${dataRows.length} papers`);

      // Initialize PEO categories and counts
      const peoCategories = {
        'Plant Science': 0,
        'Genetics': 0,
        'Molecular Biology': 0,
        'Physiology': 0,
        'Biotechnology': 0,
        'Biophysics': 0,
        'Ecology & Environment': 0,
        'Systems Biology': 0
      };

      const temporalData = {};
      const keywordCounts = {};

      // Define keywords for each PEO category
      const categoryKeywords = {
        'Plant Science': ['plant', 'crop', 'agriculture', 'leaf', 'growth', 'photosynthesis'],
        'Genetics': ['gene', 'genetic', 'genome', 'dna', 'mutation', 'transgenic'],
        'Molecular Biology': ['molecular', 'protein', 'structure', 'biochemistry'],
        'Physiology': ['physiology', 'metabolism', 'enzyme', 'pathway', 'transport'],
        'Biotechnology': ['biotechnology', 'engineering', 'synthetic', 'biofuel'],
        'Biophysics': ['biophysics', 'modeling', 'simulation', 'thermodynamics'],
        'Ecology & Environment': ['ecology', 'climate', 'environment', 'ecosystem'],
        'Systems Biology': ['systems', 'network', 'pathway', 'integrated']
      };

      // Find relevant column indices
      const titleIndex = headers.findIndex(h => h.includes('title'));
      const abstractIndex = headers.findIndex(h => h.includes('abstract') || h.includes('summary'));
      const yearIndex = headers.findIndex(h => h.includes('year') || h.includes('date'));

      // Process each paper
      dataRows.forEach((row, index) => {
        const columns = row.split(',');
        const title = columns[titleIndex] || '';
        const abstract = columns[abstractIndex] || '';
        const year = columns[yearIndex] || '';

        const fullText = (title + ' ' + abstract).toLowerCase();

        // Extract year for temporal analysis
        const extractedYear = year.match(/\d{4}/);
        if (extractedYear) {
          const paperYear = parseInt(extractedYear[0]);
          if (paperYear >= 2000 && paperYear <= 2025) {
            temporalData[paperYear] = (temporalData[paperYear] || 0) + 1;
          }
        }

        // Categorize paper by PEO category
        let maxScore = 0;
        let assignedCategory = 'Systems Biology'; // default

        Object.entries(categoryKeywords).forEach(([category, keywords]) => {
          const score = keywords.reduce((count, keyword) => {
            return count + (fullText.split(keyword).length - 1);
          }, 0);

          if (score > maxScore) {
            maxScore = score;
            assignedCategory = category;
          }

          // Count individual keywords
          keywords.forEach(keyword => {
            const occurrences = fullText.split(keyword).length - 1;
            if (occurrences > 0) {
              keywordCounts[keyword] = (keywordCounts[keyword] || 0) + occurrences;
            }
          });
        });

        peoCategories[assignedCategory]++;
      });

      // Calculate coverage percentages
      const totalPapers = dataRows.length;
      const coveragePercentages = {};
      Object.entries(peoCategories).forEach(([category, count]) => {
        coveragePercentages[category] = ((count / totalPapers) * 100).toFixed(1);
      });

      // Sort temporal data
      const sortedTemporalData = Object.keys(temporalData)
        .sort()
        .reduce((acc, year) => {
          acc[year] = temporalData[year];
          return acc;
        }, {});

      // Top keywords
      const topKeywords = Object.entries(keywordCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 20)
        .map(([keyword, count]) => ({ keyword, count }));

      const result = {
        statistics: {
          total_papers: totalPapers,
          categories: peoCategories,
          coverage_percentages: coveragePercentages,
          temporal_distribution: sortedTemporalData,
          top_keywords: topKeywords
        },
        insights: {
          most_represented: Object.entries(peoCategories).reduce((a, b) => peoCategories[a[0]] > peoCategories[b[0]] ? a : b)[0],
          least_represented: Object.entries(peoCategories).reduce((a, b) => peoCategories[a[0]] < peoCategories[b[0]] ? a : b)[0],
          temporal_span: {
            earliest: Math.min(...Object.keys(temporalData).map(Number)),
            latest: Math.max(...Object.keys(temporalData).map(Number))
          }
        }
      };

      console.log(`✅ PEO Analysis completed: ${totalPapers} papers categorized across ${Object.keys(peoCategories).length} domains`);
      return result;

    } catch (error) {
      console.error('❌ PEO Analysis failed:', error);
      return this.getDefaultPEOAnalysis();
    }
  }

  /**
   * Default PEO analysis when full analysis fails
   */
  getDefaultPEOAnalysis() {
    return {
      statistics: {
        total_papers: 0,
        categories: {
          'Plant Science': 0,
          'Genetics': 0,
          'Molecular Biology': 0,
          'Physiology': 0,
          'Biotechnology': 0,
          'Biophysics': 0,
          'Ecology & Environment': 0,
          'Systems Biology': 0
        },
        coverage_percentages: {},
        temporal_distribution: {},
        top_keywords: []
      },
      insights: {
        most_represented: 'Unknown',
        least_represented: 'Unknown',
        temporal_span: { earliest: 2000, latest: 2025 }
      }
    };
  }

  /**
   * [NEW] Generate rich AI insights for reporting
   */
  async generateRichAIInsights(graphData) {
    console.log('🧠 Generating rich AI insights report...');
    // In a real implementation, this would involve multiple calls to an AI model
    // to generate summaries, recommendations, etc.
    // For now, we will mock the data structure based on AI Insights.html.

    const networkMetrics = this.calculateNetworkMetrics(graphData);
    const peoAnalysis = await this.performPEOAnalysis(graphData);

    // Mocked AI analysis results
    const insights = {
      critical_insights: [
        { type: 'critical-path', title: 'Central Control Hub Identified', description: 'Stomatal conductance (gs) emerges as the critical control point, directly regulating both CO₂ assimilation and transpiration.' },
        { type: 'bottleneck', title: 'Optimization Bottleneck', description: 'The profit maximization function (F) is constrained by the quadratic relationship between hydraulic costs and water potential gradient.' },
        { type: 'optimization-opportunity', title: 'Coordination Opportunity', description: 'The photosynthetic coordination hypothesis (Ac = Aj) represents an underutilized optimization pathway.' }
      ],
      network_insights: {
        strongest_relationships: (graphData.links || []).sort((a, b) => (b.weight || 0) - (a.weight || 0)).slice(0, 5),
        critical_pathways: [
            { name: 'Water-Carbon Trade-off', level: 'High' },
            { name: 'Cost-Benefit Loop', level: 'High' },
        ],
        vulnerability_points: [
            { name: 'Hydraulic Failure Risk', level: 'High' },
            { name: 'Water Potential Gradient', level: 'Medium' },
        ]
      },
      strategic_recommendations: [
        { title: 'Strengthen Stomatal Control Models', priority: 'High', confidence: 92, description: 'Focus research and modeling efforts on stomatal conductance mechanisms.' },
        { title: 'Investigate Nonlinear Cost Functions', priority: 'High', confidence: 87, description: 'Detailed analysis of these cost curves could reveal new optimization strategies.' },
        { title: 'Enhance Coordination Mechanisms', priority: 'Medium', confidence: 74, description: 'Strengthening the link between carboxylation and light-limited processes could improve overall efficiency.' }
      ],
      executive_summary: {
        system_architecture: 'The Unified Plant Theory demonstrates a well-structured optimization framework with clear separation between hydraulic and photosynthetic domains.',
        critical_success_factors: 'Stomatal conductance emerges as the primary control mechanism, balancing the fundamental trade-off between carbon acquisition and water conservation.',
        strategic_priority: 'Immediate focus should be placed on enhancing stomatal control models and investigating the nonlinear cost relationships.'
      }
    };

    return {
      network_metrics: networkMetrics.basic_metrics,
      peo_analysis: peoAnalysis.statistics,
      centrality: networkMetrics.centrality,
      ...insights
    };
  }
}

module.exports = SimpleAnalysisService;
