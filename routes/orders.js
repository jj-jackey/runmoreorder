const express = require('express');
const multer = require('multer');
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');
const { validateOrderData } = require('../utils/validation');
const { convertToStandardFormat } = require('../utils/converter');
const { uploadFile, downloadFile, saveMappingData, loadMappingData, saveFileMapping, resolveActualFileName, supabase } = require('../utils/supabase');
const { createRateLimitMiddleware, getCurrentUsage, getUsageStats } = require('../utils/rateLimiter');
const axios = require('axios');

const router = express.Router();

// 서버 시작 시 매핑 캐시 초기화
if (global.savedMappings) global.savedMappings.clear();
if (global.savingMappings) global.savingMappings.clear();
console.log('🔄 파일 매핑 캐시 초기화 완료');

// 한글 파일명 디코딩 함수
function decodeFileName(fileName) {
  try {
    // 이미 올바른 한글이면 그대로 반환
    if (/^[a-zA-Z0-9가-힣\s\-_.\(\)]+$/.test(fileName)) {
      return fileName;
    }
    
    let decodedResult = fileName;
    
    // 1. Buffer를 통한 디코딩 시도
    try {
      const buffer = Buffer.from(fileName, 'latin1');
      const decoded = buffer.toString('utf8');
      
      // 디코딩 결과 검증
      if (decoded && decoded !== fileName && !/[�]/.test(decoded)) {
        decodedResult = decoded;
        console.log('🔄 Buffer 디코딩 성공:', { original: fileName, decoded: decodedResult });
      }
    } catch (bufferError) {
      console.log('⚠️ Buffer 디코딩 실패:', bufferError.message);
    }
    
    // 2. URI 디코딩 시도 (다중 디코딩 지원)
    let currentDecoded = decodedResult;
    for (let i = 0; i < 3; i++) {
      try {
        const uriDecoded = decodeURIComponent(currentDecoded);
        if (uriDecoded !== currentDecoded) {
          currentDecoded = uriDecoded;
          console.log(`🔄 URI 디코딩 ${i + 1}단계:`, { from: decodedResult, to: currentDecoded });
        } else {
          break; // 더 이상 디코딩할 것이 없음
        }
      } catch (uriError) {
        console.log(`⚠️ URI 디코딩 ${i + 1}단계 실패:`, uriError.message);
        break;
      }
    }
    
    // 3. base64 디코딩 시도 (파일명이 base64로 인코딩된 경우)
    if (/^[A-Za-z0-9+/=]+$/.test(fileName) && fileName.length % 4 === 0) {
      try {
        const base64Decoded = Buffer.from(fileName, 'base64').toString('utf8');
        if (base64Decoded && base64Decoded !== fileName) {
          console.log('🔄 Base64 디코딩 시도:', { original: fileName, decoded: base64Decoded });
          
          // Base64 디코딩 결과를 URI 디코딩
          try {
            const finalDecoded = decodeURIComponent(base64Decoded);
            if (finalDecoded !== base64Decoded) {
              currentDecoded = finalDecoded;
              console.log('🔄 Base64 + URI 디코딩 완료:', currentDecoded);
            }
          } catch (e) {
            currentDecoded = base64Decoded;
            console.log('🔄 Base64 디코딩만 적용:', currentDecoded);
          }
        }
      } catch (base64Error) {
        console.log('⚠️ Base64 디코딩 실패:', base64Error.message);
      }
    }
    
    return currentDecoded || fileName;
  } catch (error) {
    console.error('❌ 파일명 디코딩 오류:', error.message);
    return fileName;
  }
}

// 환경 감지 변수들 (파일 전체에서 사용)
const isProduction = process.env.NODE_ENV === 'production';
const isVercel = process.env.VERCEL === '1';

// uploads 폴더 제거: 모든 파일은 Supabase Storage에 저장, 임시 파일은 /tmp 사용

// 파일 업로드 설정 - Supabase Storage 사용 (모든 환경)
const storage = multer.memoryStorage(); // 모든 환경에서 Supabase 사용

// 기존 환경별 스토리지 설정 (주석 처리)
/*
const storage = process.env.NODE_ENV === 'production' 
  ? multer.memoryStorage()  // 프로덕션: 메모리 스토리지 (Supabase로 업로드)
  : multer.diskStorage({    // 개발환경: 디스크 스토리지
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
  limits: { 
    fileSize: 50 * 1024 * 1024, // 50MB로 증가
    fieldSize: 2 * 1024 * 1024   // 2MB
  },
  fileFilter: (req, file, cb) => {
    const decodedFileName = decodeFileName(file.originalname);
    
    console.log('🔍 파일 필터 검사:', {
      originalname: decodedFileName,
      rawOriginalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      platform: isVercel ? 'Vercel' : 'Local',
      maxSize: isVercel ? '4MB' : '50MB'
    });
    
    // 한컴오피스 MIME 타입 체크
    const isHancomExcel = file.mimetype === 'application/haansoftxlsx';
    if (isHancomExcel) {
      console.log('🏢 한컴오피스 Excel 파일 감지');
      if (isVercel) {
        console.warn('⚠️ Vercel 환경에서 한컴오피스 Excel 파일은 호환성 문제가 있을 수 있습니다');
      }
    }
    
    // 이진 형식 XLS 파일만 차단 (ZIP 형식은 허용)
    // 매직 바이트는 실제 파일 업로드 시 확인하고, 여기서는 기본 확장자 검증만 수행
    
    // 허용되는 파일 형식 검사 (Excel, CSV 허용)
    const allowedExtensions = ['.xlsx', '.xls', '.csv'];
    const hasValidExtension = allowedExtensions.some(ext => 
      path.extname(decodedFileName).toLowerCase() === ext
    );
    
    if (hasValidExtension) {
      console.log('✅ 파일 필터 통과:', decodedFileName);
      return cb(null, true);
    } else {
      console.log('❌ 파일 필터 실패:', { 
        fileName: decodedFileName, 
        extension: path.extname(decodedFileName).toLowerCase(),
        mimetype: file.mimetype 
      });
      cb(new Error('파일 형식이 지원되지 않습니다. Excel(.xlsx, .xls) 또는 CSV 파일만 업로드 가능합니다.'));
    }
  }
});

// 📁 파일 업로드 및 미리보기
router.post('/upload', upload.single('orderFile'), async (req, res) => {
  try {
    console.log('📁 파일 업로드 요청 수신');
    console.log('🌍 NODE_ENV:', process.env.NODE_ENV);
    
    if (!req.file) {
      console.log('❌ 파일이 업로드되지 않음');
      return res.status(400).json({ error: '파일이 업로드되지 않았습니다.' });
    }

    // 업로드된 파일 참조
    const file = req.file;
    
    // 한글 파일명 디코딩
    const originalFileName = decodeFileName(file.originalname);
    
    // 🔍 디버깅: req.body 전체 내용 확인
    console.log('🔍 req.body 전체:', req.body);
    console.log('🔍 req.body.fileType:', req.body.fileType);
    console.log('🔍 req.body.fileType 타입:', typeof req.body.fileType);
    
    // 한컴오피스 파일 감지 (강화된 다중 조건)
    const isHancomExcel = file.mimetype === 'application/haansoftxlsx' ||
                          (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' && 
                           (originalFileName.includes('한컴') || 
                            originalFileName.includes('Hancom') ||
                            originalFileName.includes('한셀') ||
                            originalFileName.includes('통합문서') ||
                            originalFileName.includes('워크시트')));
    
    // 한컴오피스 파일 감지 로그 강화
    if (isHancomExcel) {
      console.log('🏢 한컴오피스 Excel 파일 감지:', {
        mimeType: file.mimetype,
        fileName: originalFileName,
        감지방식: file.mimetype === 'application/haansoftxlsx' ? 'MIME 타입' : '파일명 패턴',
        파일크기: actualFileSize || file.size
      });
    }
    
    const actualFileSize = file.size || (file.buffer ? file.buffer.length : 0);
    
    console.log('📋 업로드된 파일 정보:', {
      originalName: originalFileName,
      rawOriginalName: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      actualSize: actualFileSize,
      bufferSize: file.buffer ? file.buffer.length : 0,
      encoding: file.encoding,
      fileType: req.body.fileType || 'order',
      isHancomExcel: isHancomExcel,
      platform: isVercel ? 'Vercel' : 'Local'
    });
    
    // 파일 크기 검증 (한컴오피스 파일 특수 처리)
    if (file.buffer && file.buffer.length > 0) {
      const bufferSizeMB = file.buffer.length / 1024 / 1024;
      const vercelLimit = 4; // 4MB
      
      if (isVercel && bufferSizeMB > vercelLimit) {
        console.error(`❌ Vercel 환경 파일 크기 초과: ${bufferSizeMB.toFixed(2)}MB > ${vercelLimit}MB`);
        
        if (isHancomExcel) {
          return res.status(400).json({ 
            error: `한컴오피스 Excel 파일이 너무 큽니다 (${bufferSizeMB.toFixed(2)}MB). Vercel 환경에서는 4MB 이하로 제한됩니다. 파일을 압축하거나 Microsoft Excel로 다시 저장해주세요.`,
            fileType: 'hancom-excel-too-large',
            fileName: originalFileName,
            fileSize: `${bufferSizeMB.toFixed(2)}MB`
          });
        } else {
          return res.status(400).json({ 
            error: `파일이 너무 큽니다 (${bufferSizeMB.toFixed(2)}MB). Vercel 환경에서는 4MB 이하로 제한됩니다.`,
            fileType: 'file-too-large',
            fileName: originalFileName,
            fileSize: `${bufferSizeMB.toFixed(2)}MB`
          });
        }
      }
      
      if (isHancomExcel) {
        console.log(`🏢 한컴오피스 Excel 파일 처리: ${bufferSizeMB.toFixed(2)}MB`);
      }
    } else {
      console.error('❌ 파일 버퍼가 없거나 크기가 0입니다');
      return res.status(400).json({ 
        error: '파일을 읽을 수 없습니다. 다시 업로드해주세요.',
        fileName: originalFileName
      });
    }

    // .xls 파일 처리 개선: 확장자를 .xlsx로 변경해서 시도
    let processFileName = originalFileName;
    let isXlsFile = false;
    if (originalFileName.toLowerCase().endsWith('.xls') && !originalFileName.toLowerCase().endsWith('.xlsx')) {
      isXlsFile = true;
      processFileName = originalFileName.slice(0, -4) + '.xlsx'; // .xls → .xlsx로 변경
      console.log('🔄 .xls 파일 감지 - .xlsx로 확장자 변경 후 처리 시도:', {
        original: originalFileName,
        converted: processFileName
      });
    }

    // 매우 구형 BIFF 포맷 파일 확인 (매직 바이트 검사, Excel 2016+ 호환)
    if (file.buffer && file.buffer.length >= 8) {
      const bytes = file.buffer;
      
      console.log('🔍 서버 Excel 파일 포맷 확인:', originalFileName);
      console.log('📋 파일 크기:', `${(file.buffer.length / 1024 / 1024).toFixed(2)}MB`);
      console.log('🌍 플랫폼:', isVercel ? 'Vercel' : 'Local');
      if (!isVercel) {
        console.log('📋 첫 16바이트:', Array.from(bytes.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' '));
      }
      
      let isBiffBlocked = false;
      
      // 1. ZIP 형식 확인 (OOXML, BIFF12 등)
      if (bytes.length >= 4) {
        const isZIP = bytes[0] === 0x50 && bytes[1] === 0x4B &&
                     (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07) &&
                     (bytes[3] === 0x04 || bytes[3] === 0x06 || bytes[3] === 0x08);
        
        if (isZIP) {
          console.log('✅ ZIP 기반 Excel 파일 감지 (OOXML/BIFF12):', originalFileName);
          // ZIP 형식이면 OOXML 또는 BIFF12 (허용)
        } else {
          // 2. Vercel 환경에서 안전한 BIFF/OLE2 검사
          try {
            const biffSignature = (bytes[1] << 8) | bytes[0]; // Little-endian
            const biffVersion = (bytes[3] << 8) | bytes[2];
            
            // 매우 구형인 BIFF2-BIFF5만 차단 (BIFF8은 Excel 2016+ 호환)
            if (biffSignature === 0x0009 || biffSignature === 0x0209 || 
                biffSignature === 0x0409 || biffSignature === 0x0805) {
              console.log('❌ 매우 구형 BIFF 시그니처 감지:', originalFileName, 'Signature:', biffSignature.toString(16));
              isBiffBlocked = true;
            } else {
              // OLE2 구조는 Excel 2016에서도 사용하므로 허용
              const isOLE2 = bytes[0] === 0xD0 && bytes[1] === 0xCF && 
                             bytes[2] === 0x11 && bytes[3] === 0xE0 &&
                             bytes[4] === 0xA1 && bytes[5] === 0xB1 &&
                             bytes[6] === 0x1A && bytes[7] === 0xE1;
              
              if (isOLE2) {
                console.log('✅ OLE2 구조 감지 (Excel 2016 호환):', originalFileName);
                
                // Vercel 환경에서 구형 파일 크기 추가 체크
                if (isVercel && file.buffer.length > 3 * 1024 * 1024) { // 3MB 초과
                  console.warn('⚠️ Vercel 환경에서 큰 구형 파일 감지:', `${(file.buffer.length / 1024 / 1024).toFixed(2)}MB`);
                  isBiffBlocked = true;
                  return res.status(400).json({ 
                    error: 'Vercel 환경에서는 3MB 이상의 구형 Excel 파일(.xls)을 처리할 수 없습니다. 파일을 .xlsx 형식으로 변환하거나 크기를 줄여주세요.',
                    fileType: 'large-xls-vercel',
                    fileName: originalFileName,
                    fileSize: `${(file.buffer.length / 1024 / 1024).toFixed(2)}MB`
                  });
                }
              }
            }
          } catch (biffError) {
            console.error('❌ BIFF/OLE2 시그니처 검사 실패:', biffError.message);
            if (isVercel) {
              console.log('⚠️ Vercel 환경에서 시그니처 검사 실패 - 안전하게 처리 진행');
              // Vercel에서는 시그니처 검사 실패 시 안전하게 진행
            } else {
              throw biffError;
            }
          }
        }
      }
      
      // 구형 BIFF 포맷 차단
      if (isBiffBlocked) {
        return res.status(400).json({ 
          error: '매우 구형 BIFF 포맷 Excel 파일은 지원되지 않습니다. Excel에서 .xlsx 형식으로 저장 후 업로드해주세요.',
          fileType: 'binary-xls',
          fileName: originalFileName
        });
      }
    }

    // 파일명 생성 (.xls 파일의 경우 .xlsx 확장자 사용)
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    
    const fileType = req.body.fileType || 'order';
    const filePrefix = fileType === 'order' ? 'orderFile' : 'supplierFile';
    const targetExtension = isXlsFile ? '.xlsx' : path.extname(originalFileName);
    const fileName = filePrefix + '-' + uniqueSuffix + targetExtension;
    
    // Supabase Storage에 업로드 (모든 환경, uploads bucket 사용)
    console.log('📤 Supabase Storage 업로드 중...', {
      fileName: fileName,
      fileSize: file.buffer.length,
      bucket: 'uploads',
      timestamp: new Date().toISOString()
    });
    
    const uploadResult = await uploadFile(file.buffer, fileName);
    if (!uploadResult.success) {
      console.error('❌ Supabase Storage 업로드 실패:', uploadResult.error);
      return res.status(500).json({ 
        error: 'Supabase Storage 업로드 실패', 
        details: uploadResult.error 
      });
    }
    
    const filePath = fileName; // Supabase에서는 파일명만 저장
    const fileBuffer = file.buffer;
    
    console.log('✅ Supabase 업로드 성공:', {
      fileName: fileName,
      uploadTime: new Date().toISOString()
    });

    // 기존 환경별 파일 처리 (주석 처리)
    /*
    let filePath;
    let fileBuffer;

    if (process.env.NODE_ENV === 'production') {
      // 프로덕션: Supabase Storage에 업로드
      console.log('📤 Supabase Storage 업로드 중...');
      
      const uploadResult = await uploadFile(file.buffer, fileName);
      if (!uploadResult.success) {
        return res.status(500).json({ 
          error: 'Supabase Storage 업로드 실패', 
          details: uploadResult.error 
        });
      }
      
      filePath = fileName; // Supabase에서는 파일명만 저장
      fileBuffer = file.buffer;
      
      console.log('✅ Supabase 업로드 성공:', fileName);
    } else {
      // 개발환경: 로컬 디스크 저장
      filePath = file.path;
      fileBuffer = fs.readFileSync(filePath);
      
      console.log('✅ 로컬 파일 저장 성공:', {
        originalName: file.originalname,
        filename: file.filename,
        size: file.size,
        path: filePath
      });
    }
    */

    const fileExtension = path.extname(originalFileName).toLowerCase();
    
    let previewData = [];
    let headers = [];

    if (fileExtension === '.csv') {
      // CSV 파일 처리 - 한글 인코딩 자동 감지 및 개선된 파싱 로직
      let csvData;
      
      // 인코딩 자동 감지 및 변환
      try {
        // BOM 확인
        const hasBom = fileBuffer.length >= 3 && 
                      fileBuffer[0] === 0xEF && 
                      fileBuffer[1] === 0xBB && 
                      fileBuffer[2] === 0xBF;
        
        if (hasBom) {
          // UTF-8 BOM이 있는 경우
          console.log('📄 UTF-8 BOM 감지됨');
          csvData = fileBuffer.slice(3).toString('utf8');
        } else {
          // 여러 인코딩으로 시도
          const encodings = ['utf8', 'euc-kr', 'cp949'];
          let bestEncoding = 'utf8';
          let bestScore = 0;
          
          for (const encoding of encodings) {
            try {
              const testData = iconv.decode(fileBuffer, encoding);
              
              // 한글 문자가 제대로 디코딩되었는지 확인
              const koreanScore = (testData.match(/[가-힣]/g) || []).length;
              const invalidScore = (testData.match(/[�]/g) || []).length;
              const finalScore = koreanScore - (invalidScore * 10); // 깨진 문자에 패널티
              
              console.log(`📊 ${encoding} 인코딩 점수: ${finalScore} (한글: ${koreanScore}, 깨짐: ${invalidScore})`);
              
              if (finalScore > bestScore) {
                bestScore = finalScore;
                bestEncoding = encoding;
              }
            } catch (error) {
              console.log(`⚠️ ${encoding} 인코딩 실패:`, error.message);
            }
          }
          
          console.log(`✅ 최적 인코딩 선택: ${bestEncoding} (점수: ${bestScore})`);
          csvData = iconv.decode(fileBuffer, bestEncoding);
        }
      } catch (error) {
        console.error('❌ 인코딩 감지 실패, UTF-8로 처리:', error);
        csvData = fileBuffer.toString('utf8');
      }
      
      const lines = csvData.split('\n').filter(line => line.trim());
      
      if (lines.length > 0) {
        // 개선된 CSV 파싱 함수
        function parseCSVLine(line) {
          const result = [];
          let current = '';
          let inQuotes = false;
          let i = 0;
          
          while (i < line.length) {
            const char = line[i];
            const nextChar = line[i + 1];
            
            if (char === '"') {
              if (inQuotes && nextChar === '"') {
                // 연속된 따옴표는 하나의 따옴표로 처리
                current += '"';
                i += 2;
                continue;
              } else {
                // 따옴표 시작/끝
                inQuotes = !inQuotes;
              }
            } else if (char === ',' && !inQuotes) {
              // 따옴표 밖의 쉼표는 구분자
              result.push(current.trim());
              current = '';
            } else {
              current += char;
            }
            i++;
          }
          
          // 마지막 필드 추가
          result.push(current.trim());
          return result;
        }
        
        // 헤더 파싱 및 빈 필드 제거
        const rawHeaders = parseCSVLine(lines[0]).map(h => h.replace(/^"|"$/g, '').trim());
        
        // 빈 헤더나 의미 없는 헤더 제거
        const validHeaderIndices = [];
        const cleanHeaders = [];
        
        rawHeaders.forEach((header, index) => {
          // 유효한 헤더 조건: 비어있지 않고, 공백이 아니며, 의미 있는 텍스트
          if (header && 
              header.length > 0 && 
              header !== 'undefined' && 
              header !== 'null' && 
              !header.match(/^[\s,]+$/)) {
            validHeaderIndices.push(index);
            cleanHeaders.push(header);
          }
        });
        
        headers = cleanHeaders;
        console.log(`📋 헤더 정리: ${rawHeaders.length} → ${headers.length}개 (유효한 필드만)`);
        
        // 데이터 파싱 (상위 20행, 유효한 컬럼만)
        const rawDataLines = lines.slice(1, 21);
        previewData = [];
        
        rawDataLines.forEach((line, lineIndex) => {
          const values = parseCSVLine(line);
          const rowData = {};
          let hasValidData = false;
          
          // 유효한 헤더 인덱스에 해당하는 데이터만 추출
          validHeaderIndices.forEach((headerIndex, cleanIndex) => {
            const header = headers[cleanIndex];
            const value = values[headerIndex] ? values[headerIndex].replace(/^"|"$/g, '').trim() : '';
            
            rowData[header] = value;
            
            // 빈 값이 아니면 유효한 데이터가 있다고 표시
            if (value && value.length > 0) {
              hasValidData = true;
            }
          });
          
          // 유효한 데이터가 있는 행만 추가
          if (hasValidData) {
            previewData.push(rowData);
          } else {
            console.log(`⚠️ 빈 행 제외 (행 ${lineIndex + 2}): 유효한 데이터 없음`);
          }
        });
        
        console.log('✅ CSV 파싱 완료:', {
          원본헤더: rawHeaders.length,
          정리된헤더: headers.length,
          원본행수: rawDataLines.length,
          유효행수: previewData.length,
          샘플헤더: headers.slice(0, 5),
          샘플데이터: previewData.slice(0, 2)
        });
      }
    } else {
      // Excel 파일 처리 - 개선된 로직 사용
      // tempFilePath를 try 블록 밖에서 선언 (스코프 문제 해결)
      let tempFilePath = null;
      
      try {
        console.log('🔄 Excel 파일 처리 시작:', {
          fileSize: fileBuffer.length,
          timestamp: new Date().toISOString()
        });

        // 메모리에서 직접 Excel 파일 처리 (안전한 방식)
        console.log('🔄 메모리에서 직접 Excel 파일 처리:', {
          fileSize: fileBuffer.length,
          originalFile: originalFileName,
          처리방식: '메모리 기반 (서버리스 환경 최적화)',
          환경정보: {
            NODE_ENV: process.env.NODE_ENV,
            isProduction: process.env.NODE_ENV === 'production',
            platform: process.env.VERCEL ? 'vercel' : (process.env.RENDER ? 'render' : 'local')
          }
        });
        
        // Excel 파일 처리 결과를 저장할 변수 (스코프 문제 해결)
        let excelData = null;
        
        // .xls 파일 또는 한컴오피스 파일 특수 처리 (메모리에서 직접)
        if (isXlsFile || isHancomExcel) {
          const fileTypeLabel = isXlsFile ? '.xls 파일' : '한컴오피스 Excel 파일';
          console.log(`🔄 ${fileTypeLabel}을 xlsx 라이브러리로 직접 처리...`);
          
          const XLSX = require('xlsx');
          
                      // 플랫폼별 타임아웃 적용
            const timeout = isVercel ? 20000 : 60000;
          
          const xlsProcessing = new Promise((resolve, reject) => {
            try {
              // .xls 파일을 버퍼에서 직접 읽기 (파일이 아닌 메모리에서)
              // Vercel 환경에서 메모리 최적화 옵션 적용
              const xlsxOptions = {
                type: 'buffer',
                cellDates: true,
                cellNF: false,
                cellText: false
              };
              
              // Vercel 환경에서 추가 최적화
              if (isVercel) {
                xlsxOptions.sheetStubs = false;    // 빈 셀 스텁 제거 (메모리 절약)
                xlsxOptions.bookVBA = false;       // VBA 제거 
                xlsxOptions.bookFiles = false;     // 파일 정보 제거
                xlsxOptions.bookProps = false;     // 속성 제거
                xlsxOptions.dense = true;          // 밀집 모드 (메모리 절약)
                console.log('⚡ Vercel 환경 - 메모리 최적화 옵션 적용');
              }
              
              // 한컴오피스 파일 특수 처리 (강화된 옵션)
              if (isHancomExcel) {
                xlsxOptions.codepage = 949;           // 한국어 코드페이지 (EUC-KR)
                xlsxOptions.raw = false;              // 포맷팅된 값 사용
                xlsxOptions.dateNF = 'yyyy-mm-dd';    // 날짜 형식 표준화
                xlsxOptions.cellText = true;          // 텍스트 우선 처리
                xlsxOptions.bookSST = true;           // 공유 문자열 테이블 활성화
                xlsxOptions.cellFormula = false;      // 수식 비활성화 (안정성)
                xlsxOptions.cellStyles = false;       // 스타일 정보 생략 (메모리 절약)
                xlsxOptions.WTF = false;              // 엄격한 파싱 모드
                console.log('🏢 한컴오피스 Excel 파일 강화된 특수 옵션 적용:', {
                  코드페이지: xlsxOptions.codepage,
                  텍스트처리: xlsxOptions.cellText,
                  공유문자열: xlsxOptions.bookSST
                });
              }
              
              const workbook = XLSX.read(fileBuffer, xlsxOptions);
              
              console.log('✅ .xls 파일 워크북 로드 성공');
              console.log('📋 워크북 정보:', {
                파일명: originalFileName,
                워크시트수: workbook.SheetNames.length,
                워크시트목록: workbook.SheetNames,
                한컴오피스여부: isHancomExcel
              });
              
              // 첫 번째 워크시트 선택
              const firstSheetName = workbook.SheetNames[0];
              const worksheet = workbook.Sheets[firstSheetName];
              
              // 워크시트 상세 정보 로그
              if (worksheet) {
                const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:A1');
                console.log('📊 워크시트 상세 정보:', {
                  워크시트명: firstSheetName,
                  범위: worksheet['!ref'],
                  시작행: range.s.r,
                  끝행: range.e.r,
                  시작열: range.s.c,
                  끝열: range.e.c,
                  총행수: range.e.r - range.s.r + 1,
                  총열수: range.e.c - range.s.c + 1
                });
              }
              
              if (!worksheet) {
                throw new Error('워크시트를 찾을 수 없습니다');
              }
              
              // 워크시트를 JSON으로 변환 - 한컴오피스 파일 특수 처리
              let jsonData = [];
              
              try {
                // 첫 번째 시도: 기본 옵션
                jsonData = XLSX.utils.sheet_to_json(worksheet, { 
                  header: 1,
                  defval: '',
                  raw: false 
                });
                
                console.log('📊 JSON 변환 결과 (기본 옵션):', {
                  파일명: originalFileName,
                  변환된행수: jsonData.length,
                  첫행샘플: jsonData[0] ? jsonData[0].slice(0, 5) : null
                });
                
                // 한컴오피스 파일이고 데이터가 없다면 다른 옵션 시도
                if (isHancomExcel && jsonData.length === 0) {
                  console.log('🔄 한컴오피스 파일 - 대안 변환 옵션 시도...');
                  
                  // 두 번째 시도: raw 모드
                  jsonData = XLSX.utils.sheet_to_json(worksheet, { 
                    header: 1,
                    defval: '',
                    raw: true,
                    dateNF: 'yyyy-mm-dd'
                  });
                  
                  console.log('📊 JSON 변환 결과 (raw 모드):', {
                    변환된행수: jsonData.length,
                    첫행샘플: jsonData[0] ? jsonData[0].slice(0, 5) : null
                  });
                }
                
                // 여전히 데이터가 없다면 셀 단위로 직접 읽기 시도
                if (isHancomExcel && jsonData.length === 0 && worksheet['!ref']) {
                  console.log('🔄 한컴오피스 파일 - 셀 단위 직접 읽기 시도...');
                  
                  const range = XLSX.utils.decode_range(worksheet['!ref']);
                  const directData = [];
                  
                  for (let row = range.s.r; row <= Math.min(range.e.r, range.s.r + 50); row++) {
                    const rowData = [];
                    for (let col = range.s.c; col <= range.e.c; col++) {
                      const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
                      const cell = worksheet[cellAddress];
                      rowData.push(cell ? (cell.v || cell.w || '') : '');
                    }
                    if (rowData.some(cell => cell && cell.toString().trim())) {
                      directData.push(rowData);
                    }
                  }
                  
                  if (directData.length > 0) {
                    jsonData = directData;
                    console.log('✅ 셀 단위 직접 읽기 성공:', {
                      읽은행수: jsonData.length,
                      첫행샘플: jsonData[0] ? jsonData[0].slice(0, 5) : null
                    });
                  }
                }
                
              } catch (conversionError) {
                console.error('❌ JSON 변환 실패:', conversionError);
                throw new Error(`Excel 파일 변환 실패: ${conversionError.message}`);
              }
              
              if (jsonData.length === 0) {
                console.error('❌ Excel 파일이 비어있습니다:', {
                  파일명: originalFileName,
                  워크시트명: firstSheetName,
                  워크시트범위: worksheet['!ref'],
                  한컴오피스여부: isHancomExcel
                });
                throw new Error('Excel 파일에 데이터가 없습니다. 헤더와 데이터가 포함된 파일을 업로드해주세요.');
              }
              
              // 첫 번째 행 확인
              if (!jsonData[0] || jsonData[0].length === 0) {
                console.error('❌ Excel 파일의 첫 번째 행이 비어있습니다:', originalFileName);
                throw new Error('Excel 파일의 첫 번째 행(헤더)이 비어있습니다. 헤더가 포함된 파일을 업로드해주세요.');
              }
              
              // 헤더 추출 (첫 번째 행) - 빈 헤더도 포함하되 완전히 비어있지 않은 경우만
              const rawHeaders = jsonData[0] || [];
              const extractedHeaders = rawHeaders.map((header, index) => {
                if (header && header.toString().trim()) {
                  return header.toString().trim();
                } else {
                  // 빈 헤더인 경우 컬럼 위치로 대체
                  return `컬럼${index + 1}`;
                }
              }).filter((header, index) => {
                // 연속된 빈 컬럼들은 실제 데이터가 있는 경우만 포함
                if (header.startsWith('컬럼')) {
                  // 해당 컬럼에 데이터가 있는지 확인
                  for (let i = 1; i < Math.min(6, jsonData.length); i++) {
                    if (jsonData[i] && jsonData[i][index] && jsonData[i][index].toString().trim()) {
                      return true;
                    }
                  }
                  return false;
                }
                return true;
              });
              
              // 헤더 추출 결과 검증
              if (extractedHeaders.length === 0) {
                console.error('❌ 유효한 헤더를 찾을 수 없습니다:', {
                  파일명: originalFileName,
                  원시헤더: rawHeaders,
                  첫행길이: rawHeaders.length,
                  전체행수: jsonData.length
                });
                throw new Error('Excel 파일에서 유효한 헤더(컬럼명)를 찾을 수 없습니다. 첫 번째 행에 컬럼명이 있는지 확인해주세요.');
              }
              
              console.log('🔍 헤더 추출 상세 정보:', {
                파일명: originalFileName,
                원시헤더: rawHeaders,
                추출된헤더: extractedHeaders,
                헤더개수: extractedHeaders.length
              });
              
              // 데이터 추출 (2행부터, 상위 20행만)
              const extractedData = [];
              for (let i = 1; i < Math.min(21, jsonData.length); i++) {
                const row = jsonData[i];
                const rowData = {};
                
                extractedHeaders.forEach((header, index) => {
                  rowData[header] = row[index] || '';
                });
                
                extractedData.push(rowData);
              }
              
              const fileTypeLabel = isXlsFile ? '.xls 파일' : '한컴오피스 Excel 파일';
              console.log(`✅ ${fileTypeLabel} 처리 완료:`, {
                파일타입: fileTypeLabel,
                플랫폼: isVercel ? 'Vercel' : 'Local',
                헤더개수: extractedHeaders.length,
                데이터행수: extractedData.length,
                헤더목록: extractedHeaders, // 전체 헤더 표시
                한컴오피스여부: isHancomExcel
              });
              
              resolve({
                headers: extractedHeaders,
                data: extractedData
              });
              
            } catch (error) {
              console.error('❌ xlsx 라이브러리 .xls 처리 실패:', error);
              reject(error);
            }
          });
          
                     excelData = await Promise.race([
             xlsProcessing,
             new Promise((_, reject) => 
               setTimeout(() => reject(new Error(`XLS 파일 처리 시간 초과 (${timeout/1000}초)`)), timeout)
             )
           ]);
           
           headers = excelData.headers;
           previewData = excelData.data; // 이미 20행으로 제한됨
          
        } else {
           // 일반 .xlsx 파일 처리 (메모리 기반, 한컴오피스 제외)
           console.log('🔄 일반 Excel 파일 읽기 시작... (Microsoft Excel 형식)');
           
           // XLSX 라이브러리를 사용한 메모리 기반 처리
           const XLSX = require('xlsx');
           
           const xlsxOptions = {
             type: 'buffer',
             cellDates: true,
             cellNF: false,
             cellText: false,
             raw: false
           };
           
           // 메모리에서 직접 워크북 읽기
           const workbook = XLSX.read(fileBuffer, xlsxOptions);
           
           if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
             throw new Error('워크시트가 없습니다.');
           }
           
           const firstSheetName = workbook.SheetNames[0];
           const worksheet = workbook.Sheets[firstSheetName];
           
           // JSON 데이터로 변환
           const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
             header: 1, 
             raw: false, 
             defval: '',
             blankrows: false
           });
           
           // 헤더 찾기
           let headers = [];
           let headerRowIndex = 0;
           
           for (let i = 0; i < Math.min(5, jsonData.length); i++) {
             const row = jsonData[i];
             if (row && row.length > 2) {
               const nonEmptyCount = row.filter(cell => cell && cell.toString().trim() !== '').length;
               if (nonEmptyCount >= 3) {
                 headers = row.filter(cell => cell && cell.toString().trim() !== '')
                             .map(cell => cell.toString().trim());
                 headerRowIndex = i;
                 break;
               }
             }
           }
           
           if (headers.length === 0) {
             throw new Error('헤더를 찾을 수 없습니다.');
           }
           
           // 데이터 처리 (상위 20행만)
           const data = [];
           const maxRows = Math.min(headerRowIndex + 21, jsonData.length); // 헤더 + 20행
           
           for (let i = headerRowIndex + 1; i < maxRows; i++) {
             const row = jsonData[i];
             if (row && row.some(cell => cell !== undefined && cell !== null && cell !== '')) {
               const rowData = {};
               headers.forEach((header, index) => {
                 const cellValue = row[index];
                 rowData[header] = cellValue !== undefined && cellValue !== null ? cellValue.toString().trim() : '';
               });
               data.push(rowData);
             }
           }
           
           headers = headers;
           previewData = data;
           
           console.log('✅ 일반 Excel 파일 처리 완료:', {
             파일타입: 'Microsoft Excel (.xlsx)',
             플랫폼: isVercel ? 'Vercel' : 'Local',
             헤더개수: headers ? headers.length : 0,
             데이터행수: previewData ? previewData.length : 0,
             헤더목록: headers || [], // 전체 헤더 표시
             한컴오피스여부: isHancomExcel
           });
        }
        
        console.log('✅ Excel 파일 처리 완료:', {
          worksheets: '자동 선택됨',
          headers: headers.length,
          dataRows: excelData.data.length,
          previewRows: previewData.length,
          processingTime: new Date().toISOString()
        });
        
        // 즉시 임시 파일 삭제 (메모리 절약)
        setImmediate(() => {
          try {
            if (tempFilePath && fs.existsSync(tempFilePath)) {
              fs.unlinkSync(tempFilePath);
              console.log(`🗑️ 임시 파일 삭제 완료: ${tempFilePath} ${isXlsFile ? '(.xls 처리 완료)' : ''}`);
            }
          } catch (deleteError) {
            console.warn('⚠️ 임시 파일 삭제 실패 (무시됨):', deleteError.message);
          }
        });
        
      } catch (excelError) {
        console.error('❌ 개선된 Excel 처리 실패:', {
          error: excelError.message,
          stack: excelError.stack?.split('\n')[0],
          fileName: originalFileName,
          fileSize: fileBuffer.length
        });
        
        // .xls 파일(.xlsx 처리 실패) 또는 시간 초과인 경우 빠른 실패
        if (isXlsFile || 
            excelError.message.includes('시간 초과') ||
            excelError.message.includes('timeout')) {
          
          // 임시 파일 즉시 정리 (안전한 방식)
          setImmediate(() => {
            try {
              if (tempFilePath && fs.existsSync(tempFilePath)) {
                fs.unlinkSync(tempFilePath);
                console.log('🗑️ XLS 실패 후 임시 파일 삭제 완료');
              }
            } catch (cleanupError) {
              console.warn('⚠️ 임시 파일 정리 실패:', cleanupError.message);
            }
          });
          
          console.log('⚠️ 구형 XLS 파일 또는 시간 초과 - 즉시 실패');
          throw new Error(`구형 Excel 파일(.xls)은 지원이 제한적입니다. 다음 방법을 시도해보세요:

1. Excel에서 파일을 열고 "다른 이름으로 저장" → "Excel 통합 문서(.xlsx)" 선택
2. 또는 Google Sheets에서 열고 .xlsx 형식으로 다운로드

문제가 계속되면 CSV 형식으로 저장해보세요.`);
        }
        
        // production 환경에서는 fallback 제한
        if (isProduction) {
          // 임시 파일 정리 (안전한 방식)
          setImmediate(() => {
            try {
              if (tempFilePath && fs.existsSync(tempFilePath)) {
                fs.unlinkSync(tempFilePath);
                console.log('🗑️ Production 실패 후 임시 파일 삭제 완료');
              }
            } catch (cleanupError) {
              console.warn('⚠️ 임시 파일 정리 실패:', cleanupError.message);
            }
          });
          
          console.log('❌ Production 환경에서 fallback 제한');
          throw new Error('파일 처리에 실패했습니다. 파일이 손상되었거나 지원되지 않는 형식일 수 있습니다.');
        }
        
        // 개발 환경에서만 기본 방식으로 fallback
        try {
          console.log('🔄 기본 Excel 처리 방식으로 fallback...');
          const workbook = new ExcelJS.Workbook();
          
          // 메타데이터 기본값 설정 (company 오류 방지)
          workbook.creator = 'AutoOrder System';
          workbook.company = 'AutoOrder';
          workbook.created = new Date();
          workbook.modified = new Date();
          
          // fallback도 타임아웃 적용 (10초) - 안전한 로딩 옵션 포함
          await Promise.race([
            workbook.xlsx.load(fileBuffer, { 
              ignoreCalculatedFields: true,
              styles: false,
              hyperlinks: false,
              drawings: false 
            }),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Fallback 처리 시간 초과 (10초)')), 10000)
            )
          ]);
          const worksheet = workbook.getWorksheet(1);
          
          if (worksheet) {
            const firstRow = worksheet.getRow(1);
            headers = [];
            firstRow.eachCell((cell, colNumber) => {
              let cellValue = cell.value;
              
              // 객체를 문자열로 변환
              if (cellValue && typeof cellValue === 'object') {
                if (cellValue.richText && Array.isArray(cellValue.richText)) {
                  // 리치 텍스트 처리
                  cellValue = cellValue.richText.map(item => item.text || '').join('');
                } else if (Array.isArray(cellValue)) {
                  cellValue = cellValue.join(', ');
                } else if (cellValue.toString && typeof cellValue.toString === 'function') {
                  cellValue = cellValue.toString();
                } else {
                  cellValue = JSON.stringify(cellValue);
                }
              }
              
              headers.push(cellValue ? cellValue.toString() : `컬럼${colNumber}`);
            });

            // 상위 20행까지 미리보기 데이터 생성
            for (let rowNumber = 2; rowNumber <= Math.min(21, worksheet.rowCount); rowNumber++) {
              const row = worksheet.getRow(rowNumber);
              const rowData = {};
              
              headers.forEach((header, index) => {
                const cell = row.getCell(index + 1);
                let cellValue = cell.value;
                
                // 객체를 문자열로 변환 (미리보기에서도 richText 처리)
                if (cellValue && typeof cellValue === 'object') {
                  if (cellValue.richText && Array.isArray(cellValue.richText)) {
                    // 리치 텍스트 처리
                    cellValue = cellValue.richText.map(item => item.text || '').join('');
                  } else if (Array.isArray(cellValue)) {
                    cellValue = cellValue.join(', ');
                  } else if (cellValue.toString && typeof cellValue.toString === 'function') {
                    cellValue = cellValue.toString();
                  } else {
                    cellValue = JSON.stringify(cellValue);
                  }
                }
                
                rowData[header] = cellValue ? cellValue.toString() : '';
              });
              
              previewData.push(rowData);
            }
            
            console.log('✅ 기본 Excel 처리 완료:', {
              headers: headers.length,
              previewRows: previewData.length
            });
          }
        } catch (fallbackError) {
          console.error('❌ 기본 Excel 처리도 실패:', fallbackError.message);
          
          // 임시 파일 정리 (안전한 방식)
          setImmediate(() => {
            try {
              if (tempFilePath && fs.existsSync(tempFilePath)) {
                fs.unlinkSync(tempFilePath);
                console.log('🗑️ 실패 후 임시 파일 삭제 완료');
              }
            } catch (cleanupError) {
              console.warn('⚠️ 임시 파일 정리 실패:', cleanupError.message);
            }
          });
          
          // .xls 파일인 경우 특별 안내 메시지 (xlsx 라이브러리로도 실패한 경우)
          if (isXlsFile) {
            throw new Error(`❌ .xls 파일 처리 실패\n\n📁 파일: ${originalFileName}\n\n🔄 xlsx 라이브러리로 직접 처리를 시도했지만 실패했습니다.\n\n파일이 손상되었거나 매우 구형 형식일 수 있습니다.\n\n✅ 해결 방법:\n1. Excel에서 파일을 열고 "다른 이름으로 저장"\n2. "Excel 통합 문서(.xlsx)" 형식으로 저장\n3. 저장된 .xlsx 파일을 다시 업로드\n\n💡 또는 Google Sheets에서 열고 .xlsx로 다운로드하세요.\n\n⚠️ 상세 오류: ${fallbackError.message}`);
          } else {
            throw new Error(`Excel 파일 처리 실패: ${fallbackError.message}`);
          }
        }
      }
    }

    // 데이터 검증 (파일 업로드 단계에서는 필수 컬럼 검증 제외)
    const validation = validateOrderData(previewData, headers, { skipRequiredColumnCheck: true });

    console.log('✅ 파일 처리 완료:', {
      headers: headers.length,
      previewRows: previewData.length,
      isValid: validation.isValid
    });

    // 📝 파일명 매핑 저장 (한글 파일명인 경우에만)
    const shouldSaveMapping = /[가-힣]/.test(originalFileName); // 한글이 포함된 파일명만
    
    if (shouldSaveMapping) {
      try {
        // 중복 저장 방지를 위한 플래그
        const mappingKey = `${originalFileName}_${fileName}`;
        
        // 이미 매핑이 저장되었거나 진행 중인지 확인
        if (!global.savedMappings) global.savedMappings = new Set();
        
        if (global.savedMappings.has(mappingKey)) {
          console.log('ℹ️ 이미 매핑 저장됨 - 스킵:', mappingKey);
        } else if (global.savingMappings && global.savingMappings.has(mappingKey)) {
          console.log('⚠️ 이미 매핑 저장 중 - 스킵:', mappingKey);
        } else {
      
      // 매핑 저장 시작 표시
      if (!global.savingMappings) global.savingMappings = new Set();
      global.savingMappings.add(mappingKey);
      
      console.log('💾 파일명 매핑 저장 시작:', { originalFileName, fileName });
      
      const mappingPromises = [];
      
      // 메타데이터 준비 (한컴오피스 파일 정보 포함)
      const fileMetadata = {
        fileSize: file.buffer ? file.buffer.length : null,
        mimeType: file.mimetype,
        isHancomExcel: isHancomExcel
      };
      
      // 1. Base64 인코딩된 파일명으로 매핑 (프론트엔드 캐시 ID 대응)
      const base64FileName = Buffer.from(originalFileName).toString('base64');
      mappingPromises.push(
        saveFileMapping(base64FileName, fileName, originalFileName, 'uploads', fileMetadata)
          .catch(err => console.warn('⚠️ Base64 매핑 저장 실패:', err.message))
      );
      
      // 2. URL 인코딩된 원본 파일명도 매핑 (한글 지원)
      const urlEncodedFileName = encodeURIComponent(originalFileName);
      if (urlEncodedFileName !== originalFileName) {
        mappingPromises.push(
          saveFileMapping(urlEncodedFileName, fileName, originalFileName, 'uploads', fileMetadata)
            .catch(err => console.warn('⚠️ URL 인코딩 매핑 저장 실패:', err.message))
        );
      }

      // 3. 한글 파일명을 안전한 키로 변환하여 매핑
      const safeFileName = Buffer.from(originalFileName).toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '') + '_safe';
      mappingPromises.push(
        saveFileMapping(safeFileName, fileName, originalFileName, 'uploads', fileMetadata)
          .catch(err => console.warn('⚠️ Safe 키 매핑 저장 실패:', err.message))
      );
      
      // 모든 매핑을 병렬로 저장 (실패해도 전체 업로드는 성공)
      const results = await Promise.allSettled(mappingPromises);
      const successCount = results.filter(r => r.status === 'fulfilled').length;
      
      console.log('✅ 파일명 매핑 저장 완료:', {
        originalFileName: originalFileName,
        actualFileName: fileName,
        successCount: successCount,
        totalAttempts: mappingPromises.length
      });
      
      // 매핑 저장 완료 표시
      global.savingMappings.delete(mappingKey);
      
      // 성공적으로 저장된 매핑 캐시에 추가
      if (successCount > 0) {
        global.savedMappings.add(mappingKey);
      }
      
      } // else 블록 종료
      
      } catch (mappingError) {
        console.error('❌ 파일명 매핑 저장 예외:', mappingError);
        
        // 예외 발생 시에도 플래그 정리
        if (global.savingMappings) {
          global.savingMappings.delete(`${originalFileName}_${fileName}`);
        }
      }
    } else {
      console.log('ℹ️ 영문 파일명으로 매핑 저장 스킵:', originalFileName);
    }

    console.log('📤 파일 업로드 최종 응답:', {
      파일명: originalFileName,
      파일ID: fileName,
      헤더개수: headers ? headers.length : 0,
      헤더목록: headers || [], // 전체 헤더 표시
      데이터행수: previewData ? previewData.length : 0,
      한컴오피스: isHancomExcel,
      구형파일변환: isXlsFile,
      플랫폼: isVercel ? 'Vercel' : 'Local'
    });

    res.json({
      success: true,
      fileName: originalFileName,
      fileId: fileName, // 모든 환경에서 Supabase 파일명 사용
      headers: headers,
      previewData: previewData,
      totalRows: previewData.length,
      validation: validation,
      xlsConverted: isXlsFile, // .xls 파일이 .xlsx로 처리되었는지 표시
      isHancomExcel: isHancomExcel, // 한컴오피스 파일 여부 추가
      message: `파일이 성공적으로 업로드되었습니다. ${previewData.length}행의 데이터를 확인했습니다.`
    });

    // 기존 환경별 fileId 설정 (주석 처리)
    // fileId: process.env.NODE_ENV === 'production' ? fileName : file.filename,

  } catch (error) {
    console.error('❌ 파일 업로드 오류:', {
      error: error.message,
      stack: error.stack?.split('\n')[0],
      fileName: req.file?.originalname ? decodeFileName(req.file.originalname) : 'unknown',
      fileSize: req.file?.size,
      timestamp: new Date().toISOString()
    });
    
    // 최종 오류 시 임시 파일 정리는 이미 각 try-catch 블록에서 처리됨
    // multer가 메모리에 파일을 저장하므로 별도 정리 불필요
    console.log('🧹 업로드 처리 완료 - 메모리 파일은 자동 정리됨');
    
    res.status(500).json({ 
      error: '파일 처리 중 오류가 발생했습니다.', 
      details: error.message,
      fileName: req.file?.originalname ? decodeFileName(req.file.originalname) : 'unknown'
    });
  }
});

// 🔄 필드 매핑 설정 저장
router.post('/mapping', async (req, res) => {
  try {
    const { mappingName, sourceFields, targetFields, mappingRules, fixedValues } = req.body;
    
    console.log('📋 매핑 저장 요청 수신');
    console.log('📝 매핑 이름:', mappingName);
    console.log('📂 소스 필드:', sourceFields);
    console.log('🎯 타겟 필드:', targetFields);
    console.log('🔗 매핑 규칙:', mappingRules);
    console.log('🔗 매핑 규칙 타입:', typeof mappingRules);
    console.log('🔗 매핑 규칙 키-값 쌍:', Object.entries(mappingRules || {}));
    console.log('🔧 고정값:', fixedValues);
    
    // 매핑 규칙 검증
    if (mappingRules && Object.keys(mappingRules).length > 0) {
      console.log('✅ 매핑 규칙 검증 결과:');
      Object.entries(mappingRules).forEach(([target, source]) => {
        console.log(`   ${target} ← ${source}`);
      });
    } else {
      console.log('⚠️ 매핑 규칙이 비어있거나 null입니다!');
    }
    
    // 매핑 규칙 데이터
    const mappingData = {
      name: mappingName,
      createdAt: new Date().toISOString(),
      sourceFields,
      targetFields,
      rules: mappingRules,
      fixedValues: fixedValues || {} // 고정값 추가
    };
    
    console.log('💾 최종 저장할 매핑 데이터:', JSON.stringify(mappingData, null, 2));

    // Supabase Storage에 저장 (모든 환경)
    const saveResult = await saveMappingData(mappingName, mappingData);
    if (!saveResult.success) {
      return res.status(500).json({ 
        error: 'Supabase Storage 매핑 저장 실패', 
        details: saveResult.error 
      });
    }
    console.log('✅ Supabase 매핑 저장 성공:', mappingName);

    // 기존 환경별 매핑 저장 (주석 처리)
    /*
    if (process.env.NODE_ENV === 'production') {
      // 프로덕션: Supabase Storage에 저장
      const saveResult = await saveMappingData(mappingName, mappingData);
      if (!saveResult.success) {
        return res.status(500).json({ 
          error: 'Supabase Storage 매핑 저장 실패', 
          details: saveResult.error 
        });
      }
      console.log('✅ Supabase 매핑 저장 성공:', mappingName);
    } else {
      // 개발환경: 로컬 파일로 저장
      const mappingPath = path.join(__dirname, '../file/mappings');
      
      if (!fs.existsSync(mappingPath)) {
        fs.mkdirSync(mappingPath, { recursive: true });
      }

      fs.writeFileSync(
        path.join(mappingPath, `${mappingName}.json`),
        JSON.stringify(mappingData, null, 2)
      );
      console.log('✅ 로컬 매핑 저장 성공:', path.join(mappingPath, `${mappingName}.json`));
    }
    */

    res.json({
      success: true,
      message: '매칭 규칙이 저장되었습니다.',
      mappingId: mappingName
    });

  } catch (error) {
    console.error('❌ 매핑 저장 오류:', error);
    res.status(500).json({ 
      error: '매칭 저장 중 오류가 발생했습니다.', 
      details: error.message 
    });
  }
});

// 📋 발주서 생성 (매칭 규칙 적용)
router.post('/generate', createRateLimitMiddleware('orderGeneration'), async (req, res) => {
  try {
    const { fileId, mappingId, templateType, supplierFileId, manualFields } = req.body;
    
    console.log('📋 발주서 생성 요청:', { fileId, mappingId, templateType, supplierFileId });
    
    // 주문서 파일 다운로드 (파일명 매핑 시스템 사용)
    let downloadResult;
    let actualFileId = fileId;
    
    try {
      console.log('📥 파일 다운로드 시작:', fileId);
      
      // 🔍 1단계: 실제 파일명 해석 (명시적으로 order 타입 전달)
      const resolveResult = await resolveActualFileName(fileId, 'uploads', 'order');
      if (resolveResult.success) {
        actualFileId = resolveResult.actualFileName;
        console.log('✅ 실제 파일명 해석 성공:', {
          requestedFileId: fileId,
          actualFileName: actualFileId
        });
      } else {
        console.log('❌ 실제 파일명 해석 실패:', resolveResult.error);
        return res.status(404).json({ 
          error: resolveResult.error,
          originalFileId: fileId
        });
      }
      
      // 🔍 2단계: 실제 파일 다운로드
      downloadResult = await downloadFile(actualFileId, 'uploads', 10); // 발주서 생성 시 더 많은 재시도
      
      if (!downloadResult.success) {
        console.log('❌ 파일 다운로드 실패:', downloadResult.error);
        
        // 타임아웃 에러인 경우 더 명확한 메시지
        if (downloadResult.error && downloadResult.error.includes('timeout')) {
          return res.status(408).json({ 
            error: '파일 다운로드 시간이 초과되었습니다. 파일 크기가 크거나 네트워크 상태를 확인해주세요.',
            type: 'timeout'
          });
        }
        
        return res.status(404).json({ 
          error: '파일 다운로드에 실패했습니다.',
          originalFileId: fileId,
          actualFileId: actualFileId,
          downloadError: downloadResult.error
        });
      }
    } catch (error) {
      console.error('❌ 파일 다운로드 예외:', error);
      
      // 타임아웃 관련 에러 처리
      if (error.message && error.message.includes('timeout')) {
        return res.status(408).json({ 
          error: '파일 다운로드 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.',
          type: 'timeout'
        });
      }
      
      return res.status(500).json({ 
        error: '파일 다운로드 중 오류가 발생했습니다.',
        details: error.message
      });
    }
    
    console.log('✅ Supabase 파일 다운로드 완료');
    
    // 임시 파일로 저장 (크로스 플랫폼 임시 디렉토리 사용)
    const os = require('os');
    const isCloudEnvironment = process.env.VERCEL || 
                              process.env.RENDER ||
                              process.env.NODE_ENV === 'production' ||
                              process.env.PORT === '10000' ||
                              fs.existsSync('/tmp');
    const tempDir = isCloudEnvironment ? '/tmp' : os.tmpdir();
    if (!fs.existsSync(tempDir)) {
      try {
        fs.mkdirSync(tempDir, { recursive: true });
      } catch (mkdirError) {
        console.warn('⚠️ 임시 폴더 생성 실패:', mkdirError.message);
      }
    }
    
    const tempFileName = `${actualFileId}_${Date.now()}.${actualFileId.split('.').pop()}`;
    const uploadedFilePath = path.join(tempDir, tempFileName);
    
    // Vercel /tmp 용량 체크 (512MB 제한)
    const fileSizeMB = downloadResult.data.length / (1024 * 1024);
    if (fileSizeMB > 100) { // 100MB 이상시 경고
      console.warn(`⚠️ 큰 파일 감지: ${fileSizeMB.toFixed(2)}MB`);
      if (fileSizeMB > 400) { // 400MB 이상시 중단
        throw new Error(`파일이 너무 큽니다 (${fileSizeMB.toFixed(2)}MB). Vercel /tmp 제한으로 인해 처리할 수 없습니다.`);
      }
    }
    
    fs.writeFileSync(uploadedFilePath, downloadResult.data);
    
    // 매핑 규칙 로드
    let mappingRules = {};
    const mappingResult = await loadMappingData(mappingId);
    if (mappingResult.success) {
      mappingRules = mappingResult.data;
      console.log('✅ Supabase 매핑 로드 완료');
    }
    
    // 발주서 템플릿 파일 다운로드 (업로드된 supplier 파일 사용)
    let templatePath = null;
    
    console.log('🔍 발주서 생성 요청 상세 정보:', {
      fileId,
      supplierFileId,
      mappingId,
      templateType,
      manualFields: Object.keys(manualFields || {}).length
    });
    
    if (supplierFileId) {
      console.log('📋 업로드된 supplier 파일을 템플릿으로 사용:', supplierFileId);
      
      // 🔍 supplier 파일명 해석 (명시적으로 supplier 타입 전달)
      const supplierResolveResult = await resolveActualFileName(supplierFileId, 'uploads', 'supplier');
      let actualSupplierFileId = supplierFileId;
      
      if (supplierResolveResult.success) {
        actualSupplierFileId = supplierResolveResult.actualFileName;
        console.log('✅ Supplier 파일명 해석 성공:', {
          requestedFileId: supplierFileId,
          actualFileName: actualSupplierFileId
        });
      } else {
        console.log('⚠️ Supplier 파일명 해석 실패, 원본 사용:', supplierResolveResult.error);
      }
      
      console.log('📥 Supplier 파일 다운로드 시작:', actualSupplierFileId);
      const supplierDownloadResult = await downloadFile(actualSupplierFileId);
      
      if (supplierDownloadResult.success) {
        // 임시 템플릿 파일 저장
        const tempTemplateFileName = `template_${Date.now()}.xlsx`;
        templatePath = path.join(tempDir, tempTemplateFileName);
        
        console.log('💾 템플릿 파일 저장:', {
          원본파일: actualSupplierFileId,
          임시파일: templatePath,
          데이터크기: supplierDownloadResult.data.length
        });
        
        fs.writeFileSync(templatePath, supplierDownloadResult.data);
        console.log('✅ 업로드된 supplier 파일을 템플릿으로 다운로드 완료');
      } else {
        console.error('❌ Supplier 파일 다운로드 실패:', supplierDownloadResult.error);
      }
    } else {
      console.warn('⚠️ supplierFileId가 없습니다! 발주서 파일이 업로드되지 않았거나 요청에 포함되지 않았습니다.');
    }
    
    // 🚫 파일 업로드 모드에서는 발주서 파일이 반드시 필요
    if (!templatePath) {
      console.error('❌ 발주서 파일이 없습니다 - 파일 업로드 모드에서는 발주서 파일이 필수입니다');
      return res.status(400).json({ 
        error: '발주서 생성을 위해 발주서 엑셀 파일을 업로드해주세요. 파일 업로드 모드에서는 발주서 파일이 필수입니다.',
        code: 'SUPPLIER_FILE_REQUIRED'
      });
    }
    
    // 데이터 변환 및 발주서 생성
    console.log('💾 수동 필드 데이터 확인:', manualFields);
    const result = await convertToStandardFormat(uploadedFilePath, templatePath, mappingRules, manualFields);
    
    if (process.env.NODE_ENV !== 'production') {
                console.log('✅ 발주서 생성 완료:', result.fileName);
            }

    // 생성된 발주서를 Supabase Storage에 업로드 (모든 환경)
    const generatedFileBuffer = fs.readFileSync(result.filePath);
    const uploadResult = await uploadFile(generatedFileBuffer, result.fileName, 'generated');
    
    // 성공/실패 관계없이 임시 파일들 정리 (Vercel /tmp 용량 절약)
    try {
      if (fs.existsSync(uploadedFilePath)) fs.unlinkSync(uploadedFilePath);
      if (fs.existsSync(result.filePath)) fs.unlinkSync(result.filePath);
      
      // 임시 템플릿 파일 정리 (업로드된 supplier 파일인 경우)
      if (supplierFileId && templatePath && templatePath.includes('/tmp') && fs.existsSync(templatePath)) {
        fs.unlinkSync(templatePath);
        console.log('✅ 임시 템플릿 파일 정리 완료');
      }
      console.log('🧹 임시 파일들 정리 완료');
    } catch (cleanupError) {
      console.warn('⚠️ 임시 파일 정리 중 오류:', cleanupError.message);
    }
    
    if (uploadResult.success) {
      if (process.env.NODE_ENV !== 'production') {
        console.log('✅ 생성된 발주서 Supabase 업로드 완료');
      }
    } else {
      console.error('❌ 생성된 발주서 Supabase 업로드 실패:', uploadResult.error);
      throw new Error(uploadResult.error);
    }

    const downloadUrl = `/api/orders/download/${result.fileName}`;
    
    res.json({
      success: true,
      generatedFile: result.fileName,
      downloadUrl: downloadUrl,
      processedRows: result.processedRows,
      errors: result.errors,
      message: '발주서가 성공적으로 생성되었습니다.'
    });

  } catch (error) {
    console.error('❌ 발주서 생성 오류:', error);
    
    // 에러 발생 시에도 임시 파일들 정리 (Vercel /tmp 용량 절약)
    try {
      if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
        fs.unlinkSync(uploadedFilePath);
        console.log('🧹 에러 처리 중 업로드 파일 정리');
      }
      if (templatePath && templatePath.includes('/tmp') && fs.existsSync(templatePath)) {
        fs.unlinkSync(templatePath);
        console.log('🧹 에러 처리 중 템플릿 파일 정리');
      }
    } catch (cleanupError) {
      console.warn('⚠️ 임시 파일 정리 중 오류:', cleanupError.message);
    }
    
    res.status(500).json({ 
      error: '발주서 생성 중 오류가 발생했습니다.', 
      details: error.message 
    });
  }
});

// 📋 파일의 헤더 순서 추출 (생성된 발주서 파일 또는 업로드된 supplier 파일)
router.get('/headers/:fileName', async (req, res) => {
  try {
    const fileName = req.params.fileName;
    console.log('📋 파일 헤더 추출 요청:', fileName);
    
    let downloadResult;
    let isHancomExcel = false;
    
    // 먼저 generated 버킷에서 시도
    downloadResult = await downloadFile(fileName, 'generated');
    
    if (!downloadResult.success) {
      console.log('📁 generated 버킷에서 파일을 찾을 수 없음, uploads 버킷에서 시도...');
      
      // uploads 버킷에서 시도하고 메타데이터 조회
      const { loadFileMapping } = require('../utils/supabase');
      const mappingResult = await loadFileMapping(fileName);
      
      if (mappingResult.success && mappingResult.data) {
        console.log('📋 파일 매핑 정보 조회 성공:', {
          actualFileName: mappingResult.data.actualFileName,
          isHancomExcel: mappingResult.data.isHancomExcel,
          mimeType: mappingResult.data.mimeType
        });
        
        isHancomExcel = mappingResult.data.isHancomExcel || false;
        downloadResult = await downloadFile(mappingResult.data.actualFileName, 'uploads');
      } else {
        // 직접 uploads 버킷에서 시도
        downloadResult = await downloadFile(fileName, 'uploads');
      }
    }
    
    if (!downloadResult.success) {
      console.log('❌ 파일 다운로드 실패:', downloadResult.error);
      return res.status(404).json({ 
        success: false,
        error: '파일을 찾을 수 없습니다.',
        details: downloadResult.error 
      });
    }
    
    // 임시 파일로 저장하여 extractHeadersWithXLSX 함수 사용 (발주서 생성과 동일한 로직)
    const os = require('os');
    const isCloudEnvironment = process.env.VERCEL || 
                              process.env.RENDER ||
                              process.env.NODE_ENV === 'production' ||
                              process.env.PORT === '10000' ||
                              fs.existsSync('/tmp');
    const tempDir = isCloudEnvironment ? '/tmp' : os.tmpdir();
    const tempFileName = `temp_header_${Date.now()}.xlsx`;
    const tempFilePath = path.join(tempDir, tempFileName);
    
    try {
      fs.writeFileSync(tempFilePath, downloadResult.data);
      
      // 헤더 추출 로직 (한컴오피스 파일 지원)
      const { extractHeadersWithXLSX } = require('../utils/converter');
      console.log('🔄 헤더 추출 시작:', { fileName, isHancomExcel });
      
      const headers = await extractHeadersWithXLSX(tempFilePath, isHancomExcel);
      
      if (process.env.NODE_ENV !== 'production') {
        console.log('✅ 파일 헤더 추출 완료:', { 
          fileName, 
          isHancomExcel, 
          headerCount: headers?.length || 0,
          headers: headers?.slice(0, 5) || []
        });
      }
      
      // 임시 파일 정리
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
      
      res.json({
        success: true,
        headers: headers,
        fileName: fileName,
        totalColumns: headers.length,
        extractionMethod: 'extractHeadersWithXLSX' // 추출 방법 명시
      });
      
    } catch (extractError) {
      console.error('❌ 헤더 추출 실패:', extractError.message);
      
      // 임시 파일 정리
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
      
      // fallback: ExcelJS 기본 방식
      console.log('🔄 fallback: ExcelJS 기본 방식으로 헤더 추출');
      
      const ExcelJS = require('exceljs');
      const workbook = new ExcelJS.Workbook();
      
      // 버퍼에서 워크북 로드
      await workbook.xlsx.load(downloadResult.data);
      
      // 첫 번째 워크시트 선택
      const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        return res.status(400).json({ 
          success: false,
          error: '워크시트를 찾을 수 없습니다.' 
        });
      }
      
      // 첫 번째 행(헤더)에서 컬럼명들 추출
      const headerRow = worksheet.getRow(1);
      const headers = [];
      
      headerRow.eachCell((cell, colNumber) => {
        if (cell.value) {
          headers.push(String(cell.value).trim());
        }
      });
      
      if (process.env.NODE_ENV !== 'production') {
        console.log('✅ 생성된 발주서 헤더 추출 완료 (fallback):', headers);
      }
      
      res.json({
        success: true,
        headers: headers,
        fileName: fileName,
        totalColumns: headers.length,
        extractionMethod: 'ExcelJS_fallback' // 추출 방법 명시
      });
    }
    
  } catch (error) {
    console.error('❌ 헤더 추출 오류:', error);
    res.status(500).json({ 
      success: false,
      error: '헤더 추출 중 오류가 발생했습니다.',
      details: error.message 
    });
  }
});

// 📥 생성된 발주서 다운로드
router.get('/download/:fileName', async (req, res) => {
  try {
    const fileName = req.params.fileName;
    const displayFileName = req.query.display || fileName; // 한글 파일명 지원
    
    console.log('📥 다운로드 요청:', { fileName, displayFileName });
    
    // Supabase Storage에서 다운로드 (모든 환경)
    const downloadResult = await downloadFile(fileName, 'generated');
    
    if (!downloadResult.success) {
      console.log('❌ Supabase 파일 다운로드 실패:', downloadResult.error);
      return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
    }

    // 파일 헤더 설정 및 전송 (한글 파일명으로 다운로드)
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(displayFileName)}`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(downloadResult.data);
    
    console.log('✅ Supabase 파일 다운로드 완료:', { fileName, displayFileName });

    // 기존 환경별 다운로드 처리 (주석 처리)
    /*
    if (process.env.NODE_ENV === 'production') {
      // 프로덕션: Supabase Storage에서 다운로드
      const downloadResult = await downloadFile(fileName, 'generated');
      
      if (!downloadResult.success) {
        console.log('❌ Supabase 파일 다운로드 실패:', downloadResult.error);
        return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
      }

      // 파일 헤더 설정 및 전송
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.send(downloadResult.data);
      
      console.log('✅ Supabase 파일 다운로드 완료:', fileName);
    } else {
      // 개발환경: 로컬 파일 시스템에서 다운로드
      const filePath = path.join(uploadsDir, fileName);
      
      if (!fs.existsSync(filePath)) {
        console.log('❌ 다운로드 파일을 찾을 수 없음:', filePath);
        return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
      }

      res.download(filePath, fileName, (err) => {
        if (err) {
          console.error('❌ 파일 다운로드 오류:', err);
          res.status(500).json({ error: '파일 다운로드 중 오류가 발생했습니다.' });
        } else {
          console.log('✅ 파일 다운로드 완료:', fileName);
        }
      });
    }
    */

  } catch (error) {
    console.error('❌ 다운로드 오류:', error);
    res.status(500).json({ 
      error: '파일 다운로드 중 오류가 발생했습니다.', 
      details: error.message 
    });
  }
});

// 📋 템플릿 목록 조회 API
router.get('/templates', (req, res) => {
  try {
    const templatesConfigPath = path.join(__dirname, '../file/templates-config.json');
    
    if (!fs.existsSync(templatesConfigPath)) {
      return res.status(404).json({ 
        error: '템플릿 설정 파일을 찾을 수 없습니다.' 
      });
    }
    
    const templatesConfig = JSON.parse(fs.readFileSync(templatesConfigPath, 'utf8'));
    
    // 각 템플릿의 파일 존재 여부 확인
    const templates = Object.keys(templatesConfig.templates).map(key => {
      const template = templatesConfig.templates[key];
      const templateFilePath = path.join(__dirname, '../file', template.file);
      
      return {
        id: key,
        name: template.name,
        description: template.description,
        file: template.file,
        fields: template.fields,
        available: fs.existsSync(templateFilePath)
      };
    });
    
    res.json({
      success: true,
      templates: templates
    });
    
  } catch (error) {
    console.error('템플릿 목록 조회 오류:', error);
    res.status(500).json({ 
      error: '템플릿 목록을 불러오는 중 오류가 발생했습니다.',
      details: error.message 
    });
  }
});

// 📝 직접 입력 데이터로 발주서 생성
router.post('/generate-direct', createRateLimitMiddleware('orderGeneration'), async (req, res) => {
  try {
    const { mappingId, inputData, templateType, manualFields, supplierFileId, workMode } = req.body;
    
    console.log('📝 직접 입력 발주서 생성 요청:', { mappingId, inputData, templateType, supplierFileId, workMode, manualFields });
    
    // 매핑 규칙 로드
    let mappingRules = {};
    const mappingResult = await loadMappingData(mappingId);
    if (mappingResult.success) {
      mappingRules = mappingResult.data;
      console.log('✅ 매핑 규칙 로드 완료');
    } else {
      console.log('❌ 매핑 로드 실패:', mappingResult.error);
    }
    
    // 발주서 템플릿 파일 다운로드 (업로드된 supplier 파일 사용)
    let templatePath = null;
    
    console.log('🔍 직접 입력 모드 - supplierFileId 확인:', supplierFileId);
    
    if (supplierFileId) {
      console.log('📋 업로드된 supplier 파일을 템플릿으로 사용:', supplierFileId);
      
      // 🔍 supplier 파일명 해석 (명시적으로 supplier 타입 전달)
      const supplierResolveResult = await resolveActualFileName(supplierFileId, 'uploads', 'supplier');
      let actualSupplierFileId = supplierFileId;
      
      if (supplierResolveResult.success) {
        actualSupplierFileId = supplierResolveResult.actualFileName;
        console.log('✅ Supplier 파일명 해석 성공:', {
          requestedFileId: supplierFileId,
          actualFileName: actualSupplierFileId
        });
      } else {
        console.log('⚠️ Supplier 파일명 해석 실패, 원본 사용:', supplierResolveResult.error);
      }
      
      const supplierDownloadResult = await downloadFile(actualSupplierFileId); // 기본 uploads bucket 사용
      console.log('📥 Supplier 파일 다운로드 결과:', supplierDownloadResult.success);
      
      if (supplierDownloadResult.success) {
        // 임시 템플릿 파일 저장 (크로스 플랫폼 임시 디렉토리 사용)
        const os = require('os');
        const isCloudEnvironment = process.env.VERCEL || 
                                  process.env.RENDER ||
                                  process.env.NODE_ENV === 'production' ||
                                  process.env.PORT === '10000' ||
                                  fs.existsSync('/tmp');
        const tempDir = isCloudEnvironment ? '/tmp' : os.tmpdir();
        if (!fs.existsSync(tempDir)) {
          try {
            fs.mkdirSync(tempDir, { recursive: true });
          } catch (mkdirError) {
            console.warn('⚠️ 임시 폴더 생성 실패:', mkdirError.message);
          }
        }
        
        const tempTemplateFileName = `template_${Date.now()}.xlsx`;
        templatePath = path.join(tempDir, tempTemplateFileName);
        fs.writeFileSync(templatePath, supplierDownloadResult.data);
        console.log('✅ 업로드된 supplier 파일을 템플릿으로 다운로드 완료');
      } else {
        console.error('❌ Supplier 파일 다운로드 실패:', supplierDownloadResult.error);
      }
    }
    
    // 🚫 기본 템플릿은 오직 "기본 템플릿 사용" 모드에서만 사용
    if (!templatePath) {
      if (workMode === 'defaultTemplate') {
        console.log('📋 기본 템플릿 모드 - default_template.xlsx 사용');
        templatePath = path.join(__dirname, '../file/default_template.xlsx');
      } else {
        console.error('❌ 발주서 파일이 없습니다 - 직접 입력 모드에서도 발주서 파일이 필요합니다');
        return res.status(400).json({ 
          error: '발주서 생성을 위해 발주서 엑셀 파일을 업로드해주세요. 직접 입력 모드에서도 발주서 파일이 필수입니다.',
          code: 'SUPPLIER_FILE_REQUIRED'
        });
      }
    }
    
    // 직접 입력 데이터를 표준 형식으로 변환
    const { convertDirectInputToStandardFormat } = require('../utils/converter');
    
    // 매핑 규칙의 rules 부분만 추출 (실제 필드 매핑)
    const actualMappingRules = mappingRules.rules || mappingRules;
    
    const result = await convertDirectInputToStandardFormat(templatePath, inputData, actualMappingRules, manualFields);
    
    if (process.env.NODE_ENV !== 'production') {
      console.log('✅ 직접 입력 발주서 생성 완료:', result.fileName);
    }

    // 생성된 발주서를 Supabase Storage에 업로드
    const generatedFileBuffer = fs.readFileSync(result.filePath);
    const uploadResult = await uploadFile(generatedFileBuffer, result.fileName, 'generated');
    
    if (uploadResult.success) {
      if (process.env.NODE_ENV !== 'production') {
        console.log('✅ 생성된 발주서 Supabase 업로드 완료');
      }
      // 임시 파일 정리
      if (fs.existsSync(result.filePath)) fs.unlinkSync(result.filePath);
    } else {
      console.error('❌ 생성된 발주서 Supabase 업로드 실패:', uploadResult.error);
    }

    const downloadUrl = `/api/orders/download/${result.fileName}`;

    res.json({
      success: true,
      message: '직접 입력으로 발주서가 성공적으로 생성되었습니다.',
      generatedFile: result.fileName,
      downloadUrl: downloadUrl,
      inputData: inputData,
      processedRows: 1
    });

  } catch (error) {
    console.error('❌ 직접 입력 발주서 생성 오류:', error);
    res.status(500).json({ 
      error: '직접 입력 발주서 생성 중 오류가 발생했습니다.', 
      details: error.message 
    });
  }
});

// 🤖 AI 자동 매핑
router.post('/ai-mapping', createRateLimitMiddleware('aiMapping'), async (req, res) => {
  try {
    const { orderFields, supplierFields } = req.body;
    
    console.log('🤖 AI 자동 매핑 요청:', {
      orderFields: orderFields.length,
      supplierFields: supplierFields.length
    });
    
    // 환경변수에서 OpenAI API 키 확인
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      return res.status(401).json({ 
        success: false,
        error: 'OpenAI API 키가 설정되지 않았습니다. 환경변수 OPENAI_API_KEY를 확인해주세요.',
        requireAuth: true
      });
    }
    
    // AI 매핑 요청 생성
    const prompt = `
다음은 주문서 파일과 발주서 파일의 필드 목록입니다.
주문서 필드를 발주서 필드와 가장 적절하게 매핑해주세요.

주문서 필드 (소스):
${orderFields.map(field => `- ${field}`).join('\n')}

발주서 필드 (타겟):
${supplierFields.map(field => `- ${field}`).join('\n')}

매핑 규칙:
1. 🎯 완전 일치 우선: 동일하거나 거의 동일한 필드명은 반드시 매핑
2. 📦 상품 관련: 상품명, 제품명, 품명, 상품, 제품 등
3. 🔢 수량 관련: 수량, 개수, 량, 갯수 등  
4. 💰 금액 관련: 단가, 가격, 금액, 비용, 원가 등
5. 👤 고객 관련: 고객명, 이름, 성명, 받는분, 고객, 구매자 등
6. 📞 연락처 관련: 연락처, 전화번호, 휴대폰, 일반전화, 휴대전화 등
7. 🏠 주소 관련: 주소, 배송지, 수령지, 상세주소, 소재지 등
8. 📮 우편 관련: 우편번호, 우편 등
9. ⚖️ 물리량 관련: 중량, 무게, 부피, 크기, 치수 등
10. 📋 기타: 발주번호, 주문번호, 일자, 날짜, 비고, 메모 등
11. ✅ 적극적 매핑: 50% 이상 유사하면 매핑 (너무 보수적이지 말 것)

특별 주의사항:
- 괄호 안의 내용이 달라도 핵심 단어가 같으면 매핑
- 예: "일반전화(02-123-4567)" ↔ "휴대전화(010-123-4567)" = 둘 다 전화번호이므로 매핑 가능
- 예: "중량(kg)" ↔ "중량(kg)" = 완전 동일하므로 반드시 매핑
- 🚨 특수문자 필드 처리: 괄호(), 등호=, 더하기+, 콜론: 등이 포함된 필드명도 정확히 복사하여 매핑
- 예: "물품크기(cm) 크기=가로+세로+높이" = 특수문자 포함 필드는 완전히 동일하게 복사

JSON 응답 시 주의사항:
- 필드명에 특수문자가 있어도 JSON 키/값에 정확히 포함해야 함
- 백슬래시나 따옴표 이스케이프 필요 없이 그대로 사용
- 완전 동일한 필드명은 100% 매핑해야 함

응답은 반드시 다음 JSON 형식으로만 답변해주세요:
{
  "mappings": {
    "발주서필드명": "주문서필드명",
    "발주서필드명2": "주문서필드명2"
  }
}

다른 설명이나 텍스트는 포함하지 마세요.
`;
    
    // OpenAI API 호출
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4o-mini', // GPT-3.5-turbo에서 변경
      messages: [
        {
          role: 'system',
          content: '당신은 데이터 매핑 전문가입니다. 필드명을 분석하여 의미적으로 가장 적절한 매핑을 제공합니다. 한글과 영어를 모두 정확히 이해하며, 괄호 안의 부가 정보도 고려합니다.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 800, // 1000에서 줄임 (더 효율적)
      temperature: 0.1 // 0.3에서 줄임 (더 일관된 결과)
    }, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    const aiResponse = response.data.choices[0].message.content;
    console.log('🤖 AI 응답:', aiResponse);
    
    // JSON 파싱
    let mappings = {};
    try {
      const parsed = JSON.parse(aiResponse);
      mappings = parsed.mappings || {};
    } catch (parseError) {
      console.error('AI 응답 JSON 파싱 실패:', parseError);
      // JSON 파싱 실패 시 간단한 문자열 매칭으로 fallback
      mappings = performSimpleMapping(orderFields, supplierFields);
    }
    
    // 매핑 결과 검증 전에 누락된 완전 일치 필드 강제 추가
    console.log('🔍 AI 매핑 후 누락된 완전 일치 필드 검사');
    supplierFields.forEach(supplierField => {
      if (!mappings[supplierField]) { // AI가 매핑하지 않은 필드
        const exactMatch = orderFields.find(orderField => 
          orderField.toLowerCase().trim() === supplierField.toLowerCase().trim()
        );
        
        if (exactMatch) {
          mappings[supplierField] = exactMatch;
          console.log(`🚨 AI 누락 보정: "${supplierField}" ← → "${exactMatch}"`);
        }
      }
    });

    // 매핑 결과 검증
    const validatedMappings = validateMappings(mappings, orderFields, supplierFields);
    
    console.log('✅ AI 매핑 완료:', {
      totalMappings: Object.keys(validatedMappings).length,
      mappings: validatedMappings
    });
    
    res.json({
      success: true,
      mappings: validatedMappings,
      totalMappings: Object.keys(validatedMappings).length
    });
    
  } catch (error) {
    console.error('❌ AI 매핑 오류:', error);
    
    // API 오류 시 간단한 문자열 매칭으로 fallback
    try {
      const { orderFields, supplierFields } = req.body;
      const fallbackMappings = performSimpleMapping(orderFields, supplierFields);
      
      res.json({
        success: true,
        mappings: fallbackMappings,
        totalMappings: Object.keys(fallbackMappings).length,
        warning: 'AI 매핑에 실패하여 간단한 매칭을 수행했습니다.'
      });
    } catch (fallbackError) {
      res.status(500).json({ 
        error: 'AI 매핑에 실패했습니다.', 
        details: error.message 
      });
    }
  }
});

// 간단한 문자열 매칭 함수
function performSimpleMapping(orderFields, supplierFields) {
  const mappings = {};
  
  // 🎯 1단계: 완전 일치 우선 매칭 (대소문자 무관)
  console.log('🔍 1단계: 완전 일치 매칭 시작');
  console.log('📋 주문서 필드:', orderFields);
  console.log('📋 발주서 필드:', supplierFields);
  
  supplierFields.forEach(supplierField => {
    if (mappings[supplierField]) return; // 이미 매칭된 경우 건너뛰기
    
    const exactMatch = orderFields.find(orderField => 
      orderField.toLowerCase().trim() === supplierField.toLowerCase().trim()
    );
    
    if (exactMatch) {
      mappings[supplierField] = exactMatch;
      console.log(`✅ 완전 일치: "${supplierField}" ← → "${exactMatch}"`);
    } else {
      // 특수문자가 포함된 필드 디버깅
      if (supplierField.includes('물품크기') || supplierField.includes('+') || supplierField.includes('=')) {
        console.log(`🔍 특수문자 필드 매칭 실패: "${supplierField}"`);
        console.log(`🔍 주문서에서 찾는 중: "${supplierField.toLowerCase().trim()}"`);
        orderFields.forEach(orderField => {
          const orderNormalized = orderField.toLowerCase().trim();
          const supplierNormalized = supplierField.toLowerCase().trim();
          console.log(`🔍 비교: "${orderNormalized}" === "${supplierNormalized}" = ${orderNormalized === supplierNormalized}`);
        });
      }
    }
  });
  
  // 🎯 2단계: 괄호 제거한 핵심 단어 매칭
  console.log('🔍 2단계: 핵심 단어 매칭 시작');
  supplierFields.forEach(supplierField => {
    if (mappings[supplierField]) return; // 이미 매칭된 경우 건너뛰기
    
    // 괄호와 내용 제거하여 핵심 단어 추출
    const supplierCore = supplierField.replace(/\([^)]*\)/g, '').trim().toLowerCase();
    
    const coreMatch = orderFields.find(orderField => {
      const orderCore = orderField.replace(/\([^)]*\)/g, '').trim().toLowerCase();
      return orderCore === supplierCore && orderCore.length > 0;
    });
    
    if (coreMatch) {
      mappings[supplierField] = coreMatch;
      console.log(`✅ 핵심 단어 일치: "${supplierField}" ← → "${coreMatch}"`);
    }
  });
  
  // 🎯 3단계: 확장된 패턴 기반 매칭
  console.log('🔍 3단계: 패턴 기반 매칭 시작');
  const mappingRules = [
    { patterns: ['상품명', '제품명', '품명', '상품', '제품', 'product', 'item'], priority: 1 },
    { patterns: ['수량', '개수', '량', 'qty', 'quantity', '갯수'], priority: 2 },
    { patterns: ['단가', '가격', '금액', 'price', 'amount', '비용', '원가'], priority: 3 },
    { patterns: ['고객명', '이름', '성명', '고객', '구매자', 'name', 'customer', '받는'], priority: 4 },
    { patterns: ['연락처', '전화번호', '휴대폰', '전화', 'phone', 'tel', '핸드폰', '일반전화', '휴대전화'], priority: 5 },
    { patterns: ['주소', '배송지', '수령지', '배송주소', 'address', '소재지', '상세주소'], priority: 6 },
    { patterns: ['우편번호', '우편', 'zip', 'postal'], priority: 7 },
    { patterns: ['중량', '무게', 'weight', 'kg'], priority: 8 },
    { patterns: ['부피', '크기', '치수', 'volume', 'size', 'cm'], priority: 9 },
    { patterns: ['발주번호', '주문번호', '번호', 'order', 'no'], priority: 10 },
    { patterns: ['일자', '날짜', '시간', 'date', 'time'], priority: 11 },
    { patterns: ['공급가액', '총액', '합계', 'total', 'sum'], priority: 12 },
    { patterns: ['비고', '메모', '참고', 'note', 'memo', 'comment'], priority: 13 }
  ];
  
  supplierFields.forEach(supplierField => {
    if (mappings[supplierField]) return; // 이미 매칭된 경우 건너뛰기
    
    for (const rule of mappingRules) {
      const matchingOrderField = orderFields.find(orderField => {
        return rule.patterns.some(pattern => 
          orderField.toLowerCase().includes(pattern.toLowerCase()) &&
          supplierField.toLowerCase().includes(pattern.toLowerCase())
        );
      });
      
      if (matchingOrderField && !Object.values(mappings).includes(matchingOrderField)) {
        mappings[supplierField] = matchingOrderField;
        console.log(`✅ 패턴 매칭: "${supplierField}" ← → "${matchingOrderField}" (패턴: ${rule.patterns[0]})`);
        break;
      }
    }
  });
  
  console.log(`🎯 매칭 완료: 총 ${Object.keys(mappings).length}개 필드 매칭`);
  return mappings;
}

// 매핑 결과 검증
function validateMappings(mappings, orderFields, supplierFields) {
  const validatedMappings = {};
  
  Object.entries(mappings).forEach(([targetField, sourceField]) => {
    // 타겟 필드가 실제로 존재하는지 확인
    if (supplierFields.includes(targetField) && orderFields.includes(sourceField)) {
      validatedMappings[targetField] = sourceField;
    }
  });
  
  return validatedMappings;
}

// 🚀 템플릿 기반 자동 변환 및 발주서 생성
router.post('/generate-with-template', createRateLimitMiddleware('orderGeneration'), async (req, res) => {
  try {
    const { fileId, templateId, templateType } = req.body;
    
    console.log('🚀 템플릿 기반 자동 변환 시작:', {
      fileId,
      templateId, 
      templateType: templateType || 'standard'
    });
    
    if (!fileId || !templateId) {
      return res.status(400).json({ 
        error: '파일 ID와 템플릿 ID가 필요합니다.' 
      });
    }
    
    // 1. 템플릿 정보 가져오기
    const { supabase } = require('../utils/supabase');
    const { data: template, error: templateError } = await supabase
      .from('order_templates')
      .select('*')
      .eq('id', templateId)
      .eq('is_active', true)
      .single();
    
    if (templateError || !template) {
      console.error('❌ 템플릿 조회 오류:', templateError);
      return res.status(404).json({ 
        error: '템플릿을 찾을 수 없습니다.' 
      });
    }
    
    console.log('✅ 템플릿 정보 로드:', template.template_name);
    
    // 2. 주문서 파일 다운로드 및 데이터 읽기 (모든 환경에서 Supabase Storage 사용)
    console.log('📥 Supabase Storage에서 주문서 파일 다운로드 중:', fileId);
    
    // 안전 검증: supplier 파일인지 확인
    if (fileId.includes('supplierFile')) {
      console.error('❌ 잘못된 파일 타입: supplier 파일이 주문서 파일로 전달됨');
      return res.status(400).json({ 
        error: '주문서 파일이 필요하지만 발주서 템플릿 파일이 전달되었습니다. 주문서 파일을 다시 업로드해주세요.',
        details: `파일 ID: ${fileId}`
      });
    }
    
    const downloadResult = await downloadFile(fileId);
    if (!downloadResult.success) {
      console.error('❌ 주문서 파일 다운로드 실패:', {
        fileId: fileId,
        error: downloadResult.error
      });
      return res.status(404).json({ 
        error: '주문서 파일을 찾을 수 없습니다.',
        details: downloadResult.error,
        suggestion: '주문서 파일을 다시 업로드한 후 시도해주세요.'
      });
    }
    
    const fileBuffer = downloadResult.data;
    console.log('✅ 주문서 파일 다운로드 성공:', {
      fileId: fileId,
      bufferSize: fileBuffer.length
    });
    
    // 3. 파일 형식 확인 및 데이터 읽기
    const fileExtension = path.extname(fileId).toLowerCase();
    console.log('📄 파일 형식 확인:', { fileId, fileExtension });
    
    let orderHeaders = [];
    let orderData = [];
    
    if (fileExtension === '.csv') {
      // 3-1. CSV 파일 처리
      console.log('📊 CSV 파일 처리 시작...');
      
      // 인코딩 자동 감지 및 변환
      let csvData;
      try {
        // BOM 확인
        const hasBom = fileBuffer.length >= 3 && 
                      fileBuffer[0] === 0xEF && 
                      fileBuffer[1] === 0xBB && 
                      fileBuffer[2] === 0xBF;
        
        if (hasBom) {
          // UTF-8 BOM이 있는 경우
          console.log('📄 UTF-8 BOM 감지됨');
          csvData = fileBuffer.slice(3).toString('utf8');
        } else {
          // 여러 인코딩으로 시도
          const encodings = ['utf8', 'euc-kr', 'cp949'];
          let bestEncoding = 'utf8';
          let bestScore = 0;
          
          for (const encoding of encodings) {
            try {
              const testData = iconv.decode(fileBuffer, encoding);
              
              // 한글 문자가 제대로 디코딩되었는지 확인
              const koreanScore = (testData.match(/[가-힣]/g) || []).length;
              const invalidScore = (testData.match(/[�]/g) || []).length;
              const finalScore = koreanScore - (invalidScore * 10); // 깨진 문자에 패널티
              
              console.log(`📊 ${encoding} 인코딩 점수: ${finalScore} (한글: ${koreanScore}, 깨짐: ${invalidScore})`);
              
              if (finalScore > bestScore) {
                bestScore = finalScore;
                bestEncoding = encoding;
              }
            } catch (error) {
              console.log(`⚠️ ${encoding} 인코딩 실패:`, error.message);
            }
          }
          
          console.log(`✅ 최적 인코딩 선택: ${bestEncoding} (점수: ${bestScore})`);
          csvData = iconv.decode(fileBuffer, bestEncoding);
        }
      } catch (error) {
        console.error('❌ 인코딩 감지 실패, UTF-8로 처리:', error);
        csvData = fileBuffer.toString('utf8');
      }
      
      const lines = csvData.split('\n').filter(line => line.trim());
      
      if (lines.length === 0) {
        return res.status(400).json({ 
          error: 'CSV 파일에 데이터가 없습니다.' 
        });
      }
      
      // CSV 파싱 함수
      function parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        let i = 0;
        
        while (i < line.length) {
          const char = line[i];
          const nextChar = line[i + 1];
          
          if (char === '"') {
            if (inQuotes && nextChar === '"') {
              // 연속된 따옴표는 하나의 따옴표로 처리
              current += '"';
              i += 2;
              continue;
            } else {
              // 따옴표 시작/끝
              inQuotes = !inQuotes;
            }
          } else if (char === ',' && !inQuotes) {
            // 따옴표 밖의 쉼표는 구분자
            result.push(current.trim());
            current = '';
          } else {
            current += char;
          }
          i++;
        }
        
        // 마지막 필드 추가
        result.push(current.trim());
        return result;
      }
      
      // 헤더 파싱
      const rawHeaders = parseCSVLine(lines[0]).map(h => h.replace(/^"|"$/g, '').trim());
      
      // 유효한 헤더 필터링
      const validHeaderIndices = [];
      rawHeaders.forEach((header, index) => {
        if (header && 
            header.length > 0 && 
            header !== 'undefined' && 
            header !== 'null' && 
            !header.match(/^[\s,]+$/)) {
          validHeaderIndices.push(index);
          orderHeaders.push(header);
        }
      });
      
      console.log(`📋 CSV 헤더 정리: ${rawHeaders.length} → ${orderHeaders.length}개`);
      
      // 데이터 파싱
      const rawDataLines = lines.slice(1);
      rawDataLines.forEach((line, lineIndex) => {
        const values = parseCSVLine(line);
        const rowData = [];
        let hasValidData = false;
        
        // 유효한 헤더 인덱스에 해당하는 데이터만 추출
        validHeaderIndices.forEach((headerIndex) => {
          const value = values[headerIndex] ? values[headerIndex].replace(/^"|"$/g, '').trim() : '';
          rowData.push(value);
          
          if (value && value.length > 0) {
            hasValidData = true;
          }
        });
        
        // 유효한 데이터가 있는 행만 추가
        if (hasValidData) {
          orderData.push(rowData);
        }
      });
      
      console.log('✅ CSV 파싱 완료:', {
        헤더: orderHeaders.length,
        데이터행: orderData.length
      });
      
    } else {
      // 3-2. Excel 파일 처리 (구형 .xls 파일 지원 포함)
      console.log('📊 Excel 파일 처리 시작...');
      
      // 파일 내용으로 구형 .xls 파일 여부 판단 (파일명은 신뢰할 수 없음)
      let isXlsFile = false;
      let fileSignatureInfo = { fileSize: fileBuffer.length };
      
      if (fileBuffer.length >= 8) {
        const bytes = new Uint8Array(fileBuffer.slice(0, 8));
        
        // 시그니처 상세 분석
        const first8Bytes = Array.from(bytes).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ');
        const first4Bytes = Array.from(bytes.slice(0, 4)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ');
        
        // OLE2 구조 확인 (구형 .xls 파일의 특징)
        const isOLE2 = bytes[0] === 0xD0 && bytes[1] === 0xCF && 
                       bytes[2] === 0x11 && bytes[3] === 0xE0 &&
                       bytes[4] === 0xA1 && bytes[5] === 0xB1 &&
                       bytes[6] === 0x1A && bytes[7] === 0xE1;
        
        // ZIP 구조 확인 (최신 .xlsx 파일의 특징)
        const isZIP = bytes[0] === 0x50 && bytes[1] === 0x4B;
        
        // 다른 가능한 시그니처들도 확인
        const isPDF = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
        const isDoc = bytes[0] === 0xD0 && bytes[1] === 0xCF; // OLE2 기반 (더 넓은 범위)
        
        // OLE2이면서 ZIP이 아니면 구형 .xls 파일
        isXlsFile = isOLE2 && !isZIP;
        
        fileSignatureInfo = {
          fileSize: fileBuffer.length,
          first8Bytes,
          first4Bytes,
          isOLE2,
          isZIP,
          isPDF,
          isDoc,
          detectedType: isXlsFile ? 'Legacy .xls (OLE2)' : 
                       isZIP ? 'Modern .xlsx (ZIP)' : 
                       isPDF ? 'PDF' : 
                       isDoc ? 'OLE2 Document' : 
                       'Unknown'
        };
      }
      
      console.log('📋 파일 시그니처 상세 분석:', fileSignatureInfo);
      console.log('🎯 최종 판정:', { 
        fileId, 
        isXlsFile,
        처리경로: isXlsFile ? 'XLSX 라이브러리 (구형)' : 'ExcelJS (최신)'
      });
      
      let skipExcelProcessing = false;
      
      // .xls 파일인 경우 XLSX 라이브러리로 처리 (파일업로드 방식과 동일)
      if (isXlsFile) {
        console.log('🔄 .xls 파일을 XLSX 라이브러리로 처리...', {
          platform: isVercel ? 'Vercel' : 'Local',
          fileSize: `${(fileBuffer.length / 1024 / 1024).toFixed(2)}MB`
        });
        
        try {
          const XLSX = require('xlsx');
          
          // Vercel 환경에서 메모리 최적화 옵션 적용
          const xlsxOptions = {
            type: 'buffer',
            cellDates: true,
            cellNF: false,
            cellText: false
          };
          
          // Vercel 환경에서 추가 최적화 (generate-with-template)
          if (isVercel) {
            xlsxOptions.sheetStubs = false;    // 빈 셀 스텁 제거
            xlsxOptions.bookVBA = false;       // VBA 제거 
            xlsxOptions.bookFiles = false;     // 파일 정보 제거
            xlsxOptions.bookProps = false;     // 속성 제거
            xlsxOptions.dense = true;          // 밀집 모드 (메모리 절약)
            xlsxOptions.raw = true;            // 원시 값 사용 (변환 최소화)
            console.log('⚡ Vercel 환경 - generate-with-template 메모리 최적화 적용');
          }
          
          // .xls 파일을 버퍼에서 직접 읽기
          const workbook = XLSX.read(fileBuffer, xlsxOptions);
          
          console.log('✅ .xls 파일 워크북 로드 성공');
          
          // 첫 번째 워크시트 선택
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          
          if (!worksheet) {
            throw new Error('워크시트를 찾을 수 없습니다');
          }
          
          // 원시 워크시트 데이터 확인
          console.log('🔍 워크시트 원시 정보:', {
            range: worksheet['!ref'],
            sheetKeys: Object.keys(worksheet).slice(0, 10),
            cellA1: worksheet['A1'],
            cellB1: worksheet['B1'],
            cellA2: worksheet['A2'],
            cellB2: worksheet['B2']
          });
          
          // 다양한 변환 옵션으로 테스트
          const jsonData1 = XLSX.utils.sheet_to_json(worksheet, { 
            header: 1,
            defval: '',
            raw: false 
          });
          
          const jsonData2 = XLSX.utils.sheet_to_json(worksheet, { 
            header: 1,
            defval: '',
            raw: true  // raw 모드
          });
          
          const jsonData3 = XLSX.utils.sheet_to_json(worksheet, { 
            header: 1,
            blankrows: true,  // 빈 행도 포함
            defval: null,
            raw: false 
          });
          
          console.log('🔍 다양한 변환 결과 비교:', {
            method1_rows: jsonData1.length,
            method1_first: jsonData1[0],
            method1_second: jsonData1[1],
            method2_rows: jsonData2.length, 
            method2_first: jsonData2[0],
            method2_second: jsonData2[1],
            method3_rows: jsonData3.length,
            method3_first: jsonData3[0], 
            method3_second: jsonData3[1]
          });
          
          // 가장 많은 데이터를 가진 방법 선택
          let jsonData = jsonData1;
          if (jsonData2.length > jsonData.length) jsonData = jsonData2;
          if (jsonData3.length > jsonData.length) jsonData = jsonData3;
          
          console.log(`✅ 최종 선택된 변환 방법: ${jsonData === jsonData1 ? 'method1' : jsonData === jsonData2 ? 'method2' : 'method3'}`);
          
          if (jsonData.length === 0) {
            throw new Error('데이터가 없습니다');
          }
          
          // 헤더 추출 (원본 인덱스 유지)
          const rawHeaders = jsonData[0] || [];
          const headerMapping = []; // {header: string, originalIndex: number}
          
          rawHeaders.forEach((header, originalIndex) => {
            if (header && header.trim()) {
              headerMapping.push({
                header: header.trim(),
                originalIndex: originalIndex
              });
            }
          });
          
          orderHeaders = headerMapping.map(item => item.header);
          
          console.log('📋 헤더 매핑 확인:', {
            rawHeaders: rawHeaders.length,
            validHeaders: orderHeaders.length,
            headerMapping: headerMapping.slice(0, 5) // 처음 5개만 로그
          });
          
          // 데이터 추출 (2행부터, 원본 인덱스 사용)
          orderData = [];
          let processedRows = 0;
          
          for (let i = 1; i < jsonData.length; i++) {
            const row = jsonData[i];
            
            // 로그 최적화: 처음 3개와 마지막 1개만 로그 출력
            const shouldLog = i <= 3 || i === jsonData.length - 1 || (i % 100 === 0);
            
            if (shouldLog) {
              // 각 셀의 정확한 내용과 타입 확인
              const cellAnalysis = row ? row.map((cell, idx) => ({
                index: idx,
                value: cell,
                type: typeof cell,
                length: cell ? String(cell).length : 0,
                isEmpty: cell === null || cell === undefined || cell === '' || String(cell).trim() === ''
              })) : [];
              
              console.log(`🔍 행 ${i} 상세 분석:`, {
                rowExists: !!row,
                rowLength: row?.length || 0,
                cellAnalysis: cellAnalysis.slice(0, 5), // 처음 5개 셀 상세 분석
                hasDataOriginal: row && row.some(cell => cell !== null && cell !== undefined && cell !== '' && cell !== ' '),
                hasDataImproved: row && row.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== '')
              });
            }
            
            // 개선된 빈 행 판단 로직 (다양한 빈 값 형태 고려)
            const hasValidData = row && row.some(cell => {
              if (cell === null || cell === undefined) return false;
              const cellStr = String(cell).trim();
              // 빈 문자열, 공백만 있는 문자열, "undefined", "null" 문자열 제외
              return cellStr !== '' && 
                     cellStr !== 'undefined' && 
                     cellStr !== 'null' && 
                     cellStr !== 'NULL' && 
                     cellStr.length > 0;
            });
            
            if (hasValidData) {
              const rowObject = {};
              headerMapping.forEach(({header, originalIndex}) => {
                const cellValue = row[originalIndex];
                rowObject[header] = cellValue !== null && cellValue !== undefined ? String(cellValue).trim() : '';
              });
              orderData.push(rowObject);
              processedRows++;
              
              // 처음 3개만 상세 로그
              if (processedRows <= 3) {
                console.log(`✅ 행 ${i} 데이터 추가:`, rowObject);
              }
            }
          }
          
          console.log(`📊 데이터 처리 완료: ${jsonData.length - 1}행 중 ${processedRows}행 추출`);
          
          console.log('✅ .xls 파일 데이터 추출 완료:', {
            headers: orderHeaders.length,
            dataRows: orderData.length,
            sampleHeaders: orderHeaders.slice(0, 5),
            sampleData: orderData.length > 0 ? orderData[0] : null
          });
          
        } catch (xlsError) {
          console.error('❌ XLSX 라이브러리로 .xls 파일 처리 실패:', xlsError);
          
          // Vercel 환경에서 ExcelJS 폴백 주의사항 체크
          if (isVercel && fileBuffer.length > 2 * 1024 * 1024) { // 2MB 초과
            console.warn('⚠️ Vercel 환경에서 큰 구형 파일 - ExcelJS 폴백 스킵');
            throw new Error('Vercel 환경에서는 2MB 이상의 구형 Excel 파일(.xls) ExcelJS 처리를 지원하지 않습니다. 파일을 .xlsx로 변환해주세요.');
          }
          
          console.log('🔄 ExcelJS로 구형 .xls 파일 처리 재시도...', {
            platform: isVercel ? 'Vercel (위험)' : 'Local',
            fileSize: `${(fileBuffer.length / 1024 / 1024).toFixed(2)}MB`
          });
          
          try {
            // ExcelJS로 구형 파일 처리 시도
            const ExcelJS = require('exceljs');
            const workbook = new ExcelJS.Workbook();
            
            // Vercel 환경에서는 메타데이터 설정 최소화
            if (!isVercel) {
              workbook.creator = 'AutoOrder System';
              workbook.company = 'AutoOrder';
              workbook.created = new Date();
              workbook.modified = new Date();
            }
            
            // ExcelJS로 .xls 파일 읽기 시도 (Vercel 환경 최적화)
            const exceljsOptions = {
              ignoreCalculatedFields: true,
              styles: false,
              hyperlinks: false
            };
            
            if (isVercel) {
              exceljsOptions.sharedStrings = 'ignore';     // 공유 문자열 무시
              exceljsOptions.worksheets = 'emit';          // 워크시트만 방출
              console.log('⚡ Vercel 환경 - ExcelJS 최적화 옵션 적용');
            }
            
            await workbook.xlsx.load(fileBuffer, exceljsOptions);
            
            const worksheet = workbook.getWorksheet(1);
            if (!worksheet) {
              throw new Error('ExcelJS: 워크시트를 찾을 수 없습니다');
            }
            
            console.log('✅ ExcelJS로 구형 .xls 파일 로드 성공');
            
            // ExcelJS 방식으로 데이터 추출
            const rawData = [];
            worksheet.eachRow((row, rowNumber) => {
              const rowData = [];
              row.eachCell((cell, colNumber) => {
                const cellValue = cell.value;
                let processedValue = cellValue;
                
                // ExcelJS 특수 타입 처리
                if (processedValue && typeof processedValue === 'object') {
                  if (processedValue.richText && Array.isArray(processedValue.richText)) {
                    processedValue = processedValue.richText.map(item => item.text || '').join('');
                  } else if (processedValue.text !== undefined) {
                    processedValue = processedValue.text;
                  } else if (processedValue.result !== undefined) {
                    processedValue = processedValue.result;
                  } else if (processedValue.valueOf && typeof processedValue.valueOf === 'function') {
                    processedValue = processedValue.valueOf();
                  }
                }
                
                rowData.push(processedValue ? String(processedValue).trim() : '');
              });
              rawData.push(rowData);
            });
            
            console.log('🔍 ExcelJS 추출 결과:', {
              totalRows: rawData.length,
              firstRow: rawData[0],
              secondRow: rawData[1]
            });
            
            if (rawData.length === 0) {
              throw new Error('ExcelJS: 데이터가 없습니다');
            }
            
            // ExcelJS 결과를 XLSX 형식으로 변환 (헤더 매핑 방식 일관성 유지)
            const rawHeaders = rawData[0] || [];
            const headerMapping = [];
            
            rawHeaders.forEach((header, originalIndex) => {
              if (header && header.trim()) {
                headerMapping.push({
                  header: header.trim(),
                  originalIndex: originalIndex
                });
              }
            });
            
            orderHeaders = headerMapping.map(item => item.header);
            orderData = [];
            
            for (let i = 1; i < rawData.length; i++) {
              const row = rawData[i];
              if (row && row.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== '')) {
                const rowObject = {};
                headerMapping.forEach(({header, originalIndex}) => {
                  rowObject[header] = row[originalIndex] || '';
                });
                orderData.push(rowObject);
              }
            }
            
            console.log('✅ ExcelJS로 .xls 파일 처리 성공:', {
              headers: orderHeaders.length,
              dataRows: orderData.length,
              sampleData: orderData[0]
            });
            
          } catch (excelljsError) {
            console.error('❌ ExcelJS로도 .xls 파일 처리 실패:', excelljsError);
            throw new Error(`구형 Excel 파일(.xls) 처리 실패 - XLSX: ${xlsError.message}, ExcelJS: ${excelljsError.message}`);
          }
        }
        
      } else {
        // .xlsx 파일인 경우 ExcelJS로 처리
        console.log('📊 .xlsx 파일 ExcelJS 처리 시작...');
        
        const workbook = new ExcelJS.Workbook();
        
        // ExcelJS 메타데이터 기본값 설정 (company 오류 방지)
        workbook.creator = 'AutoOrder System';
        workbook.company = 'AutoOrder';
        workbook.created = new Date();
        workbook.modified = new Date();
        
        try {
          // 첫 번째 시도: 기본 로딩 (안전한 옵션 포함)
          await workbook.xlsx.load(fileBuffer, { 
            ignoreCalculatedFields: true,
            styles: false,
            hyperlinks: false 
          });
        } catch (loadError) {
          console.error('❌ ExcelJS 로드 오류:', loadError);
        
        try {
          // 두 번째 시도: 완전히 새로운 워크북으로 재시도
          console.log('🔄 새 워크북으로 재시도...');
          const safeWorkbook = new ExcelJS.Workbook();
          
          // 안전한 메타데이터 설정
          Object.defineProperty(safeWorkbook, 'creator', { value: 'AutoOrder System', writable: true });
          Object.defineProperty(safeWorkbook, 'company', { value: 'AutoOrder', writable: true });
          Object.defineProperty(safeWorkbook, 'created', { value: new Date(), writable: true });
          Object.defineProperty(safeWorkbook, 'modified', { value: new Date(), writable: true });
          
          // 최소 옵션으로 로딩
          await safeWorkbook.xlsx.load(fileBuffer, { 
            ignoreCalculatedFields: true,
            styles: false,
            hyperlinks: false,
            drawings: false,
            worksheetReader: false
          });
          
          // 워크시트 복사
          workbook.worksheets = safeWorkbook.worksheets;
          console.log('✅ 재시도 성공');
          
        } catch (retryError) {
          console.error('❌ 재시도도 실패:', retryError);
          
          // 세 번째 시도: 임시 파일로 저장 후 다시 읽기
          try {
            console.log('🔄 임시 파일 방식으로 재시도...');
            const os = require('os');
            const isCloudEnvironment = process.env.VERCEL || 
                                      process.env.RENDER ||
                                      process.env.NODE_ENV === 'production' ||
                                      process.env.PORT === '10000' ||
                                      fs.existsSync('/tmp');
            const tempDir = isCloudEnvironment ? '/tmp' : os.tmpdir();
            const tempFileName = `temp_safe_${Date.now()}.xlsx`;
            const tempFilePath = path.join(tempDir, tempFileName);
            
            // 파일 저장
            fs.writeFileSync(tempFilePath, fileBuffer);
            
            // 새로운 방식으로 읽기
            const { readExcelFile } = require('../utils/converter');
            const excelData = await readExcelFile(tempFilePath);
            
            // 임시 파일 삭제
            if (fs.existsSync(tempFilePath)) {
              fs.unlinkSync(tempFilePath);
            }
            
            // 성공 시 데이터 변환
            const rawData = [];
            rawData.push(excelData.headers);
            excelData.data.forEach(row => {
              const rowArray = excelData.headers.map(header => row[header] || '');
              rawData.push(rowArray);
            });
            
            orderHeaders = rawData[0];
            orderData = rawData.slice(1).filter(row => row.some(cell => cell));
            
            console.log('✅ 임시 파일 방식으로 성공:', {
              헤더: orderHeaders.length,
              데이터행: orderData.length
            });
            
            // Excel 처리 완료로 스킵
            skipExcelProcessing = true;
            
          } catch (tempError) {
            console.error('❌ 임시 파일 방식도 실패:', tempError);
            
            // supplier 파일 오류인 경우 특별 처리
            if (fileId.includes('supplierFile')) {
              throw new Error(`발주서 템플릿 파일이 손상되었습니다. 템플릿을 다시 생성해주세요.\n\n1. 새 주문서 파일 업로드\n2. 수동 매핑으로 새 템플릿 생성\n3. 기존 템플릿 이름으로 저장하여 덮어쓰기`);
            } else {
              throw new Error(`Excel 파일 처리 실패: 모든 방법을 시도했지만 실패했습니다. CSV 형식으로 변환해서 다시 업로드해주세요.`);
            }
          }
        }
      }
      
      // Excel 처리가 완료되지 않은 경우에만 워크시트 처리
      if (!skipExcelProcessing) {
        const worksheet = workbook.getWorksheet(1);
        
        if (!worksheet) {
          return res.status(400).json({ 
            error: '워크시트를 찾을 수 없습니다.' 
          });
        }
        
        // 헤더와 데이터 추출
        const rawData = [];
        worksheet.eachRow((row, rowNumber) => {
          const rowData = [];
          row.eachCell((cell, colNumber) => {
            // ⚠️ CRITICAL: cell.value를 직접 수정하지 말고 복사해서 처리
            const originalValue = cell.value;
            let processedValue = originalValue;
            
            // 객체를 문자열로 변환 (ExcelJS 특수 타입 처리)
            if (processedValue && typeof processedValue === 'object') {
              // ExcelJS 특수 타입 처리
              if (processedValue.richText && Array.isArray(processedValue.richText)) {
                // 리치 텍스트 배열에서 text 속성만 추출
                processedValue = processedValue.richText.map(item => item.text || '').join('');
              } else if (processedValue.text !== undefined) {
                // 하이퍼링크 또는 단순 텍스트
                processedValue = processedValue.text;
              } else if (processedValue.result !== undefined) {
                // 수식 결과
                processedValue = processedValue.result;
              } else if (processedValue.valueOf && typeof processedValue.valueOf === 'function') {
                // 날짜 또는 숫자 객체
                processedValue = processedValue.valueOf();
              } else if (Array.isArray(processedValue)) {
                processedValue = processedValue.join(', ');
              } else if (processedValue.toString && typeof processedValue.toString === 'function') {
                const toStringResult = processedValue.toString();
                if (toStringResult !== '[object Object]') {
                  processedValue = toStringResult;
                } else {
                  processedValue = JSON.stringify(processedValue);
                }
              } else {
                processedValue = JSON.stringify(processedValue);
              }
            }
            
            const finalValue = processedValue ? String(processedValue).trim() : '';
            rowData.push(finalValue);
          });
          rawData.push(rowData);
        });
        
        if (rawData.length === 0) {
          return res.status(400).json({ 
            error: '파일에 데이터가 없습니다.' 
          });
        }
        
        // 헤더 추출 및 매핑 생성 (.xls 방식과 동일)
        const rawHeaders = rawData[0] || [];
        const headerMapping = [];
        
        rawHeaders.forEach((header, originalIndex) => {
          if (header && header.trim()) {
            headerMapping.push({
              header: header.trim(),
              originalIndex: originalIndex
            });
          }
        });
        
        orderHeaders = headerMapping.map(item => item.header);
        orderData = [];
        
        // 데이터 행을 헤더명을 키로 하는 객체로 변환
        for (let i = 1; i < rawData.length; i++) {
          const row = rawData[i];
          
          // 유효한 데이터가 있는 행만 처리
          const hasValidData = row && row.some(cell => {
            if (cell === null || cell === undefined) return false;
            const cellStr = String(cell).trim();
            return cellStr !== '' && cellStr !== 'undefined' && cellStr !== 'null' && cellStr !== 'NULL' && cellStr.length > 0;
          });
          
          if (hasValidData) {
            const rowObject = {};
            headerMapping.forEach(({header, originalIndex}) => {
              const cellValue = row[originalIndex];
              rowObject[header] = cellValue !== null && cellValue !== undefined ? String(cellValue).trim() : '';
            });
            orderData.push(rowObject);
            
            // 처음 3개만 상세 로그
            if (orderData.length <= 3) {
              console.log(`✅ .xlsx 행 ${i} 데이터 추가:`, rowObject);
            }
          }
        }
        
        console.log('✅ Excel 파싱 완료:', {
          헤더: orderHeaders.length,
          데이터행: orderData.length,
          sampleHeaders: orderHeaders.slice(0, 5),
          sampleData: orderData.length > 0 ? orderData[0] : null
        });
      }
      } // .xlsx 파일 ExcelJS 처리 블록 닫기
    } // 전체 Excel 파일 처리 블록 닫기
    
    // 4. 데이터 검증
    if (orderData.length === 0) {
      return res.status(400).json({ 
        error: '처리할 데이터가 없습니다.' 
      });
    }
    
    console.log('📊 주문서 데이터:', {
      headers: orderHeaders,
      dataRows: orderData.length
    });
    
    // 5. 템플릿 매핑 적용하여 데이터 변환
    const orderMapping = template.order_field_mapping;
    const supplierMapping = template.supplier_field_mapping;
    const fixedFields = template.fixed_fields || {};
    
    console.log('📋 템플릿 매핑:', {
      orderMapping,
      supplierMapping,
      fixedFields
    });
    
    // 매핑 데이터 검증
    if (!supplierMapping || Object.keys(supplierMapping).length === 0) {
      console.error('❌ 템플릿 매핑 오류: supplier_field_mapping이 비어있음');
      return res.status(400).json({ 
        error: '템플릿의 공급업체 필드 매핑이 설정되지 않았습니다. 템플릿을 다시 설정해주세요.' 
      });
    }
    
    if (!orderMapping || Object.keys(orderMapping).length === 0) {
      console.error('❌ 템플릿 매핑 오류: order_field_mapping이 비어있음');
      return res.status(400).json({ 
        error: '템플릿의 주문서 필드 매핑이 설정되지 않았습니다. 템플릿을 다시 설정해주세요.' 
      });
    }
    
    // 6. 변환된 데이터 생성 (순서 보장)
    const convertedData = [];
    
    // 순서 보장을 위해 supplierFieldMappingArray 사용 (있는 경우)
    let supplierHeaders = [];
    if (template.supplier_field_mapping_array && Array.isArray(template.supplier_field_mapping_array)) {
      // 순서 배열이 있으면 그 순서대로 사용
      supplierHeaders = template.supplier_field_mapping_array
        .sort((a, b) => a.order - b.order)
        .map(item => item.supplierField);
      console.log('📋 발주서 헤더 생성 (배열 순서 사용):', supplierHeaders);
    } else {
      // 순서 배열이 없으면 Object.keys 사용 (기존 방식)
      supplierHeaders = Object.keys(supplierMapping);
      console.log('📋 발주서 헤더 생성 (Object.keys 사용):', supplierHeaders);
      console.log('⚠️ 순서 배열이 없어 Object.keys를 사용했습니다. 순서가 보장되지 않을 수 있습니다.');
    }
    
    // 헤더(컬럼명) 추가
    convertedData.push(supplierHeaders);
    
    // 데이터 변환
    orderData.forEach((orderRow, index) => {
      console.log(`🔄 행 ${index + 1} 변환 시작:`, {
        orderRowType: typeof orderRow,
        orderRowKeys: Object.keys(orderRow).slice(0, 5),
        orderRowSample: Object.fromEntries(Object.entries(orderRow).slice(0, 3))
      });
      
      const convertedRow = [];
      
      supplierHeaders.forEach(supplierField => {
        let value = '';
        
        // 고정값이 있으면 사용
        if (fixedFields[supplierField]) {
          value = fixedFields[supplierField];
        } else {
          // 매핑된 주문서 필드에서 값 가져오기
          const orderField = supplierMapping[supplierField];
          if (orderField && orderMapping[orderField]) {
            const orderColumnName = orderMapping[orderField];
            
            // orderRow는 객체이므로 키로 접근 (배열 인덱스가 아님!)
            if (orderRow[orderColumnName]) {
              const rawValue = orderRow[orderColumnName];
              
              console.log(`🔄 필드 매핑: ${supplierField} ← ${orderColumnName} = "${rawValue}"`);
              
              // 객체를 문자열로 변환 (읽기 전용 처리)
              if (rawValue && typeof rawValue === 'object') {
                let processedValue = rawValue;
                if (processedValue.richText && Array.isArray(processedValue.richText)) {
                  // 리치 텍스트 처리
                  value = processedValue.richText.map(item => item.text || '').join('');
                } else if (Array.isArray(processedValue)) {
                  value = processedValue.join(', ');
                } else if (processedValue.toString && typeof processedValue.toString === 'function') {
                  const toStringResult = processedValue.toString();
                  value = toStringResult !== '[object Object]' ? toStringResult : JSON.stringify(processedValue);
                } else {
                  value = JSON.stringify(processedValue);
                }
              } else {
                value = String(rawValue).trim();
              }
            }
          }
        }
        
        convertedRow.push(value);
      });
      
      convertedData.push(convertedRow);
    });
    
    console.log('🔄 데이터 변환 완료:', {
      originalRows: orderData.length,
      convertedRows: convertedData.length - 1,
      convertedDataSample: convertedData.slice(0, 3) // 처음 3행 확인
    });
    
    // 7. 발주서 파일 생성 (메타데이터 설정)
    const outputWorkbook = new ExcelJS.Workbook();
    
    // 출력 워크북 메타데이터 설정 (오류 방지)
    outputWorkbook.creator = 'AutoOrder System';
    outputWorkbook.company = 'AutoOrder';
    outputWorkbook.created = new Date();
    outputWorkbook.modified = new Date();
    outputWorkbook.subject = '발주서';
    outputWorkbook.description = '자동 생성된 발주서';
    
    const outputWorksheet = outputWorkbook.addWorksheet('발주서');
    
    // 데이터 추가 (상세 디버깅)
    convertedData.forEach((row, rowIndex) => {
      console.log(`📝 행 ${rowIndex + 1} 처리 중:`, {
        rowLength: row.length,
        rowSample: row.slice(0, 3)
      });
      
      row.forEach((value, colIndex) => {
        const cell = outputWorksheet.getCell(rowIndex + 1, colIndex + 1);
        
        // 객체를 문자열로 변환 (읽기 전용 처리)
        let processedCellValue = value;
        if (processedCellValue && typeof processedCellValue === 'object') {
          if (Array.isArray(processedCellValue)) {
            processedCellValue = processedCellValue.join(', ');
          } else if (processedCellValue.toString && typeof processedCellValue.toString === 'function') {
            const toStringResult = processedCellValue.toString();
            processedCellValue = toStringResult !== '[object Object]' ? toStringResult : JSON.stringify(processedCellValue);
          } else {
            processedCellValue = JSON.stringify(processedCellValue);
          }
        }
        
        cell.value = processedCellValue;
        
        // 첫 3개 행의 첫 3개 열만 상세 로그
        if (rowIndex < 3 && colIndex < 3) {
          console.log(`📊 셀 [${rowIndex + 1}, ${colIndex + 1}] 쓰기:`, {
            originalValue: value,
            processedValue: processedCellValue,
            cellType: typeof processedCellValue,
            cellLength: processedCellValue ? String(processedCellValue).length : 0
          });
        }
        
        // 헤더(컬럼명) 스타일링
        if (rowIndex === 0) {
          cell.font = { bold: true };
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE6E6E6' }
          };
        }
      });
    });
    
    // Excel 파일 쓰기 완료 후 검증
    console.log('🔍 Excel 파일 쓰기 검증:', {
      totalRows: outputWorksheet.rowCount,
      totalCols: outputWorksheet.columnCount,
      cell_A1: outputWorksheet.getCell('A1').value,
      cell_B1: outputWorksheet.getCell('B1').value,
      cell_A2: outputWorksheet.getCell('A2').value,
      cell_B2: outputWorksheet.getCell('B2').value
    });
    
    // 자동 열 너비 조정
    outputWorksheet.columns.forEach(column => {
      column.width = 15;
    });
    
    // 8. 파일 저장 (모든 환경에서 Supabase Storage 사용)
    const now = new Date();
    const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
    
    // Supabase Storage 호환 파일명 생성 (URL 인코딩 방식)
    const templateNameSafe = encodeURIComponent(template.template_name)
      .replace(/[%]/g, '_') // % 기호를 언더스코어로 변경
      .replace(/[^a-zA-Z0-9_-]/g, '_') // 영문, 숫자, _, - 만 허용
      .replace(/_+/g, '_') // 연속 언더스코어를 하나로
      .replace(/^_|_$/g, '') // 시작/끝 언더스코어 제거
      .substring(0, 30) // 길이 제한
      || 'template'; // 빈 문자열인 경우 기본값
    
    const outputFileName = `order_${templateNameSafe}_${timestamp}.xlsx`;
    
    console.log('💾 발주서 파일 Supabase Storage 저장 중:', outputFileName);
    
    // Supabase Storage에 저장 (한글 인코딩 개선)
    const buffer = await outputWorkbook.xlsx.writeBuffer({
      useStyles: true,
      useSharedStrings: false,  // 한글 호환성 개선
      compression: false        // 압축 비활성화로 한글 호환성 개선
    });
    
    console.log('💾 Excel 버퍼 생성 완료:', {
      bufferSize: buffer.length,
      fileName: outputFileName
    });
    
    const uploadResult = await uploadFile(buffer, outputFileName, 'generated');
    
    if (!uploadResult.success) {
      return res.status(500).json({ 
        error: 'Supabase Storage 저장 실패',
        details: uploadResult.error 
      });
    }
    
    console.log('✅ Supabase Storage 저장 완료:', outputFileName);
    
    // 9. 다운로드 URL 및 사용자 친화적 파일명 생성
    const userFriendlyFileName = `발주서_${template.template_name}_${timestamp}.xlsx`;
    const downloadUrl = `/api/orders/download/${outputFileName}?display=${encodeURIComponent(userFriendlyFileName)}`;
    
    console.log('🎉 템플릿 기반 변환 완료:', {
      template: template.template_name,
      processedRows: orderData.length,
      outputFile: outputFileName,
      userFriendlyFileName: userFriendlyFileName
    });
    
    res.json({
      success: true,
      message: '템플릿 기반 발주서 생성이 완료되었습니다.',
      generatedFile: outputFileName,
      displayFileName: userFriendlyFileName,
      downloadUrl: downloadUrl,
      processedRows: orderData.length,
      templateUsed: template.template_name,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ 템플릿 기반 변환 오류:', error);
    console.error('🔍 상세 오류 정보:', {
      name: error.name,
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 5).join('\n'),
      templateId: req.body.templateId,
      fileId: req.body.fileId
    });
    res.status(500).json({ 
      error: '템플릿 기반 변환 중 오류가 발생했습니다.',
      details: error.message,
      errorType: error.name,
      templateId: req.body.templateId
    });
  }
});

// 📂 Storage 파일 목록 조회 API
router.get('/storage/files', async (req, res) => {
  try {
    console.log('📂 Storage 파일 목록 요청');
    console.log('🔍 요청 시간:', new Date().toISOString());
    
    // uploads bucket과 generated bucket 모두 확인
    const uploadsResult = await supabase.storage
      .from('uploads')
      .list('files', {
        limit: 100,
        offset: 0,
        sortBy: { column: 'created_at', order: 'desc' }
      });
    
    const generatedResult = await supabase.storage
      .from('generated')
      .list('files', {
        limit: 100,
        offset: 0,
        sortBy: { column: 'created_at', order: 'desc' }
      });
    
    console.log('📊 uploads bucket 조회 결과:', uploadsResult.error || 'OK');
    console.log('📊 generated bucket 조회 결과:', generatedResult.error || 'OK');
    
    const { data, error } = uploadsResult;
    
    if (error) {
      console.error('❌ Storage 파일 목록 조회 실패:', error);
      return res.status(500).json({
        success: false,
        error: 'Storage 파일 목록을 가져올 수 없습니다.',
        details: error.message
      });
    }
    
    console.log('✅ Storage 파일 목록 조회 완료:', data.length + '개 파일');
    
    // 파일 정보 정리
    const fileList = data.map(file => ({
      name: file.name,
      size: file.metadata?.size || 0,
      lastModified: file.updated_at || file.created_at,
      contentType: file.metadata?.contentType || 'unknown'
    }));
    
    // generated bucket의 파일들도 포함
    let allFiles = data.map(file => ({
      name: file.name,
      size: file.metadata?.size || 0,
      lastModified: file.updated_at || file.created_at,
      contentType: file.metadata?.contentType || 'unknown',
      bucket: 'uploads'
    }));
    
    // generated bucket 파일들 추가
    if (!generatedResult.error && generatedResult.data) {
      const generatedFiles = generatedResult.data.map(file => ({
        name: file.name,
        size: file.metadata?.size || 0,
        lastModified: file.updated_at || file.created_at,
        contentType: file.metadata?.contentType || 'unknown',
        bucket: 'generated'
      }));
      allFiles = [...allFiles, ...generatedFiles];
    }
    
    // 최신 파일 순으로 정렬
    allFiles.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
    
    console.log(`📊 전체 파일 ${allFiles.length}개 조회 완료 (uploads: ${uploadsResult.data?.length || 0}, generated: ${generatedResult.data?.length || 0})`);

    res.json({
      success: true,
      files: allFiles,
      count: allFiles.length,
      buckets: {
        uploads: uploadsResult.data?.length || 0,
        generated: generatedResult.data?.length || 0
      }
    });
    
  } catch (error) {
    console.error('❌ Storage 파일 목록 조회 오류:', error);
    res.status(500).json({
      success: false,
      error: 'Storage 파일 목록 조회 중 오류가 발생했습니다.',
      details: error.message
    });
  }
});

// 📋 발주서 파일 미리보기 API
router.get('/preview/:fileName', async (req, res) => {
  try {
    const { fileName } = req.params;
    console.log('🔍 파일 미리보기 요청:', {
      fileName: fileName,
      requestTime: new Date().toISOString(),
      userAgent: req.get('User-Agent'),
      ip: req.ip
    });
    
    // 파일명으로 bucket 추정 (purchase_order는 generated, 나머지는 uploads)
    const isGeneratedFile = fileName.startsWith('purchase_order_') || 
                           fileName.startsWith('order_') ||
                           fileName.includes('발주서_');
    const bucket = isGeneratedFile ? 'generated' : 'uploads';
    
    console.log('📥 Supabase Storage에서 파일 다운로드 시도:', {
      fileName: fileName,
      bucket: bucket,
      isGeneratedFile: isGeneratedFile
    });
    
    const downloadResult = await downloadFile(fileName, bucket);
    
    if (!downloadResult.success) {
      console.error('❌ 미리보기 파일 다운로드 실패:', {
        fileName: fileName,
        error: downloadResult.error,
        timestamp: new Date().toISOString()
      });
      
      // 구체적인 오류 메시지 제공
      let errorMessage = '파일을 찾을 수 없습니다.';
      if (downloadResult.error && downloadResult.error.includes('{}')) {
        errorMessage = '파일이 아직 업로드 중이거나 경로를 찾을 수 없습니다. 잠시 후 다시 시도해주세요.';
      } else if (downloadResult.error) {
        errorMessage = `파일 접근 오류: ${downloadResult.error}`;
      }
      
      return res.status(404).json({ 
        success: false,
        error: errorMessage,
        fileName: fileName,
        suggestion: '파일 업로드가 완료되기까지 몇 초 더 기다려주세요.'
      });
    }
    
    const fileBuffer = downloadResult.data;
    const fileExtension = path.extname(fileName).toLowerCase();
    
    let previewData = [];
    let headers = [];
    
    try {
      if (fileExtension === '.xlsx' || fileExtension === '.xls') {
        // Excel 파일 처리
        const workbook = new ExcelJS.Workbook();
        
        // 메타데이터 기본값 설정
        workbook.creator = 'AutoOrder System';
        workbook.company = 'AutoOrder';
        workbook.created = new Date();
        workbook.modified = new Date();
        
        await workbook.xlsx.load(fileBuffer, { 
          ignoreCalculatedFields: true,
          styles: false,
          hyperlinks: false,
          drawings: false,
          sharedStrings: 'ignore', // SharedStrings 무시로 속도 향상
          worksheets: 'emit'       // 워크시트만 로드
        });
        
        const worksheet = workbook.getWorksheet(1);
        
        if (worksheet) {
          // 헤더 추출 (첫 번째 행)
          const firstRow = worksheet.getRow(1);
          firstRow.eachCell((cell, colNumber) => {
            let cellValue = cell.value;
            
            // 객체를 문자열로 변환
            if (cellValue && typeof cellValue === 'object') {
              if (cellValue.richText && Array.isArray(cellValue.richText)) {
                cellValue = cellValue.richText.map(item => item.text || '').join('');
              } else if (cellValue.text) {
                cellValue = cellValue.text;
              } else if (cellValue.toString && typeof cellValue.toString === 'function') {
                cellValue = cellValue.toString();
              } else {
                cellValue = JSON.stringify(cellValue);
              }
            }
            
            headers.push(cellValue ? cellValue.toString() : `컬럼${colNumber}`);
          });
          
          // 데이터 추출 (최대 10행까지 미리보기)
          const maxRows = Math.min(11, worksheet.rowCount); // 헤더 + 10행
          for (let rowNumber = 2; rowNumber <= maxRows; rowNumber++) {
            const row = worksheet.getRow(rowNumber);
            const rowData = {};
            
            headers.forEach((header, index) => {
              const cell = row.getCell(index + 1);
              let cellValue = cell.value;
              
              // 객체를 문자열로 변환
              if (cellValue && typeof cellValue === 'object') {
                if (cellValue.richText && Array.isArray(cellValue.richText)) {
                  cellValue = cellValue.richText.map(item => item.text || '').join('');
                } else if (cellValue.text) {
                  cellValue = cellValue.text;
                } else if (cellValue.result !== undefined) {
                  cellValue = cellValue.result;
                } else if (cellValue.toString && typeof cellValue.toString === 'function') {
                  cellValue = cellValue.toString();
                } else {
                  cellValue = JSON.stringify(cellValue);
                }
              }
              
              rowData[header] = cellValue ? cellValue.toString() : '';
            });
            
            previewData.push(rowData);
          }
          
          console.log('✅ Excel 미리보기 데이터 처리 완료:', {
            headers: headers.length,
            rows: previewData.length
          });
        }
        
      } else if (fileExtension === '.csv') {
        // CSV 파일 처리
        const csvData = fileBuffer.toString('utf8');
        const lines = csvData.split('\n').filter(line => line.trim());
        
        if (lines.length > 0) {
          // 헤더 파싱
          headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim());
          
          // 데이터 파싱 (최대 10행)
          const dataLines = lines.slice(1, 11);
          dataLines.forEach(line => {
            const values = line.split(',').map(v => v.replace(/^"|"$/g, '').trim());
            const rowData = {};
            
            headers.forEach((header, index) => {
              rowData[header] = values[index] || '';
            });
            
            previewData.push(rowData);
          });
        }
      }
      
      res.json({
        success: true,
        headers: headers,
        data: previewData,
        totalRows: previewData.length,
        message: `파일 미리보기 데이터 ${previewData.length}행을 불러왔습니다.`
      });
      
    } catch (parseError) {
      console.error('❌ 파일 파싱 오류:', parseError);
      res.status(500).json({
        success: false,
        error: '파일을 읽는 중 오류가 발생했습니다.',
        details: parseError.message
      });
    }
    
  } catch (error) {
    console.error('❌ 미리보기 API 오류:', error);
    res.status(500).json({
      success: false,
      error: '미리보기 처리 중 오류가 발생했습니다.',
      details: error.message
    });
  }
});

// 📊 사용량 조회 API
router.get('/usage', (req, res) => {
  try {
    const usage = getCurrentUsage(req);
    const stats = getUsageStats();
    
    // 전체 사용량 계산
    const totalUsed = usage.orderGeneration.current + usage.aiMapping.current + usage.emailSending.current;
    const totalLimit = usage.orderGeneration.limit + usage.aiMapping.limit + usage.emailSending.limit;
    
    res.json({
      success: true,
      usage,
      stats,
      summary: {
        totalUsed,
        totalLimit,
        totalRemaining: totalLimit - totalUsed
      },
      message: `발주서 생성: ${usage.orderGeneration.current}/${usage.orderGeneration.limit}, AI 매핑: ${usage.aiMapping.current}/${usage.aiMapping.limit}, 이메일: ${usage.emailSending.current}/${usage.emailSending.limit}`
    });
  } catch (error) {
    console.error('❌ 사용량 조회 오류:', error);
    res.status(500).json({
      success: false,
      error: '사용량 조회 중 오류가 발생했습니다.',
      details: error.message
    });
  }
});

// 📊 사용량 동기화 API (캐시 사용 시 호출)
router.post('/usage/sync', async (req, res) => {
  try {
    const { action, cached = false, metadata = {} } = req.body;
    
    console.log('📊 사용량 동기화 요청:', { 
      action, 
      cached, 
      metadata, 
      sessionId: req.session.id || 'anonymous' 
    });
    
    // 지원되는 액션 검증
    const validActions = ['fileUpload', 'orderGeneration', 'aiMapping', 'emailSending'];
    if (!validActions.includes(action)) {
      return res.status(400).json({
        success: false,
        error: '지원하지 않는 액션입니다.',
        validActions
      });
    }
    
    // 액션에 따른 카테고리 매핑
    const actionToCategoryMap = {
      fileUpload: 'orderGeneration',  // 파일 업로드는 발주서 생성 카테고리로 집계
      orderGeneration: 'orderGeneration',
      aiMapping: 'aiMapping',
      emailSending: 'emailSending'
    };
    
    const category = actionToCategoryMap[action];
    
    // 세션 안전 체크 및 초기화
    if (!req.session) {
      console.warn('⚠️ 세션이 초기화되지 않음 - 기본 세션 생성');
      req.session = {};
    }
    
    if (!req.session.dailyUsage) {
      const today = new Date().toDateString();
      const now = new Date();
      req.session.dailyUsage = {
        date: today,
        categories: {
          orderGeneration: { current: 0, limit: 10 },
          aiMapping: { current: 0, limit: 10 },
          emailSending: { current: 0, limit: 5 }
        },
        lastReset: now.toISOString(),
        startTime: now.toISOString()
      };
    }
    
    // 카테고리 안전 체크
    if (!req.session.dailyUsage.categories) {
      req.session.dailyUsage.categories = {
        orderGeneration: { current: 0, limit: 10 },
        aiMapping: { current: 0, limit: 10 },
        emailSending: { current: 0, limit: 5 }
      };
    }
    
    const categoryUsage = req.session.dailyUsage.categories[category];
    
    // 카테고리별 사용량 안전 체크
    if (!categoryUsage) {
      console.warn(`⚠️ ${category} 카테고리 사용량 정보 없음 - 초기화`);
      req.session.dailyUsage.categories[category] = { 
        current: 0, 
        limit: category === 'emailSending' ? 5 : 10 
      };
    }
    
    // 안전 체크 후 카테고리 사용량 다시 가져오기
    const finalCategoryUsage = req.session.dailyUsage.categories[category];
    
    // 현재 사용량 확인 (한도 체크)
    if (finalCategoryUsage.current >= finalCategoryUsage.limit) {
      console.log(`🚫 사용량 한도 초과: ${category} ${finalCategoryUsage.current}/${finalCategoryUsage.limit}`);
      return res.status(429).json({
        success: false,
        error: `일일 사용 한도를 초과했습니다.`,
        category,
        usage: {
          current: finalCategoryUsage.current,
          limit: finalCategoryUsage.limit,
          remaining: 0
        },
        type: 'RATE_LIMIT_EXCEEDED'
      });
    }
    
    // 사용량 증가 (캐시 히트이더라도 실제 사용으로 카운트)
    finalCategoryUsage.current += 1;
    req.session.dailyUsage.lastUsed = new Date().toISOString();
    
    console.log(`📈 사용량 동기화 완료: ${category} ${finalCategoryUsage.current}/${finalCategoryUsage.limit} (캐시: ${cached})`);
    
    // 현재 사용량 정보 반환
    const currentUsage = getCurrentUsage(req);
    
    res.json({
      success: true,
      action,
      category,
      cached,
      usage: currentUsage[category],
      allUsage: currentUsage,
      message: cached ? 
        `캐시 사용량이 동기화되었습니다. (${category}: ${finalCategoryUsage.current}/${finalCategoryUsage.limit})` :
        `사용량이 기록되었습니다. (${category}: ${finalCategoryUsage.current}/${finalCategoryUsage.limit})`
    });
    
  } catch (error) {
    console.error('❌ 사용량 동기화 오류:', error);
    res.status(500).json({
      success: false,
      error: '사용량 동기화 중 오류가 발생했습니다.',
      details: error.message
    });
  }
});

module.exports = router; 