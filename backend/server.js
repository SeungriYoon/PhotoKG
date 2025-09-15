const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
require('dotenv').config();

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
      'http://localhost:3005', 
      'http://127.0.0.1:3005',
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
const path = require('path');
app.use(express.static(path.join(__dirname, '..')));

// API 어댑터 미들웨어 적용
app.use('/api', APIAdapter.applyAll());

// 라우트 임포트
const graphRoutes = require('./routes/graph');
const analysisRoutes = require('./routes/analysis');
const uploadRoutes = require('./routes/upload');
const peoRoutes = require('./routes/peo');
const arangoRoutes = require('./arangoRoutes');

// API 라우트
app.use('/api/graph', graphRoutes);
app.use('/api/analysis', analysisRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/peo', peoRoutes);
app.use('/api/arango', arangoRoutes); // Enhanced ArangoDB routes

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

  // 환경 변수 확인 로그
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your-openai-api-key-here') {
    console.log(`✅ OpenAI API key configured`);
  } else {
    console.warn(`⚠️ OpenAI API key not configured. Please set OPENAI_API_KEY in .env file`);
  }

  if (process.env.NODE_ENV) {
    console.log(`🌍 Environment: ${process.env.NODE_ENV}`);
  }
});

module.exports = { app, upload };