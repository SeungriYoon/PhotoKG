/**
 * 데이터 변환 유틸리티
 * 기존 클라이언트 사이드 데이터 모델을 ArangoDB 형식으로 변환
 */

const { v4: uuidv4 } = require('uuid');
const { validateNode, validateEdge, validateMetadata } = require('../models/schemas');

class DataTransformer {
  
  // 클라이언트 지식그래프를 ArangoDB 형식으로 변환
  static transformKnowledgeGraph(clientData) {
    console.log('🔄 클라이언트 데이터를 ArangoDB 형식으로 변환 중...');
    
    const { nodes = [], edges = [], metadata = {} } = clientData;
    
    // 변환 결과 객체
    const result = {
      nodes: [],
      edges: [],
      metadata: {},
      validationErrors: {
        nodes: [],
        edges: [],
        metadata: []
      }
    };

    // 노드 변환
    nodes.forEach((node, index) => {
      try {
        const transformedNode = this.transformNode(node, index);
        const { error, value } = validateNode(transformedNode);
        
        if (error) {
          result.validationErrors.nodes.push({
            index,
            originalNode: node,
            errors: error.details.map(d => d.message)
          });
        } else {
          result.nodes.push(value);
        }
      } catch (transformError) {
        result.validationErrors.nodes.push({
          index,
          originalNode: node,
          errors: [`변환 오류: ${transformError.message}`]
        });
      }
    });

    // 엣지 변환
    edges.forEach((edge, index) => {
      try {
        const transformedEdge = this.transformEdge(edge, index);
        const { error, value } = validateEdge(transformedEdge);
        
        if (error) {
          result.validationErrors.edges.push({
            index,
            originalEdge: edge,
            errors: error.details.map(d => d.message)
          });
        } else {
          result.edges.push(value);
        }
      } catch (transformError) {
        result.validationErrors.edges.push({
          index,
          originalEdge: edge,
          errors: [`변환 오류: ${transformError.message}`]
        });
      }
    });

    // 메타데이터 변환
    try {
      const transformedMetadata = this.transformMetadata(metadata);
      const { error, value } = validateMetadata(transformedMetadata);
      
      if (error) {
        result.validationErrors.metadata = error.details.map(d => d.message);
      } else {
        result.metadata = value;
      }
    } catch (transformError) {
      result.validationErrors.metadata = [`메타데이터 변환 오류: ${transformError.message}`];
    }

    console.log(`✅ 변환 완료: 노드 ${result.nodes.length}개, 엣지 ${result.edges.length}개`);
    
    if (result.validationErrors.nodes.length > 0 || 
        result.validationErrors.edges.length > 0 || 
        result.validationErrors.metadata.length > 0) {
      console.warn(`⚠️ 검증 오류 발견: 
        노드 ${result.validationErrors.nodes.length}개, 
        엣지 ${result.validationErrors.edges.length}개, 
        메타데이터 ${result.validationErrors.metadata.length}개`);
    }

    return result;
  }

  // 단일 노드 변환
  static transformNode(clientNode, index = 0) {
    // 클라이언트 노드 형식 예시:
    // {
    //   id: "node1",
    //   label: "Photosynthesis", 
    //   size: 30,
    //   type: "process",
    //   attributes: { ... }
    // }

    const transformed = {
      _key: this.sanitizeKey(clientNode.id) || `node_${index}`,
      label: clientNode.label || clientNode.name || `Node ${index}`,
      size: this.normalizeSize(clientNode.size),
      type: this.normalizeNodeType(clientNode.type),
      attributes: this.transformNodeAttributes(clientNode.attributes || {}),
      
      // 추가 필드들 변환
      definition: clientNode.definition || '',
      citations: Array.isArray(clientNode.citations) ? clientNode.citations : [],
      context: clientNode.context || '',
      
      // 메타데이터
      created_at: new Date().toISOString()
    };

    // 기존 클라이언트 필드들 중 유용한 것들 보존
    if (clientNode.page_reference) transformed.attributes.page_reference = clientNode.page_reference;
    if (clientNode.importance_score) transformed.attributes.importance_score = clientNode.importance_score;
    if (clientNode.value) transformed.attributes.value = clientNode.value;
    if (clientNode.unit) transformed.attributes.unit = clientNode.unit;
    if (clientNode.formula) transformed.attributes.formula = clientNode.formula;

    return transformed;
  }

  // 단일 엣지 변환
  static transformEdge(clientEdge, index = 0) {
    // 클라이언트 엣지 형식 예시:
    // {
    //   source: "node1",
    //   target: "node2", 
    //   weight: 5,
    //   relationship_type: "INFLUENCES"
    // }

    const transformed = {
      _from: `nodes/${this.sanitizeKey(clientEdge.source)}`,
      _to: `nodes/${this.sanitizeKey(clientEdge.target)}`,
      weight: this.normalizeWeight(clientEdge.weight),
      relationship_type: this.normalizeRelationshipType(clientEdge.relationship_type),
      
      // 신뢰도 및 증거
      confidence: clientEdge.confidence || 0.5,
      evidence: clientEdge.evidence || '',
      
      attributes: this.transformEdgeAttributes(clientEdge.attributes || {}),
      citations: Array.isArray(clientEdge.citations) ? clientEdge.citations : [],
      
      // 메타데이터
      created_at: new Date().toISOString()
    };

    // 추가 필드들
    if (clientEdge.page_reference) transformed.attributes.page_reference = clientEdge.page_reference;
    if (clientEdge.distance) transformed.attributes.distance = clientEdge.distance;
    if (clientEdge.context_sentence) transformed.attributes.context_sentence = clientEdge.context_sentence;

    return transformed;
  }

  // 메타데이터 변환
  static transformMetadata(clientMetadata) {
    return {
      _key: uuidv4(),
      title: clientMetadata.title || 'Imported Knowledge Graph',
      description: clientMetadata.description || 'Converted from client-side data',
      
      // 파일 정보
      source_file: clientMetadata.source_file || clientMetadata.fileName || 'unknown',
      file_type: clientMetadata.file_type || this.detectFileType(clientMetadata.source_file),
      upload_method: 'api',
      
      // 통계
      node_count: 0, // 실제 개수는 나중에 설정
      edge_count: 0,
      
      // 학술 정보
      authors: this.normalizeAuthors(clientMetadata.authors),
      journal: clientMetadata.journal || '',
      year: this.normalizeYear(clientMetadata.year),
      doi: clientMetadata.doi || '',
      
      // 추출 정보
      extraction_date: clientMetadata.extraction_date || new Date().toISOString(),
      processing_options: clientMetadata.processing_options || {},
      
      created_at: new Date().toISOString()
    };
  }

  // 노드 속성 변환
  static transformNodeAttributes(clientAttributes) {
    const transformed = { ...clientAttributes };

    // 숫자 필드 정규화
    if (transformed.total_citations) {
      transformed.total_citations = parseInt(transformed.total_citations) || 0;
    }
    if (transformed.importance_score) {
      transformed.importance_score = parseFloat(transformed.importance_score) || 0;
    }
    if (transformed.bert_confidence) {
      transformed.bert_confidence = Math.max(0, Math.min(1, parseFloat(transformed.bert_confidence) || 0));
    }

    // 배열 필드 정규화
    if (transformed.related_papers && !Array.isArray(transformed.related_papers)) {
      transformed.related_papers = [];
    }

    // 문자열 필드 정리
    if (transformed.context_sentence) {
      transformed.context_sentence = String(transformed.context_sentence).substring(0, 500);
    }

    return transformed;
  }

  // 엣지 속성 변환
  static transformEdgeAttributes(clientAttributes) {
    const transformed = { ...clientAttributes };

    // 거리 정규화
    if (transformed.distance) {
      transformed.distance = Math.max(0, parseInt(transformed.distance) || 0);
    }

    // 문자열 필드 정리
    if (transformed.context_sentence) {
      transformed.context_sentence = String(transformed.context_sentence).substring(0, 500);
    }

    return transformed;
  }

  // 키 값 정리 (ArangoDB 키 규칙에 맞게)
  static sanitizeKey(key) {
    if (!key) return null;
    
    return String(key)
      .replace(/[^a-zA-Z0-9_-]/g, '_') // 허용되지 않는 문자를 _로 변경
      .replace(/^[^a-zA-Z_]/, '_') // 첫 문자가 숫자면 _로 시작
      .substring(0, 254); // 최대 길이 제한
  }

  // 크기 정규화
  static normalizeSize(size) {
    const numSize = parseFloat(size) || 20;
    return Math.max(1, Math.min(100, Math.round(numSize)));
  }

  // 가중치 정규화
  static normalizeWeight(weight) {
    const numWeight = parseFloat(weight) || 1;
    return Math.max(0.1, Math.min(10, numWeight));
  }

  // 노드 타입 정규화
  static normalizeNodeType(type) {
    const validTypes = [
      'concept', 'process', 'material', 'measurement', 
      'formula', 'method', 'condition', 'organism',
      'author', 'journal', 'keyword'
    ];

    const lowerType = String(type || '').toLowerCase();
    
    // 매핑 테이블
    const typeMapping = {
      'node': 'concept',
      'entity': 'concept',
      'paper': 'concept',
      'document': 'concept',
      'chemical': 'material',
      'protein': 'material',
      'enzyme': 'material',
      'compound': 'material',
      'gene': 'material',
      'reaction': 'process',
      'pathway': 'process',
      'mechanism': 'process',
      'value': 'measurement',
      'data': 'measurement',
      'result': 'measurement',
      'equation': 'formula',
      'calculation': 'formula',
      'technique': 'method',
      'protocol': 'method',
      'assay': 'method',
      'parameter': 'condition',
      'environment': 'condition',
      'species': 'organism',
      'plant': 'organism',
      'animal': 'organism'
    };

    const mappedType = typeMapping[lowerType] || lowerType;
    return validTypes.includes(mappedType) ? mappedType : 'concept';
  }

  // 관계 타입 정규화
  static normalizeRelationshipType(type) {
    const validTypes = [
      'RELATED_TO', 'INFLUENCES', 'DEPENDS_ON', 'MEASURED_BY',
      'CALCULATED_BY', 'PART_OF', 'CAUSES', 'CORRELATES_WITH',
      'DEFINED_AS', 'INHIBITS', 'ACTIVATES', 'CATALYZES',
      'REGULATES', 'BINDS_TO', 'SIMILAR_TO'
    ];

    const upperType = String(type || '').toUpperCase();
    
    // 매핑 테이블
    const typeMapping = {
      'RELATES_TO': 'RELATED_TO',
      'CONNECTED_TO': 'RELATED_TO',
      'ASSOCIATED_WITH': 'RELATED_TO',
      'AFFECTS': 'INFLUENCES',
      'IMPACTS': 'INFLUENCES',
      'MODIFIES': 'INFLUENCES',
      'REQUIRES': 'DEPENDS_ON',
      'NEEDS': 'DEPENDS_ON',
      'RELIES_ON': 'DEPENDS_ON',
      'CONTAINS': 'PART_OF',
      'INCLUDES': 'PART_OF',
      'HAS': 'PART_OF',
      'LEADS_TO': 'CAUSES',
      'RESULTS_IN': 'CAUSES',
      'PRODUCES': 'CAUSES',
      'CORRELATED_WITH': 'CORRELATES_WITH',
      'LINKED_TO': 'CORRELATES_WITH',
      'IS': 'DEFINED_AS',
      'EQUALS': 'DEFINED_AS',
      'REPRESENTS': 'DEFINED_AS',
      'BLOCKS': 'INHIBITS',
      'PREVENTS': 'INHIBITS',
      'REDUCES': 'INHIBITS',
      'STIMULATES': 'ACTIVATES',
      'ENHANCES': 'ACTIVATES',
      'PROMOTES': 'ACTIVATES',
      'CONTROLS': 'REGULATES',
      'MANAGES': 'REGULATES',
      'INTERACTS_WITH': 'BINDS_TO',
      'CONNECTS_TO': 'BINDS_TO'
    };

    const mappedType = typeMapping[upperType] || upperType;
    return validTypes.includes(mappedType) ? mappedType : 'RELATED_TO';
  }

  // 저자 정보 정규화
  static normalizeAuthors(authors) {
    if (!authors) return [];
    if (Array.isArray(authors)) return authors;
    if (typeof authors === 'string') {
      return authors.split(/[,;]/).map(a => a.trim()).filter(a => a.length > 0);
    }
    return [];
  }

  // 연도 정규화
  static normalizeYear(year) {
    const numYear = parseInt(year);
    const currentYear = new Date().getFullYear();
    
    if (numYear >= 1900 && numYear <= currentYear + 5) {
      return numYear;
    }
    return null;
  }

  // 파일 타입 감지
  static detectFileType(filename) {
    if (!filename) return 'unknown';
    
    const ext = filename.toLowerCase().split('.').pop();
    const typeMap = {
      'csv': 'csv',
      'json': 'json',
      'pdf': 'pdf',
      'txt': 'text',
      'xlsx': 'excel',
      'xls': 'excel'
    };
    
    return typeMap[ext] || 'unknown';
  }

  // CSV 헤더 매핑
  static mapCSVHeaders(headers) {
    const mapping = {};
    const standardFields = {
      // 제목 필드
      title: ['title', 'paper_title', 'article_title', 'name'],
      abstract: ['abstract', 'description', 'summary'],
      authors: ['authors', 'author', 'writer', 'creator'],
      journal: ['journal', 'publication', 'venue', 'conference'],
      year: ['year', 'pub_year', 'publication_year', 'date'],
      doi: ['doi', 'digital_object_identifier'],
      keywords: ['keywords', 'keyword', 'tags', 'subjects'],
      citations: ['citations', 'cited_by', 'citation_count']
    };

    const lowerHeaders = headers.map(h => h.toLowerCase().replace(/\s+/g, '_'));

    Object.entries(standardFields).forEach(([standard, variants]) => {
      for (const header of lowerHeaders) {
        if (variants.some(variant => header.includes(variant))) {
          mapping[standard] = headers[lowerHeaders.indexOf(header)];
          break;
        }
      }
    });

    return mapping;
  }

  // 배치 변환
  static transformBatch(clientDataArray) {
    console.log(`🔄 배치 변환 시작: ${clientDataArray.length}개 항목`);
    
    const results = [];
    const errors = [];

    clientDataArray.forEach((item, index) => {
      try {
        const result = this.transformKnowledgeGraph(item);
        results.push(result);
      } catch (error) {
        errors.push({
          index,
          item,
          error: error.message
        });
      }
    });

    console.log(`✅ 배치 변환 완료: 성공 ${results.length}개, 실패 ${errors.length}개`);
    
    return { results, errors };
  }

  // 역변환: ArangoDB 형식을 클라이언트 형식으로
  static reverseTransformKnowledgeGraph(arangoData) {
    const { nodes = [], edges = [], metadata = {} } = arangoData;

    return {
      nodes: nodes.map(node => ({
        id: node._key,
        label: node.label,
        size: node.size,
        type: node.type,
        attributes: node.attributes,
        definition: node.definition,
        citations: node.citations,
        context: node.context
      })),
      edges: edges.map(edge => ({
        source: edge._from.replace('nodes/', ''),
        target: edge._to.replace('nodes/', ''),
        weight: edge.weight,
        relationship_type: edge.relationship_type,
        confidence: edge.confidence,
        evidence: edge.evidence,
        attributes: edge.attributes,
        citations: edge.citations
      })),
      metadata: {
        title: metadata.title,
        description: metadata.description,
        source_file: metadata.source_file,
        node_count: metadata.node_count,
        edge_count: metadata.edge_count,
        authors: metadata.authors,
        journal: metadata.journal,
        year: metadata.year,
        doi: metadata.doi
      }
    };
  }
}

module.exports = DataTransformer;