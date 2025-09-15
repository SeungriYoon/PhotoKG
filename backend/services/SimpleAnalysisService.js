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

      const sampledCsvText = this.sampleCsvText(csvText);
      console.log(`📊 Starting analysis of CSV file: ${csvText.split('\n').length - 1} rows`);

      const analysisResult = await this.analyzeWithOpenAI(sampledCsvText, 'knowledge_graph', csvText);

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
        type: 'csv_analysis',
        timestamp: new Date().toISOString(),
        knowledgeGraph,
        peoAnalysis,
        networkMetrics,
        originalData: {
          type: 'csv',
          size: csvText.length,
          rows: csvText.split('\n').length - 1,
          sampled: sampledCsvText.length < csvText.length
        }
      };

      this.cache.set(result.id, result);
      console.log(`✅ CSV analysis complete: ${knowledgeGraph.nodes.length} nodes and ${knowledgeGraph.links.length} links created`);
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
      console.log(`✅ PDF analysis complete: ${knowledgeGraph.nodes.length} nodes and ${knowledgeGraph.links.length} links created`);
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
      const mergedEdges = new Map(); // Using 'edges' internally for processing

      graphs.forEach(graph => {
          const nodes = graph.nodes || [];
          const edges = graph.edges || graph.links || []; // Accept both 'edges' and 'links'

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

          edges.forEach(edge => {
              const sourceId = edge.source;
              const targetId = edge.target;
              const edgeLabel = edge.label || 'related';
              const edgeKey = `${sourceId}->${targetId}[${edgeLabel}]`;

              if (mergedEdges.has(edgeKey)) {
                  mergedEdges.get(edgeKey).weight += edge.weight;
              } else {
                  mergedEdges.set(edgeKey, { ...edge });
              }
          });
      });
      
      console.log(`Merged graph contains ${mergedNodes.size} unique nodes and ${mergedEdges.size} unique edges.`);
      return {
          nodes: Array.from(mergedNodes.values()),
          links: Array.from(mergedEdges.values()) // Return as 'links' for frontend
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
  async analyzeWithOpenAI(textToAnalyze, analysisType = 'knowledge_graph', originalText = null) {
    try {
        const sourceText = originalText || textToAnalyze;
        const dataRows = sourceText.split('\n')[0].includes(',') ? sourceText.split('\n').length - 1 : (sourceText.length / 500);
        const targetEntities = Math.min(100, Math.max(10, Math.floor(dataRows * 0.2)));

        if(analysisType !== 'knowledge_graph_chunk') {
            console.log(`Dynamic Target: Requesting approximately ${targetEntities} entities for ${dataRows} data rows/equivalents.`);
        }

        const systemPrompts = {
            knowledge_graph: `You are a world-class plant science knowledge graph specialist. Your task is to extract a comprehensive, hierarchical, and semantically rich knowledge graph from the provided scientific text.
CRITICAL INSTRUCTIONS:
1.  **Node ID:** The "id" for each node MUST be a unique, snake_case version of its "label".
2.  **Identify Core Concepts:** First, identify the main overarching theory, domains (e.g., hydraulics, photosynthesis), and core principles or hypotheses. These will be high-level nodes.
3.  **Extract Entities:** Identify key scientific entities (systems, processes, properties, capacities, risks, costs). Based on the data's complexity, extract approximately ${targetEntities} of the most important entities.
4.  **Define Attributes:** Provide a concise scientific 'description' for each node. Add specific attributes like 'traits', 'components', or a 'formula' where applicable.
5.  **Extract Relationships:** Identify meaningful relationships (edges). Each edge MUST have a 'label' describing the relationship (e.g., 'unifies', 'regulates', 'is_based_on'). Provide a 'description' for the scientific context. The response should use the key "edges" for the relationship array.
6.  **Assign Weights and Sizes:** Assign a 'size' to each node based on importance (10-60). Assign a 'weight' to each edge based on strength (1-10).
You MUST respond with ONLY a valid JSON object in the specified format.
{ "nodes": [ { "id": "unique_node_id", "label": "Entity Label", "size": 50, "type": "theory|domain|...", "description": "...", "traits": ["..."], "components": ["..."], "formula": "..." } ], "edges": [ { "source": "source_node_id", "target": "target_node_id", "weight": 8, "label": "relationship_type", "description": "..." } ] }`,
            knowledge_graph_chunk: `You are a scientific knowledge graph extractor. Your task is to extract entities and relationships from this text chunk.
CRITICAL INSTRUCTIONS:
1.  **Node ID:** The "id" for each node MUST be a unique, snake_case version of its "label" to allow for later merging.
2.  **Extract Entities:** Identify all key scientific entities within this chunk.
3.  **Extract Relationships:** Identify all direct relationships between the entities found IN THIS CHUNK, using the key "edges".
4.  **Format:** You MUST respond with ONLY a valid JSON object.
{ "nodes": [ { "id": "unique_node_id", "label": "Entity Label", "size": 30, "type": "...", "description": "..." } ], "edges": [ { "source": "source_node_id", "target": "target_node_id", "weight": 5, "label": "..." } ] }`
        };

      const response = await this.openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: systemPrompts[analysisType] || systemPrompts.knowledge_graph
          },
          {
            role: 'user',
            content: `Analyze the following text and generate the knowledge graph:\n\n${textToAnalyze}`
          }
        ],
        response_format: { type: "json_object" }
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No content received from OpenAI API');
      }

      const parsedContent = JSON.parse(content);

      if (analysisType !== 'knowledge_graph_chunk') {
        console.log(`✅ OpenAI analysis complete: ${parsedContent.nodes?.length || 0} nodes, ${(parsedContent.edges || parsedContent.links)?.length || 0} relationships extracted`);
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

        const nodes = analysisResult.nodes || [];
        const edges = analysisResult.edges || analysisResult.links || []; // Accept both formats

        const validNodes = nodes.filter(n => n.id && n.label).map(node => ({
            id: node.id,
            label: node.label,
            size: node.size || 30,
            type: node.type || 'concept',
            attributes: {
                description: node.description,
                traits: node.traits,
                components: node.components,
                formula: node.formula
            }
        }));

        const nodeIds = new Set(validNodes.map(n => n.id));

        const validLinks = edges.filter(e => e.source && e.target && nodeIds.has(e.source) && nodeIds.has(e.target)).map(edge => ({
            source: edge.source,
            target: edge.target,
            weight: edge.weight || 3,
            label: edge.label || 'related',
            attributes: {
                description: edge.description
            }
        }));

        console.log(`Graph built: ${validNodes.length} valid nodes, ${validLinks.length} valid links.`);

        return {
            nodes: validNodes,
            links: validLinks, // Ensure the final property is 'links'
            metadata: {
                extraction_method: 'openai_structured_analysis',
                timestamp: new Date().toISOString(),
                total_entities: validNodes.length,
                total_relationships: validLinks.length
            }
        };
    } catch (error) {
        console.error('Error building knowledge graph:', error);
        return {
            nodes: [],
            links: [],
            metadata: { error: error.message }
        };
    }
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
