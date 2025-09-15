const express = require('express');
const router = express.Router();
const multer = require('multer');
// AnalysisService has database dependencies, so we leave it as is.
const AnalysisService = require('../services/AnalysisService'); 
// Create a single instance of SimpleAnalysisService to be shared (Singleton pattern).
const SimpleAnalysisService = require('../services/SimpleAnalysisService');
const simpleService = new SimpleAnalysisService(); // Create the instance outside the router.

// Multer setup for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    // Increase file size limit to 50MB to handle larger academic materials.
    fileSize: 50 * 1024 * 1024 // 50MB limit
  }
});

// CSV Analysis with OpenAI (Database-free)
router.post('/csv', upload.single('csvFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No CSV file uploaded'
      });
    }

    console.log(`📄 Starting CSV analysis: ${req.file.originalname} (${req.file.size} bytes)`);

    // Convert buffer to text
    const csvText = req.file.buffer.toString('utf-8');

    if (!csvText || csvText.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'CSV file is empty or contains no readable data'
      });
    }

    // Use the shared service instance.
    const result = await simpleService.analyzeCSVWithAI(csvText);

    console.log(`✅ CSV analysis complete: ${result.knowledgeGraph.nodes.length} nodes, ${result.knowledgeGraph.edges.length} edges`);

    res.json({
      success: true,
      data: result,
      message: 'CSV analysis completed with AI (database-free mode)'
    });

  } catch (error) {
    console.error('❌ CSV analysis failed:', error);

    const statusCode = error.message.includes('timed out') ? 408 :
                      error.message.includes('OpenAI API key') ? 401 : 500;

    res.status(statusCode).json({
      success: false,
      error: 'CSV analysis failed',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// PDF Analysis with OpenAI (Database-free)
router.post('/pdf', upload.single('pdfFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No PDF file uploaded'
      });
    }

    console.log(`📄 Starting PDF analysis: ${req.file.originalname} (${req.file.size} bytes)`);
    
    // Use the shared service instance.
    const result = await simpleService.analyzePDFWithAI(req.file.buffer);

    console.log(`✅ PDF analysis complete: ${result.knowledgeGraph.nodes.length} nodes, ${result.knowledgeGraph.edges.length} edges`);

    res.json({
      success: true,
      data: result,
      message: 'PDF analysis completed with AI (database-free mode)'
    });

  } catch (error) {
    console.error('❌ PDF analysis failed:', error);

    const statusCode = error.message.includes('timed out') ? 408 :
                      error.message.includes('OpenAI API key') ? 401 :
                      error.message.includes('No readable text') ? 400 : 500;

    res.status(statusCode).json({
      success: false,
      error: 'PDF analysis failed',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Graph Analysis with OpenAI (Database-free)
router.post('/graph', async (req, res) => {
  try {
    const { nodes, links, edges } = req.body; // Handle both 'links' and 'edges' properties.
    
    const graphEdges = links || edges;

    if (!nodes || !graphEdges) {
      return res.status(400).json({
        success: false,
        error: 'Graph data (nodes and links/edges) is required'
      });
    }

    // Use the shared service instance.
    const result = await simpleService.analyzeGraphWithAI({ nodes, edges: graphEdges });
    
    res.json({
      success: true,
      data: result,
      message: 'Graph analysis completed with AI (database-free mode)'
    });
    
  } catch (error) {
    console.error('Graph analysis error:', error);
    res.status(500).json({
      success: false,
      error: 'Graph analysis failed',
      message: error.message
    });
  }
});

// [NEW] Rich AI Insights Report
router.post('/rich-insights', async (req, res) => {
  try {
    const { nodes, links, edges } = req.body;
    const graphEdges = links || edges;

    if (!nodes || !graphEdges) {
      return res.status(400).json({
        success: false,
        error: 'Graph data (nodes and links/edges) is required'
      });
    }

    const result = await simpleService.generateRichAIInsights({ nodes, links: graphEdges });
    
    res.json({
      success: true,
      data: result,
      message: 'Rich AI insights generated successfully'
    });

  } catch (error) {
    console.error('Rich AI insights error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate rich AI insights',
      message: error.message
    });
  }
});


// --- Keep the existing database-based analysis endpoints as they are ---
// These endpoints use a separate AnalysisService and are not directly related to the current issue.

// Graph Structure Analysis
router.post('/structure', async (req, res) => {
  try {
    const { graphId, analysisOptions } = req.body;
    
    const result = await AnalysisService.analyzeStructure({
      graphId,
      options: analysisOptions || {}
    });
    
    res.json({
      success: true,
      data: result,
      message: 'Graph structure analysis completed'
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Structure analysis failed',
      message: error.message
    });
  }
});

// Community Detection
router.post('/communities', async (req, res) => {
  try {
    const { graphId, algorithm = 'modularity', options } = req.body;
    
    const result = await AnalysisService.detectCommunities({
      graphId,
      algorithm,
      options: options || {}
    });
    
    res.json({
      success: true,
      data: result,
      message: 'Community detection completed'
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Community detection failed',
      message: error.message
    });
  }
});

// Centrality Analysis
router.post('/centrality', async (req, res) => {
  try {
    const { graphId, metrics = ['degree', 'betweenness', 'closeness'] } = req.body;
    
    const result = await AnalysisService.calculateCentrality({
      graphId,
      metrics
    });
    
    res.json({
      success: true,
      data: result,
      message: 'Centrality analysis completed'
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Centrality analysis failed',
      message: error.message
    });
  }
});

// AI-based Clustering
router.post('/ai-clustering', async (req, res) => {
  try {
    const { graphId, aiModel = 'default', options } = req.body;
    
    const result = await AnalysisService.performAIClustering({
      graphId,
      aiModel,
      options: options || {}
    });
    
    res.json({
      success: true,
      data: result,
      message: 'AI clustering completed'
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'AI clustering failed',
      message: error.message
    });
  }
});

// Keyword Extraction and Analysis
router.post('/keywords', async (req, res) => {
  try {
    const { graphId, extractionMethod = 'tfidf', topK = 20 } = req.body;
    
    const result = await AnalysisService.extractKeywords({
      graphId,
      method: extractionMethod,
      topK
    });
    
    res.json({
      success: true,
      data: result,
      message: 'Keyword extraction completed'
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Keyword extraction failed',
      message: error.message
    });
  }
});

// Similarity Analysis
router.post('/similarity', async (req, res) => {
  try {
    const { nodeId1, nodeId2, method = 'semantic' } = req.body;
    
    if (!nodeId1 || !nodeId2) {
      return res.status(400).json({
        success: false,
        error: 'Both node IDs are required'
      });
    }
    
    const result = await AnalysisService.calculateSimilarity({
      nodeId1,
      nodeId2,
      method
    });
    
    res.json({
      success: true,
      data: result,
      message: 'Similarity calculation completed'
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Similarity calculation failed',
      message: error.message
    });
  }
});

// Path Analysis (shortest path, all paths, etc.)
router.post('/paths', async (req, res) => {
  try {
    const { sourceId, targetId, pathType = 'shortest', maxLength = 5 } = req.body;
    
    if (!sourceId || !targetId) {
      return res.status(400).json({
        success: false,
        error: 'Source and target node IDs are required'
      });
    }
    
    const result = await AnalysisService.findPaths({
      sourceId,
      targetId,
      pathType,
      maxLength
    });
    
    res.json({
      success: true,
      data: result,
      message: 'Path analysis completed'
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Path analysis failed',
      message: error.message
    });
  }
});

// Anomaly Detection
router.post('/anomalies', async (req, res) => {
  try {
    const { graphId, method = 'isolation_forest', options } = req.body;
    
    const result = await AnalysisService.detectAnomalies({
      graphId,
      method,
      options: options || {}
    });
    
    res.json({
      success: true,
      data: result,
      message: 'Anomaly detection completed'
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Anomaly detection failed',
      message: error.message
    });
  }
});

// Trend Analysis (time-based)
router.post('/trends', async (req, res) => {
  try {
    const { graphId, timeField = 'created_at', interval = 'month' } = req.body;
    
    const result = await AnalysisService.analyzeTrends({
      graphId,
      timeField,
      interval
    });
    
    res.json({
      success: true,
      data: result,
      message: 'Trend analysis completed'
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Trend analysis failed',
      message: error.message
    });
  }
});

// Recommendation System (related node recommendation)
router.post('/recommendations', async (req, res) => {
  try {
    const { nodeId, method = 'collaborative', topK = 10 } = req.body;
    
    if (!nodeId) {
      return res.status(400).json({
        success: false,
        error: 'Node ID is required'
      });
    }
    
    const result = await AnalysisService.getRecommendations({
      nodeId,
      method,
      topK
    });
    
    res.json({
      success: true,
      data: result,
      message: 'Recommendations generated successfully'
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Recommendation generation failed',
      message: error.message
    });
  }
});

// Calculate Network Metrics
router.get('/metrics/:graphId', async (req, res) => {
  try {
    const { graphId } = req.params;
    
    const result = await AnalysisService.calculateNetworkMetrics(graphId);
    
    res.json({
      success: true,
      data: result,
      message: 'Network metrics calculated successfully'
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Network metrics calculation failed',
      message: error.message
    });
  }
});

// Get Analysis History
router.get('/history', async (req, res) => {
  try {
    const { limit = 20, offset = 0, analysisType } = req.query;
    
    const result = await AnalysisService.getAnalysisHistory({
      limit: parseInt(limit),
      offset: parseInt(offset),
      analysisType
    });
    
    res.json({
      success: true,
      data: result
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch analysis history',
      message: error.message
    });
  }
});

// Get Specific Analysis Result
router.get('/result/:analysisId', async (req, res) => {
  try {
    const { analysisId } = req.params;
    
    const result = await AnalysisService.getAnalysisResult(analysisId);
    
    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Analysis result not found'
      });
    }
    
    res.json({
      success: true,
      data: result
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch analysis result',
      message: error.message
    });
  }
});

module.exports = router;
