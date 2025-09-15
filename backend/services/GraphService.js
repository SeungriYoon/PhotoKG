const dbManager = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class GraphService {
  static async getDatabase() {
    try {
      if (!dbManager.isConnected()) {
        console.log('📡 데이터베이스 연결 시도...');
        await dbManager.connect();
        console.log('✅ 데이터베이스 연결 완료');
      }
      return dbManager.getDatabase();
    } catch (error) {
      console.error('❌ 데이터베이스 연결 오류:', error);
      throw error;
    }
  }

  // 전체 그래프 조회
  static async getGraph(options = {}) {
    console.log('🔍 GraphService.getGraph 시작, options:', options);
    
    try {
      const db = await this.getDatabase();
      console.log('✅ 데이터베이스 연결 성공');
      
      const { limit = 50, offset = 0, filter = {} } = options;
      console.log('📋 파라미터:', { limit, offset, filter });

      try {
      // 필터 조건 구성
      let nodeFilter = '';
      let edgeFilter = '';
      const bindVars = { limit, offset };

      if (filter.nodeType) {
        nodeFilter = 'FILTER node.type == @nodeType';
        bindVars.nodeType = filter.nodeType;
      }

      if (filter.minSize) {
        nodeFilter += nodeFilter ? ' AND node.size >= @minSize' : 'FILTER node.size >= @minSize';
        bindVars.minSize = filter.minSize;
      }

      if (filter.minWeight) {
        edgeFilter = 'FILTER edge.weight >= @minWeight';
        bindVars.minWeight = filter.minWeight;
      }

      // 노드 조회 쿼리 (LIMIT 구문 수정)
      const nodeQuery = `
        FOR node IN nodes
        ${nodeFilter}
        LIMIT ${offset}, ${limit}
        RETURN node
      `;

      // 엣지 조회 쿼리 (해당 노드들과 연결된 엣지만)
      const edgeQuery = `
        FOR edge IN edges
        ${edgeFilter}
        LET sourceExists = DOCUMENT('nodes', edge._from)
        LET targetExists = DOCUMENT('nodes', edge._to)
        FILTER sourceExists != null AND targetExists != null
        RETURN edge
      `;

      // 총 개수 조회
      const countQuery = `
        FOR node IN nodes
        ${nodeFilter}
        COLLECT WITH COUNT INTO totalCount
        RETURN totalCount
      `;

      console.log('🔍 쿼리 실행 시작...');
      console.log('📝 노드 쿼리:', nodeQuery);
      console.log('📝 엣지 쿼리:', edgeQuery);
      console.log('📝 bindVars:', bindVars);

      const [nodesResult, edgesResult, countResult] = await Promise.all([
        db.query(nodeQuery),
        db.query(edgeQuery),
        db.query(countQuery)
      ]);

      const nodes = await nodesResult.all();
      const edges = await edgesResult.all();
      const totalCount = (await countResult.all())[0] || 0;

      // 클라이언트 형식으로 변환
      const formattedNodes = nodes.map(node => ({
        id: node._key,
        label: node.label,
        size: node.size,
        type: node.type,
        attributes: node.attributes || {},
        ...node
      }));

      const formattedEdges = edges.map(edge => ({
        source: edge._from.replace('nodes/', ''),
        target: edge._to.replace('nodes/', ''),
        weight: edge.weight,
        relationship_type: edge.relationship_type,
        ...edge
      }));

      return {
        nodes: formattedNodes,
        edges: formattedEdges,
        totalCount
      };

      } catch (innerError) {
        console.error('❌ 쿼리 실행 오류:', innerError);
        throw innerError;
      }
    } catch (error) {
      console.error('❌ 그래프 조회 오류:', error);
      console.error('❌ 오류 상세:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      throw new Error(`그래프 조회 실패: ${error.message || error.toString()}`);
    }
  }

  // 서브그래프 조회 (특정 노드 중심)
  static async getSubgraph(nodeId, depth = 1) {
    const db = await this.getDatabase();

    try {
      const query = `
        FOR vertex, edge, path IN 1..@depth ANY @startNode edges
        RETURN {
          vertex: vertex,
          edge: edge,
          path: path
        }
      `;

      const result = await db.query(query, {
        startNode: `nodes/${nodeId}`,
        depth
      });

      const data = await result.all();
      
      const nodes = new Map();
      const edges = [];

      // 중심 노드 추가
      const centerNode = await db.collection('nodes').document(nodeId);
      nodes.set(nodeId, {
        id: nodeId,
        label: centerNode.label,
        size: centerNode.size,
        type: centerNode.type,
        attributes: centerNode.attributes || {},
        ...centerNode
      });

      // 연결된 노드들과 엣지들 추가
      data.forEach(item => {
        if (item.vertex) {
          const vertexId = item.vertex._key;
          if (!nodes.has(vertexId)) {
            nodes.set(vertexId, {
              id: vertexId,
              label: item.vertex.label,
              size: item.vertex.size,
              type: item.vertex.type,
              attributes: item.vertex.attributes || {},
              ...item.vertex
            });
          }
        }

        if (item.edge) {
          edges.push({
            source: item.edge._from.replace('nodes/', ''),
            target: item.edge._to.replace('nodes/', ''),
            weight: item.edge.weight,
            relationship_type: item.edge.relationship_type,
            ...item.edge
          });
        }
      });

      return {
        nodes: Array.from(nodes.values()),
        edges
      };

    } catch (error) {
      console.error('서브그래프 조회 오류:', error);
      throw new Error(`서브그래프 조회 실패: ${error.message}`);
    }
  }

  // 노드 검색
  static async searchNodes(options) {
    const db = await this.getDatabase();
    const { query, type, limit = 20 } = options;

    try {
      let searchFilter = 'FILTER CONTAINS(LOWER(node.label), LOWER(@query))';
      const bindVars = { query, limit };

      if (type) {
        searchFilter += ' AND node.type == @type';
        bindVars.type = type;
      }

      const searchQuery = `
        FOR node IN nodes
        ${searchFilter}
        SORT node.size DESC
        LIMIT @limit
        RETURN node
      `;

      const result = await db.query(searchQuery, bindVars);
      const nodes = await result.all();

      return nodes.map(node => ({
        id: node._key,
        label: node.label,
        size: node.size,
        type: node.type,
        attributes: node.attributes || {},
        score: 1.0 // 검색 점수 (추후 개선 가능)
      }));

    } catch (error) {
      console.error('노드 검색 오류:', error);
      throw new Error(`노드 검색 실패: ${error.message}`);
    }
  }

  // 새 그래프 생성
  static async createGraph(data) {
    const db = await this.getDatabase();
    const { nodes, edges, metadata = {} } = data;

    try {
      const nodesCollection = db.collection('nodes');
      const edgesCollection = db.collection('edges');
      const metadataCollection = db.collection('metadata');

      // 트랜잭션 사용
      const trx = await db.beginTransaction({
        write: ['nodes', 'edges', 'metadata']
      });

      try {
        // 메타데이터 저장
        const graphId = uuidv4();
        const metadataDoc = {
          _key: graphId,
          ...metadata,
          created_at: new Date().toISOString(),
          node_count: nodes.length,
          edge_count: edges.length
        };

        await trx.step(() => metadataCollection.save(metadataDoc));

        // 노드 저장
        const nodeResults = [];
        for (const node of nodes) {
          const nodeDoc = {
            _key: node.id || uuidv4(),
            label: node.label,
            size: node.size || 20,
            type: node.type || 'concept',
            attributes: node.attributes || {},
            graph_id: graphId,
            created_at: new Date().toISOString()
          };

          const result = await trx.step(() => nodesCollection.save(nodeDoc));
          nodeResults.push(result);
        }

        // 엣지 저장
        const edgeResults = [];
        for (const edge of edges) {
          const edgeDoc = {
            _from: `nodes/${edge.source}`,
            _to: `nodes/${edge.target}`,
            weight: edge.weight || 1,
            relationship_type: edge.relationship_type || 'RELATED_TO',
            attributes: edge.attributes || {},
            graph_id: graphId,
            created_at: new Date().toISOString()
          };

          const result = await trx.step(() => edgesCollection.save(edgeDoc));
          edgeResults.push(result);
        }

        await trx.commit();

        return {
          graphId,
          nodes: nodeResults.length,
          edges: edgeResults.length,
          metadata: metadataDoc
        };

      } catch (error) {
        await trx.abort();
        throw error;
      }

    } catch (error) {
      console.error('그래프 생성 오류:', error);
      throw new Error(`그래프 생성 실패: ${error.message}`);
    }
  }

  // 그래프 병합
  static async mergeGraph(data) {
    const db = await this.getDatabase();
    const { nodes, edges, mergeStrategy = 'append' } = data;

    try {
      const nodesCollection = db.collection('nodes');
      const edgesCollection = db.collection('edges');

      if (mergeStrategy === 'replace') {
        // 기존 데이터 삭제
        await nodesCollection.truncate();
        await edgesCollection.truncate();
      }

      // 새 데이터 추가
      const nodeResults = [];
      for (const node of nodes) {
        const existingNode = await nodesCollection.firstExample({ label: node.label });
        
        if (existingNode && mergeStrategy === 'update') {
          // 기존 노드 업데이트
          const updated = await nodesCollection.update(existingNode._key, {
            size: Math.max(existingNode.size, node.size),
            attributes: { ...existingNode.attributes, ...node.attributes }
          });
          nodeResults.push(updated);
        } else if (!existingNode) {
          // 새 노드 추가
          const nodeDoc = {
            _key: node.id || uuidv4(),
            label: node.label,
            size: node.size || 20,
            type: node.type || 'concept',
            attributes: node.attributes || {},
            created_at: new Date().toISOString()
          };
          const result = await nodesCollection.save(nodeDoc);
          nodeResults.push(result);
        }
      }

      // 엣지 병합
      const edgeResults = [];
      for (const edge of edges) {
        const existingEdge = await edgesCollection.firstExample({
          _from: `nodes/${edge.source}`,
          _to: `nodes/${edge.target}`
        });

        if (existingEdge && mergeStrategy === 'update') {
          // 기존 엣지 업데이트
          const updated = await edgesCollection.update(existingEdge._key, {
            weight: existingEdge.weight + edge.weight
          });
          edgeResults.push(updated);
        } else if (!existingEdge) {
          // 새 엣지 추가
          const edgeDoc = {
            _from: `nodes/${edge.source}`,
            _to: `nodes/${edge.target}`,
            weight: edge.weight || 1,
            relationship_type: edge.relationship_type || 'RELATED_TO',
            attributes: edge.attributes || {},
            created_at: new Date().toISOString()
          };
          const result = await edgesCollection.save(edgeDoc);
          edgeResults.push(result);
        }
      }

      return {
        nodes: nodeResults.length,
        edges: edgeResults.length,
        strategy: mergeStrategy
      };

    } catch (error) {
      console.error('그래프 병합 오류:', error);
      throw new Error(`그래프 병합 실패: ${error.message}`);
    }
  }

  // 노드 조회
  static async getNode(nodeId) {
    const db = await this.getDatabase();

    try {
      const node = await db.collection('nodes').document(nodeId);
      return {
        id: node._key,
        label: node.label,
        size: node.size,
        type: node.type,
        attributes: node.attributes || {},
        ...node
      };
    } catch (error) {
      if (error.isArangoError && error.errorNum === 1202) {
        return null; // 문서가 존재하지 않음
      }
      throw new Error(`노드 조회 실패: ${error.message}`);
    }
  }

  // 노드 업데이트
  static async updateNode(nodeId, updateData) {
    const db = await this.getDatabase();

    try {
      const result = await db.collection('nodes').update(nodeId, {
        ...updateData,
        updated_at: new Date().toISOString()
      });

      return result;
    } catch (error) {
      throw new Error(`노드 업데이트 실패: ${error.message}`);
    }
  }

  // 노드 삭제
  static async deleteNode(nodeId) {
    const db = await this.getDatabase();

    try {
      // 관련 엣지 먼저 삭제
      const deleteEdgesQuery = `
        FOR edge IN edges
        FILTER edge._from == @nodeRef OR edge._to == @nodeRef
        REMOVE edge IN edges
      `;

      await db.query(deleteEdgesQuery, { nodeRef: `nodes/${nodeId}` });

      // 노드 삭제
      const result = await db.collection('nodes').remove(nodeId);

      return result;
    } catch (error) {
      throw new Error(`노드 삭제 실패: ${error.message}`);
    }
  }

  // 엣지 생성
  static async createEdge(edgeData) {
    const db = await this.getDatabase();

    try {
      const edgeDoc = {
        _from: `nodes/${edgeData.source}`,
        _to: `nodes/${edgeData.target}`,
        weight: edgeData.weight || 1,
        relationship_type: edgeData.relationship_type || 'RELATED_TO',
        attributes: edgeData.attributes || {},
        created_at: new Date().toISOString()
      };

      const result = await db.collection('edges').save(edgeDoc);
      return result;
    } catch (error) {
      throw new Error(`엣지 생성 실패: ${error.message}`);
    }
  }

  // 그래프 초기화 (개발용)
  static async clearGraph() {
    const db = await this.getDatabase();

    try {
      await Promise.all([
        db.collection('nodes').truncate(),
        db.collection('edges').truncate(),
        db.collection('metadata').truncate()
      ]);

      return { message: 'Graph cleared successfully' };
    } catch (error) {
      throw new Error(`그래프 초기화 실패: ${error.message}`);
    }
  }
}

module.exports = GraphService;