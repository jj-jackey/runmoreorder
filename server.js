const express = require('express');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const session = require('express-session');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// 플랫폼 감지 및 환경 최적화 설정
const isProduction = process.env.NODE_ENV === 'production';
const isVercel = process.env.VERCEL === '1';

// 플랫폼별 설정
const platform = isVercel ? 'vercel' : 'local';

if (!isProduction) {
  console.log(`플랫폼: ${platform.toUpperCase()}`);
}

if (isProduction) {
  
  // 플랫폼별 요청 타임아웃 설정
  const timeout = isVercel ? 30000 : 60000; // Vercel: 30초, 기타: 60초
  app.use((req, res, next) => {
    req.setTimeout(timeout, () => {
      res.status(408).json({ 
        error: `요청 처리 시간이 초과되었습니다. (${timeout/1000}초) 파일 크기를 줄이거나 다시 시도해주세요.`,
        platform: platform
      });
    });
    next();
  });
  
  // 메모리 사용량 모니터링 (Render에서만)
  if (!isVercel) {
    setInterval(() => {
      const memUsage = process.memoryUsage();
      const memUsageMB = {
        rss: Math.round(memUsage.rss / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        external: Math.round(memUsage.external / 1024 / 1024)
      };
      
      // 메모리 사용량이 높을 때 경고
      const memoryLimit = 300; // 기본: 300MB
      if (memUsageMB.heapUsed > memoryLimit) {
        console.warn('⚠️ 높은 메모리 사용량 감지:', memUsageMB);
        
        // 강제 가비지 컬렉션 (가능한 경우)
        if (global.gc) {
          global.gc();
          console.log('🗑️ 가비지 컬렉션 실행됨');
        }
      }
    }, 30000); // 30초마다 체크
  } else {
    console.log('⚡ Vercel Serverless 환경 - 메모리 모니터링 생략');
  }
}

// 한글 파일명 디코딩 함수
function decodeFileName(fileName) {
  try {
    // 이미 올바른 한글이면 그대로 반환
    if (/^[a-zA-Z0-9가-힣\s\-_.\(\)]+$/.test(fileName)) {
      return fileName;
    }
    
    // Buffer를 통한 디코딩 시도
    const buffer = Buffer.from(fileName, 'latin1');
    const decoded = buffer.toString('utf8');
    
    // 디코딩 결과 검증
    if (decoded && decoded !== fileName && !/[�]/.test(decoded)) {
      console.log('✅ 서버 파일명 디코딩 성공:', { original: fileName, decoded: decoded });
      return decoded;
    }
    
    // URI 디코딩 시도
    try {
      const uriDecoded = decodeURIComponent(fileName);
      if (uriDecoded !== fileName) {
        console.log('✅ 서버 파일명 URI 디코딩 성공:', { original: fileName, decoded: uriDecoded });
        return uriDecoded;
      }
    } catch (e) {
      // URI 디코딩 실패 시 무시
    }
    
    console.log('⚠️ 서버 파일명 디코딩 실패, 원본 사용:', fileName);
    return fileName;
  } catch (error) {
    console.error('❌ 서버 파일명 디코딩 오류:', error.message);
    return fileName;
  }
}

// Supabase 클라이언트 초기화
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// uploads 폴더 완전 제거: Supabase Storage가 메인, 임시 파일은 /tmp 사용

// 세션 설정
app.use(session({
  secret: process.env.SESSION_SECRET || 'autorder-session-secret-key-2024',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // HTTPS가 아닌 환경에서도 동작하도록
    maxAge: 24 * 60 * 60 * 1000 // 24시간
  }
}));

// 미들웨어 설정
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// 파일 업로드 설정 - Supabase Storage 사용 (로컬에서도 테스트)
const storage = multer.memoryStorage(); // 모든 환경에서 Supabase 사용

// 기존 로컬 파일 시스템 설정 (주석 처리)
/*
const storage = process.env.NODE_ENV === 'production' 
  ? multer.memoryStorage()  // 프로덕션: 메모리에 임시 저장 후 Supabase로 업로드
  : multer.diskStorage({    // 개발환경: 디스크 저장
      destination: function (req, file, cb) {
        cb(null, uploadsDir);
      },
      filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
      }
    });
*/

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    const decodedFileName = decodeFileName(file.originalname);
    
    console.log('🔍 서버 파일 필터 검사:', {
      originalname: decodedFileName,
      rawOriginalname: file.originalname,
      mimetype: file.mimetype
    });
    
    const allowedTypes = /xlsx|xls|csv/;
    const extname = allowedTypes.test(path.extname(decodedFileName).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype) || 
                     file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
                     file.mimetype === 'application/vnd.ms-excel' ||
                     file.mimetype === 'text/csv' ||
                     file.mimetype === 'application/octet-stream'; // 일부 브라우저에서 Excel을 이렇게 인식
    
    if (mimetype && extname) {
      console.log('✅ 서버 파일 필터 통과');
      return cb(null, true);
    } else {
      console.log('❌ 서버 파일 필터 실패:', { mimetype, extname, decodedFileName });
      cb(new Error('파일 형식이 지원되지 않습니다. Excel(.xlsx, .xls) 또는 CSV 파일만 업로드 가능합니다.'));
    }
  },
  limits: { 
    fileSize: 50 * 1024 * 1024, // 50MB로 증가
    fieldSize: 2 * 1024 * 1024   // 2MB
  }
});

// API 라우트
const orderRoutes = require('./routes/orders');
const emailRoutes = require('./routes/email');
const templateRoutes = require('./routes/templates');
const webhookRoutes = require('./routes/webhook');
const { router: authRoutes, requireAuth } = require('./routes/auth');

app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/webhook', webhookRoutes);

// 홈페이지 라우트 - OpenAI API 키 없이도 사용 가능
app.get('/', (req, res) => {
  console.log('🏠 메인 페이지 접근 - API 키 없이도 사용 가능');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// index.html 직접 접근 허용
app.get('/index.html', (req, res) => {
  console.log('📄 index.html 직접 접근 - API 키 없이도 사용 가능');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 에러 핸들링
app.use((error, req, res, next) => {
  console.error('🚨 서버 에러:', {
    error: error.message,
    code: error.code,
    type: error.constructor.name,
    timestamp: new Date().toISOString()
  });
  
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ 
        error: '파일 크기가 너무 큽니다. 50MB 이하의 파일을 업로드해주세요.',
        code: 'LIMIT_FILE_SIZE'
      });
    }
    if (error.code === 'LIMIT_FIELD_SIZE') {
      return res.status(400).json({ 
        error: '필드 크기가 너무 큽니다.',
        code: 'LIMIT_FIELD_SIZE'
      });
    }
  }
  
  res.status(500).json({ 
    error: error.message,
    code: error.code || 'UNKNOWN_ERROR'
  });
});

app.listen(PORT, async () => {
  console.log(`🚀 서버가 포트 ${PORT}에서 실행 중입니다.`);
  console.log(`📁 파일 업로드: http://localhost:${PORT}`);
  console.log(`☁️ 스토리지: Supabase Storage (모든 환경)`);
  console.log(`🔗 Supabase URL: ${process.env.SUPABASE_URL ? '✅ 연결됨' : '❌ 설정안됨'}`);
  
  // Production 환경에서 Supabase 연결 상태 확인
  if (process.env.NODE_ENV === 'production') {
    try {
      console.log('🔍 Supabase 연결 상태 확인 중...');
      const { data, error } = await supabase.storage.listBuckets();
      
      if (error) {
        console.error('❌ Supabase Storage 연결 실패:', error.message);
        console.log('💡 환경 변수를 확인해주세요: SUPABASE_URL, SUPABASE_ANON_KEY');
      } else {
        console.log('✅ Supabase Storage 연결 성공:', data.map(b => b.name).join(', '));
      }
    } catch (connectError) {
      console.error('❌ Supabase 연결 테스트 실패:', connectError.message);
      console.log('⚠️ 네트워크 상태를 확인해주세요. 서비스는 계속 실행됩니다.');
    }
  }
  
  // Node.js 네트워크 설정 최적화
  if (process.env.NODE_ENV === 'production') {
    // Keep-alive 연결 설정
    const http = require('http');
    const https = require('https');
    
    const keepAliveAgent = new https.Agent({
      keepAlive: true,
      keepAliveMsecs: 30000,
      maxSockets: 50,
      maxFreeSockets: 10,
      timeout: 60000,
      freeSocketTimeout: 30000
    });
    
    // 글로벌 에이전트 설정
    https.globalAgent = keepAliveAgent;
    
    if (!isProduction) {
      console.log('Keep-alive 연결 설정 완료');
    }
  }
  
  // Render 헬스 체크 엔드포인트
  app.get('/health', (req, res) => {
    res.status(200).json({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      platform: platform,
      uptime: process.uptime()
    });
  });
  
  // 기본 루트 엔드포인트
  app.get('/', (req, res) => {
    res.redirect('/index.html');
  });
}); 