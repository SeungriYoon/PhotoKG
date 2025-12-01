const Joi = require('joi');

// 노드 스키마 정의
const NodeSchema = Joi.object({
  _key: Joi.string().optional(),
  label: Joi.string().required().min(1).max(200),
  size: Joi.number().min(1).max(100).default(20),
  type: Joi.string().valid(
    'concept', 'process', 'material', 'measurement', 
    'formula', 'method', 'condition', 'organism',
    'author', 'journal', 'keyword'
  ).default('concept'),
  
  // 속성 정보
  attributes: Joi.object({
    // 학술 논문 관련
    total_citations: Joi.number().min(0).optional(),
    citation_score: Joi.number().min(0).optional(),
    frequency: Joi.number().min(0).optional(),
    first_appeared: Joi.number().integer().min(1900).max(2030).optional(),
    last_appeared: Joi.number().integer().min(1900).max(2030).optional(),
    related_papers: Joi.array().items(Joi.string()).optional(),
    
    // 과학적 정보
    formula: Joi.string().optional(),
    value: Joi.alternatives().try(Joi.number(), Joi.string()).optional(),
    unit: Joi.string().optional(),
    rate: Joi.number().optional(),
    
    // 메타데이터
    importance_score: Joi.number().min(0).optional(),
    bert_confidence: Joi.number().min(0).max(1).optional(),
    bert_entity_type: Joi.string().optional(),
    context_sentence: Joi.string().optional(),
    page_reference: Joi.string().optional(),
    
    // 저자/저널 정보
    journal_if: Joi.number().min(0).optional(),
    pmid: Joi.string().optional(),
    doi: Joi.string().optional(),
    journal: Joi.string().optional(),
    pub_year: Joi.number().integer().min(1900).max(2030).optional(),
    authors: Joi.string().optional(),
    abstract: Joi.string().optional(),
    top_fields: Joi.string().optional(),
    sub_fields: Joi.string().optional()
  }).default({}),
  
  // 메타데이터
  definition: Joi.string().optional(),
  citations: Joi.array().items(Joi.string()).default([]),
  context: Joi.string().optional(),
  graph_id: Joi.string().optional(),
  created_at: Joi.date().iso().default(() => new Date()),
  updated_at: Joi.date().iso().optional()
});

// 엣지 스키마 정의
const EdgeSchema = Joi.object({
  _key: Joi.string().optional(),
  _from: Joi.string().required().pattern(/^nodes\//),
  _to: Joi.string().required().pattern(/^nodes\//),
  
  weight: Joi.number().min(0.1).max(10).default(1),
  relationship_type: Joi.string().valid(
    'RELATED_TO', 'INFLUENCES', 'DEPENDS_ON', 'MEASURED_BY',
    'CALCULATED_BY', 'PART_OF', 'CAUSES', 'CORRELATES_WITH',
    'DEFINED_AS', 'INHIBITS', 'ACTIVATES', 'CATALYZES',
    'REGULATES', 'BINDS_TO', 'SIMILAR_TO'
  ).default('RELATED_TO'),
  
  // 관계 증거 및 메타데이터
  evidence: Joi.string().optional(),
  confidence: Joi.number().min(0).max(1).default(0.5),
  
  attributes: Joi.object({
    distance: Joi.number().min(0).optional(),
    context_sentence: Joi.string().optional(),
    page_reference: Joi.string().optional(),
    extraction_method: Joi.string().optional()
  }).default({}),
  
  citations: Joi.array().items(Joi.string()).default([]),
  graph_id: Joi.string().optional(),
  created_at: Joi.date().iso().default(() => new Date()),
  updated_at: Joi.date().iso().optional()
});

// 메타데이터 스키마
const MetadataSchema = Joi.object({
  _key: Joi.string().optional(),
  title: Joi.string().required(),
  description: Joi.string().optional(),
  
  // 파일 정보
  source_file: Joi.string().optional(),
  file_type: Joi.string().valid('csv', 'json', 'pdf').optional(),
  upload_method: Joi.string().valid('file', 'url', 'api').default('api'),
  
  // 통계 정보
  node_count: Joi.number().min(0).default(0),
  edge_count: Joi.number().min(0).default(0),
  
  // 처리 정보
  processing_options: Joi.object().optional(),
  extraction_date: Joi.date().iso().default(() => new Date()),
  
  // 학술 정보
  authors: Joi.array().items(Joi.string()).default([]),
  journal: Joi.string().optional(),
  year: Joi.number().integer().min(1900).max(2030).optional(),
  doi: Joi.string().optional(),
  
  created_at: Joi.date().iso().default(() => new Date()),
  updated_at: Joi.date().iso().optional()
});

// 참고문헌 스키마
const ReferenceSchema = Joi.object({
  _key: Joi.string().optional(),
  citation_id: Joi.string().required(),
  
  // 기본 정보
  title: Joi.string().required(),
  authors: Joi.array().items(Joi.string()).default([]),
  journal: Joi.string().optional(),
  year: Joi.number().integer().min(1900).max(2030).optional(),
  
  // 상세 정보
  volume: Joi.string().optional(),
  pages: Joi.string().optional(),
  doi: Joi.string().optional(),
  pmid: Joi.string().optional(),
  url: Joi.string().uri().optional(),
  
  // 메타데이터
  graph_id: Joi.string().optional(),
  created_at: Joi.date().iso().default(() => new Date())
});

// 업로드 히스토리 스키마
const UploadHistorySchema = Joi.object({
  _key: Joi.string().optional(),
  upload_id: Joi.string().required(),
  
  // 파일 정보
  original_filename: Joi.string().required(),
  file_size: Joi.number().min(0).required(),
  file_type: Joi.string().required(),
  upload_method: Joi.string().valid('file', 'url').required(),
  
  // 처리 결과
  status: Joi.string().valid('processing', 'completed', 'failed').default('processing'),
  nodes_created: Joi.number().min(0).default(0),
  edges_created: Joi.number().min(0).default(0),
  processing_time: Joi.number().min(0).optional(),
  
  // 오류 정보
  error_message: Joi.string().optional(),
  
  // 메타데이터
  graph_id: Joi.string().optional(),
  created_at: Joi.date().iso().default(() => new Date()),
  completed_at: Joi.date().iso().optional()
});

// 분석 결과 스키마
const AnalysisResultSchema = Joi.object({
  _key: Joi.string().optional(),
  analysis_id: Joi.string().required(),
  
  // 분석 정보
  analysis_type: Joi.string().valid(
    'structure', 'centrality', 'communities', 'clustering',
    'keywords', 'similarity', 'paths', 'anomalies', 'trends', 'recommendations'
  ).required(),
  
  graph_id: Joi.string().required(),
  
  // 분석 설정
  parameters: Joi.object().default({}),
  
  // 결과
  results: Joi.object().required(),
  
  // 성능 정보
  processing_time: Joi.number().min(0).optional(),
  memory_usage: Joi.number().min(0).optional(),
  
  created_at: Joi.date().iso().default(() => new Date())
});

// 스키마 검증 함수들
const validateNode = (data) => {
  return NodeSchema.validate(data, { abortEarly: false });
};

const validateEdge = (data) => {
  return EdgeSchema.validate(data, { abortEarly: false });
};

const validateMetadata = (data) => {
  return MetadataSchema.validate(data, { abortEarly: false });
};

const validateReference = (data) => {
  return ReferenceSchema.validate(data, { abortEarly: false });
};

const validateUploadHistory = (data) => {
  return UploadHistorySchema.validate(data, { abortEarly: false });
};

const validateAnalysisResult = (data) => {
  return AnalysisResultSchema.validate(data, { abortEarly: false });
};

// 배치 검증 함수
const validateBatch = (items, validator) => {
  const results = [];
  const errors = [];
  
  items.forEach((item, index) => {
    const { error, value } = validator(item);
    if (error) {
      errors.push({
        index,
        item,
        errors: error.details.map(d => d.message)
      });
    } else {
      results.push(value);
    }
  });
  
  return { results, errors };
};

module.exports = {
  // 스키마 객체들
  NodeSchema,
  EdgeSchema,
  MetadataSchema,
  ReferenceSchema,
  UploadHistorySchema,
  AnalysisResultSchema,
  
  // 검증 함수들
  validateNode,
  validateEdge,
  validateMetadata,
  validateReference,
  validateUploadHistory,
  validateAnalysisResult,
  validateBatch,
  
  // 컬렉션 이름 상수
  COLLECTIONS: {
    NODES: 'nodes',
    EDGES: 'edges',
    METADATA: 'metadata',
    REFERENCES: 'references',
    UPLOAD_HISTORY: 'upload_history',
    ANALYSIS_RESULTS: 'analysis_results'
  }
};