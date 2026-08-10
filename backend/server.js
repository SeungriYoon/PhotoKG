const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

if (!process.env.LLM_PROVIDER && process.env.GEMINI_API_KEY) {
  process.env.LLM_PROVIDER = 'gemini';
}
if (!process.env.LLM_MODEL && process.env.GEMINI_API_KEY) {
  process.env.LLM_MODEL = 'gemini-2.5-flash';
}

process.env.GRAPH_BACKEND = process.env.GRAPH_BACKEND || 'neo4j';

const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

const app = express();
const PORT = process.env.PORT || 3015;

// API 어댑터 미들웨어 임포트
const APIAdapter = require('./middleware/apiAdapter');

// 미들웨어 설정
app.use(helmet());
app.use(compression());
app.use(morgan('combined'));

// 타임아웃 설정 (10분)
app.use((req, res, next) => {
  req.setTimeout(600000); // 10분
  res.setTimeout(600000); // 10분
  next();
});
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3015',
      'null' // for file:// protocol
    ];
    
    if (allowedOrigins.indexOf(origin) !== -1 || origin.startsWith('file://')) {
      return callback(null, true);
    }
    return callback(null, true); // Allow all for development
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 정적 파일 서빙 (프론트엔드 파일들)
app.use(express.static(path.join(__dirname, '..')));

// API 어댑터 미들웨어 적용
app.use('/api', APIAdapter.applyAll());

// 라우트 임포트
const graphRoutes = require('./routes/graph');
const analysisRoutes = require('./routes/analysis');
const uploadRoutes = require('./routes/upload');
const peoRoutes = require('./routes/peo');
const neo4jRoutes = require('./routes/neo4j');
const arangoRoutes = process.env.GRAPH_BACKEND === 'arango' ? require('./arangoRoutes') : null;

// API 라우트
app.use('/api/graph', graphRoutes);
app.use('/api/analysis', analysisRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/peo', peoRoutes);
app.use('/api/neo4j', neo4jRoutes);
if (arangoRoutes) {
  app.use('/api/arango', arangoRoutes); // Enhanced ArangoDB routes
}

// 헬스 체크
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'Knowledge Graph Backend'
  });
});

// API 헬스 체크 (프론트엔드용)
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'Knowledge Graph Backend API'
  });
});

// 임시 테스트 데이터 API (ArangoDB 없이 테스트용)
app.get('/api/test-data', (req, res) => {
  const fs = require('fs');
  const path = require('path');
  
  try {
    const testDataPath = path.join(__dirname, '..', 'test_data.json');
    const testData = JSON.parse(fs.readFileSync(testDataPath, 'utf8'));
    
    res.json({
      success: true,
      data: testData,
      message: 'Test data loaded successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to load test data',
      message: error.message
    });
  }
});

// 404 핸들러
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Route not found',
    path: req.originalUrl 
  });
});

// 에러 핸들러 (API 어댑터 포함)
app.use(APIAdapter.standardizeErrorResponse);

// 서버 시작
app.listen(PORT, () => {
  console.log(`🚀 Knowledge Graph Backend Server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔗 API Base URL: http://localhost:${PORT}/api`);
  console.log(`🧭 Graph backend: ${process.env.GRAPH_BACKEND}`);

  const llmProvider = process.env.LLM_PROVIDER || 'unknown';
  const llmModel = process.env.LLM_MODEL || 'unknown';
  if (llmProvider !== 'unknown') {
    console.log(`🧭 LLM provider: ${llmProvider}`);
    console.log(`🧠 LLM model: ${llmModel}`);
  } else {
    console.warn(`⚠️ LLM provider not configured. Please set LLM_PROVIDER in .env file`);
  }

  if (process.env.NODE_ENV) {
    console.log(`🌍 Environment: ${process.env.NODE_ENV}`);
  }
});

module.exports = { app, upload };
