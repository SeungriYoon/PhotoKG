const crypto = require('crypto');
const GraphService = require('./GraphService');
const SimpleAnalysisService = require('./SimpleAnalysisService');
const {
  getLLMConfig,
  isLLMConfigured,
  resolveLLMEndpoint,
  buildLLMHeaders,
  buildChatCompletionPayload
} = require('../config/llm');

class LLMExtractionService {
  constructor() {
    this.config = getLLMConfig();
    this.maxChunkChars = 12000;
    this.chunkOverlapChars = 1200;
    this.maxPreviewChunks = 3;
    this.textExtractor = new SimpleAnalysisService();
  }

  isEnabled() {
    return isLLMConfigured(this.config);
  }

  refreshConfig() {
    this.config = getLLMConfig();
    return this.config;
  }

  async testConnection() {
    this.refreshConfig();

    const endpoint = resolveLLMEndpoint(this.config);
    const configured = this.isEnabled();

    if (!configured) {
      return {
        connected: false,
        configured: false,
        provider: this.config.provider || 'unknown',
        model: this.config.model || 'unknown',
        baseURL: this.config.baseURL || '',
        endpoint,
        message: 'LLM is not configured. Set LLM_PROVIDER, LLM_BASE_URL, and model settings in .env.'
      };
    }

    try {
      const raw = await this.callModel(
        [
          { role: 'system', content: 'Reply with the single word OK.' },
          { role: 'user', content: 'OK' }
        ],
        {
          temperature: 0,
          maxTokens: 8,
          timeoutMs: Math.min(this.config.timeoutMs || 15000, 15000)
        }
      );

      return {
        connected: true,
        configured: true,
        provider: this.config.provider || 'unknown',
        model: this.config.model || 'unknown',
        baseURL: this.config.baseURL || '',
        endpoint,
        responsePreview: String(raw || '').trim().slice(0, 120),
        message: 'LLM connection successful'
      };
    } catch (error) {
      return {
        connected: false,
        configured: true,
        provider: this.config.provider || 'unknown',
        model: this.config.model || 'unknown',
        baseURL: this.config.baseURL || '',
        endpoint,
        message: error.message || 'LLM connection failed'
      };
    }
  }

  async generateGraphInsights(graphData = {}, options = {}) {
    this.refreshConfig();

    if (!this.isEnabled()) {
      throw new Error('LLM is not configured. Set LLM_PROVIDER, LLM_BASE_URL, and model settings in .env.');
    }

    const nodes = Array.isArray(graphData.nodes) ? graphData.nodes : [];
    const links = Array.isArray(graphData.links) ? graphData.links : Array.isArray(graphData.edges) ? graphData.edges : [];
    const topNodes = nodes
      .slice()
      .sort((a, b) => Number(b.size || 0) - Number(a.size || 0))
      .slice(0, 12)
      .map(node => ({
        label: node.label || node.name || node.title || node.id,
        type: node.type || 'node',
        size: Number(node.size || 0)
      }));

    const topEdges = links
      .slice()
      .sort((a, b) => Number(b.weight || 0) - Number(a.weight || 0))
      .slice(0, 8)
      .map(edge => ({
        source: typeof edge.source === 'object' ? edge.source.label || edge.source.id : edge.source,
        target: typeof edge.target === 'object' ? edge.target.label || edge.target.id : edge.target,
        label: edge.label || edge.relationship_type || edge.type || 'related_to',
        weight: Number(edge.weight || 1)
      }));

    const promptMessages = [
      {
        role: 'system',
        content: [
          'You are analyzing a scientific knowledge graph for a plant-science research interface.',
          'Return concise academic insights in valid JSON only.',
          'Do not include markdown, code fences, or commentary outside JSON.',
          'Use short single-line strings only; do not include quotes inside descriptions unless escaped.'
        ].join(' ')
      },
      {
        role: 'user',
        content: JSON.stringify({
          task: 'Generate rich AI insights for an interactive graph panel.',
          graph_summary: {
            node_count: nodes.length,
            edge_count: links.length,
            top_nodes: topNodes,
            top_edges: topEdges,
            graph_source: graphData?.metadata?.graph_source || graphData?.metadata?.dataset || graphData?.metadata?.source || null
          },
          expectations: {
            critical_insights: [
              { type: 'string', title: 'string', description: 'string' }
            ],
            strategic_recommendations: [
              { title: 'string', priority: 'High|Medium|Low', confidence: 0, description: 'string' }
            ],
            executive_summary: {
              system_architecture: 'string',
              critical_success_factors: 'string',
              strategic_priority: 'string'
            }
          }
        }, null, 2)
      }
    ];

    try {
      const raw = await this.callModel(promptMessages, {
        temperature: options.temperature ?? 0.2,
        maxTokens: options.maxTokens ?? 2048,
        timeoutMs: options.timeoutMs || Math.min(this.config.timeoutMs || 300000, 120000),
        responseMimeType: 'application/json',
        responseSchema: this.getGraphInsightsSchema()
      });

      const parsed = this.parseModelJson(raw, { mode: 'graph_insights' });

      return {
        critical_insights: Array.isArray(parsed.critical_insights) ? parsed.critical_insights : [],
        strategic_recommendations: Array.isArray(parsed.strategic_recommendations) ? parsed.strategic_recommendations : [],
        executive_summary: parsed.executive_summary || {
          system_architecture: '',
          critical_success_factors: '',
          strategic_priority: ''
        },
        provenance: {
          provider: this.config.provider,
          model: this.config.model,
          mode: 'graph_insights',
          source: 'llm'
        }
      };
    } catch (error) {
      const nodeCount = nodes.length;
      const edgeCount = links.length;
      const topLabel = topNodes[0]?.label || 'the graph';
      const linkLabel = topEdges[0]?.label || 'related_to';

      return {
        critical_insights: [
          {
            type: 'structure',
            title: `Largest signal: ${topLabel}`,
            description: `The current graph contains ${nodeCount} nodes and ${edgeCount} edges, with ${topLabel} as the most prominent node.`
          },
          {
            type: 'relationship',
            title: 'Dominant relation pattern',
            description: `The strongest visible relation is "${linkLabel}", suggesting the graph is organized around a small number of high-salience connections.`
          }
        ],
        strategic_recommendations: [
          {
            title: 'Expand evidence coverage',
            priority: 'High',
            confidence: 78,
            description: 'Add more grounded papers or evidence edges so the graph summary can identify stronger cross-node patterns.'
          },
          {
            title: 'Separate graph sources',
            priority: 'High',
            confidence: 84,
            description: 'If multiple domains are mixed, store and query them by graph source to improve retrieval and interpretation.'
          }
        ],
        executive_summary: {
          system_architecture: `Graph summary fallback used after model parsing failed. The graph has ${nodeCount} nodes and ${edgeCount} edges.`,
          critical_success_factors: `The most prominent node is ${topLabel}; the dominant relation label is ${linkLabel}.`,
          strategic_priority: 'Strengthen source scoping and evidence quality, then regenerate LLM insights.'
        },
        provenance: {
          provider: this.config.provider,
          model: this.config.model,
          mode: 'graph_insights',
          source: 'fallback',
          error: error.message
        }
      };
    }
  }
  async extractFromPDFPayload({ text = '', pagesText = {}, metadata = {}, mode = 'pdf_structured' } = {}) {
    this.refreshConfig();

    if (!this.isEnabled()) {
      throw new Error('LLM is not configured. Set LLM_PROVIDER, LLM_BASE_URL, and model settings in .env.');
    }

    const sourceText = this.composeSourceText(text, pagesText);
    if (!sourceText.trim()) {
      throw new Error('No readable text provided for LLM extraction.');
    }

    const normalizedSourceText = this.normalizePdfTextForExtraction(sourceText);
    const focusedText = this.buildFocusedExtractionExcerpt(normalizedSourceText, metadata);
    const chunks = this.chunkText(focusedText || sourceText, mode);
    const chunkResults = await this.extractChunks(chunks, { metadata, mode });
    let merged = this.mergeChunkResults(chunkResults, { metadata, mode });
    let normalized = this.validateAndNormalize(merged, { metadata, mode });

    if (mode !== 'pdf_preview' && this.needsGraphExpansion(normalized)) {
      const expansionResult = await this.extractGraphExpansion(sourceText, {
        metadata,
        mode: 'pdf_expansion'
      });
      merged = this.mergeChunkResults([merged, expansionResult], {
        metadata,
        mode: 'pdf_expansion'
      });
      normalized = this.validateAndNormalize(merged, { metadata, mode });
    }

    if (mode !== 'pdf_preview' && this.needsRelationExpansion(normalized)) {
      const anchorLabels = (normalized?.knowledgeGraph?.nodes || [])
        .slice(0, 16)
        .map(node => String(node?.label || node?.id || '').trim())
        .filter(Boolean);

      const relationResult = await this.extractRelationExpansion(focusedText || sourceText, {
        metadata,
        mode: 'pdf_relations',
        anchorLabels
      });

      merged = this.mergeChunkResults([merged, relationResult], {
        metadata,
        mode: 'pdf_relations'
      });
      normalized = this.validateAndNormalize(merged, { metadata, mode });
    }

    if (mode !== 'pdf_preview' && this.needsHeuristicFallback(normalized)) {
      const heuristicResult = this.buildHeuristicPlantScienceGraph(focusedText || sourceText, metadata);
      merged = this.mergeChunkResults([merged, heuristicResult], {
        metadata,
        mode: 'pdf_heuristic'
      });
      normalized = this.validateAndNormalize(merged, { metadata, mode });
    }

    const filenameTitle = this.extractTitleFromFilename(metadata?.filename || metadata?.source_file || '');

    if (filenameTitle) {
      const currentTitle = String(normalized?.knowledgeGraph?.metadata?.document?.title || '').trim();
      if (!currentTitle || this.isFragmentaryTitle(currentTitle)) {
        normalized.knowledgeGraph.metadata.document.title = filenameTitle;
      }
    }

    const documentTitle = String(normalized?.knowledgeGraph?.metadata?.document?.title || '').trim();
    if (documentTitle) {
      const documentNode = Array.isArray(normalized?.knowledgeGraph?.nodes)
        ? normalized.knowledgeGraph.nodes.find(node => String(node?.type || '').toLowerCase() === 'document')
        : null;
      if (documentNode && (!documentNode.label || this.isFragmentaryTitle(documentNode.label))) {
        documentNode.label = documentTitle;
      }
    }

    return {
      ...normalized,
      provenance: {
        provider: this.config.provider,
        model: this.config.model,
        chunkCount: chunks.length,
        mode,
        ...normalized.provenance
      }
    };
  }

  extractTitleFromFilename(filename) {
    const raw = String(filename || '').trim();
    if (!raw) return '';

    const withoutExt = raw.replace(/\.[^.]+$/, '');
    const sanitized = withoutExt
      .replace(/^\d+[\s._-]*/, '')
      .replace(/[._-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!sanitized) {
      return '';
    }

    const parts = sanitized
      .split(/\s+/)
      .filter(Boolean);

    if (parts.length < 4) {
      return sanitized;
    }

    return sanitized;
  }

  isFragmentaryTitle(value) {
    const title = String(value || '').trim();
    if (!title) return true;
    const words = title.split(/\s+/).filter(Boolean).length;
    const letters = (title.match(/[A-Za-z]/g) || []).length;
    return words < 4 || letters < 15 || /^(ll|c|fig|table|supplementary|abstract)\b/i.test(title);
  }

  isLikelyPaperTitle(title, paper = {}) {
    const text = String(title || '').trim();
    if (!text || this.isFragmentaryTitle(text)) {
      return false;
    }

    const words = text.split(/\s+/).filter(Boolean);
    const hasStrongMetadata = this.hasStrongPaperMetadata(paper);

    if (words.length < 6) {
      return false;
    }

    if (/[.;:!?]$/.test(text)) {
      return false;
    }

    if (/^[a-z]/.test(text)) {
      return false;
    }

    if (!hasStrongMetadata && words.length < 8) {
      return false;
    }

    return true;
  }

  hasStrongPaperMetadata(paper = {}) {
    const doi = String(
      paper?.doi ||
      paper?.DOI ||
      paper?.paper_doi ||
      paper?.article_doi ||
      paper?.external_doi ||
      ''
    ).trim();
    const pmid = String(
      paper?.pmid ||
      paper?.pubmedID ||
      paper?.pubmed_id ||
      ''
    ).trim();
    const journal = String(paper?.journal || paper?.source || paper?.venue || '').trim();
    const authors = this.asArray(paper?.authors || paper?.author);
    const year = Number(paper?.year || paper?.pub_year || paper?.publication_year || paper?.date?.slice?.(0, 4));
    const hasYear = Number.isFinite(year) && year >= 1800 && year <= 2100;

    return Boolean(doi || pmid || journal || authors.length >= 1 || hasYear);
  }

  composeSourceText(text, pagesText) {
    if (pagesText && typeof pagesText === 'object' && !Array.isArray(pagesText)) {
      const orderedPages = Object.keys(pagesText)
        .sort((a, b) => Number(a) - Number(b))
        .map(page => `## Page ${page}\n${pagesText[page] || ''}`);
      const joinedPages = orderedPages.join('\n\n');
      if (joinedPages.trim()) {
        return joinedPages;
      }
    }

    return String(text || '');
  }

  chunkText(text, mode = 'pdf_structured') {
    const limit = mode === 'pdf_preview' ? this.maxChunkChars * 2 : this.maxChunkChars;
    const overlap = mode === 'pdf_preview' ? Math.floor(this.chunkOverlapChars / 2) : this.chunkOverlapChars;
    const chunks = [];

    if (text.length <= limit) {
      return [text];
    }

    for (let start = 0; start < text.length; start += Math.max(1, limit - overlap)) {
      const chunk = text.slice(start, start + limit).trim();
      if (chunk) {
        chunks.push(chunk);
      }
      if (chunks.length >= 32) {
        break;
      }
    }

    return chunks.length ? chunks : [text.slice(0, limit)];
  }

  async extractChunks(chunks, context = {}) {
    const results = [];
    for (let index = 0; index < chunks.length; index += 1) {
      const chunkText = chunks[index];
      let chunkResult;
      try {
        chunkResult = await this.extractChunk(chunkText, {
          ...context,
          chunkIndex: index,
          chunkCount: chunks.length
        });
      } catch (error) {
        chunkResult = this.buildChunkFallback(chunkText, {
          ...context,
          chunkIndex: index,
          chunkCount: chunks.length,
          error
        });
      }

      if (this.shouldRetryAsConceptGraph(chunkResult, {
        ...context,
        chunkIndex: index,
        chunkCount: chunks.length
      })) {
        try {
          const retryResult = await this.extractChunk(chunkText, {
            ...context,
            chunkIndex: index,
            chunkCount: chunks.length,
            mode: 'pdf_concepts'
          });
          if (this.hasRicherConceptGraph(retryResult, chunkResult)) {
            chunkResult = retryResult;
          }
          if (process.env.LLM_TRACE_OUTPUT === '1') {
            const retryEntityCount = this.asArray(retryResult?.entities || retryResult?.nodes).length;
            const retryRelationCount = this.asArray(retryResult?.relations || retryResult?.links || retryResult?.edges).length;
            const retryPaperCount = this.asArray(retryResult?.papers || retryResult?.documents).length;
            console.log(`[LLMExtraction] chunk ${index + 1}/${chunks.length} concept retry -> entities=${retryEntityCount}, relations=${retryRelationCount}, papers=${retryPaperCount}`);
          }
        } catch (error) {
          if (process.env.LLM_TRACE_OUTPUT === '1') {
            console.log(`[LLMExtraction] chunk ${index + 1}/${chunks.length} concept retry failed: ${error.message}`);
          }
        }
      }

      if (process.env.LLM_TRACE_OUTPUT === '1') {
        const entityCount = this.asArray(chunkResult?.entities || chunkResult?.nodes).length;
        const relationCount = this.asArray(chunkResult?.relations || chunkResult?.links || chunkResult?.edges).length;
        const paperCount = this.asArray(chunkResult?.papers || chunkResult?.documents).length;
        console.log(`[LLMExtraction] chunk ${index + 1}/${chunks.length} (${context.mode || 'pdf_structured'}) -> entities=${entityCount}, relations=${relationCount}, papers=${paperCount}`);
      }
      results.push(chunkResult);
    }
    return results;
  }

  async extractChunk(chunkText, context = {}) {
    const prompt = this.buildPrompt(chunkText, context);
    const messages = [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user }
    ];

    if (String(context.mode || '').toLowerCase() === 'pdf_concepts') {
      const response = await this.callModel(messages, {
        temperature: 0.1,
        maxTokens: 2048
      });
      return this.parsePdfGraphResponse(response, context);
    }

    const response = await this.callModel(messages, {
      temperature: context.mode === 'pdf_preview'
        ? 0
        : context.mode === 'pdf_expansion' || context.mode === 'pdf_concepts'
          ? Math.max(this.config.temperature, 0.2)
          : this.config.temperature,
      maxTokens: context.mode === 'pdf_expansion'
        ? Math.max(this.config.maxTokens, 8192)
        : context.mode === 'pdf_concepts'
          ? Math.max(4096, Math.min(this.config.maxTokens, 4096))
        : this.config.maxTokens
    });

    return this.parsePdfGraphResponse(response, context);
  }

  buildPrompt(chunkText, context = {}) {
    const { metadata = {}, mode = 'pdf_structured', chunkIndex = 0, chunkCount = 1 } = context;
    const schemaHint = mode === 'pdf_concepts' || mode === 'pdf_relations'
      ? 'Return plain text only. Use one ENTITY or RELATION per line.'
      : 'Return plain text only. Use one ENTITY, RELATION, or PAPER per line. Do not include markdown or JSON.';

    const system = [
      mode === 'pdf_concepts'
        ? 'You extract only concept nodes and relations from a plant-science PDF chunk. Output plain text lines only.'
        : mode === 'pdf_relations'
          ? 'You extract only relation edges from a plant-science PDF chunk. Output plain text lines only.'
        : 'You extract a plant-science knowledge graph from PDF text and output line-based graph records.',
      'Map evidence carefully and preserve PubMed IDs, DOI, authors, year, species, and relationship terms.',
      'Build a dense but faithful concept graph, not a bibliography summary.',
      'Prioritize entities for genes, proteins, pathways, physiological traits, experimental conditions, measurements, outcomes, models, species, and interventions.',
      'When the paper discusses photosynthesis and crop yield, prefer concrete mechanism and outcome nodes such as photosynthesis, leaf photosynthesis, canopy photosynthesis, crop yield, crop biomass, photosynthetic efficiency, Rubisco, electron transport, mesophyll conductance, stomatal conductance, CO2 diffusion, leaf nitrogen, canopy light interception, water status, water limitation, soil water uptake, transpiration, biochemical models, crop models, environmental drivers, field data, simulation, and validation datasets.',
      'When evidence exists, try to capture a rich local graph with many grounded concepts and relations instead of a minimal summary; do not fabricate anything.',
      mode === 'pdf_concepts'
        ? 'This is a concept-only retry. Do not return paper entries. Focus on concrete scientific concepts, variables, treatments, mechanisms, and outcomes present in the text. As a soft target for a strong chunk, return about 6-12 entities and 6-12 relations if grounded evidence exists. Keep labels short and avoid commas, pipes, and quotation marks in labels.'
        : mode === 'pdf_relations'
          ? `This is a relation-only retry. Use the provided anchor entities when possible and add relation lines for grounded mechanisms, regulation, dependence, integration, validation, increase, decrease, and contribution links between concepts. Anchor entities: ${String((context.anchorLabels || []).join(', ')).slice(0, 500)}`
        : 'As a soft target, a strong paper may yield roughly 20-30 grounded entities and 3-40 relations, but smaller or larger graphs are acceptable when that is what the evidence supports.',
      mode === 'pdf_concepts'
        ? 'Use this exact line format only:\nENTITY|label|type\nRELATION|source|target|label|confidence\nKeep each field short. Use slug-like source/target names that match entity labels.'
        : mode === 'pdf_relations'
          ? 'Use these line formats:\nRELATION|source|target|label|confidence\nENTITY|label|type\nExamples:\nRELATION|photosynthesis|crop_yield|contributes_to|0.92\nRELATION|rubisco|photosynthesis|enables|0.88\nRELATION|mesophyll_conductance|photosynthetic_efficiency|affects|0.81\nKeep each field short. Use slug-like source/target names that match entity labels.'
        : 'Use these line formats:\nENTITY|label|type\nRELATION|source|target|label|confidence\nPAPER|title|doi|pmid|year|journal\nKeep each field short. Use slug-like source/target names that match entity labels.',
      'For any sentence that explains a mechanism, dependency, regulation, increase, decrease, integration, or validation, add at least one relation line when two grounded concepts can be linked.',
      'Do not invent relations. Only include relations supported by the current chunk text.',
      schemaHint
    ].join(' ');

    const user = [
      `Mode: ${mode}`,
      `Chunk: ${chunkIndex + 1}/${chunkCount}`,
      `Document metadata: ${JSON.stringify(metadata)}`,
      'Extract entities and relations from the text below.',
      mode === 'pdf_expansion'
        ? 'This is a graph expansion pass. Focus on concept nodes and relations from the paper body, abstract, introduction, results, discussion, and conclusion. Do not spend tokens on bibliographic metadata unless it directly supports the graph.'
        : 'If the text is a preview, keep only the strongest and most grounded entities/relations.',
      'Include evidence sentences where possible.',
      'TEXT START',
      chunkText,
      'TEXT END'
    ].join('\n\n');

    if (mode === 'pdf_merge') {
      return {
        system: 'Merge multiple JSON extraction results into one clean knowledge graph. Return JSON only.',
        user: `Merge these JSON fragments into one schema-compliant result.\n\n${chunkText}`
      };
    }

    return { system, user };
  }

  parseConceptGraphText(text, context = {}) {
    const nodes = [];
    const links = [];
    const papers = [];
    const warnings = [];
    const nodeMap = new Map();

    String(text || '')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .forEach(line => {
        const parts = line.split('|').map(part => part.trim());
        const kind = String(parts[0] || '').toUpperCase().replace(/[^A-Z]/g, '');

        if ((kind === 'ENTITY' || kind === 'NODE' || kind === 'CONCEPT') && parts.length >= 3) {
          const label = parts[1];
          const type = parts[2] || 'concept';
          const id = this.slugify(`${type}_${label}`);
          if (!nodeMap.has(id)) {
            const node = {
              id,
              label,
              type: String(type || 'concept').toLowerCase(),
              size: 18,
              attributes: {
                source_text: '',
                evidence: []
              }
            };
            nodeMap.set(id, node);
            nodes.push(node);
          }
          return;
        }

        if ((kind === 'RELATION' || kind === 'EDGE' || kind === 'LINK') && parts.length >= 4) {
          const sourceLabel = parts[1];
          const targetLabel = parts[2];
          const relationLabel = parts[3] || 'related_to';
          const confidence = Number(parts[4] || 1);
          const sourceId = this.slugify(sourceLabel);
          const targetId = this.slugify(targetLabel);

          if (!nodeMap.has(sourceId)) {
            const sourceNode = {
              id: sourceId,
              label: sourceLabel,
              type: 'concept',
              size: 18,
              attributes: { source_text: '', evidence: [] }
            };
            nodeMap.set(sourceId, sourceNode);
            nodes.push(sourceNode);
          }

          if (!nodeMap.has(targetId)) {
            const targetNode = {
              id: targetId,
              label: targetLabel,
              type: 'concept',
              size: 18,
              attributes: { source_text: '', evidence: [] }
            };
            nodeMap.set(targetId, targetNode);
            nodes.push(targetNode);
          }

          links.push({
            source: sourceId,
            target: targetId,
            label: relationLabel,
            relationship_type: relationLabel,
            weight: Number.isFinite(confidence) ? confidence : 1,
            attributes: {
              confidence: Number.isFinite(confidence) ? confidence : null,
              evidence: []
            }
          });
          return;
        }

        if (kind === 'PAPER' && parts.length >= 2) {
          papers.push({
            title: parts[1] || '',
            doi: parts[2] || '',
            pmid: parts[3] || '',
            year: parts[4] || '',
            journal: parts[5] || ''
          });
          return;
        }

        warnings.push(`Unparsed line: ${line.slice(0, 120)}`);
      });

    return {
      knowledgeGraph: {
        nodes,
        links,
        metadata: {
          ...(context.metadata || {}),
          document: {},
          provenance: {
            source: 'concept_text_retry'
          },
          warnings
        }
      },
      papers,
      provenance: {
        source: 'concept_text_retry',
        warnings
      },
      warnings,
      graphSummary: {
        nodes: nodes.length,
        links: links.length,
        papers: papers.length
      }
    };
  }

  shouldRetryAsConceptGraph(chunkResult, context = {}) {
    const mode = String(context?.mode || '').toLowerCase();
    if (mode === 'pdf_preview' || mode === 'pdf_concepts') {
      return false;
    }

    const entityCount = this.asArray(chunkResult?.entities || chunkResult?.nodes).length;
    const relationCount = this.asArray(chunkResult?.relations || chunkResult?.links || chunkResult?.edges).length;
    const paperCount = this.asArray(chunkResult?.papers || chunkResult?.documents).length;
    return paperCount > 0 && (entityCount < 6 || relationCount < 6);
  }

  hasRicherConceptGraph(candidate = {}, baseline = {}) {
    const candidateEntities = this.asArray(candidate?.entities || candidate?.nodes).length;
    const candidateRelations = this.asArray(candidate?.relations || candidate?.links || candidate?.edges).length;
    const baselineEntities = this.asArray(baseline?.entities || baseline?.nodes).length;
    const baselineRelations = this.asArray(baseline?.relations || baseline?.links || baseline?.edges).length;
    return candidateEntities > baselineEntities || candidateRelations > baselineRelations;
  }

  getPdfGraphResponseSchema(context = {}) {
    return this.getPdfGraphResponseSchemaForMode(context);
  }

  parsePdfGraphResponse(content, context = {}) {
    const text = String(content || '').trim();
    if (!text) {
      throw new Error('LLM returned an empty response.');
    }

    if (text.startsWith('{') || text.startsWith('[')) {
      return this.parseModelJson(text, context);
    }

    return this.parseConceptGraphText(text, context);
  }

  getPdfGraphResponseSchemaForMode(context = {}) {
    const mode = String(context?.mode || '').toLowerCase();
    const useCompactRelations = mode === 'pdf_concepts';
    return {
      type: 'object',
      properties: {
        document: { type: 'object' },
        entities: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              label: { type: 'string' },
              type: { type: 'string' },
              aliases: {
                type: 'array',
                items: { type: 'string' }
              },
              attributes: { type: 'object' }
            }
          }
        },
        relations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              source: {},
              target: {},
              label: { type: 'string' },
              relationship_type: { type: 'string' },
              confidence: { type: 'number' },
              ...(useCompactRelations
                ? {}
                : {
                    evidence: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          sentence: { type: 'string' },
                          pmid: { type: 'string' },
                          doi: { type: 'string' },
                          page: {}
                        }
                      }
                    }
                  })
            }
          }
        },
        provenance: { type: 'object' },
        warnings: {
          type: 'array',
          items: { type: 'string' }
        }
      }
    };
  }

  async extractGraphExpansion(sourceText, context = {}) {
    const excerpt = this.buildExpansionExcerpt(sourceText, context.metadata || {});
    if (!excerpt.trim()) {
      return this.buildChunkFallback('', {
        ...context,
        chunkIndex: 0,
        error: new Error('No expansion excerpt available.')
      });
    }

    try {
      const result = await this.extractChunk(excerpt, {
        ...context,
        chunkIndex: 0,
        chunkCount: 1,
        mode: 'pdf_expansion'
      });
      if (process.env.LLM_TRACE_OUTPUT === '1') {
        const entityCount = this.asArray(result?.entities || result?.nodes).length;
        const relationCount = this.asArray(result?.relations || result?.links || result?.edges).length;
        const paperCount = this.asArray(result?.papers || result?.documents).length;
        console.log(`[LLMExtraction] expansion -> entities=${entityCount}, relations=${relationCount}, papers=${paperCount}`);
      }
      return result;
    } catch (error) {
      return this.buildChunkFallback(excerpt, {
        ...context,
        chunkIndex: 0,
        error
      });
    }
  }

  buildExpansionExcerpt(sourceText, metadata = {}) {
    const text = String(sourceText || '');
    if (!text.trim()) {
      return '';
    }

    const lines = text.split(/\r?\n/).map(line => line.trim());
    const nonEmpty = lines.filter(Boolean);
    if (!nonEmpty.length) {
      return text.slice(0, 16000);
    }

    const filtered = nonEmpty.filter(line => {
      if (line.length > 220) return false;
      if (/^(references?|acknowledg(e)?ments?|supplementary|appendix)\b/i.test(line)) return false;
      if (/^fig(?:ure)?\.?\s*\d+/i.test(line)) return false;
      return true;
    });

    const titleLine = String(metadata?.title || metadata?.filename || '').trim();
    const excerpt = [titleLine, filtered.slice(0, 120).join('\n'), text.slice(0, Math.min(text.length, 16000))]
      .filter(Boolean)
      .join('\n\n');

    return excerpt.slice(0, 22000);
  }

  needsRelationExpansion(normalized = {}) {
    const nodeCount = Number(normalized?.graphSummary?.nodes || normalized?.knowledgeGraph?.nodes?.length || 0);
    const linkCount = Number(normalized?.graphSummary?.links || normalized?.knowledgeGraph?.links?.length || 0);
    return nodeCount >= 2 && linkCount < 12;
  }

  needsHeuristicFallback(normalized = {}) {
    const nodeCount = Number(normalized?.graphSummary?.nodes || normalized?.knowledgeGraph?.nodes?.length || 0);
    const linkCount = Number(normalized?.graphSummary?.links || normalized?.knowledgeGraph?.links?.length || 0);
    return nodeCount < 12 || linkCount < 10;
  }

  buildHeuristicPlantScienceGraph(sourceText, metadata = {}) {
    const text = this.normalizePdfTextForExtraction(sourceText);
    const sentences = text
      .split(/(?<=[.!?])\s+|\n+/)
      .map(sentence => sentence.trim())
      .filter(Boolean);
    const themeHint = /photosynthesis|crop yield|rubisco|leaf nitrogen|mesophyll conductance|stomatal conductance/i.test(
      `${String(metadata?.title || '')} ${text}`
    );

    const keywordCatalog = [
      ['photosynthesis', 'process'],
      ['leaf photosynthesis', 'process'],
      ['canopy photosynthesis', 'process'],
      ['crop yield', 'concept'],
      ['crop biomass', 'concept'],
      ['photosynthetic efficiency', 'concept'],
      ['Rubisco', 'protein'],
      ['electron transport', 'process'],
      ['mesophyll conductance', 'parameter'],
      ['stomatal conductance', 'parameter'],
      ['CO2 diffusion', 'process'],
      ['leaf nitrogen', 'parameter'],
      ['canopy light interception', 'process'],
      ['water status', 'concept'],
      ['water limitation', 'concept'],
      ['soil water uptake', 'process'],
      ['transpiration', 'process'],
      ['biochemical models', 'concept'],
      ['crop models', 'concept'],
      ['environmental drivers', 'concept'],
      ['field data', 'concept'],
      ['simulation', 'concept'],
      ['validation', 'concept']
    ];

    const nodes = [];
    const links = [];
    const nodeMap = new Map();
    const addNode = (label, type) => {
      const cleanLabel = String(label || '').trim();
      if (!cleanLabel) return '';
      const id = this.slugify(`${type}_${cleanLabel}`);
      if (!nodeMap.has(id)) {
        const node = {
          id,
          label: cleanLabel,
          type: String(type || 'concept').toLowerCase(),
          size: 20,
          attributes: {
            source_text: 'heuristic_fallback',
            evidence: []
          }
        };
        nodeMap.set(id, node);
        nodes.push(node);
      }
      return id;
    };

    const matchedTerms = [];
    keywordCatalog.forEach(([label, type]) => {
      const regex = new RegExp(`\\b${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (regex.test(text)) {
        const id = addNode(label, type);
        matchedTerms.push({ label, id, type });
      }
    });

    if (themeHint) {
      keywordCatalog.forEach(([label, type]) => {
        const id = addNode(label, type);
        if (!matchedTerms.find(term => term.id === id)) {
          matchedTerms.push({ label, id, type });
        }
      });
    }

    const cueToLabel = [
      [/increase|enhance|improve|boost|raise|promot/i, 'enhances'],
      [/decrease|reduce|limit|restrict|suppress/i, 'reduces'],
      [/depend|require|driven by/i, 'depends_on'],
      [/regulat|control|controls|controlled/i, 'regulates'],
      [/integrat|linked with|interact/i, 'integrates_with'],
      [/affect|influence|impact/i, 'affects'],
      [/validat|support|supported/i, 'validated_by']
    ];

    const relationSeen = new Set();
    sentences.forEach(sentence => {
      const present = matchedTerms.filter(term => new RegExp(`\\b${term.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(sentence));
      if (present.length < 2) {
        return;
      }

      let relationLabel = 'related_to';
      for (const [pattern, label] of cueToLabel) {
        if (pattern.test(sentence)) {
          relationLabel = label;
          break;
        }
      }

      const pairLimit = Math.min(present.length, 5);
      for (let i = 0; i < pairLimit; i += 1) {
        for (let j = i + 1; j < pairLimit; j += 1) {
          const sourceId = present[i].id;
          const targetId = present[j].id;
          const key = `${sourceId}::${targetId}::${relationLabel}`;
          if (relationSeen.has(key)) {
            continue;
          }
          relationSeen.add(key);
          links.push({
            source: sourceId,
            target: targetId,
            label: relationLabel,
            relationship_type: relationLabel,
            weight: relationLabel === 'related_to' ? 0.55 : 0.8,
            attributes: {
              confidence: relationLabel === 'related_to' ? 0.55 : 0.8,
              evidence: sentence ? [{ sentence }] : []
            }
          });
        }
      }
    });

    if (themeHint) {
      const templateEdges = [
        ['photosynthesis', 'crop yield', 'contributes_to'],
        ['photosynthesis', 'crop biomass', 'contributes_to'],
        ['photosynthetic efficiency', 'crop yield', 'influences'],
        ['Rubisco', 'photosynthesis', 'enables'],
        ['electron transport', 'photosynthesis', 'supports'],
        ['mesophyll conductance', 'photosynthetic efficiency', 'affects'],
        ['stomatal conductance', 'photosynthetic efficiency', 'affects'],
        ['CO2 diffusion', 'photosynthesis', 'supports'],
        ['leaf nitrogen', 'photosynthesis', 'influences'],
        ['canopy light interception', 'photosynthesis', 'affects'],
        ['water status', 'transpiration', 'influences'],
        ['water limitation', 'water status', 'affects'],
        ['soil water uptake', 'water status', 'supports'],
        ['biochemical models', 'photosynthesis', 'models'],
        ['crop models', 'crop yield', 'predicts'],
        ['environmental drivers', 'photosynthesis', 'regulates'],
        ['field data', 'validation', 'supports'],
        ['simulation', 'validation', 'supports']
      ];

      templateEdges.forEach(([sourceLabel, targetLabel, relationLabel]) => {
        const sourceNode = matchedTerms.find(term => term.label.toLowerCase() === sourceLabel.toLowerCase());
        const targetNode = matchedTerms.find(term => term.label.toLowerCase() === targetLabel.toLowerCase());
        if (!sourceNode || !targetNode) {
          return;
        }

        const key = `${sourceNode.id}::${targetNode.id}::${relationLabel}`;
        if (relationSeen.has(key)) {
          return;
        }
        relationSeen.add(key);
        links.push({
          source: sourceNode.id,
          target: targetNode.id,
          label: relationLabel,
          relationship_type: relationLabel,
          weight: 0.75,
          attributes: {
            confidence: 0.75,
            evidence: []
          }
        });
      });
    }

    const documentLabel = String(metadata?.title || metadata?.filename || 'PDF Document').trim();
    const primaryPaper = this.buildPrimaryPaperFromMetadata({
      document: {
        title: documentLabel,
        doi: metadata?.doi || '',
        pmid: metadata?.pmid || '',
        journal: metadata?.journal || '',
        year: metadata?.year || null
      }
    }, { metadata });

    return {
      knowledgeGraph: {
        nodes,
        links,
        metadata: {
          ...(metadata || {}),
          document: {
            title: documentLabel,
            source_file: metadata?.filename || metadata?.source_file || ''
          },
          provenance: {
            source: 'heuristic_fallback'
          }
        }
      },
      papers: primaryPaper ? [primaryPaper] : [],
      provenance: {
        source: 'heuristic_fallback'
      },
      warnings: [],
      graphSummary: {
        nodes: nodes.length,
        links: links.length,
        papers: primaryPaper ? 1 : 0
      }
    };
  }

  async extractRelationExpansion(sourceText, context = {}) {
    const excerpt = this.buildFocusedExtractionExcerpt(sourceText, context.metadata || {});
    if (!excerpt.trim()) {
      return this.buildChunkFallback('', {
        ...context,
        chunkIndex: 0,
        error: new Error('No relation expansion excerpt available.')
      });
    }

    try {
      const result = await this.extractChunk(excerpt, {
        ...context,
        chunkIndex: 0,
        chunkCount: 1,
        mode: 'pdf_relations'
      });

      if (process.env.LLM_TRACE_OUTPUT === '1') {
        const entityCount = this.asArray(result?.entities || result?.nodes).length;
        const relationCount = this.asArray(result?.relations || result?.links || result?.edges).length;
        const paperCount = this.asArray(result?.papers || result?.documents).length;
        console.log(`[LLMExtraction] relation expansion -> entities=${entityCount}, relations=${relationCount}, papers=${paperCount}`);
      }

      return result;
    } catch (error) {
      return this.buildChunkFallback(excerpt, {
        ...context,
        chunkIndex: 0,
        error
      });
    }
  }

  normalizePdfTextForExtraction(text) {
    return String(text || '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/-\n\s*/g, '')
      .split(/\n{2,}/)
      .map(block => block.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join('\n\n');
  }

  buildFocusedExtractionExcerpt(sourceText, metadata = {}) {
    const text = String(sourceText || '');
    if (!text.trim()) {
      return '';
    }

    const lines = text.split(/\r?\n/).map(line => line.trim());
    const nonEmpty = lines.filter(Boolean);
    if (!nonEmpty.length) {
      return text.slice(0, 16000);
    }

    const filtered = nonEmpty.filter(line => {
      if (line.length > 220) return false;
      if (/^(references?|acknowledg(e)?ments?|supplementary|appendix)\b/i.test(line)) return false;
      return true;
    });

    const titleLine = String(metadata?.title || metadata?.filename || '').trim();
    const excerpt = [titleLine, filtered.slice(0, 120).join('\n')]
      .filter(Boolean)
      .join('\n\n');

    return excerpt.slice(0, 16000);
  }

  needsGraphExpansion(normalized = {}) {
    const nodeCount = Number(normalized?.graphSummary?.nodes || normalized?.knowledgeGraph?.nodes?.length || 0);
    const linkCount = Number(normalized?.graphSummary?.links || normalized?.knowledgeGraph?.links?.length || 0);
    const paperCount = Number(normalized?.graphSummary?.papers || normalized?.papers?.length || 0);
    return nodeCount < 8 || linkCount < 8 || paperCount < 2;
  }

  getPdfResponseSchema() {
    return {
      type: 'object',
      properties: {
        document: { type: 'object' },
        entities: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              label: { type: 'string' },
              type: { type: 'string' },
              aliases: {
                type: 'array',
                items: { type: 'string' }
              },
              attributes: { type: 'object' }
            }
          }
        },
        relations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              source: {},
              target: {},
              label: { type: 'string' },
              relationship_type: { type: 'string' },
              confidence: { type: 'number' },
              evidence: { type: 'array' }
            }
          }
        },
        papers: { type: 'array' },
        provenance: { type: 'object' },
        warnings: { type: 'array' }
      }
    };
  }

  getGraphInsightsSchema() {
    return {
      type: 'object',
      properties: {
        critical_insights: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string' },
              title: { type: 'string' },
              description: { type: 'string' }
            }
          }
        },
        strategic_recommendations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              priority: { type: 'string' },
              confidence: { type: 'number' },
              description: { type: 'string' }
            }
          }
        },
        executive_summary: {
          type: 'object',
          properties: {
            system_architecture: { type: 'string' },
            critical_success_factors: { type: 'string' },
            strategic_priority: { type: 'string' }
          }
        }
      }
    };
  }

  async callModel(messages, options = {}) {
    const endpoint = resolveLLMEndpoint(this.config);
    const payload = buildChatCompletionPayload(messages, options, this.config);
    const controller = new AbortController();
    const timeout = options.timeoutMs || this.config.timeoutMs || 300000;
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: buildLLMHeaders(this.config),
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = data?.error?.message || data?.error || data?.message || `HTTP ${response.status}`;
        throw new Error(`LLM request failed: ${message}`);
      }

      if (this.config.provider === 'gemini') {
        const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
        const parts = candidates[0]?.content?.parts || [];
        const text = parts
          .map(part => String(part?.text || part?.inline_data?.data || '').trim())
          .filter(Boolean)
          .join('\n');

        if (text) {
          return text;
        }

        return String(data?.text || data?.output || '').trim();
      }

      if (this.config.provider === 'ollama') {
        return data?.message?.content || data?.response || '';
      }

      return data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || '';
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error(`LLM request timed out after ${timeout}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  parseModelJson(content, context = {}) {
    const text = String(content || '').trim();
    if (!text) {
      throw new Error('LLM returned an empty response.');
    }

    const cleaned = text
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/i, '')
      .trim();

    const candidate = this.extractJsonCandidate(cleaned);

    try {
      return JSON.parse(candidate);
    } catch (error) {
      try {
        return this.parseLooseJson(candidate);
      } catch (looseError) {
        throw new Error(`Unable to parse LLM JSON output: ${error.message}`);
      }
    }
  }

  parseLooseJson(candidate) {
    const normalized = String(candidate || '')
      .replace(/^\uFEFF/, '')
      .replace(/,\s*([}\]])/g, '$1')
      .trim();

    if (!normalized) {
      throw new Error('Empty JSON candidate.');
    }

    // Gemini occasionally returns JSON-like objects with unquoted keys or
    // single-quoted strings. A controlled Function wrapper can recover those
    // cases after the strict parser fails.
    return new Function(`"use strict"; return (${normalized});`)();
  }

  buildChunkFallback(chunkText, context = {}) {
    const text = String(chunkText || '');
    const title = this.extractFallbackTitle(text, context.metadata || {});
    const doi = this.extractDoi(text);
    const pmid = this.extractPmid(text);

    return {
      document: {
        title: title || context.metadata?.title || '',
        source_file: context.metadata?.filename || context.metadata?.source_file || '',
        doi: doi || context.metadata?.doi || ''
      },
      entities: [],
      relations: [],
      papers: [
        {
          title: title || `Chunk ${Number(context.chunkIndex || 0) + 1}`,
          pmid,
          doi
        }
      ],
      provenance: {
        source: 'chunk_fallback',
        chunkIndex: context.chunkIndex || 0,
        reason: context.error?.message || 'LLM chunk parse failure'
      },
      warnings: [
        `Chunk ${Number(context.chunkIndex || 0) + 1} used fallback extraction because LLM JSON parsing failed.`
      ]
    };
  }

  extractFallbackTitle(text, metadata = {}) {
    const lines = String(text || '')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);

    const firstMeaningful = lines.find(line => line.length > 20 && !/^([0-9]+|references|acknowledg(e)?ments?)$/i.test(line));
    return firstMeaningful || metadata.title || '';
  }

  extractDoi(text) {
    const raw = String(text || '');
    const match = raw.match(/\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i);
    return match ? match[0].replace(/[)\],.;]+$/, '') : '';
  }

  extractPmid(text) {
    const raw = String(text || '');
    const match = raw.match(/\bPMID[:\s#-]*([0-9]{6,9})\b/i) || raw.match(/\b([0-9]{8,9})\b/);
    return match ? String(match[1] || match[0]).trim() : '';
  }

  extractJsonCandidate(text) {
    const trimmed = String(text || '').trim();
    const firstBrace = trimmed.indexOf('{');
    const firstBracket = trimmed.indexOf('[');
    const start = firstBrace === -1 ? firstBracket : firstBracket === -1 ? firstBrace : Math.min(firstBrace, firstBracket);

    if (start === -1) {
      return trimmed;
    }

    const open = trimmed[start];
    const close = open === '{' ? '}' : ']';
    let depth = 0;
    for (let i = start; i < trimmed.length; i += 1) {
      const char = trimmed[i];
      if (char === open) depth += 1;
      if (char === close) depth -= 1;
      if (depth === 0) {
        return trimmed.slice(start, i + 1);
      }
    }

    return trimmed.slice(start);
  }

  mergeChunkResults(results, context = {}) {
    const merged = {
      document: {},
      entities: [],
      relations: [],
      papers: [],
      provenance: {
        chunks: results.length,
        mode: context.mode || 'pdf_structured'
      },
      warnings: []
    };

    results.forEach((result, index) => {
      if (!result || typeof result !== 'object') {
        merged.warnings.push(`Chunk ${index + 1} produced no structured output.`);
        return;
      }

      merged.document = { ...merged.document, ...(result.document || {}) };
      merged.entities.push(...this.asArray(result.entities || result.nodes || result.knowledgeGraph?.nodes));
      merged.relations.push(...this.asArray(result.relations || result.links || result.edges || result.knowledgeGraph?.links || result.knowledgeGraph?.edges));
      merged.papers.push(...this.asArray(result.papers || result.documents));
      merged.warnings.push(...this.asArray(result.warnings));
    });

    merged.provenance.source = 'llm_merge';
    return merged;
  }

  validateAndNormalize(result, context = {}) {
    const entityMap = new Map();
    const nodes = [];
    const papers = [];
    const links = [];
    const warnings = [];
    const relationIndex = new Map();
    const rawEntities = this.asArray(result.entities).length
      ? this.asArray(result.entities)
      : this.asArray(result.nodes);
    const rawRelations = this.asArray(result.relations).length
      ? this.asArray(result.relations)
      : this.asArray(result.links).length
        ? this.asArray(result.links)
        : this.asArray(result.edges);
    const rawPapers = this.asArray(result.papers).length
      ? this.asArray(result.papers)
      : this.asArray(result.documents);

    const normalizedEntities = rawEntities.map((entity, index) => {
      const label = String(entity?.label || entity?.name || entity?.title || `Entity ${index + 1}`).trim();
      const type = String(entity?.type || entity?.category || 'concept').trim().toLowerCase();
      const id = String(entity?.id || entity?.nodeId || entity?._key || this.slugify(`${type}_${label}`)).trim();
      const attributes = this.normalizeAttributes(entity?.attributes || {});
      const aliases = this.asArray(entity?.aliases || attributes.aliases);

      const node = {
        id,
        label,
        type,
        size: Number(entity?.size || attributes.size || 18),
        attributes: {
          ...attributes,
          aliases,
          pmid: this.asArray(attributes.pmid || attributes.pubmed_ids),
          doi: this.asArray(attributes.doi),
          source_text: entity?.source_text || '',
          evidence: this.asArray(entity?.evidence)
        }
      };

      entityMap.set(id, node);
      return node;
    });

    normalizedEntities.forEach(node => {
      if (!nodes.find(existing => existing.id === node.id)) {
        nodes.push(node);
      }
    });

    rawRelations.forEach((relation, index) => {
      const sourceId = this.resolveNodeId(relation?.source, entityMap);
      const targetId = this.resolveNodeId(relation?.target, entityMap);
      if (!sourceId || !targetId) {
        warnings.push(`Relation ${index + 1} skipped because source/target could not be resolved.`);
        return;
      }

      const relationshipType = String(relation?.relationship_type || relation?.label || relation?.relationship || 'related_to').trim();
      const edgeKey = `${sourceId}::${targetId}::${relationshipType.toLowerCase()}`;
      if (relationIndex.has(edgeKey)) {
        const existingEdge = relationIndex.get(edgeKey);
        existingEdge.weight = Math.max(existingEdge.weight, Number(relation?.confidence || 1));
        existingEdge.attributes.evidence.push(...this.collectEvidence(relation));
        return;
      }

      const edge = {
        source: sourceId,
        target: targetId,
        label: relationshipType,
        relationship_type: relationshipType,
        weight: Number(relation?.confidence || relation?.weight || 1),
        attributes: {
          confidence: relation?.confidence ?? null,
          evidence: this.collectEvidence(relation),
          pmid: this.asArray(relation?.pmid || relation?.pubmed_id || relation?.pubmedID),
          doi: this.asArray(relation?.doi)
        }
      };

      relationIndex.set(edgeKey, edge);
      links.push(edge);
    });

    rawPapers.forEach((paper, index) => {
      const hasStrongMetadata = this.hasStrongPaperMetadata(paper);
      const rawTitle = String(paper?.title || paper?.name || '').trim();
      const normalized = {
        pmid: String(paper?.pmid || paper?.pubmedID || paper?.pubmed_id || '').trim(),
        title: this.normalizePaperTitle(
          rawTitle || `Paper ${index + 1}`,
          paper
        ),
        authors: this.asArray(paper?.authors || paper?.author),
        year: paper?.year || paper?.pub_year || null,
        doi: String(paper?.doi || '').trim(),
        journal: String(paper?.journal || '').trim()
      };

      if (!normalized.title) {
        if (normalized.pmid || normalized.doi || hasStrongMetadata) {
          normalized.title = normalized.pmid
            ? `PMID: ${normalized.pmid}`
            : normalized.doi
              ? `DOI: ${normalized.doi}`
              : `Reference ${index + 1}`;
        }
      }

      if (!normalized.title && !hasStrongMetadata && !normalized.pmid && !normalized.doi) {
        warnings.push(`Paper ${index + 1} skipped because it lacks bibliographic metadata and title quality is too weak.`);
        return;
      }

      if (!this.isLikelyPaperTitle(normalized.title, paper) && !hasStrongMetadata && !normalized.pmid && !normalized.doi) {
        warnings.push(`Paper ${index + 1} skipped because the title looks fragmentary and no strong metadata was found.`);
        return;
      }

      if (normalized.pmid || normalized.doi || normalized.title) {
        papers.push({
          ...normalized,
          title: normalized.title || (normalized.pmid ? `PMID: ${normalized.pmid}` : '')
        });
      }
    });

    const primaryPaper = this.buildPrimaryPaperFromMetadata(result, context);
    if (primaryPaper) {
      const duplicateKey = this.paperKey(primaryPaper);
      if (!papers.find(existing => this.paperKey(existing) === duplicateKey)) {
        papers.unshift(primaryPaper);
      }
    }

    const dedupedPapers = [];
    const seenPaperKeys = new Set();
    papers.forEach(paper => {
      const key = this.paperKey(paper);
      if (!key || seenPaperKeys.has(key)) {
        return;
      }
      seenPaperKeys.add(key);
      dedupedPapers.push(paper);
    });
    papers.length = 0;
    papers.push(...dedupedPapers);

    const documentLabel = String(
      result?.document?.title ||
      context?.metadata?.title ||
      context?.metadata?.filename ||
      'PDF Document'
    ).trim();
    const documentId = this.slugify(`document_${documentLabel || 'pdf'}`) || 'document_pdf';

    if (papers.length) {
      const paperNodes = papers.map((paper, index) => {
        const paperId = paper.pmid
          ? `pmid_${paper.pmid}`
          : paper.doi
            ? this.slugify(`doi_${paper.doi}`)
            : this.slugify(`paper_${paper.title || index + 1}`);

        return {
          id: paperId || `paper_${index + 1}`,
          label: paper.title || `Paper ${index + 1}`,
          type: 'paper',
          size: 28,
          attributes: {
            pmid: paper.pmid ? [paper.pmid] : [],
            doi: paper.doi ? [paper.doi] : [],
            authors: paper.authors || [],
            year: paper.year || null,
            journal: paper.journal || ''
          }
        };
      });

      paperNodes.forEach(paperNode => {
        if (!nodes.find(node => node.id === paperNode.id)) {
          nodes.push(paperNode);
        }
      });
    }

    if (!nodes.length && papers.length) {
      const documentId = this.slugify(`document_${documentLabel || 'pdf'}`) || 'document_pdf';

      nodes.push({
        id: documentId,
        label: documentLabel,
        type: 'document',
        size: 42,
        attributes: {
          source_file: context?.metadata?.filename || context?.metadata?.source_file || '',
          doi: context?.metadata?.doi || '',
          pmid: []
        }
      });

      papers.forEach((paper, index) => {
        links.push({
          source: documentId,
          target: nodes.find(node => node.id.startsWith('pmid_') || node.id.startsWith('doi_') || node.id.startsWith('paper_') && node.attributes?.doi?.[0] === paper.doi)?.id || `paper_${index + 1}`,
          label: 'mentions',
          relationship_type: 'mentions',
          weight: 1,
          attributes: {
            pmid: paper.pmid ? [paper.pmid] : [],
            doi: paper.doi ? [paper.doi] : []
          }
        });
      });
    }

    const knowledgeGraph = {
      nodes,
      links,
      metadata: {
        ...context.metadata,
        document: result.document || {},
        provenance: result.provenance || {},
        warnings
      }
    };

    return {
      knowledgeGraph,
      papers,
      provenance: {
        ...(result.provenance || {}),
        warnings
      },
      warnings,
      graphSummary: {
        nodes: knowledgeGraph.nodes.length,
        links: knowledgeGraph.links.length,
        papers: papers.length
      }
    };
  }

  buildPrimaryPaperFromMetadata(result = {}, context = {}) {
    const document = result?.document || {};
    const metadata = context?.metadata || {};
    const title = String(
      document.title ||
      metadata.title ||
      this.extractTitleFromFilename(metadata.filename || metadata.source_file || '') ||
      ''
    ).trim();
    const doi = String(
      document.doi ||
      metadata.doi ||
      metadata.DOI ||
      metadata.paper_doi ||
      metadata.article_doi ||
      metadata.external_doi ||
      ''
    ).trim();
    const pmid = String(
      document.pmid ||
      metadata.pmid ||
      metadata.pubmedID ||
      metadata.pubmed_id ||
      ''
    ).trim();
    const authors = this.asArray(document.authors || metadata.authors || metadata.author);
    const year = document.year || metadata.year || metadata.pub_year || metadata.publication_year || null;
    const journal = String(document.journal || metadata.journal || metadata.venue || '').trim();

    if (!title && !doi && !pmid) {
      return null;
    }

    return {
      title: this.normalizePaperTitle(title || 'PDF Document', { doi, pmid, title }),
      pmid,
      doi,
      authors,
      year,
      journal
    };
  }

  paperKey(paper = {}) {
    const pmid = String(paper?.pmid || '').trim();
    const doi = String(paper?.doi || '').trim().toLowerCase();
    const title = String(paper?.title || '').trim().toLowerCase();
    return pmid || doi || title;
  }

  normalizePaperTitle(title, paper = {}) {
    const text = String(title || '').trim();
    const doi = String(paper?.doi || '').trim();
    const pmid = String(paper?.pmid || paper?.pubmedID || paper?.pubmed_id || '').trim();

    if (this.isFragmentaryTitle(text)) {
      if (doi) {
        return `DOI: ${doi}`;
      }
      if (pmid) {
        return `PMID: ${pmid}`;
      }
      if (this.isLikelyPaperTitle(text, paper)) {
        return text;
      }
      return '';
    }

    if (!this.isLikelyPaperTitle(text, paper) && !doi && !pmid) {
      return '';
    }

    return text;
  }

  buildKnowledgeGraph(extraction, context = {}) {
    return this.validateAndNormalize(extraction, context);
  }

  async analyzePDF(input, options = {}) {
    return await this.runLegacyPdfWorkflow(input, { ...options, preview: false });
  }

  async analyzePdf(input, options = {}) {
    return await this.analyzePDF(input, options);
  }

  async extractStructuredKG(input, options = {}) {
    return await this.analyzePDF(input, options);
  }

  async extractKnowledgeGraph(input, options = {}) {
    return await this.analyzePDF(input, options);
  }

  async analyze(input, options = {}) {
    return await this.analyzePDF(input, options);
  }

  async run(input, options = {}) {
    return await this.analyzePDF(input, options);
  }

  async previewPDF(input, options = {}) {
    return await this.runLegacyPdfWorkflow(input, { ...options, preview: true });
  }

  async previewPdf(input, options = {}) {
    return await this.previewPDF(input, options);
  }

  async preview(input, options = {}) {
    return await this.previewPDF(input, options);
  }

  async analyzePDFPreview(input, options = {}) {
    return await this.previewPDF(input, options);
  }

  async analyzePdfPreview(input, options = {}) {
    return await this.previewPDF(input, options);
  }

  async extractPreview(input, options = {}) {
    return await this.previewPDF(input, options);
  }

  async extractPDFPreview(input, options = {}) {
    return await this.previewPDF(input, options);
  }

  async runLegacyPdfWorkflow(input, { preview = false, metadata = {} } = {}) {
    const pdfBuffer = this.resolvePdfBuffer(input);
    const pdfText = await this.resolvePdfText(input, pdfBuffer);

    if (!pdfText || !pdfText.trim()) {
      throw new Error('No readable text found in PDF file.');
    }

    const extraction = await this.extractFromPDFPayload({
      text: pdfText,
      metadata,
      mode: preview ? 'pdf_preview' : 'pdf_structured'
    });

    if (preview) {
      return extraction;
    }

    const graphStorage = await GraphService.createGraph({
      nodes: extraction.knowledgeGraph.nodes || [],
      edges: extraction.knowledgeGraph.links || extraction.knowledgeGraph.edges || [],
      metadata: {
        ...(extraction.knowledgeGraph.metadata || {}),
        ...metadata,
        llm_provider: extraction.provenance?.provider || null,
        llm_model: extraction.provenance?.model || null
      }
    });

    return {
      ...extraction,
      graphId: graphStorage.graphId,
      graphStorage
    };
  }

  resolvePdfBuffer(input) {
    if (Buffer.isBuffer(input)) {
      return input;
    }

    if (input && Buffer.isBuffer(input.buffer)) {
      return input.buffer;
    }

    if (input && input.buffer && typeof input.buffer === 'object' && input.buffer.type === 'Buffer' && Array.isArray(input.buffer.data)) {
      return Buffer.from(input.buffer.data);
    }

    return Buffer.alloc(0);
  }

  async resolvePdfText(input, pdfBuffer) {
    if (input && typeof input.text === 'string' && input.text.trim()) {
      return input.text;
    }

    if (input && input.pagesText && typeof input.pagesText === 'object') {
      const combined = this.composeSourceText('', input.pagesText);
      if (combined.trim()) {
        return combined;
      }
    }

    if (!pdfBuffer || !pdfBuffer.length) {
      return '';
    }

    if (this.textExtractor && typeof this.textExtractor.extractTextFromPDF === 'function') {
      return await this.textExtractor.extractTextFromPDF(pdfBuffer);
    }

    if (this.textExtractor && typeof this.textExtractor.extractTextFromPDF === 'function') {
      return await this.textExtractor.extractTextFromPDF(pdfBuffer);
    }

    return '';
  }

  normalizeAttributes(attributes = {}) {
    const normalized = { ...attributes };
    if (normalized.pubmed_ids && !normalized.pmid) {
      normalized.pmid = this.asArray(normalized.pubmed_ids);
    }
    return normalized;
  }

  resolveNodeId(candidate, entityMap) {
    if (!candidate) return '';
    if (typeof candidate === 'string' && entityMap.has(candidate)) {
      return candidate;
    }

    if (typeof candidate === 'string') {
      const normalized = this.slugify(candidate);
      const exact = Array.from(entityMap.values()).find(node => node.id === candidate || this.slugify(node.label) === normalized);
      return exact ? exact.id : normalized;
    }

    if (typeof candidate === 'object') {
      const id = candidate.id || candidate._key || candidate.nodeId;
      if (id && entityMap.has(id)) return id;
      const label = candidate.label || candidate.name;
      if (label) {
        const normalized = this.slugify(label);
        const exact = Array.from(entityMap.values()).find(node => this.slugify(node.label) === normalized);
        return exact ? exact.id : normalized;
      }
    }

    return '';
  }

  collectEvidence(relation) {
    const evidence = [];
    this.asArray(relation?.evidence).forEach(item => {
      if (typeof item === 'string') {
        evidence.push({ sentence: item });
        return;
      }
      evidence.push({
        sentence: item?.sentence || item?.text || '',
        pmid: String(item?.pmid || item?.pubmedID || item?.pubmed_id || '').trim(),
        doi: String(item?.doi || '').trim(),
        page: item?.page || item?.page_num || null
      });
    });

    if (relation?.pmid || relation?.pubmedID || relation?.pubmed_id) {
      evidence.push({
        pmid: String(relation.pmid || relation.pubmedID || relation.pubmed_id).trim(),
        sentence: relation?.sentence || relation?.text || ''
      });
    }

    return evidence;
  }

  asArray(value) {
    if (value === null || value === undefined || value === '') {
      return [];
    }
    return Array.isArray(value) ? value : [value];
  }

  slugify(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }
}

module.exports = LLMExtractionService;
