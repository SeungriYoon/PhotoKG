#!/usr/bin/env node

/**
 * 데이터 마이그레이션 스크립트
 * 
 * 기존 클라이언트 사이드 데이터를 ArangoDB로 마이그레이션
 * 
 * 실행 방법:
 * node scripts/migrate-data.js --source ./data/client-graph.json
 * node scripts/migrate-data.js --source ./data/ --format csv
 * node scripts/migrate-data.js --source ./data/ --batch
 */

require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const { program } = require('commander');
const dbManager = require('../config/database');
const DataTransformer = require('../utils/dataTransformer');
const GraphService = require('../services/GraphService');

class DataMigrator {
  constructor() {
    this.stats = {
      processed: 0,
      successful: 0,
      failed: 0,
      nodes: 0,
      edges: 0,
      startTime: null,
      endTime: null
    };
  }

  async migrate(options) {
    this.stats.startTime = Date.now();
    
    try {
      console.log('🚀 데이터 마이그레이션 시작...');
      console.log(`📂 소스: ${options.source}`);
      console.log(`📄 형식: ${options.format}`);
      console.log('');

      // 데이터베이스 연결
      await this.connectDatabase();

      // 소스 파일/디렉토리 처리
      if (options.batch) {
        await this.migrateBatch(options);
      } else {
        await this.migrateSingle(options);
      }

      this.stats.endTime = Date.now();
      this.printSummary();

    } catch (error) {
      console.error('❌ 마이그레이션 실패:', error.message);
      process.exit(1);
    }
  }

  async connectDatabase() {
    try {
      console.log('🔗 데이터베이스 연결 중...');
      await dbManager.connect();
      console.log('✅ 데이터베이스 연결 성공');
      console.log('');
    } catch (error) {
      throw new Error(`데이터베이스 연결 실패: ${error.message}`);
    }
  }

  async migrateSingle(options) {
    const { source, format, dryRun } = options;
    
    try {
      // 파일 존재 확인
      const stats = await fs.stat(source);
      if (!stats.isFile()) {
        throw new Error(`${source}는 파일이 아닙니다`);
      }

      console.log(`📄 파일 처리 중: ${source}`);
      
      // 파일 읽기
      const content = await fs.readFile(source, 'utf-8');
      
      // 형식에 따른 파싱
      let clientData;
      switch (format) {
        case 'json':
          clientData = JSON.parse(content);
          break;
        case 'csv':
          clientData = await this.parseCSVFile(content, source);
          break;
        default:
          // 확장자로 추정
          const ext = path.extname(source).toLowerCase();
          if (ext === '.json') {
            clientData = JSON.parse(content);
          } else if (ext === '.csv') {
            clientData = await this.parseCSVFile(content, source);
          } else {
            throw new Error(`지원하지 않는 파일 형식: ${ext}`);
          }
      }

      // 데이터 변환
      const transformResult = DataTransformer.transformKnowledgeGraph(clientData);
      
      this.stats.processed++;
      
      // 검증 오류 출력
      this.printValidationErrors(transformResult.validationErrors);

      if (dryRun) {
        console.log('🔍 DRY RUN 모드: 실제 저장하지 않음');
        console.log(`변환 결과: 노드 ${transformResult.nodes.length}개, 엣지 ${transformResult.edges.length}개`);
        return;
      }

      // 데이터베이스에 저장
      if (transformResult.nodes.length > 0 || transformResult.edges.length > 0) {
        const graphResult = await GraphService.createGraph({
          nodes: transformResult.nodes,
          edges: transformResult.edges,
          metadata: {
            ...transformResult.metadata,
            source_file: path.basename(source),
            migration_date: new Date().toISOString()
          }
        });

        console.log(`✅ 저장 완료: 그래프 ID ${graphResult.graphId}`);
        console.log(`  노드: ${transformResult.nodes.length}개`);
        console.log(`  엣지: ${transformResult.edges.length}개`);
        
        this.stats.successful++;
        this.stats.nodes += transformResult.nodes.length;
        this.stats.edges += transformResult.edges.length;
      } else {
        console.log('⚠️ 변환된 노드/엣지가 없어 저장하지 않음');
      }

    } catch (error) {
      console.error(`❌ 파일 처리 실패: ${source}`, error.message);
      this.stats.failed++;
    }
  }

  async migrateBatch(options) {
    const { source, format, dryRun } = options;
    
    try {
      // 디렉토리 확인
      const stats = await fs.stat(source);
      if (!stats.isDirectory()) {
        throw new Error(`${source}는 디렉토리가 아닙니다`);
      }

      console.log(`📁 디렉토리 처리 중: ${source}`);
      
      // 파일 목록 조회
      const files = await fs.readdir(source);
      const targetFiles = files.filter(file => {
        const ext = path.extname(file).toLowerCase();
        return format ? file.endsWith(`.${format}`) : ['.json', '.csv'].includes(ext);
      });

      console.log(`📄 처리할 파일 ${targetFiles.length}개 발견`);
      console.log('');

      // 각 파일 처리
      for (const file of targetFiles) {
        const filePath = path.join(source, file);
        console.log(`📄 처리 중: ${file}`);
        
        try {
          await this.migrateSingle({
            source: filePath,
            format: format || path.extname(file).substring(1),
            dryRun
          });
          console.log('');
        } catch (error) {
          console.error(`❌ 파일 처리 실패: ${file}`, error.message);
          console.log('');
        }
      }

    } catch (error) {
      throw new Error(`배치 처리 실패: ${error.message}`);
    }
  }

  async parseCSVFile(content, filename) {
    // CSV를 JSON 형식으로 변환
    const lines = content.split('\n').filter(line => line.trim());
    if (lines.length < 2) {
      throw new Error('CSV 파일이 비어있거나 헤더만 있습니다');
    }

    const headers = lines[0].split(',').map(h => h.trim().replace(/['"]/g, ''));
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCSVLine(lines[i]);
      if (values.length >= headers.length) {
        const row = {};
        headers.forEach((header, index) => {
          row[header] = values[index] ? values[index].trim().replace(/['"]/g, '') : '';
        });
        rows.push(row);
      }
    }

    // CSV 데이터를 지식그래프 형식으로 변환
    return {
      nodes: this.extractNodesFromCSV(rows),
      edges: this.extractEdgesFromCSV(rows),
      metadata: {
        title: `Knowledge Graph from ${path.basename(filename)}`,
        description: `Generated from CSV file with ${rows.length} rows`,
        source_file: filename,
        row_count: rows.length
      }
    };
  }

  parseCSVLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current);
    return values;
  }

  extractNodesFromCSV(rows) {
    const nodes = [];
    const nodeSet = new Set();

    rows.forEach((row, index) => {
      // 제목/이름 필드에서 노드 추출
      const titleFields = ['title', 'name', 'paper_title', 'article_title'];
      const keywordFields = ['keywords', 'tags', 'subjects'];
      
      titleFields.forEach(field => {
        if (row[field] && row[field].trim()) {
          const nodeId = `paper_${index}`;
          if (!nodeSet.has(nodeId)) {
            nodes.push({
              id: nodeId,
              label: row[field].trim(),
              type: 'concept',
              size: 25,
              attributes: {
                source_row: index,
                original_data: row
              }
            });
            nodeSet.add(nodeId);
          }
        }
      });

      // 키워드에서 노드 추출
      keywordFields.forEach(field => {
        if (row[field] && row[field].trim()) {
          const keywords = row[field].split(/[,;|]/).map(k => k.trim());
          keywords.forEach(keyword => {
            if (keyword.length > 2) {
              const nodeId = `keyword_${keyword.toLowerCase().replace(/\s+/g, '_')}`;
              if (!nodeSet.has(nodeId)) {
                nodes.push({
                  id: nodeId,
                  label: keyword,
                  type: 'keyword',
                  size: 15,
                  attributes: {
                    keyword: true
                  }
                });
                nodeSet.add(nodeId);
              }
            }
          });
        }
      });
    });

    return nodes;
  }

  extractEdgesFromCSV(rows) {
    const edges = [];
    const edgeSet = new Set();

    rows.forEach((row, index) => {
      const paperId = `paper_${index}`;
      const keywordFields = ['keywords', 'tags', 'subjects'];
      
      keywordFields.forEach(field => {
        if (row[field] && row[field].trim()) {
          const keywords = row[field].split(/[,;|]/).map(k => k.trim());
          keywords.forEach(keyword => {
            if (keyword.length > 2) {
              const keywordId = `keyword_${keyword.toLowerCase().replace(/\s+/g, '_')}`;
              const edgeKey = `${paperId}__${keywordId}`;
              
              if (!edgeSet.has(edgeKey)) {
                edges.push({
                  source: paperId,
                  target: keywordId,
                  weight: 2,
                  relationship_type: 'HAS_KEYWORD'
                });
                edgeSet.add(edgeKey);
              }
            }
          });
        }
      });
    });

    return edges;
  }

  printValidationErrors(errors) {
    if (errors.nodes.length > 0) {
      console.log(`⚠️ 노드 검증 오류 ${errors.nodes.length}개:`);
      errors.nodes.slice(0, 5).forEach(error => {
        console.log(`  인덱스 ${error.index}: ${error.errors.join(', ')}`);
      });
      if (errors.nodes.length > 5) {
        console.log(`  ... 및 ${errors.nodes.length - 5}개 더`);
      }
    }

    if (errors.edges.length > 0) {
      console.log(`⚠️ 엣지 검증 오류 ${errors.edges.length}개:`);
      errors.edges.slice(0, 3).forEach(error => {
        console.log(`  인덱스 ${error.index}: ${error.errors.join(', ')}`);
      });
      if (errors.edges.length > 3) {
        console.log(`  ... 및 ${errors.edges.length - 3}개 더`);
      }
    }

    if (errors.metadata.length > 0) {
      console.log(`⚠️ 메타데이터 검증 오류: ${errors.metadata.join(', ')}`);
    }
  }

  printSummary() {
    const duration = this.stats.endTime - this.stats.startTime;
    
    console.log('');
    console.log('📊 마이그레이션 완료 요약:');
    console.log('='.repeat(40));
    console.log(`처리된 파일: ${this.stats.processed}개`);
    console.log(`성공: ${this.stats.successful}개`);
    console.log(`실패: ${this.stats.failed}개`);
    console.log(`총 노드: ${this.stats.nodes}개`);
    console.log(`총 엣지: ${this.stats.edges}개`);
    console.log(`소요 시간: ${(duration / 1000).toFixed(2)}초`);
    
    if (this.stats.successful > 0) {
      console.log('');
      console.log('✅ 마이그레이션이 성공적으로 완료되었습니다!');
      console.log('🔗 웹 인터페이스에서 결과를 확인할 수 있습니다.');
    }
  }
}

// CLI 설정
program
  .name('migrate-data')
  .description('클라이언트 데이터를 ArangoDB로 마이그레이션')
  .version('1.0.0');

program
  .option('-s, --source <path>', '소스 파일 또는 디렉토리 경로', './data')
  .option('-f, --format <format>', '파일 형식 (json, csv)', null)
  .option('-b, --batch', '배치 모드 (디렉토리 내 모든 파일 처리)', false)
  .option('-d, --dry-run', 'DRY RUN 모드 (실제 저장하지 않음)', false)
  .action(async (options) => {
    const migrator = new DataMigrator();
    await migrator.migrate(options);
  });

// 예제 명령어 표시
program.on('--help', () => {
  console.log('');
  console.log('예제:');
  console.log('  $ node scripts/migrate-data.js --source ./data/graph.json');
  console.log('  $ node scripts/migrate-data.js --source ./data/ --batch --format csv');
  console.log('  $ node scripts/migrate-data.js --source ./data/papers.csv --dry-run');
  console.log('');
});

// 스크립트 실행
if (require.main === module) {
  // commander가 설치되지 않은 경우를 위한 대체
  if (!program.parse) {
    console.error('❌ commander 패키지가 필요합니다: npm install commander');
    process.exit(1);
  }
  
  program.parse();
}

module.exports = DataMigrator;