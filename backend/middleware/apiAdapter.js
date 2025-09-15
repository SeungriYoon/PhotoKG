/**
 * API 어댑터 미들웨어
 * 클라이언트와 백엔드 간의 데이터 형식 변환을 담당
 */

const DataTransformer = require('../utils/dataTransformer');

class APIAdapter {
  
  // 요청 데이터 변환 미들웨어
  static transformRequest(req, res, next) {
    // POST/PUT 요청에서 body 변환
    if ((req.method === 'POST' || req.method === 'PUT') && req.body) {
      try {
        // 그래프 생성/업데이트 요청 감지
        if (req.path.includes('/api/graph') && req.body.nodes && req.body.edges) {
          console.log('🔄 클라이언트 그래프 데이터 변환 중...');
          
          const transformResult = DataTransformer.transformKnowledgeGraph(req.body);
          
          // 변환 결과를 요청 body에 적용
          req.body = {
            nodes: transformResult.nodes,
            edges: transformResult.edges,
            metadata: transformResult.metadata
          };
          
          // 검증 오류가 있으면 별도 필드에 저장
          if (transformResult.validationErrors) {
            req.validationWarnings = transformResult.validationErrors;
          }
          
          console.log(`✅ 변환 완료: 노드 ${transformResult.nodes.length}개, 엣지 ${transformResult.edges.length}개`);
        }
        
        // 파일 업로드 옵션 변환
        if (req.path.includes('/api/upload') && req.body.options) {
          req.body.options = this.transformUploadOptions(req.body.options);
        }
        
      } catch (error) {
        console.error('요청 데이터 변환 실패:', error);
        return res.status(400).json({
          success: false,
          error: 'Request data transformation failed',
          message: error.message
        });
      }
    }
    
    next();
  }

  // 응답 데이터 변환 미들웨어
  static transformResponse(req, res, next) {
    // 원본 json 메소드 저장
    const originalJson = res.json;
    
    // json 메소드 오버라이드
    res.json = function(data) {
      try {
        // 클라이언트가 레거시 형식을 요청하는 경우 변환
        const acceptLegacy = req.headers['accept-legacy-format'] === 'true' || 
                            req.query.legacy === 'true';
        
        if (acceptLegacy && data.success && data.data) {
          console.log('🔄 백엔드 응답을 클라이언트 형식으로 변환 중...');
          
          // 그래프 데이터 응답 변환
          if (data.data.nodes && data.data.edges) {
            const clientFormat = DataTransformer.reverseTransformKnowledgeGraph(data.data);
            data.data = clientFormat;
            console.log('✅ 클라이언트 형식으로 변환 완료');
          }
          
          // 검색 결과 변환
          if (Array.isArray(data.data) && data.data.length > 0 && data.data[0]._key) {
            data.data = data.data.map(item => APIAdapter.transformArangoDocToClient(item));
          }
        }
        
        // 검증 경고가 있으면 응답에 추가
        if (req.validationWarnings) {
          data.warnings = req.validationWarnings;
        }
        
      } catch (error) {
        console.error('응답 데이터 변환 실패:', error);
        // 변환 실패 시에도 원본 데이터 반환
      }
      
      // 원본 json 메소드 호출
      return originalJson.call(this, data);
    };
    
    next();
  }

  // 업로드 옵션 변환
  static transformUploadOptions(options) {
    if (typeof options === 'string') {
      try {
        options = JSON.parse(options);
      } catch (error) {
        return {};
      }
    }
    
    const transformed = { ...options };
    
    // 클라이언트 옵션을 백엔드 형식으로 매핑
    const optionMapping = {
      'max_keywords': 'maxKeywords',
      'min_frequency': 'minFrequency',
      'include_authors': 'includeAuthors',
      'include_journals': 'includeJournals',
      'max_nodes': 'maxNodes',
      'min_weight': 'minWeight'
    };
    
    Object.entries(optionMapping).forEach(([oldKey, newKey]) => {
      if (transformed[oldKey] !== undefined) {
        transformed[newKey] = transformed[oldKey];
        delete transformed[oldKey];
      }
    });
    
    return transformed;
  }

  // ArangoDB 문서를 클라이언트 형식으로 변환
  static transformArangoDocToClient(doc) {
    if (!doc) return doc;
    
    // 노드 변환
    if (doc.label && doc.size !== undefined) {
      return {
        id: doc._key,
        label: doc.label,
        size: doc.size,
        type: doc.type,
        attributes: doc.attributes || {},
        definition: doc.definition,
        citations: doc.citations || [],
        context: doc.context
      };
    }
    
    // 엣지 변환
    if (doc._from && doc._to) {
      return {
        source: doc._from.replace('nodes/', ''),
        target: doc._to.replace('nodes/', ''),
        weight: doc.weight,
        relationship_type: doc.relationship_type,
        confidence: doc.confidence,
        evidence: doc.evidence,
        attributes: doc.attributes || {},
        citations: doc.citations || []
      };
    }
    
    return doc;
  }

  // 페이징 파라미터 정규화
  static normalizePagination(req, res, next) {
    // 클라이언트에서 다양한 형식으로 올 수 있는 페이징 파라미터 정규화
    const { page, per_page, page_size, limit, offset, start } = req.query;
    
    // limit/offset 형식으로 통일
    let normalizedLimit = 50; // 기본값
    let normalizedOffset = 0;
    
    if (limit) {
      normalizedLimit = Math.max(1, Math.min(100, parseInt(limit)));
    } else if (per_page) {
      normalizedLimit = Math.max(1, Math.min(100, parseInt(per_page)));
    } else if (page_size) {
      normalizedLimit = Math.max(1, Math.min(100, parseInt(page_size)));
    }
    
    if (offset) {
      normalizedOffset = Math.max(0, parseInt(offset));
    } else if (start) {
      normalizedOffset = Math.max(0, parseInt(start));
    } else if (page) {
      const pageNum = Math.max(1, parseInt(page));
      normalizedOffset = (pageNum - 1) * normalizedLimit;
    }
    
    // 정규화된 값으로 덮어쓰기
    req.query.limit = normalizedLimit;
    req.query.offset = normalizedOffset;
    
    next();
  }

  // 필터 파라미터 정규화
  static normalizeFilters(req, res, next) {
    const { filter, filters, where, search } = req.query;
    
    let normalizedFilter = {};
    
    try {
      // 다양한 필터 형식 처리
      if (filter) {
        if (typeof filter === 'string') {
          normalizedFilter = JSON.parse(filter);
        } else {
          normalizedFilter = filter;
        }
      } else if (filters) {
        if (typeof filters === 'string') {
          normalizedFilter = JSON.parse(filters);
        } else {
          normalizedFilter = filters;
        }
      } else if (where) {
        if (typeof where === 'string') {
          normalizedFilter = JSON.parse(where);
        } else {
          normalizedFilter = where;
        }
      }
      
      // 검색어가 있으면 필터에 추가
      if (search) {
        normalizedFilter.search = search;
      }
      
      // 클라이언트 필드명을 백엔드 형식으로 변환
      const fieldMapping = {
        'node_type': 'nodeType',
        'edge_type': 'edgeType',
        'min_size': 'minSize',
        'max_size': 'maxSize',
        'min_weight': 'minWeight',
        'max_weight': 'maxWeight'
      };
      
      Object.entries(fieldMapping).forEach(([oldKey, newKey]) => {
        if (normalizedFilter[oldKey] !== undefined) {
          normalizedFilter[newKey] = normalizedFilter[oldKey];
          delete normalizedFilter[oldKey];
        }
      });
      
      req.query.filter = normalizedFilter;
      
    } catch (error) {
      console.warn('필터 파라미터 파싱 실패:', error.message);
      req.query.filter = {};
    }
    
    next();
  }

  // 정렬 파라미터 정규화
  static normalizeSorting(req, res, next) {
    const { sort, sort_by, order_by, order, direction } = req.query;
    
    let normalizedSort = {};
    
    try {
      if (sort) {
        if (typeof sort === 'string') {
          // "field:direction" 형식 파싱
          const parts = sort.split(':');
          normalizedSort.field = parts[0];
          normalizedSort.direction = parts[1] || 'asc';
        } else {
          normalizedSort = sort;
        }
      } else if (sort_by || order_by) {
        normalizedSort.field = sort_by || order_by;
        normalizedSort.direction = direction || order || 'asc';
      }
      
      // 필드명 매핑
      const fieldMapping = {
        'created': 'created_at',
        'updated': 'updated_at',
        'name': 'label'
      };
      
      if (normalizedSort.field && fieldMapping[normalizedSort.field]) {
        normalizedSort.field = fieldMapping[normalizedSort.field];
      }
      
      // 방향 정규화
      if (normalizedSort.direction) {
        normalizedSort.direction = normalizedSort.direction.toLowerCase();
        if (!['asc', 'desc'].includes(normalizedSort.direction)) {
          normalizedSort.direction = 'asc';
        }
      }
      
      req.query.sort = normalizedSort;
      
    } catch (error) {
      console.warn('정렬 파라미터 파싱 실패:', error.message);
      req.query.sort = {};
    }
    
    next();
  }

  // 에러 응답 표준화
  static standardizeErrorResponse(err, req, res, next) {
    // 클라이언트가 기대하는 에러 형식으로 변환
    const acceptLegacy = req.headers['accept-legacy-format'] === 'true' || 
                        req.query.legacy === 'true';
    
    let errorResponse;
    
    if (acceptLegacy) {
      // 레거시 클라이언트용 에러 형식
      errorResponse = {
        error: true,
        message: err.message || 'An error occurred',
        code: err.code || 'UNKNOWN_ERROR',
        timestamp: new Date().toISOString()
      };
    } else {
      // 표준 백엔드 에러 형식
      errorResponse = {
        success: false,
        error: err.name || 'Error',
        message: err.message || 'An error occurred',
        timestamp: new Date().toISOString()
      };
      
      // 개발 환경에서는 스택 트레이스 포함
      if (process.env.NODE_ENV === 'development') {
        errorResponse.stack = err.stack;
      }
    }
    
    const statusCode = err.statusCode || err.status || 500;
    res.status(statusCode).json(errorResponse);
  }

  // 모든 미들웨어를 순서대로 적용하는 헬퍼
  static applyAll() {
    return [
      this.normalizePagination,
      this.normalizeFilters,
      this.normalizeSorting,
      this.transformRequest,
      this.transformResponse
    ];
  }
}

module.exports = APIAdapter;