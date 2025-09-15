#!/usr/bin/env node

/**
 * ArangoDB 데이터베이스 초기화 스크립트
 * 
 * 실행 방법:
 * node scripts/init-database.js
 * 
 * 환경변수를 통한 설정:
 * ARANGODB_URL=http://localhost:8529
 * ARANGODB_DATABASE=knowledge_graph
 * ARANGODB_USERNAME=root
 * ARANGODB_PASSWORD=
 */

require('dotenv').config();
const { Database } = require('arangojs');
const { COLLECTIONS } = require('../models/schemas');

class DatabaseInitializer {
  constructor() {
    this.systemDb = null;
    this.db = null;
    this.databaseName = process.env.ARANGODB_DATABASE || 'knowledge_graph';
  }

  async initialize() {
    try {
      console.log('🚀 ArangoDB 초기화 시작...');
      
      // 시스템 데이터베이스 연결
      await this.connectToSystem();
      
      // 타겟 데이터베이스 생성
      await this.createDatabase();
      
      // 타겟 데이터베이스 연결
      await this.connectToTarget();
      
      // 컬렉션 생성
      await this.createCollections();
      
      // 인덱스 생성
      await this.createIndexes();
      
      // 기본 데이터 삽입
      await this.insertSampleData();
      
      console.log('✅ 데이터베이스 초기화 완료!');
      
    } catch (error) {
      console.error('❌ 초기화 실패:', error.message);
      process.exit(1);
    }
  }

  async connectToSystem() {
    try {
      this.systemDb = new Database({
        url: process.env.ARANGODB_URL || 'http://localhost:8529',
        auth: {
          username: process.env.ARANGODB_USERNAME || 'root',
          password: process.env.ARANGODB_PASSWORD || ''
        }
      });
      
      // 연결 테스트
      await this.systemDb.version();
      console.log('🔗 시스템 데이터베이스 연결 성공');
      
    } catch (error) {
      throw new Error(`시스템 데이터베이스 연결 실패: ${error.message}`);
    }
  }

  async createDatabase() {
    try {
      const databases = await this.systemDb.listDatabases();
      
      if (databases.includes(this.databaseName)) {
        console.log(`📊 데이터베이스 '${this.databaseName}' 이미 존재함`);
        return;
      }
      
      await this.systemDb.createDatabase(this.databaseName);
      console.log(`📊 데이터베이스 '${this.databaseName}' 생성 완료`);
      
    } catch (error) {
      throw new Error(`데이터베이스 생성 실패: ${error.message}`);
    }
  }

  async connectToTarget() {
    try {
      this.db = new Database({
        url: process.env.ARANGODB_URL || 'http://localhost:8529',
        databaseName: this.databaseName,
        auth: {
          username: process.env.ARANGODB_USERNAME || 'root',
          password: process.env.ARANGODB_PASSWORD || ''
        }
      });
      
      await this.db.version();
      console.log(`🔗 타겟 데이터베이스 '${this.databaseName}' 연결 성공`);
      
    } catch (error) {
      throw new Error(`타겟 데이터베이스 연결 실패: ${error.message}`);
    }
  }

  async createCollections() {
    const collections = [
      { name: COLLECTIONS.NODES, type: 'document' },
      { name: COLLECTIONS.EDGES, type: 'edge' },
      { name: COLLECTIONS.METADATA, type: 'document' },
      { name: COLLECTIONS.REFERENCES, type: 'document' },
      { name: COLLECTIONS.UPLOAD_HISTORY, type: 'document' },
      { name: COLLECTIONS.ANALYSIS_RESULTS, type: 'document' }
    ];

    for (const collectionInfo of collections) {
      await this.createCollection(collectionInfo.name, collectionInfo.type);
    }
  }

  async createCollection(name, type = 'document') {
    try {
      const existingCollections = await this.db.listCollections();
      const exists = existingCollections.some(col => col.name === name);
      
      if (exists) {
        console.log(`📁 컬렉션 '${name}' 이미 존재함`);
        return;
      }
      
      if (type === 'edge') {
        await this.db.createEdgeCollection(name);
      } else {
        await this.db.createCollection(name);
      }
      
      console.log(`📁 컬렉션 '${name}' (${type}) 생성 완료`);
      
    } catch (error) {
      throw new Error(`컬렉션 '${name}' 생성 실패: ${error.message}`);
    }
  }

  async createIndexes() {
    console.log('🔍 인덱스 생성 중...');
    
    try {
      // 노드 컬렉션 인덱스
      await this.createNodeIndexes();
      
      // 엣지 컬렉션 인덱스
      await this.createEdgeIndexes();
      
      // 메타데이터 컬렉션 인덱스
      await this.createMetadataIndexes();
      
      // 기타 컬렉션 인덱스
      await this.createOtherIndexes();
      
      console.log('🔍 모든 인덱스 생성 완료');
      
    } catch (error) {
      console.warn(`⚠️ 인덱스 생성 중 오류: ${error.message}`);
    }
  }

  async createNodeIndexes() {
    const collection = this.db.collection(COLLECTIONS.NODES);
    
    const indexes = [
      // 기본 검색 인덱스
      { type: 'hash', fields: ['label'], name: 'label_hash_idx' },
      { type: 'hash', fields: ['type'], name: 'type_hash_idx' },
      { type: 'skiplist', fields: ['size'], name: 'size_skiplist_idx' },
      
      // 복합 인덱스
      { type: 'hash', fields: ['type', 'graph_id'], name: 'type_graph_hash_idx' },
      { type: 'skiplist', fields: ['created_at'], name: 'created_at_skiplist_idx' },
      
      // 전문 검색을 위한 인덱스
      { type: 'fulltext', fields: ['label'], name: 'label_fulltext_idx' },
      
      // 속성 기반 인덱스
      { type: 'skiplist', fields: ['attributes.total_citations'], name: 'citations_skiplist_idx', sparse: true },
      { type: 'skiplist', fields: ['attributes.importance_score'], name: 'importance_skiplist_idx', sparse: true }
    ];

    for (const indexDef of indexes) {
      try {
        await collection.ensureIndex(indexDef);
        console.log(`  ✓ 노드 인덱스 '${indexDef.name}' 생성 완료`);
      } catch (error) {
        console.warn(`  ⚠️ 노드 인덱스 '${indexDef.name}' 생성 실패: ${error.message}`);
      }
    }
  }

  async createEdgeIndexes() {
    const collection = this.db.collection(COLLECTIONS.EDGES);
    
    const indexes = [
      // 관계 타입 인덱스
      { type: 'hash', fields: ['relationship_type'], name: 'relationship_type_hash_idx' },
      
      // 가중치 인덱스
      { type: 'skiplist', fields: ['weight'], name: 'weight_skiplist_idx' },
      { type: 'skiplist', fields: ['confidence'], name: 'confidence_skiplist_idx' },
      
      // 복합 인덱스
      { type: 'hash', fields: ['relationship_type', 'graph_id'], name: 'rel_graph_hash_idx' },
      { type: 'skiplist', fields: ['created_at'], name: 'edge_created_at_skiplist_idx' }
    ];

    for (const indexDef of indexes) {
      try {
        await collection.ensureIndex(indexDef);
        console.log(`  ✓ 엣지 인덱스 '${indexDef.name}' 생성 완료`);
      } catch (error) {
        console.warn(`  ⚠️ 엣지 인덱스 '${indexDef.name}' 생성 실패: ${error.message}`);
      }
    }
  }

  async createMetadataIndexes() {
    const collection = this.db.collection(COLLECTIONS.METADATA);
    
    const indexes = [
      { type: 'hash', fields: ['file_type'], name: 'file_type_hash_idx' },
      { type: 'skiplist', fields: ['created_at'], name: 'meta_created_at_skiplist_idx' },
      { type: 'skiplist', fields: ['node_count'], name: 'node_count_skiplist_idx' },
      { type: 'fulltext', fields: ['title'], name: 'title_fulltext_idx' }
    ];

    for (const indexDef of indexes) {
      try {
        await collection.ensureIndex(indexDef);
        console.log(`  ✓ 메타데이터 인덱스 '${indexDef.name}' 생성 완료`);
      } catch (error) {
        console.warn(`  ⚠️ 메타데이터 인덱스 '${indexDef.name}' 생성 실패: ${error.message}`);
      }
    }
  }

  async createOtherIndexes() {
    // 업로드 히스토리 인덱스
    const uploadCollection = this.db.collection(COLLECTIONS.UPLOAD_HISTORY);
    await uploadCollection.ensureIndex({
      type: 'hash',
      fields: ['status'],
      name: 'status_hash_idx'
    });

    // 분석 결과 인덱스
    const analysisCollection = this.db.collection(COLLECTIONS.ANALYSIS_RESULTS);
    await analysisCollection.ensureIndex({
      type: 'hash',
      fields: ['analysis_type'],
      name: 'analysis_type_hash_idx'
    });
    
    console.log('  ✓ 기타 컬렉션 인덱스 생성 완료');
  }

  async insertSampleData() {
    console.log('📊 샘플 데이터 삽입 중...');
    
    try {
      // 샘플 노드 데이터
      const sampleNodes = [
        {
          _key: 'photosynthesis',
          label: 'Photosynthesis',
          size: 50,
          type: 'process',
          attributes: {
            importance_score: 5.0,
            frequency: 100
          }
        },
        {
          _key: 'chlorophyll',
          label: 'Chlorophyll',
          size: 40,
          type: 'material',
          attributes: {
            importance_score: 4.5,
            frequency: 80
          }
        },
        {
          _key: 'atp',
          label: 'ATP',
          size: 35,
          type: 'material',
          attributes: {
            importance_score: 4.0,
            frequency: 75
          }
        }
      ];

      // 샘플 엣지 데이터
      const sampleEdges = [
        {
          _from: 'nodes/photosynthesis',
          _to: 'nodes/chlorophyll',
          weight: 8,
          relationship_type: 'REQUIRES',
          confidence: 0.9
        },
        {
          _from: 'nodes/photosynthesis',
          _to: 'nodes/atp',
          weight: 7,
          relationship_type: 'PRODUCES',
          confidence: 0.95
        }
      ];

      // 샘플 메타데이터
      const sampleMetadata = {
        _key: 'sample_graph',
        title: 'Sample Knowledge Graph',
        description: 'Initial sample data for knowledge graph system',
        node_count: sampleNodes.length,
        edge_count: sampleEdges.length,
        source_file: 'init-script',
        file_type: 'system'
      };

      // 데이터 삽입
      await this.db.collection(COLLECTIONS.NODES).saveAll(sampleNodes);
      await this.db.collection(COLLECTIONS.EDGES).saveAll(sampleEdges);
      await this.db.collection(COLLECTIONS.METADATA).save(sampleMetadata);

      console.log('📊 샘플 데이터 삽입 완료');
      console.log(`  - 노드: ${sampleNodes.length}개`);
      console.log(`  - 엣지: ${sampleEdges.length}개`);
      console.log(`  - 메타데이터: 1개`);
      
    } catch (error) {
      console.warn(`⚠️ 샘플 데이터 삽입 실패: ${error.message}`);
    }
  }
}

// 스크립트 실행
if (require.main === module) {
  const initializer = new DatabaseInitializer();
  initializer.initialize();
}

module.exports = DatabaseInitializer;