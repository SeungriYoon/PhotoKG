const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const router = express.Router();
const UploadService = require('../services/UploadService');

// 파일 업로드 설정
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = process.env.UPLOAD_DIR || './uploads';
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    cb(null, `${name}_${timestamp}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.csv', '.json', '.pdf'];
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`지원하지 않는 파일 형식입니다. 허용된 형식: ${allowedTypes.join(', ')}`));
    }
  }
});

// 단일 파일 업로드
router.post('/file', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    const { options } = req.body;
    const parseOptions = options ? JSON.parse(options) : {};

    console.log(`📁 파일 업로드됨: ${req.file.originalname}`);
    
    // 파일 처리
    const result = await UploadService.processFile(req.file, parseOptions);
    
    res.json({
      success: true,
      data: result,
      message: `파일 '${req.file.originalname}' 처리 완료`
    });
    
  } catch (error) {
    console.error('파일 업로드 오류:', error);
    
    // 업로드된 파일 정리
    if (req.file) {
      try {
        await fs.unlink(req.file.path);
      } catch (unlinkError) {
        console.error('임시 파일 삭제 실패:', unlinkError);
      }
    }
    
    res.status(500).json({
      success: false,
      error: 'File processing failed',
      message: error.message
    });
  }
});

// 다중 파일 업로드
router.post('/files', upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No files uploaded'
      });
    }

    const { options } = req.body;
    const parseOptions = options ? JSON.parse(options) : {};

    console.log(`📁 ${req.files.length}개 파일 업로드됨`);
    
    // 파일들을 순차적으로 처리
    const results = [];
    for (const file of req.files) {
      try {
        const result = await UploadService.processFile(file, parseOptions);
        results.push({
          filename: file.originalname,
          success: true,
          data: result
        });
      } catch (error) {
        results.push({
          filename: file.originalname,
          success: false,
          error: error.message
        });
      }
    }
    
    res.json({
      success: true,
      data: results,
      message: `${req.files.length}개 파일 처리 완료`
    });
    
  } catch (error) {
    console.error('다중 파일 업로드 오류:', error);
    
    // 업로드된 파일들 정리
    if (req.files) {
      for (const file of req.files) {
        try {
          await fs.unlink(file.path);
        } catch (unlinkError) {
          console.error('임시 파일 삭제 실패:', unlinkError);
        }
      }
    }
    
    res.status(500).json({
      success: false,
      error: 'Multiple file processing failed',
      message: error.message
    });
  }
});

// URL에서 파일 다운로드 및 처리
router.post('/url', async (req, res) => {
  try {
    const { url, options } = req.body;
    
    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required'
      });
    }
    
    console.log(`🔗 URL에서 파일 다운로드 중: ${url}`);
    
    const result = await UploadService.processFromURL(url, options || {});
    
    res.json({
      success: true,
      data: result,
      message: 'URL 파일 처리 완료'
    });
    
  } catch (error) {
    console.error('URL 파일 처리 오류:', error);
    
    res.status(500).json({
      success: false,
      error: 'URL file processing failed',
      message: error.message
    });
  }
});

// 업로드된 파일 목록 조회
router.get('/history', async (req, res) => {
  try {
    const { limit = 20, offset = 0 } = req.query;
    
    const result = await UploadService.getUploadHistory({
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
    
    res.json({
      success: true,
      data: result
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch upload history',
      message: error.message
    });
  }
});

// 특정 업로드 결과 조회
router.get('/result/:uploadId', async (req, res) => {
  try {
    const { uploadId } = req.params;
    
    const result = await UploadService.getUploadResult(uploadId);
    
    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Upload result not found'
      });
    }
    
    res.json({
      success: true,
      data: result
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch upload result',
      message: error.message
    });
  }
});

// 업로드 파일 삭제
router.delete('/:uploadId', async (req, res) => {
  try {
    const { uploadId } = req.params;
    
    const result = await UploadService.deleteUpload(uploadId);
    
    res.json({
      success: true,
      data: result,
      message: 'Upload deleted successfully'
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to delete upload',
      message: error.message
    });
  }
});

// 에러 핸들러
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'File too large',
        message: 'File size exceeds 100MB limit'
      });
    }
    
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        error: 'Too many files',
        message: 'Maximum 10 files allowed'
      });
    }
  }
  
  res.status(400).json({
    success: false,
    error: 'Upload error',
    message: error.message
  });
});

module.exports = router;
