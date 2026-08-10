const { Database } = require('arangojs');

class DatabaseManager {
  constructor() {
    this.db = null;
    this.connected = false;
  }

  async connect() {
    try {
      // ArangoDB connection settings
      // Try with different auth configurations
      try {
        // First try with no auth
        this.db = new Database({
          url: process.env.ARANGODB_URL || 'http://localhost:8529',
          databaseName: process.env.ARANGODB_DATABASE || 'knowledge_graph'
        });
        await this.db.version();
      } catch (error) {
        // If no auth fails, try with auth
        this.db = new Database({
          url: process.env.ARANGODB_URL || 'http://localhost:8529',
          databaseName: process.env.ARANGODB_DATABASE || 'knowledge_graph',
          auth: {
            username: process.env.ARANGODB_USERNAME || 'root',
            password: process.env.ARANGODB_PASSWORD || 'newpassword123'
          }
        });
      }

      // Connection test
      await this.db.version();
      
      // Check database existence and create if needed
      await this.ensureDatabase();
      
      // 컬렉션 초기화
      await this.initializeCollections();
      
      this.connected = true;
      console.log('✅ ArangoDB connection successful');
      
      return this.db;
    } catch (error) {
      console.error('❌ ArangoDB 연결 실패:', error.message);
      throw error;
    }
  }

  async ensureDatabase() {
    try {
      const databaseName = process.env.ARANGODB_DATABASE || 'knowledge_graph';
      
      // 시스템 데이터베이스로 연결 (same auth config as main connection)
      let systemDb;
      try {
        // Try with no auth first
        systemDb = new Database({
          url: process.env.ARANGODB_URL || 'http://localhost:8529'
        });
        await systemDb.version();
      } catch (error) {
        // If no auth fails, try with auth
        systemDb = new Database({
          url: process.env.ARANGODB_URL || 'http://localhost:8529',
          auth: {
            username: process.env.ARANGODB_USERNAME || 'root',
            password: process.env.ARANGODB_PASSWORD || 'newpassword123'
          }
        });
      }

      // 데이터베이스 목록 확인
      const databases = await systemDb.listDatabases();
      
      if (!databases.includes(databaseName)) {
        console.log(`📊 데이터베이스 '${databaseName}' 생성 중...`);
        await systemDb.createDatabase(databaseName);
        console.log(`✅ 데이터베이스 '${databaseName}' 생성 완료`);
      }
    } catch (error) {
      console.error('데이터베이스 확인/생성 실패:', error.message);
      throw error;
    }
  }

  async initializeCollections() {
    try {
      // 노드 컬렉션 (문서 컬렉션)
      await this.ensureCollection('nodes', 'document');
      
      // 엣지 컬렉션 (엣지 컬렉션)
      await this.ensureCollection('edges', 'edge');
      
      // 메타데이터 컬렉션
      await this.ensureCollection('metadata', 'document');
      
      // 참고문헌 컬렉션
      await this.ensureCollection('references', 'document');
      
      console.log('✅ 컬렉션 초기화 완료');
    } catch (error) {
      console.error('컬렉션 초기화 실패:', error.message);
      throw error;
    }
  }

  async ensureCollection(name, type = 'document') {
    try {
      const collections = await this.db.listCollections();
      const exists = collections.some(col => col.name === name);
      
      if (!exists) {
        console.log(`📁 컬렉션 '${name}' 생성 중...`);
        
        if (type === 'edge') {
          await this.db.createEdgeCollection(name);
        } else {
          await this.db.createCollection(name);
        }
        
        // 인덱스 생성
        await this.createIndexes(name, type);
        
        console.log(`✅ 컬렉션 '${name}' 생성 완료`);
      }
    } catch (error) {
      console.error(`컬렉션 '${name}' 생성 실패:`, error.message);
      throw error;
    }
  }

  async createIndexes(collectionName, type) {
    try {
      const collection = this.db.collection(collectionName);
      
      if (collectionName === 'nodes') {
        // 노드 컬렉션 인덱스
        await collection.ensureIndex({
          type: 'hash',
          fields: ['label'],
          name: 'label_hash_idx'
        });
        
        await collection.ensureIndex({
          type: 'hash',
          fields: ['type'],
          name: 'type_hash_idx'
        });

        await collection.ensureIndex({
          type: 'hash',
          fields: ['graph_source'],
          name: 'graph_source_hash_idx'
        });
        
        await collection.ensureIndex({
          type: 'skiplist',
          fields: ['size'],
          name: 'size_skiplist_idx'
        });
        
      } else if (collectionName === 'edges') {
        // 엣지 컬렉션 인덱스
        await collection.ensureIndex({
          type: 'hash',
          fields: ['relationship_type'],
          name: 'relationship_type_hash_idx'
        });

        await collection.ensureIndex({
          type: 'hash',
          fields: ['graph_source'],
          name: 'edge_graph_source_hash_idx'
        });
        
        await collection.ensureIndex({
          type: 'skiplist',
          fields: ['weight'],
          name: 'weight_skiplist_idx'
        });
      }
      
    } catch (error) {
      console.warn(`인덱스 생성 경고 (${collectionName}):`, error.message);
    }
  }

  getDatabase() {
    if (!this.connected || !this.db) {
      throw new Error('데이터베이스가 연결되지 않았습니다');
    }
    return this.db;
  }

  async disconnect() {
    if (this.db) {
      // ArangoDB 클라이언트는 명시적 연결 해제가 필요하지 않음
      this.connected = false;
      console.log('🔌 ArangoDB 연결 해제');
    }
  }

  isConnected() {
    return this.connected;
  }
}

// 싱글톤 인스턴스 생성
const dbManager = new DatabaseManager();

module.exports = dbManager;
