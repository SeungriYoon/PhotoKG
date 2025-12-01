#!/usr/bin/env node

/**
 * ArangoDB 연결 테스트 스크립트
 * 
 * 실행 방법:
 * node scripts/test-connection.js
 */

require('dotenv').config();
const dbManager = require('../config/database');

async function testConnection() {
  console.log('🔍 ArangoDB 연결 테스트 시작...');
  console.log('');
  
  // 환경 변수 확인
  console.log('📋 설정 확인:');
  console.log(`  URL: ${process.env.ARANGODB_URL || 'http://localhost:8529'}`);
  console.log(`  Database: ${process.env.ARANGODB_DATABASE || 'knowledge_graph'}`);
  console.log(`  Username: ${process.env.ARANGODB_USERNAME || 'root'}`);
  console.log(`  Password: ${process.env.ARANGODB_PASSWORD ? '***' : '(empty)'}`);
  console.log('');

  try {
    // 데이터베이스 연결 테스트
    console.log('🔗 데이터베이스 연결 중...');
    const db = await dbManager.connect();
    
    // 버전 정보 확인
    const version = await db.version();
    console.log(`✅ ArangoDB 연결 성공!`);
    console.log(`  버전: ${version.version}`);
    console.log(`  서버: ${version.server}`);
    console.log('');

    // 데이터베이스 목록 확인
    console.log('📊 데이터베이스 목록:');
    const databases = await db.listDatabases();
    databases.forEach(dbName => {
      const current = dbName === (process.env.ARANGODB_DATABASE || 'knowledge_graph');
      console.log(`  ${current ? '→' : ' '} ${dbName}`);
    });
    console.log('');

    // 컬렉션 목록 확인
    console.log('📁 컬렉션 목록:');
    const collections = await db.listCollections();
    if (collections.length === 0) {
      console.log('  (컬렉션이 없습니다. init-database.js를 실행하세요)');
    } else {
      collections.forEach(col => {
        const type = col.type === 3 ? '[edge]' : '[document]';
        console.log(`  ${type} ${col.name}`);
      });
    }
    console.log('');

    // 기본 통계 확인
    if (collections.length > 0) {
      console.log('📊 컬렉션 통계:');
      for (const col of collections) {
        try {
          const collection = db.collection(col.name);
          const count = await collection.count();
          console.log(`  ${col.name}: ${count.count}개 문서`);
        } catch (error) {
          console.log(`  ${col.name}: 통계 조회 실패`);
        }
      }
      console.log('');
    }

    // 샘플 쿼리 실행
    console.log('🔍 샘플 쿼리 테스트:');
    try {
      const query = 'FOR doc IN @@collection LIMIT 1 RETURN doc';
      const nodeCollection = collections.find(c => c.name === 'nodes');
      
      if (nodeCollection) {
        const result = await db.query(query, { '@collection': 'nodes' });
        const docs = await result.all();
        console.log(`  nodes 컬렉션 샘플: ${docs.length > 0 ? '✅ 조회 성공' : '⚠️ 데이터 없음'}`);
      } else {
        console.log('  nodes 컬렉션이 없습니다.');
      }
    } catch (error) {
      console.log(`  쿼리 실행 실패: ${error.message}`);
    }
    console.log('');

    console.log('✅ 모든 테스트 완료!');
    console.log('');
    console.log('📝 다음 단계:');
    console.log('  1. 컬렉션이 없다면: npm run init-db');
    console.log('  2. 백엔드 서버 시작: npm run dev');
    console.log('  3. API 테스트: http://localhost:3015/health');

  } catch (error) {
    console.error('❌ 연결 테스트 실패:');
    console.error(`  오류: ${error.message}`);
    console.log('');
    console.log('🔧 문제 해결 방법:');
    console.log('  1. ArangoDB가 실행 중인지 확인');
    console.log('  2. 연결 정보(.env)가 올바른지 확인');
    console.log('  3. 네트워크 접근 권한 확인');
    console.log('  4. ArangoDB 로그 확인');
    
    process.exit(1);
  }
}

// 스크립트 실행
if (require.main === module) {
  testConnection();
}

module.exports = testConnection;