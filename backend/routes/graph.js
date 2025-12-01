const express = require('express');
const router = express.Router();
const GraphService = require('../services/GraphService');

// 전체 그래프 조회
router.get('/', async (req, res) => {
  try {
    const { limit = 50, offset = 0, filter } = req.query;
    
    let parsedFilter = {};
    if (filter) {
      try {
        parsedFilter = typeof filter === 'string' ? JSON.parse(filter) : filter;
      } catch (parseError) {
        console.error('필터 파싱 오류:', parseError, 'filter value:', filter);
        parsedFilter = {};
      }
    }

    const result = await GraphService.getGraph({
      limit: parseInt(limit),
      offset: parseInt(offset),
      filter: parsedFilter
    });
    
    res.json({
      success: true,
      data: result,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: result.totalCount || 0
      }
    });
  } catch (error) {
    console.error('❌ 라우트 오류:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch graph',
      message: error.message || error.toString() || 'Unknown error'
    });
  }
});

// 특정 노드와 연결된 서브그래프 조회
router.get('/subgraph/:nodeId', async (req, res) => {
  try {
    const { nodeId } = req.params;
    const { depth = 1 } = req.query;
    
    const result = await GraphService.getSubgraph(nodeId, parseInt(depth));
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch subgraph',
      message: error.message
    });
  }
});

// 노드 검색
router.get('/search', async (req, res) => {
  try {
    const { query, type, limit = 20 } = req.query;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Search query is required'
      });
    }
    
    const result = await GraphService.searchNodes({
      query,
      type,
      limit: parseInt(limit)
    });
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Search failed',
      message: error.message
    });
  }
});

// 새 그래프 생성/업로드
router.post('/', async (req, res) => {
  try {
    const { nodes, edges, metadata } = req.body;
    
    if (!nodes || !Array.isArray(nodes)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid nodes data'
      });
    }
    
    if (!edges || !Array.isArray(edges)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid edges data'
      });
    }
    
    const result = await GraphService.createGraph({
      nodes,
      edges,
      metadata: metadata || {}
    });
    
    res.status(201).json({
      success: true,
      data: result,
      message: 'Graph created successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to create graph',
      message: error.message
    });
  }
});

// 기존 그래프에 노드/엣지 추가
router.post('/merge', async (req, res) => {
  try {
    const { nodes, edges, mergeStrategy = 'append' } = req.body;
    
    const result = await GraphService.mergeGraph({
      nodes: nodes || [],
      edges: edges || [],
      mergeStrategy
    });
    
    res.json({
      success: true,
      data: result,
      message: 'Graph merged successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to merge graph',
      message: error.message
    });
  }
});

// 특정 노드 조회
router.get('/nodes/:nodeId', async (req, res) => {
  try {
    const { nodeId } = req.params;
    
    const result = await GraphService.getNode(nodeId);
    
    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Node not found'
      });
    }
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch node',
      message: error.message
    });
  }
});

// 노드 업데이트
router.put('/nodes/:nodeId', async (req, res) => {
  try {
    const { nodeId } = req.params;
    const updateData = req.body;
    
    const result = await GraphService.updateNode(nodeId, updateData);
    
    res.json({
      success: true,
      data: result,
      message: 'Node updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to update node',
      message: error.message
    });
  }
});

// 노드 삭제
router.delete('/nodes/:nodeId', async (req, res) => {
  try {
    const { nodeId } = req.params;
    
    const result = await GraphService.deleteNode(nodeId);
    
    res.json({
      success: true,
      data: result,
      message: 'Node deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to delete node',
      message: error.message
    });
  }
});

// 엣지 생성
router.post('/edges', async (req, res) => {
  try {
    const { source, target, weight, relationship_type, attributes } = req.body;
    
    if (!source || !target) {
      return res.status(400).json({
        success: false,
        error: 'Source and target nodes are required'
      });
    }
    
    const result = await GraphService.createEdge({
      source,
      target,
      weight: weight || 1,
      relationship_type: relationship_type || 'RELATED_TO',
      attributes: attributes || {}
    });
    
    res.status(201).json({
      success: true,
      data: result,
      message: 'Edge created successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to create edge',
      message: error.message
    });
  }
});

// 전체 그래프 삭제 (개발용)
router.delete('/all', async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({
        success: false,
        error: 'Operation not allowed in production'
      });
    }
    
    const result = await GraphService.clearGraph();
    
    res.json({
      success: true,
      data: result,
      message: 'Graph cleared successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to clear graph',
      message: error.message
    });
  }
});

module.exports = router;