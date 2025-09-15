const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const GraphService = require('./GraphService');
const dbManager = require('../config/database');
const { validateNode, validateEdge, COLLECTIONS } = require('../models/schemas');

class UploadService {
  static async getDatabase() {
    if (!dbManager.isConnected()) {
      await dbManager.connect();
    }
    return dbManager.getDatabase();
  }

  // 파일 처리 메인 함수
  static async processFile(file, options = {}) {
    const uploadId = uuidv4();
    const startTime = Date.now();
    
    try {
      console.log(`📁 파일 처리 시작: ${file.originalname}`);
      
      // 업로드 히스토리 생성
      await this.createUploadHistory({
        uploadId,
        originalFilename: file.originalname,
        fileSize: file.size,
        fileType: path.extname(file.originalname).toLowerCase(),
        uploadMethod: 'file',
        status: 'processing'
      });

      // 파일 타입에 따른 처리
      let processedData;
      const fileExtension = path.extname(file.originalname).toLowerCase();
      
      switch (fileExtension) {
        case '.csv':
          processedData = await this.processCSVFile(file, options);
          break;
        case '.json':
          processedData = await this.processJSONFile(file, options);
          break;
        case '.pdf':
          processedData = await this.processPDFFile(file, options);
          break;
        default:
          throw new Error(`지원하지 않는 파일 형식: ${fileExtension}`);
      }

      // 그래프 생성
      const graphResult = await GraphService.createGraph({
        nodes: processedData.nodes,
        edges: processedData.edges,
        metadata: {
          ...processedData.metadata,
          source_file: file.originalname,
          file_type: fileExtension.substring(1),
          upload_method: 'file',
          processing_options: options
        }
      });

      const processingTime = Date.now() - startTime;

      // 업로드 히스토리 업데이트
      await this.updateUploadHistory(uploadId, {
        status: 'completed',
        nodes_created: processedData.nodes.length,
        edges_created: processedData.edges.length,
        processing_time: processingTime,
        graph_id: graphResult.graphId,
        completed_at: new Date().toISOString()
      });

      // 임시 파일 삭제
      try {
        await fs.unlink(file.path);
      } catch (unlinkError) {
        console.warn('임시 파일 삭제 실패:', unlinkError.message);
      }

      console.log(`✅ 파일 처리 완료: ${file.originalname} (${processingTime}ms)`);

      return {
        uploadId,
        graphId: graphResult.graphId,
        nodes: processedData.nodes.length,
        edges: processedData.edges.length,
        processingTime,
        metadata: processedData.metadata
      };

    } catch (error) {
      console.error(`❌ 파일 처리 실패: ${file.originalname}`, error);
      
      // 실패 상태 업데이트
      try {
        await this.updateUploadHistory(uploadId, {
          status: 'failed',
          error_message: error.message,
          completed_at: new Date().toISOString()
        });
      } catch (updateError) {
        console.error('업로드 히스토리 업데이트 실패:', updateError);
      }

      // 임시 파일 정리
      if (file && file.path) {
        try {
          await fs.unlink(file.path);
        } catch (unlinkError) {
          console.warn('임시 파일 삭제 실패:', unlinkError.message);
        }
      }

      throw error;
    }
  }

  // CSV 파일 처리
  static async processCSVFile(file, options) {
    try {
      const content = await fs.readFile(file.path, 'utf-8');
      const csvData = this.parseCSV(content);

      if (csvData.length === 0) {
        throw new Error('CSV 파일이 비어있습니다');
      }

      // CSV를 지식그래프로 변환
      const graphData = await this.csvToKnowledgeGraph(csvData, {
        maxKeywords: options.maxKeywords || 10,
        minFrequency: options.minFrequency || 2,
        includeAuthors: options.includeAuthors !== false,
        includeJournals: options.includeJournals !== false
      });

      return {
        nodes: graphData.nodes,
        edges: graphData.edges,
        metadata: {
          title: `Knowledge Graph from ${file.originalname}`,
          description: `Generated from CSV file with ${csvData.length} rows`,
          source_papers: csvData.length
        }
      };

    } catch (error) {
      throw new Error(`CSV 처리 실패: ${error.message}`);
    }
  }

  // JSON 파일 처리
  static async processJSONFile(file, options) {
    try {
      const content = await fs.readFile(file.path, 'utf-8');
      const jsonData = JSON.parse(content);

      // JSON 구조 검증
      if (!jsonData.nodes || !Array.isArray(jsonData.nodes)) {
        throw new Error('올바른 노드 배열이 없습니다');
      }

      if (!jsonData.edges || !Array.isArray(jsonData.edges)) {
        throw new Error('올바른 엣지 배열이 없습니다');
      }

      // 데이터 정규화
      const normalizedNodes = jsonData.nodes.map((node, index) => ({
        id: node.id || `node_${index}`,
        label: node.label || node.name || `Node ${index}`,
        size: Math.max(10, Math.min(50, node.size || 20)),
        type: node.type || 'concept',
        attributes: node.attributes || {}
      }));

      const normalizedEdges = jsonData.edges.map(edge => ({
        source: edge.source || edge.from,
        target: edge.target || edge.to,
        weight: Math.max(1, edge.weight || edge.value || 1),
        relationship_type: edge.relationship_type || edge.type || 'RELATED_TO',
        attributes: edge.attributes || {}
      }));

      return {
        nodes: normalizedNodes,
        edges: normalizedEdges,
        metadata: {
          title: jsonData.metadata?.title || `Knowledge Graph from ${file.originalname}`,
          description: jsonData.metadata?.description || 'Imported from JSON file',
          ...jsonData.metadata
        }
      };

    } catch (error) {
      throw new Error(`JSON 처리 실패: ${error.message}`);
    }
  }

  // PDF 파일 처리 (기본 구현 - 추후 확장 가능)
  static async processPDFFile(file, options) {
    try {
      // 실제 구현에서는 PDF 파싱 라이브러리 사용
      // 현재는 기본 응답 반환
      console.warn('PDF 처리는 현재 기본 구현입니다. 추후 PDF.js 통합 예정');
      
      return {
        nodes: [
          {
            id: 'pdf_document',
            label: path.basename(file.originalname, '.pdf'),
            size: 30,
            type: 'document',
            attributes: {
              file_type: 'pdf',
              file_size: file.size
            }
          }
        ],
        edges: [],
        metadata: {
          title: `PDF Document: ${file.originalname}`,
          description: 'PDF file uploaded - full text extraction pending',
          file_type: 'pdf'
        }
      };

    } catch (error) {
      throw new Error(`PDF 처리 실패: ${error.message}`);
    }
  }

  // URL에서 파일 처리
  static async processFromURL(url, options = {}) {
    const uploadId = uuidv4();
    
    try {
      console.log(`🔗 URL에서 파일 다운로드 중: ${url}`);
      
      // 간단한 URL 다운로드 구현 (실제로는 더 견고한 구현 필요)
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const content = await response.text();
      const filename = path.basename(new URL(url).pathname) || 'downloaded_file';
      const fileExtension = path.extname(filename).toLowerCase();

      // 임시 파일 생성
      const tempFilePath = path.join(process.env.UPLOAD_DIR || './uploads', `${uploadId}_${filename}`);
      await fs.writeFile(tempFilePath, content);

      // 가상 파일 객체 생성
      const mockFile = {
        originalname: filename,
        path: tempFilePath,
        size: Buffer.byteLength(content, 'utf8')
      };

      // 기존 파일 처리 로직 재사용
      return await this.processFile(mockFile, options);

    } catch (error) {
      throw new Error(`URL 파일 처리 실패: ${error.message}`);
    }
  }

  // CSV 파싱
  static parseCSV(csvText) {
    const lines = csvText.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];

    // 헤더 처리
    const headers = lines[0].split(',').map(h => 
      h.trim().toLowerCase().replace(/['"]/g, '').replace(/\s+/g, '_')
    );

    const data = [];
    for (let i = 1; i < lines.length; i++) {
      try {
        const values = this.parseCSVLine(lines[i]);
        if (values.length >= headers.length) {
          const row = {};
          headers.forEach((header, index) => {
            row[header] = values[index] ? values[index].trim().replace(/['"]/g, '') : '';
          });
          data.push(row);
        }
      } catch (error) {
        console.warn(`CSV 라인 ${i + 1} 파싱 실패:`, error.message);
      }
    }

    return data;
  }

  // CSV 라인 파싱
  static parseCSVLine(line) {
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

  // CSV를 지식그래프로 변환
  static async csvToKnowledgeGraph(papers, config) {
    const nodes = new Map();
    const edges = new Map();
    const paperKeywords = [];

    // 각 논문에서 키워드 추출
    papers.forEach((paper, index) => {
      const keywords = new Set();

      // 기존 키워드 필드에서 추출
      const keywordFields = ['keywords', 'keyword', 'tags', 'subjects'];
      keywordFields.forEach(field => {
        if (paper[field] && paper[field].trim()) {
          paper[field].split(/[,;|]/)
            .map(k => k.trim().toLowerCase())
            .filter(k => k.length > 2)
            .forEach(k => keywords.add(k));
        }
      });

      // 제목과 초록에서 키워드 추출
      const titleFields = ['title', 'paper_title', 'article_title'];
      const abstractFields = ['abstract', 'description', 'summary'];
      
      let combinedText = '';
      titleFields.forEach(field => {
        if (paper[field]) combinedText += ' ' + paper[field];
      });
      abstractFields.forEach(field => {
        if (paper[field]) combinedText += ' ' + paper[field];
      });

      if (combinedText.trim()) {
        const extractedKeywords = this.extractKeywords(combinedText, config.maxKeywords);
        extractedKeywords.forEach(kw => keywords.add(kw.word));
      }

      paperKeywords.push({
        paper: paper,
        keywords: Array.from(keywords)
      });
    });

    // 빈도 계산 및 노드 생성
    const keywordFreq = new Map();
    paperKeywords.forEach(pk => {
      pk.keywords.forEach(keyword => {
        keywordFreq.set(keyword, (keywordFreq.get(keyword) || 0) + 1);
      });
    });

    // 최소 빈도 이상의 키워드만 노드로 생성
    Array.from(keywordFreq.entries())
      .filter(([keyword, freq]) => freq >= config.minFrequency)
      .forEach(([keyword, freq]) => {
        const relatedPapers = paperKeywords
          .filter(pk => pk.keywords.includes(keyword))
          .map(pk => pk.paper);

        const nodeId = `keyword_${keyword.replace(/\s+/g, '_')}`;
        const size = Math.min(50, Math.max(10, freq * 5));

        nodes.set(nodeId, {
          id: nodeId,
          label: keyword,
          type: 'keyword',
          size: size,
          attributes: {
            frequency: freq,
            paper_count: relatedPapers.length,
            related_papers: relatedPapers.slice(0, 5).map(p => 
              p.title || p.paper_title || 'Untitled'
            )
          }
        });
      });

    // 엣지 생성 (동시 출현 기반)
    paperKeywords.forEach(pk => {
      const validKeywords = pk.keywords.filter(k => keywordFreq.get(k) >= config.minFrequency);
      
      for (let i = 0; i < validKeywords.length; i++) {
        for (let j = i + 1; j < validKeywords.length; j++) {
          const kw1 = validKeywords[i];
          const kw2 = validKeywords[j];
          
          const id1 = `keyword_${kw1.replace(/\s+/g, '_')}`;
          const id2 = `keyword_${kw2.replace(/\s+/g, '_')}`;
          const edgeKey = id1 < id2 ? `${id1}__${id2}` : `${id2}__${id1}`;
          
          if (edges.has(edgeKey)) {
            edges.get(edgeKey).weight++;
          } else {
            edges.set(edgeKey, {
              source: id1,
              target: id2,
              weight: 1,
              relationship_type: 'CO_OCCURS'
            });
          }
        }
      }
    });

    return {
      nodes: Array.from(nodes.values()),
      edges: Array.from(edges.values())
    };
  }

  // 텍스트에서 키워드 추출
  static extractKeywords(text, maxKeywords = 10) {
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2);

    const wordCount = {};
    words.forEach(word => {
      wordCount[word] = (wordCount[word] || 0) + 1;
    });

    return Object.entries(wordCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxKeywords)
      .map(([word, count]) => ({ word, count }));
  }

  // 업로드 히스토리 생성
  static async createUploadHistory(historyData) {
    const db = await this.getDatabase();
    
    try {
      const collection = db.collection(COLLECTIONS.UPLOAD_HISTORY);
      const doc = {
        _key: historyData.uploadId,
        upload_id: historyData.uploadId,
        original_filename: historyData.originalFilename,
        file_size: historyData.fileSize,
        file_type: historyData.fileType,
        upload_method: historyData.uploadMethod,
        status: historyData.status,
        created_at: new Date().toISOString()
      };

      return await collection.save(doc);
    } catch (error) {
      throw new Error(`업로드 히스토리 생성 실패: ${error.message}`);
    }
  }

  // 업로드 히스토리 업데이트
  static async updateUploadHistory(uploadId, updateData) {
    const db = await this.getDatabase();
    
    try {
      const collection = db.collection(COLLECTIONS.UPLOAD_HISTORY);
      return await collection.update(uploadId, updateData);
    } catch (error) {
      console.error(`업로드 히스토리 업데이트 실패: ${error.message}`);
    }
  }

  // 업로드 히스토리 조회
  static async getUploadHistory(options = {}) {
    const db = await this.getDatabase();
    const { limit = 20, offset = 0 } = options;

    try {
      const query = `
        FOR doc IN ${COLLECTIONS.UPLOAD_HISTORY}
        SORT doc.created_at DESC
        LIMIT @offset, @limit
        RETURN doc
      `;

      const result = await db.query(query, { limit, offset });
      return await result.all();
    } catch (error) {
      throw new Error(`업로드 히스토리 조회 실패: ${error.message}`);
    }
  }

  // 특정 업로드 결과 조회
  static async getUploadResult(uploadId) {
    const db = await this.getDatabase();

    try {
      const collection = db.collection(COLLECTIONS.UPLOAD_HISTORY);
      return await collection.document(uploadId);
    } catch (error) {
      if (error.isArangoError && error.errorNum === 1202) {
        return null;
      }
      throw new Error(`업로드 결과 조회 실패: ${error.message}`);
    }
  }

  // 업로드 삭제
  static async deleteUpload(uploadId) {
    const db = await this.getDatabase();

    try {
      // 업로드 히스토리 조회
      const uploadHistory = await this.getUploadResult(uploadId);
      if (!uploadHistory) {
        throw new Error('업로드 기록을 찾을 수 없습니다');
      }

      // 관련 그래프 데이터 삭제 (선택적)
      if (uploadHistory.graph_id) {
        // 실제로는 사용자에게 확인을 받아야 함
        console.log(`그래프 ${uploadHistory.graph_id} 삭제는 별도로 수행해야 합니다`);
      }

      // 업로드 히스토리 삭제
      const collection = db.collection(COLLECTIONS.UPLOAD_HISTORY);
      await collection.remove(uploadId);

      return { message: '업로드 기록이 삭제되었습니다' };
    } catch (error) {
      throw new Error(`업로드 삭제 실패: ${error.message}`);
    }
  }
}

module.exports = UploadService;