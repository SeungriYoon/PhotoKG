const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const fetch = require('node-fetch'); // Use node-fetch v2
const PEOService = require('../services/PEOService');

// PEO service instance
const peoService = new PEOService();

// PEO Ontology Coverage Analysis
router.post('/ontology-coverage', async (req, res) => {
  try {
    console.log('🔍 PEO Ontology Coverage analysis started...');
    const { papers_data, analysis_options } = req.body;
    
    if (!papers_data || !Array.isArray(papers_data)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid papers_data format'
      });
    }

    console.log(`📊 Processing ${papers_data.length} papers`);

    const result = await peoService.runOntologyCoverageAnalysis(papers_data, analysis_options);
    
    res.json({
      success: true,
      data: result,
      message: 'PEO Ontology Coverage analysis completed',
      analysis_type: 'ontology_coverage',
      papers_count: papers_data.length
    });

  } catch (error) {
    console.error('❌ PEO Ontology Coverage analysis error:', error.message);
    res.status(500).json({
      success: false,
      error: 'PEO Ontology Coverage analysis failed',
      message: error.message
    });
  }
});

// PEO Text Encoding Analysis
router.post('/text-encoding', async (req, res) => {
  try {
    console.log('🔍 PEO Text Encoding analysis started...');
    const { papers_data, analysis_options } = req.body;
    
    if (!papers_data || !Array.isArray(papers_data)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid papers_data format'
      });
    }

    console.log(`📝 Processing ${papers_data.length} papers for text encoding analysis`);

    const result = await peoService.runTextEncodingAnalysis(papers_data, analysis_options);
    
    res.json({
      success: true,
      data: result,
      message: 'PEO Text Encoding analysis completed',
      analysis_type: 'text_encoding',
      papers_count: papers_data.length
    });

  } catch (error) {
    console.error('❌ PEO Text Encoding analysis error:', error.message);
    res.status(500).json({
      success: false,
      error: 'PEO Text Encoding analysis failed',
      message: error.message
    });
  }
});

// Ollama-based Advanced Analysis
router.post('/ollama-analysis', async (req, res) => {
  try {
    console.log('🔍 Ollama-based PEO analysis started...');
    const { papers_data, ollama_config } = req.body;
    
    if (!papers_data || !Array.isArray(papers_data)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid papers_data format'
      });
    }

    console.log(`🤖 Processing ${papers_data.length} papers with Ollama LLM analysis`);

    const result = await peoService.runOllamaAnalysis(papers_data, ollama_config || {});
    
    res.json({
      success: true,
      data: result,
      message: 'Ollama-based PEO analysis completed',
      analysis_type: 'ollama_enhanced',
      papers_count: papers_data.length
    });

  } catch (error) {
    console.error('❌ Ollama PEO analysis error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Ollama PEO analysis failed',
      message: error.message
    });
  }
});

// Analysis Results Retrieval
router.get('/results/:analysisId', async (req, res) => {
  try {
    console.log('🔍 PEO analysis results retrieval:', req.params.analysisId);
    
    const { analysisId } = req.params;
    
    const results = await peoService.getAnalysisResults(analysisId);
    
    res.json({
      success: true,
      data: results.results,
      analysisId: results.analysisId,
      fileCount: results.fileCount
    });
    
  } catch (error) {
    console.error('❌ Results retrieval error:', error.message);
    
    if (error.message.includes('not found')) {
      res.status(404).json({
        success: false,
        error: 'Analysis results not found'
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve analysis results',
        message: error.message
      });
    }
  }
});

// PEO Configuration Retrieval
router.get('/config', async (req, res) => {
  try {
    console.log('🔍 PEO configuration retrieval...');
    
    const config = await peoService.getPEOConfiguration();
    
    res.json({
      success: true,
      data: config
    });
    
  } catch (error) {
    console.error('❌ Configuration retrieval error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve PEO configuration',
      message: error.message
    });
  }
});

// Ollama Connection Test
router.get('/ollama/test', async (req, res) => {
  try {
    console.log('🔗 Testing Ollama server connection...');
    
    const response = await fetch('http://127.0.0.1:11434/api/tags', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 5000
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Ollama server connection successful');
      
      res.json({
        success: true,
        message: 'Ollama server connected successfully',
        connected: true,
        models: data.models || [],
        modelCount: data.models ? data.models.length : 0
      });
    } else {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
  } catch (error) {
    console.error('❌ Ollama server connection failed:', error.message);
    res.json({
      success: false,
      message: `Ollama server connection failed: ${error.message}`,
      connected: false,
      error: error.message
    });
  }
});

// Ollama Generate Proxy
router.post('/ollama/generate', async (req, res) => {
  try {
    console.log('⚡️ Proxying request to Ollama /api/generate');
    
    const ollamaResponse = await fetch('http://127.0.0.1:11434/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body),
    });
    
    const data = await ollamaResponse.json();
    
    if (!ollamaResponse.ok) {
      throw new Error(data.error || 'Failed to generate response from Ollama');
    }
    
    res.json(data);
    
  } catch (error) {
    console.error('❌ Ollama proxy error:', error.message);
    res.status(500).json({
      success: false,
      message: `Ollama proxy failed: ${error.message}`,
      error: error.message,
    });
  }
});

module.exports = router;
