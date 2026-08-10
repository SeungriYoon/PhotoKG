const express = require('express');
const router = express.Router();
const GraphService = require('../services/GraphService');

router.get('/health', async (_req, res) => {
  try {
    const result = await GraphService.testConnection();
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Graph health check failed',
      message: error.message
    });
  }
});

router.get('/search', async (req, res) => {
  try {
    const { query, limit = 20 } = req.query;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Search query is required'
      });
    }

    const result = await GraphService.searchNodes({
      query,
      limit: parseInt(limit, 10)
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Graph search failed',
      message: error.message
    });
  }
});

router.get('/subgraph/:nodeId?', async (req, res) => {
  try {
    const nodeId = req.query.nodeId || req.params.nodeId;
    const { depth = 2 } = req.query;

    if (!nodeId) {
      return res.status(400).json({
        success: false,
        error: 'Node ID is required'
      });
    }

    const result = await GraphService.getSubgraph(nodeId, parseInt(depth, 10));

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Graph subgraph failed',
      message: error.message
    });
  }
});

module.exports = router;
