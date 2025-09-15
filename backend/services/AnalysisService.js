const dbManager = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const { COLLECTIONS } = require('../models/schemas');
const { spawn } = require('child_process');
const path = require('path');

class AnalysisService {
  static async getDatabase() {
    if (!dbManager.isConnected()) {
      await dbManager.connect();
    }
    return dbManager.getDatabase();
  }

  // 그래프 구조 분석
  static async analyzeStructure(options = {}) {
    const db = await this.getDatabase();
    const { graphId, options: analysisOptions = {} } = options;

    try {
      console.log('📊 그래프 구조 분석 시작...');
      const startTime = Date.now();

      // 기본 통계 쿼리
      const statsQuery = `
        LET nodeCount = LENGTH(FOR n IN nodes RETURN 1)
        LET edgeCount = LENGTH(FOR e IN edges RETURN 1)
        LET nodeTypes = (
          FOR n IN nodes
          COLLECT type = n.type WITH COUNT INTO count
          RETURN { type: type, count: count }
        )
        LET edgeTypes = (
          FOR e IN edges
          COLLECT type = e.relationship_type WITH COUNT INTO count
          RETURN { type: type, count: count }
        )
        LET avgDegree = edgeCount > 0 ? (edgeCount * 2) / nodeCount : 0
        
        RETURN {
          nodeCount: nodeCount,
          edgeCount: edgeCount,
          nodeTypes: nodeTypes,
          edgeTypes: edgeTypes,
          avgDegree: avgDegree,
          density: nodeCount > 1 ? (edgeCount * 2) / (nodeCount * (nodeCount - 1)) : 0
        }
      `;

      const statsResult = await db.query(statsQuery);
      const basicStats = await statsResult.next();

      // 연결성 분석
      const connectivityStats = await this.analyzeConnectivity();

      // 중심성 분석 (옵션)
      let centralityStats = null;
      if (analysisOptions.includeCentrality) {
        centralityStats = await this.calculateCentrality({ graphId });
      }

      // 모듈성 분석 (옵션)
      let modularityStats = null;
      if (analysisOptions.includeModularity) {
        modularityStats = await this.detectCommunities({ graphId, algorithm: 'modularity' });
      }

      const processingTime = Date.now() - startTime;

      const result = {
        analysisId: uuidv4(),
        analysisType: 'structure',
        graphId,
        basicStatistics: basicStats,
        connectivity: connectivityStats,
        centrality: centralityStats,
        modularity: modularityStats,
        processingTime,
        timestamp: new Date().toISOString()
      };

      // 분석 결과 저장
      await this.saveAnalysisResult(result);

      console.log(`✅ 구조 분석 완료 (${processingTime}ms)`);
      return result;

    } catch (error) {
      console.error('구조 분석 실패:', error);
      throw new Error(`구조 분석 실패: ${error.message}`);
    }
  }

  // 연결성 분석
  static async analyzeConnectivity() {
    const db = await this.getDatabase();

    try {
      // 연결 컴포넌트 분석
      const componentsQuery = `
        FOR n IN nodes
        LET neighbors = (
          FOR e IN edges
          FILTER e._from == n._id OR e._to == n._id
          RETURN e._from == n._id ? e._to : e._from
        )
        RETURN {
          node: n._key,
          degree: LENGTH(neighbors),
          neighbors: neighbors
        }
      `;

      const componentsResult = await db.query(componentsQuery);
      const nodeConnections = await componentsResult.all();

      // 차수 분포 계산
      const degrees = nodeConnections.map(nc => nc.degree);
      const degreeDistribution = this.calculateDegreeDistribution(degrees);

      // 고립된 노드 찾기
      const isolatedNodes = nodeConnections
        .filter(nc => nc.degree === 0)
        .map(nc => nc.node);

      // 허브 노드 찾기 (상위 10%)
      const sortedByDegree = nodeConnections.sort((a, b) => b.degree - a.degree);
      const hubThreshold = Math.ceil(nodeConnections.length * 0.1);
      const hubNodes = sortedByDegree.slice(0, hubThreshold);

      return {
        degreeDistribution,
        isolatedNodesCount: isolatedNodes.length,
        isolatedNodes: isolatedNodes.slice(0, 10), // 처음 10개만
        hubNodes: hubNodes.map(hn => ({
          node: hn.node,
          degree: hn.degree
        })),
        maxDegree: degrees.length > 0 ? Math.max(...degrees) : 0,
        minDegree: degrees.length > 0 ? Math.min(...degrees) : 0,
        avgDegree: degrees.length > 0 ? degrees.reduce((a, b) => a + b, 0) / degrees.length : 0
      };

    } catch (error) {
      throw new Error(`연결성 분석 실패: ${error.message}`);
    }
  }

  // 차수 분포 계산
  static calculateDegreeDistribution(degrees) {
    const distribution = {};
    degrees.forEach(degree => {
      distribution[degree] = (distribution[degree] || 0) + 1;
    });

    return Object.entries(distribution)
      .map(([degree, count]) => ({
        degree: parseInt(degree),
        count,
        probability: count / degrees.length
      }))
      .sort((a, b) => a.degree - b.degree);
  }

  // 중심성 분석
  static async calculateCentrality(options = {}) {
    const db = await this.getDatabase();
    const { graphId, metrics = ['degree', 'betweenness'] } = options;

    try {
      console.log('🎯 중심성 분석 시작...');

      const results = {};

      // 차수 중심성 (Degree Centrality)
      if (metrics.includes('degree')) {
        const degreeQuery = `
          FOR n IN nodes
          LET inDegree = LENGTH(FOR e IN edges FILTER e._to == n._id RETURN 1)
          LET outDegree = LENGTH(FOR e IN edges FILTER e._from == n._id RETURN 1)
          LET totalDegree = inDegree + outDegree
          SORT totalDegree DESC
          RETURN {
            node: n._key,
            label: n.label,
            inDegree: inDegree,
            outDegree: outDegree,
            totalDegree: totalDegree
          }
        `;

        const degreeResult = await db.query(degreeQuery);
        results.degree = await degreeResult.all();
      }

      // 근접 중심성 (Closeness Centrality) - 간소화된 버전
      if (metrics.includes('closeness')) {
        results.closeness = await this.calculateClosenessCentrality();
      }

      // 매개 중심성 (Betweenness Centrality) - 기본 구현
      if (metrics.includes('betweenness')) {
        results.betweenness = await this.calculateBetweennessCentrality();
      }

      console.log('✅ 중심성 분석 완료');
      return results;

    } catch (error) {
      throw new Error(`중심성 분석 실패: ${error.message}`);
    }
  }

  // 근접 중심성 계산 (간소화)
  static async calculateClosenessCentrality() {
    const db = await this.getDatabase();

    try {
      // 각 노드에서 다른 모든 노드까지의 최단 거리 합 계산
      const closenessQuery = `
        FOR n IN nodes
        LET distances = (
          FOR target IN nodes
          FILTER target._key != n._key
          LET path = (
            FOR v, e, p IN 1..5 OUTBOUND n._id edges
            FILTER v._key == target._key
            LIMIT 1
            RETURN LENGTH(p.edges)
          )
          RETURN LENGTH(path) > 0 ? path[0] : 999
        )
        LET avgDistance = LENGTH(distances) > 0 ? AVERAGE(distances) : 999
        LET closeness = avgDistance < 999 ? 1 / avgDistance : 0
        SORT closeness DESC
        RETURN {
          node: n._key,
          label: n.label,
          avgDistance: avgDistance,
          closeness: closeness
        }
      `;

      const result = await db.query(closenessQuery);
      return await result.all();

    } catch (error) {
      console.warn('근접 중심성 계산 실패, 기본값 반환:', error.message);
      return [];
    }
  }

  // 매개 중심성 계산 (기본 구현)
  static async calculateBetweennessCentrality() {
    // 복잡한 계산이므로 기본 구현만 제공
    console.log('매개 중심성은 복잡한 계산으로 인해 차수 기반 근사치를 반환합니다');
    
    const db = await this.getDatabase();
    
    try {
      const query = `
        FOR n IN nodes
        LET degree = LENGTH(FOR e IN edges FILTER e._from == n._id OR e._to == n._id RETURN 1)
        LET betweenness = degree * degree  // 근사치
        SORT betweenness DESC
        RETURN {
          node: n._key,
          label: n.label,
          betweenness: betweenness
        }
      `;

      const result = await db.query(query);
      return await result.all();

    } catch (error) {
      console.warn('매개 중심성 계산 실패:', error.message);
      return [];
    }
  }

  // 커뮤니티 탐지
  static async detectCommunities(options = {}) {
    const { graphId, algorithm = 'modularity' } = options;

    try {
      console.log(`🔍 커뮤니티 탐지 시작 (${algorithm})...`);

      switch (algorithm) {
        case 'modularity':
          return await this.modularityCommunityDetection();
        case 'label_propagation':
          return await this.labelPropagationCommunityDetection();
        default:
          throw new Error(`지원하지 않는 알고리즘: ${algorithm}`);
      }

    } catch (error) {
      throw new Error(`커뮤니티 탐지 실패: ${error.message}`);
    }
  }

  // 모듈성 기반 커뮤니티 탐지 (간소화)
  static async modularityCommunityDetection() {
    const db = await this.getDatabase();

    try {
      // 노드 타입별로 커뮤니티 그룹핑 (간단한 방법)
      const query = `
        FOR n IN nodes
        COLLECT type = n.type WITH COUNT INTO count
        RETURN {
          community: type,
          nodes: (
            FOR node IN nodes
            FILTER node.type == type
            RETURN {
              id: node._key,
              label: node.label,
              size: node.size
            }
          ),
          size: count
        }
      `;

      const result = await db.query(query);
      const communities = await result.all();

      // 모듈성 점수 계산 (단순화)
      const totalEdges = await this.getTotalEdgeCount();
      let modularity = 0;

      for (const community of communities) {
        const internalEdges = await this.getInternalEdgeCount(community.nodes.map(n => n.id));
        const expectedEdges = (community.size * (community.size - 1)) / (2 * totalEdges);
        modularity += (internalEdges / totalEdges) - Math.pow(expectedEdges, 2);
      }

      return {
        algorithm: 'modularity',
        communities,
        modularityScore: modularity,
        communityCount: communities.length
      };

    } catch (error) {
      throw new Error(`모듈성 커뮤니티 탐지 실패: ${error.message}`);
    }
  }

  // 라벨 전파 커뮤니티 탐지 (기본 구현)
  static async labelPropagationCommunityDetection() {
    console.log('라벨 전파 알고리즘은 기본 구현을 제공합니다');
    
    // 실제로는 복잡한 반복 알고리즘 필요
    return {
      algorithm: 'label_propagation',
      communities: [],
      message: 'Label propagation algorithm requires iterative implementation'
    };
  }

  // AI 기반 클러스터링
  static async performAIClustering(options = {}) {
    const { graphId, aiModel = 'default' } = options;

    try {
      console.log(`🤖 AI 클러스터링 시작 (${aiModel})...`);

      // 임베딩 기반 클러스터링 시뮬레이션
      const nodes = await this.getAllNodes();
      
      // 간단한 특성 기반 클러스터링
      const clusters = this.clusterByFeatures(nodes);

      return {
        algorithm: `ai_clustering_${aiModel}`,
        clusters,
        clusterCount: clusters.length,
        processingTime: Date.now()
      };

    } catch (error) {
      throw new Error(`AI 클러스터링 실패: ${error.message}`);
    }
  }

  // 특성 기반 클러스터링
  static clusterByFeatures(nodes) {
    const clusters = new Map();

    nodes.forEach(node => {
      // 크기와 타입을 기준으로 클러스터링
      const sizeCategory = node.size < 20 ? 'small' : node.size < 40 ? 'medium' : 'large';
      const clusterKey = `${node.type}_${sizeCategory}`;

      if (!clusters.has(clusterKey)) {
        clusters.set(clusterKey, {
          id: clusterKey,
          type: node.type,
          sizeCategory,
          nodes: []
        });
      }

      clusters.get(clusterKey).nodes.push({
        id: node._key,
        label: node.label,
        size: node.size
      });
    });

    return Array.from(clusters.values());
  }

  // 키워드 추출 및 분석
  static async extractKeywords(options = {}) {
    const { graphId, method = 'frequency', topK = 20 } = options;

    try {
      console.log(`🔤 키워드 추출 시작 (${method})...`);

      const query = `
        FOR n IN nodes
        LET words = SPLIT(LOWER(n.label), " ")
        FOR word IN words
        FILTER LENGTH(word) > 2
        COLLECT keyword = word WITH COUNT INTO freq
        SORT freq DESC
        LIMIT @topK
        RETURN {
          keyword: keyword,
          frequency: freq,
          score: freq / (SELECT VALUE COUNT(*) FROM nodes)[0]
        }
      `;

      const result = await db.query(query, { topK });
      const keywords = await result.all();

      return {
        method,
        keywords,
        extractedCount: keywords.length,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      throw new Error(`키워드 추출 실패: ${error.message}`);
    }
  }

  // 유사도 계산
  static async calculateSimilarity(options = {}) {
    const { nodeId1, nodeId2, method = 'jaccard' } = options;

    try {
      const db = await this.getDatabase();

      // 두 노드 조회
      const [node1, node2] = await Promise.all([
        db.collection('nodes').document(nodeId1),
        db.collection('nodes').document(nodeId2)
      ]);

      let similarity = 0;

      switch (method) {
        case 'jaccard':
          similarity = this.calculateJaccardSimilarity(node1.label, node2.label);
          break;
        case 'semantic':
          similarity = await this.calculateSemanticSimilarity(node1, node2);
          break;
        case 'structural':
          similarity = await this.calculateStructuralSimilarity(nodeId1, nodeId2);
          break;
        default:
          throw new Error(`지원하지 않는 유사도 방법: ${method}`);
      }

      return {
        node1: { id: nodeId1, label: node1.label },
        node2: { id: nodeId2, label: node2.label },
        method,
        similarity,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      throw new Error(`유사도 계산 실패: ${error.message}`);
    }
  }

  // 자카드 유사도 계산
  static calculateJaccardSimilarity(text1, text2) {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  // 의미적 유사도 계산 (기본 구현)
  static async calculateSemanticSimilarity(node1, node2) {
    // 실제로는 임베딩 벡터 간 코사인 유사도 계산
    // 현재는 라벨 기반 단순 계산
    return this.calculateJaccardSimilarity(node1.label, node2.label);
  }

  // 구조적 유사도 계산
  static async calculateStructuralSimilarity(nodeId1, nodeId2) {
    const db = await this.getDatabase();

    try {
      // 각 노드의 이웃 노드들 조회
      const neighborsQuery = `
        LET neighbors1 = (
          FOR e IN edges
          FILTER e._from == @node1 OR e._to == @node1
          RETURN e._from == @node1 ? e._to : e._from
        )
        LET neighbors2 = (
          FOR e IN edges
          FILTER e._from == @node2 OR e._to == @node2
          RETURN e._from == @node2 ? e._to : e._from
        )
        RETURN {
          neighbors1: neighbors1,
          neighbors2: neighbors2
        }
      `;

      const result = await db.query(neighborsQuery, {
        node1: `nodes/${nodeId1}`,
        node2: `nodes/${nodeId2}`
      });

      const data = await result.next();
      
      // 공통 이웃 노드 계산
      const set1 = new Set(data.neighbors1);
      const set2 = new Set(data.neighbors2);
      const intersection = new Set([...set1].filter(x => set2.has(x)));
      const union = new Set([...set1, ...set2]);

      return union.size > 0 ? intersection.size / union.size : 0;

    } catch (error) {
      console.warn('구조적 유사도 계산 실패:', error.message);
      return 0;
    }
  }

  // 경로 분석
  static async findPaths(options = {}) {
    const { sourceId, targetId, pathType = 'shortest', maxLength = 5 } = options;

    try {
      const db = await this.getDatabase();

      const pathQuery = `
        FOR v, e, p IN 1..@maxLength ANY @source edges
        FILTER v._key == @target
        ${pathType === 'shortest' ? 'LIMIT 1' : ''}
        RETURN {
          path: p.vertices[*]._key,
          edges: p.edges[*].relationship_type,
          length: LENGTH(p.vertices) - 1,
          weight: SUM(p.edges[*].weight)
        }
      `;

      const result = await db.query(pathQuery, {
        source: `nodes/${sourceId}`,
        target: targetId,
        maxLength
      });

      const paths = await result.all();

      return {
        source: sourceId,
        target: targetId,
        pathType,
        paths,
        pathCount: paths.length
      };

    } catch (error) {
      throw new Error(`경로 분석 실패: ${error.message}`);
    }
  }

  // 유틸리티 함수들
  static async getAllNodes() {
    const db = await this.getDatabase();
    const result = await db.query('FOR n IN nodes RETURN n');
    return await result.all();
  }

  static async getTotalEdgeCount() {
    const db = await this.getDatabase();
    const result = await db.query('RETURN LENGTH(FOR e IN edges RETURN 1)');
    return await result.next();
  }

  static async getInternalEdgeCount(nodeIds) {
    const db = await this.getDatabase();
    
    const query = `
      FOR e IN edges
      LET sourceInCommunity = @nodeIds ANY == SPLIT(e._from, "/")[1]
      LET targetInCommunity = @nodeIds ANY == SPLIT(e._to, "/")[1]
      FILTER sourceInCommunity AND targetInCommunity
      RETURN 1
    `;

    const result = await db.query(query, { nodeIds });
    const edges = await result.all();
    return edges.length;
  }

  // 분석 결과 저장
  static async saveAnalysisResult(analysisData) {
    const db = await this.getDatabase();

    try {
      const collection = db.collection(COLLECTIONS.ANALYSIS_RESULTS);
      const doc = {
        _key: analysisData.analysisId,
        analysis_id: analysisData.analysisId,
        analysis_type: analysisData.analysisType,
        graph_id: analysisData.graphId,
        parameters: analysisData.parameters || {},
        results: analysisData,
        processing_time: analysisData.processingTime,
        created_at: new Date().toISOString()
      };

      return await collection.save(doc);
    } catch (error) {
      console.error('분석 결과 저장 실패:', error);
    }
  }

  // 분석 히스토리 조회
  static async getAnalysisHistory(options = {}) {
    const db = await this.getDatabase();
    const { limit = 20, offset = 0, analysisType } = options;

    try {
      let filter = '';
      const bindVars = { limit, offset };

      if (analysisType) {
        filter = 'FILTER doc.analysis_type == @analysisType';
        bindVars.analysisType = analysisType;
      }

      const query = `
        FOR doc IN ${COLLECTIONS.ANALYSIS_RESULTS}
        ${filter}
        SORT doc.created_at DESC
        LIMIT @offset, @limit
        RETURN doc
      `;

      const result = await db.query(query, bindVars);
      return await result.all();
    } catch (error) {
      throw new Error(`분석 히스토리 조회 실패: ${error.message}`);
    }
  }

  // 특정 분석 결과 조회
  static async getAnalysisResult(analysisId) {
    const db = await this.getDatabase();

    try {
      const collection = db.collection(COLLECTIONS.ANALYSIS_RESULTS);
      return await collection.document(analysisId);
    } catch (error) {
      if (error.isArangoError && error.errorNum === 1202) {
        return null;
      }
      throw new Error(`분석 결과 조회 실패: ${error.message}`);
    }
  }

  // OpenAI CSV Analysis
  static async analyzeCSVWithAI(csvText) {
    try {
      console.log('🤖 CSV 분석을 위해 OpenAI 서비스 호출...');
      
      return new Promise((resolve, reject) => {
        const pythonScript = path.join(__dirname, '..', '..', 'openai_cli_analyzer.py');
        const pythonProcess = spawn('python', [pythonScript, '--csv'], {
          stdio: ['pipe', 'pipe', 'pipe']
        });

        let output = '';
        let errorOutput = '';

        pythonProcess.stdout.on('data', (data) => {
          output += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
          errorOutput += data.toString();
        });

        pythonProcess.on('close', (code) => {
          if (code === 0) {
            try {
              const result = JSON.parse(output);
              resolve(result);
            } catch (e) {
              reject(new Error(`Failed to parse AI response: ${e.message}`));
            }
          } else {
            reject(new Error(`Python script failed with code ${code}: ${errorOutput}`));
          }
        });

        // Send CSV data to Python script
        pythonProcess.stdin.write(csvText);
        pythonProcess.stdin.end();
      });
    } catch (error) {
      console.error('❌ CSV AI 분석 실패:', error);
      throw error;
    }
  }

  // OpenAI PDF Analysis
  static async analyzePDFWithAI(pdfBuffer) {
    try {
      console.log('🤖 PDF 분석을 위해 OpenAI 서비스 호출...');
      
      return new Promise((resolve, reject) => {
        const pythonScript = path.join(__dirname, '..', '..', 'openai_cli_analyzer.py');
        const pythonProcess = spawn('python', [pythonScript, '--pdf'], {
          stdio: ['pipe', 'pipe', 'pipe']
        });

        let output = '';
        let errorOutput = '';

        pythonProcess.stdout.on('data', (data) => {
          output += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
          errorOutput += data.toString();
        });

        pythonProcess.on('close', (code) => {
          if (code === 0) {
            try {
              const result = JSON.parse(output);
              resolve(result);
            } catch (e) {
              reject(new Error(`Failed to parse AI response: ${e.message}`));
            }
          } else {
            reject(new Error(`Python script failed with code ${code}: ${errorOutput}`));
          }
        });

        // Send PDF buffer to Python script
        pythonProcess.stdin.write(pdfBuffer);
        pythonProcess.stdin.end();
      });
    } catch (error) {
      console.error('❌ PDF AI 분석 실패:', error);
      throw error;
    }
  }

  // OpenAI Graph Analysis
  static async analyzeGraphWithAI(graphData) {
    try {
      console.log('🤖 그래프 분석을 위해 OpenAI 서비스 호출...');
      
      return new Promise((resolve, reject) => {
        const pythonScript = path.join(__dirname, '..', '..', 'openai_cli_analyzer.py');
        const pythonProcess = spawn('python', [pythonScript, '--graph'], {
          stdio: ['pipe', 'pipe', 'pipe']
        });

        let output = '';
        let errorOutput = '';

        pythonProcess.stdout.on('data', (data) => {
          output += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
          errorOutput += data.toString();
        });

        pythonProcess.on('close', (code) => {
          if (code === 0) {
            try {
              const result = JSON.parse(output);
              resolve(result);
            } catch (e) {
              reject(new Error(`Failed to parse AI response: ${e.message}`));
            }
          } else {
            reject(new Error(`Python script failed with code ${code}: ${errorOutput}`));
          }
        });

        // Send graph data to Python script
        pythonProcess.stdin.write(JSON.stringify(graphData));
        pythonProcess.stdin.end();
      });
    } catch (error) {
      console.error('❌ 그래프 AI 분석 실패:', error);
      throw error;
    }
  }
}

module.exports = AnalysisService;