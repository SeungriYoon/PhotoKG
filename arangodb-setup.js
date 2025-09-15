// ArangoDB 초기 설정 스크립트
const { Database } = require('arangojs');

async function setupPhotoRAGDatabase() {
    // 데이터베이스 연결
    const db = new Database({
        url: 'http://localhost:8529',
        databaseName: '_system',
        auth: { username: 'root', password: 'photorag123' }
    });

    try {
        // 1. photorag_db 데이터베이스 생성
        await db.createDatabase('photorag_db');
        console.log('✅ 데이터베이스 생성 완료: photorag_db');
        
        // 생성된 데이터베이스로 전환
        const photoragDB = db.database('photorag_db');
        
        // 2. 컬렉션 생성
        
        // 논문 컬렉션 (Document Collection)
        const papersCollection = await photoragDB.createCollection('papers');
        console.log('✅ papers 컬렉션 생성 완료');
        
        // 키워드 컬렉션 (Document Collection)  
        const keywordsCollection = await photoragDB.createCollection('keywords');
        console.log('✅ keywords 컬렉션 생성 완료');
        
        // 저자 컬렉션 (Document Collection)
        const authorsCollection = await photoragDB.createCollection('authors');
        console.log('✅ authors 컬렉션 생성 완료');
        
        // 저널 컬렉션 (Document Collection)
        const journalsCollection = await photoragDB.createCollection('journals');
        console.log('✅ journals 컬렉션 생성 완료');
        
        // 관계 컬렉션들 (Edge Collections)
        const paperKeywordsEdge = await photoragDB.createEdgeCollection('paper_keywords');
        console.log('✅ paper_keywords 엣지 컬렉션 생성 완료');
        
        const paperAuthorsEdge = await photoragDB.createEdgeCollection('paper_authors');
        console.log('✅ paper_authors 엣지 컬렉션 생성 완료');
        
        const paperJournalsEdge = await photoragDB.createEdgeCollection('paper_journals');
        console.log('✅ paper_journals 엣지 컬렉션 생성 완료');
        
        const citationsEdge = await photoragDB.createEdgeCollection('citations');
        console.log('✅ citations 엣지 컬렉션 생성 완료');

        // 3. 인덱스 생성 (검색 성능 향상)
        await papersCollection.ensureIndex({
            type: 'persistent',
            fields: ['title', 'abstract'],
            name: 'text_search_index'
        });
        
        await papersCollection.ensureIndex({
            type: 'persistent', 
            fields: ['year', 'doi'],
            name: 'metadata_index'
        });
        
        await keywordsCollection.ensureIndex({
            type: 'persistent',
            fields: ['name'],
            name: 'keyword_name_index'
        });

        console.log('✅ 인덱스 생성 완료');
        console.log('🎉 ArangoDB 초기 설정 완료!');
        
    } catch (error) {
        console.error('❌ 설정 오류:', error.message);
    }
}

// 샘플 논문 데이터 구조
const samplePaper = {
    _key: 'paper_001',
    title: 'Photosynthetic Light Reactions in Chloroplasts',
    abstract: 'This study investigates the mechanisms of photosynthetic light reactions...',
    authors: ['Smith, J.', 'Johnson, A.', 'Brown, K.'],
    journal: 'Nature Photosynthesis',
    year: 2023,
    doi: '10.1038/s41477-023-01234-5',
    citation_count: 45,
    keywords: ['photosynthesis', 'chloroplast', 'light reactions', 'PSII', 'electron transport'],
    url: 'https://doi.org/10.1038/s41477-023-01234-5',
    impact_factor: 15.3,
    
    // PEO 분석 결과 저장용 필드
    peo_categories: {
        'Photosystem_Proteins': 0.85,
        'Light_Reactions': 0.92,
        'Chloroplast_Structure': 0.67
    },
    
    // 메타데이터
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    source: 'csv_import'
};

module.exports = { setupPhotoRAGDatabase, samplePaper };

// 직접 실행시
if (require.main === module) {
    setupPhotoRAGDatabase();
}