const { createClient } = require('@supabase/supabase-js');

// 환경변수 체크 (최소화된 로깅)
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  console.error('❌ Supabase 환경변수 누락');
}

// Supabase 클라이언트 초기화 (Vercel 서버리스 환경 최적화)
let supabase;
try {
  supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_ANON_KEY || '',
    {
      global: {
        fetch: (url, options = {}) => {
          return fetch(url, {
            ...options,
            timeout: 15000, // Vercel 환경에 맞게 15초로 단축
          });
        }
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    }
  );
  // 초기화 완료 (로그 최소화)
} catch (initError) {
  console.error('❌ Supabase 초기화 실패');
  supabase = null;
}

/**
 * 파일을 Supabase Storage에 업로드 (강화된 재시도 로직)
 * @param {Buffer} fileBuffer - 파일 버퍼
 * @param {string} fileName - 파일명
 * @param {string} bucket - 버킷명 (기본값: 'uploads')
 * @param {number} maxRetries - 최대 재시도 횟수 (기본값: 5)
 * @returns {Promise<{success: boolean, data?: any, error?: string}>}
 */
async function uploadFile(fileBuffer, fileName, bucket = 'uploads', maxRetries = 5) {
  // 파일 확장자에 따른 MIME 타입 설정
  const getContentType = (fileName) => {
    const ext = fileName.toLowerCase().split('.').pop();
    switch (ext) {
      case 'xlsx':
        return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      case 'xls':
        return 'application/vnd.ms-excel';
      case 'csv':
        return 'text/csv';
      case 'json':
        return 'application/json';
      default:
        return 'application/octet-stream';
    }
  };

  let lastError = null;
  let consecutiveFailures = 0;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`📤 Supabase Storage 업로드 시도 ${attempt}/${maxRetries}:`, {
        fileName,
        fileSize: fileBuffer.length,
        bucket,
        path: `files/${fileName}` // files 폴더에 업로드
      });
      
      // 연속 실패 시 더 긴 대기 (서킷 브레이커 패턴)
      if (consecutiveFailures >= 2) {
        const circuitDelay = Math.min(5000 + consecutiveFailures * 2000, 15000);
        console.log(`🔄 서킷 브레이커: ${circuitDelay}ms 대기 중...`);
        await new Promise(resolve => setTimeout(resolve, circuitDelay));
      }
      
      // Promise.race를 사용한 타임아웃 제어
      // files 폴더에 업로드 (기존 파일들과 동일한 위치)
      const uploadPromise = supabase.storage
        .from(bucket)
        .upload(`files/${fileName}`, fileBuffer, {
          cacheControl: '3600',
          upsert: false,
          contentType: getContentType(fileName)
        });
      
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Upload timeout after 25 seconds')), 25000);
      });
      
      const { data, error } = await Promise.race([uploadPromise, timeoutPromise]);

      if (error) {
        lastError = error;
        consecutiveFailures++;
        console.error(`❌ Supabase 업로드 오류 (시도 ${attempt}):`, {
          error: error.message,
          status: error.status || error.statusCode,
          consecutiveFailures
        });
        
        // 504, 503, 502, 타임아웃, 네트워크 오류인 경우 재시도
        const shouldRetry = attempt < maxRetries && (
          error.message.includes('504') || 
          error.message.includes('503') || 
          error.message.includes('502') || 
          error.message.includes('Gateway Timeout') || 
          error.message.includes('Bad Gateway') ||
          error.message.includes('Service Unavailable') ||
          error.message.includes('timeout') ||
          error.message.includes('ECONNRESET') ||
          error.message.includes('ETIMEDOUT') ||
          error.message.includes('ENOTFOUND') ||
          error.message.includes('fetch failed') ||
          (error.status >= 500 && error.status < 600)
        );
        
        if (shouldRetry) {
          // 지수 백오프 + 지터 (최대 20초)
          const baseDelay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          const jitter = Math.random() * 1000; // 0-1초 랜덤
          const delay = baseDelay + jitter;
          
          console.log(`🔄 ${Math.round(delay)}ms 후 재시도... (연속실패: ${consecutiveFailures})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        } else {
          // 재시도하지 않는 오류인 경우
          console.error(`❌ 재시도 불가능한 오류:`, error.message);
          return { success: false, error: error.message };
        }
      }

      console.log(`✅ Supabase 업로드 성공 (시도 ${attempt}):`, {
        path: data.path,
        fileSize: fileBuffer.length
      });
      
      consecutiveFailures = 0; // 성공 시 실패 카운터 리셋
      return { success: true, data };
      
    } catch (error) {
      lastError = error;
      consecutiveFailures++;
      console.error(`❌ 업로드 예외 오류 (시도 ${attempt}):`, {
        error: error.message,
        consecutiveFailures,
        stack: error.stack?.split('\n')[0]
      });
      
      // 네트워크 관련 오류인 경우 재시도
      const shouldRetry = attempt < maxRetries && (
        error.message.includes('504') || 
        error.message.includes('503') || 
        error.message.includes('502') || 
        error.message.includes('timeout') ||
        error.message.includes('ECONNRESET') ||
        error.message.includes('ETIMEDOUT') ||
        error.message.includes('ENOTFOUND') ||
        error.message.includes('fetch failed') ||
        error.message.includes('network') ||
        error.name === 'AbortError' ||
        error.name === 'TimeoutError'
      );
      
      if (shouldRetry) {
        const baseDelay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        const jitter = Math.random() * 1000;
        const delay = baseDelay + jitter;
        
        console.log(`🔄 ${Math.round(delay)}ms 후 재시도... (연속실패: ${consecutiveFailures})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
    }
  }
  
  // 모든 재시도 실패
  console.error(`❌ ${maxRetries}번의 업로드 재시도 모두 실패:`, lastError?.message);
  return { 
    success: false, 
            error: `파일 업로드 실패 (${maxRetries}번 재시도): ${lastError?.message || '알 수 없는 오류'}. 네트워크 연결을 확인해주세요.`
  };
}

/**
 * Supabase Storage에서 파일 다운로드 (강화된 재시도 로직)
 * @param {string} fileName - 파일명
 * @param {string} bucket - 버킷명 (기본값: 'uploads')
 * @param {number} maxRetries - 최대 재시도 횟수 (기본값: 5)
 * @returns {Promise<{success: boolean, data?: Buffer, error?: string}>}
 */
async function downloadFile(fileName, bucket = 'uploads', maxRetries = 7) {
  let lastError = null;
  let consecutiveFailures = 0;
  
  // 파일명 디코딩 처리 (base64로 인코딩된 경우)
  let decodedFileName = fileName;
  let allDecodingVariants = [fileName]; // 모든 디코딩 변형을 저장
  
  try {
    // base64로 인코딩된 파일명인지 확인
    if (/^[A-Za-z0-9+/=]+$/.test(fileName) && fileName.length % 4 === 0) {
      const decoded = Buffer.from(fileName, 'base64').toString('utf8');
      if (decoded && decoded !== fileName) {
        decodedFileName = decoded;
        allDecodingVariants.push(decoded);
        console.log('🔄 파일명 base64 디코딩:', { original: fileName, decoded: decodedFileName });
        
        // base64 디코딩 결과가 URL 인코딩된 경우 추가 처리
        try {
          const urlDecoded = decodeURIComponent(decoded);
          if (urlDecoded !== decoded) {
            allDecodingVariants.push(urlDecoded);
            console.log('🔄 추가 URL 디코딩:', { from: decoded, to: urlDecoded });
          }
        } catch (urlError) {
          // URL 디코딩 실패는 정상 - 모든 파일명이 URL 인코딩된 것은 아니므로
          console.log('📝 URL 디코딩 불필요:', decoded);
        }
        
        // 불완전한 URL 인코딩 처리 (한글 파일명의 경우)
        if (decoded.includes('%')) {
          try {
            // 여러 번 URL 디코딩 시도 (중첩 인코딩 대응)
            let multiDecoded = decoded;
            for (let i = 0; i < 3; i++) {
              const nextDecoded = decodeURIComponent(multiDecoded);
              if (nextDecoded === multiDecoded) break;
              multiDecoded = nextDecoded;
              allDecodingVariants.push(multiDecoded);
            }
            console.log('🔄 다중 URL 디코딩 완료:', multiDecoded);
          } catch (e) {
            console.log('⚠️ 다중 URL 디코딩 실패:', e.message);
          }
        }
      }
    }
  } catch (e) {
    // 디코딩 실패 시 원본 파일명 사용
    console.log('⚠️ 파일명 디코딩 실패, 원본 사용:', fileName);
  }
  
  // 원본 파일명도 URL 디코딩 시도
  try {
    const originalUrlDecoded = decodeURIComponent(fileName);
    if (originalUrlDecoded !== fileName) {
      allDecodingVariants.push(originalUrlDecoded);
    }
  } catch (e) {
    // 원본이 URL 인코딩되지 않은 경우는 정상
  }
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`📥 Supabase Storage 다운로드 시도 ${attempt}/${maxRetries}:`, fileName);
      
      // 첫 번째 시도에서 버킷의 파일 목록 확인 (디버깅용)
      if (attempt === 1) {
                 try {
           console.log('🔍 files 폴더 파일 목록 확인 중...');
           const { data: fileList, error: listError } = await supabase.storage
             .from(bucket)
             .list('files', { limit: 100 });
           
                     if (!listError && fileList) {
            // 파일 목록은 로그 출력하지 않음 (성능 및 가독성 개선)
            console.log(`📂 files 폴더에서 ${fileList.length}개 파일 발견`);
            
            // 유사한 파일명 찾기 (로그 출력 없음)
            const similarFiles = fileList.filter(f => 
              f.name.includes(fileName.substring(0, 8)) || 
              fileName.includes(f.name.substring(0, 8))
            );
            if (similarFiles.length > 0) {
              console.log(`🔍 유사한 파일명 ${similarFiles.length}개 발견`);
            }
          } else {
            console.log('⚠️ files 폴더 목록 조회 실패:', listError?.message);
          }
         } catch (listErr) {
           console.log('⚠️ files 폴더 조회 오류:', listErr.message);
         }
         
                 // 루트 경로도 확인 (하위 호환용) - 로그 간소화
        try {
          const { data: rootList, error: rootError } = await supabase.storage
            .from(bucket)
            .list('', { limit: 100 });
          
          if (!rootError && rootList && rootList.length > 0) {
            console.log(`📂 루트에서 ${rootList.length}개 항목 발견`);
          } else {
            console.log('📂 루트 비어있음');
          }
        } catch (rootErr) {
          console.log('⚠️ 루트 조회 오류:', rootErr.message);
        }
      }
      
      // 연속 실패 시 더 긴 대기 (서킷 브레이커 패턴)
      if (consecutiveFailures >= 1) {
        let circuitDelay;
        // 타임아웃 에러의 경우 더 긴 대기 시간
        if (lastError && lastError.message && lastError.message.includes('timeout')) {
          circuitDelay = Math.min(3000 + attempt * 2000, 10000);
          console.log(`⏱️ 타임아웃 재시도: ${circuitDelay}ms 대기 중... (시도 ${attempt}/${maxRetries})`);
        } else {
          circuitDelay = Math.min(2000 + consecutiveFailures * 1000, 8000);
          console.log(`🔄 서킷 브레이커: ${circuitDelay}ms 대기 중...`);
        }
        await new Promise(resolve => setTimeout(resolve, circuitDelay));
      }
      
      // 수집된 모든 디코딩 변형을 사용 (중복 제거)
      const fileVariants = [...new Set(allDecodingVariants)];
      
      console.log(`🔍 ${fileVariants.length}개 파일명 변형으로 다운로드 시도`);
      
      let downloadData = null;
      let downloadError = null;
      
             // 각 파일명 변형을 순서대로 시도 (files/ 경로 우선)
       const pathVariants = ['files/', '']; // files/ 경로 우선, 루트는 하위 호환
       
       // 먼저 files 폴더에 해당 파일이 실제로 존재하는지 확인
       let fileExistsInFiles = false;
       try {
         const { data: filesCheck, error: filesError } = await supabase.storage
           .from(bucket)
           .list('files', { limit: 1000 });
         
         if (!filesError && filesCheck) {
           fileExistsInFiles = fileVariants.some(variant => 
             filesCheck.some(f => f.name === variant)
           );
           // 로그 간소화: 존재 여부만 간단히 표시
           if (fileExistsInFiles) {
             console.log('📁 files 폴더에서 파일 확인됨');
           }
         }
       } catch (checkError) {
         console.log('⚠️ 파일 존재 확인 실패:', checkError.message);
       }
       
       for (const pathPrefix of pathVariants) {
         // files/ 경로가 아닌 경우, 실제로 files 폴더에 파일이 있다면 스킵
         if (pathPrefix === '' && fileExistsInFiles) {
           console.log('⏭️ 파일이 files 폴더에 있으므로 루트 경로 스킵');
           continue;
         }
         
         for (const variant of fileVariants) {
           try {
             const fullPath = `${pathPrefix}${variant}`;
             console.log(`📥 파일 다운로드 시도: ${fullPath}`);
             
             const downloadPromise = supabase.storage
               .from(bucket)
               .download(fullPath);
             
                         const timeoutPromise = new Promise((_, reject) => {
              setTimeout(() => reject(new Error('Download timeout after 30 seconds')), 30000);
            });
             
             const result = await Promise.race([downloadPromise, timeoutPromise]);
             
             if (!result.error && result.data) {
               downloadData = result.data;
               console.log(`✅ 파일 다운로드 성공: ${fullPath}`);
               break;
             } else {
               downloadError = result.error;
               console.log(`⚠️ 파일명 변형 실패: ${fullPath}`, {
                 error: result.error?.message || 'Unknown error',
                 status: result.error?.status || result.error?.statusCode,
                 details: result.error
               });
             }
           } catch (variantError) {
             console.log(`⚠️ 파일명 변형 오류: ${pathPrefix}${variant}`, {
               message: variantError.message,
               details: variantError
             });
             downloadError = variantError;
           }
         }
         if (downloadData) break; // 성공하면 경로 변형 중단
       }
      
      // 최종 결과 설정
      const data = downloadData;
      const error = downloadData ? null : downloadError;

      if (error) {
        lastError = error;
        consecutiveFailures++;
        console.error(`❌ Supabase 다운로드 오류 (시도 ${attempt}):`, {
          error: error.message || JSON.stringify(error),
          status: error.status || error.statusCode,
          bucket: bucket,
          originalFileName: fileName,
          decodedFileName: decodedFileName,
          allDecodingVariants: allDecodingVariants,
          triedVariants: fileVariants,
          consecutiveFailures,
          errorDetails: {
            name: error.name,
            code: error.code,
            statusText: error.statusText,
            headers: error.headers
          }
        });
        
        // 504, 503, 502, 타임아웃, 네트워크 오류인 경우 재시도
        const shouldRetry = attempt < maxRetries && (
          error.message.includes('504') || 
          error.message.includes('503') || 
          error.message.includes('502') || 
          error.message.includes('Gateway Timeout') || 
          error.message.includes('Bad Gateway') ||
          error.message.includes('Service Unavailable') ||
          error.message.includes('timeout') ||
          error.message.includes('ECONNRESET') ||
          error.message.includes('ETIMEDOUT') ||
          error.message.includes('ENOTFOUND') ||
          error.message.includes('fetch failed') ||
          (error.status >= 500 && error.status < 600)
        );
        
        if (shouldRetry) {
          // 지수 백오프 + 지터 (최대 20초)
          const baseDelay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          const jitter = Math.random() * 1000; // 0-1초 랜덤
          const delay = baseDelay + jitter;
          
          console.log(`🔄 ${Math.round(delay)}ms 후 재시도... (연속실패: ${consecutiveFailures})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        } else {
          // 재시도하지 않는 오류인 경우
          console.error(`❌ 재시도 불가능한 오류:`, error.message);
          return { success: false, error: error.message };
        }
      }

      // Blob을 Buffer로 변환
      const arrayBuffer = await data.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      console.log(`✅ Supabase 다운로드 성공 (시도 ${attempt}):`, {
        fileSize: buffer.length,
        fileName: fileName
      });
      
      consecutiveFailures = 0; // 성공 시 실패 카운터 리셋
      return { success: true, data: buffer };
      
    } catch (error) {
      lastError = error;
      consecutiveFailures++;
      console.error(`❌ 다운로드 예외 오류 (시도 ${attempt}):`, {
        error: error.message,
        consecutiveFailures,
        stack: error.stack?.split('\n')[0]
      });
      
      // 네트워크 관련 오류인 경우 재시도
      const shouldRetry = attempt < maxRetries && (
        error.message.includes('504') || 
        error.message.includes('503') || 
        error.message.includes('502') || 
        error.message.includes('timeout') ||
        error.message.includes('ECONNRESET') ||
        error.message.includes('ETIMEDOUT') ||
        error.message.includes('ENOTFOUND') ||
        error.message.includes('fetch failed') ||
        error.message.includes('network') ||
        error.name === 'AbortError' ||
        error.name === 'TimeoutError'
      );
      
      if (shouldRetry) {
        const baseDelay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        const jitter = Math.random() * 1000;
        const delay = baseDelay + jitter;
        
        console.log(`🔄 ${Math.round(delay)}ms 후 재시도... (연속실패: ${consecutiveFailures})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
    }
  }
  
  // 모든 재시도 실패 - 대체 방법 시도
  console.error(`❌ ${maxRetries}번의 재시도 모두 실패. 공개 URL 방법 시도...`);
  
  try {
    const publicUrl = getPublicUrl(fileName, bucket);
    console.log(`🔄 공개 URL 다운로드 시도:`, publicUrl);
    
    const response = await fetch(publicUrl, {
      timeout: 30000
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    console.log(`✅ 공개 URL 다운로드 성공:`, {
      fileSize: buffer.length,
      fileName: fileName
    });
    
    return { success: true, data: buffer };
    
  } catch (publicUrlError) {
    console.error(`❌ 공개 URL 다운로드도 실패:`, publicUrlError.message);
  }
  
  console.error(`❌ 모든 다운로드 방법 실패:`, lastError?.message);
  return { 
    success: false, 
            error: `파일 다운로드 실패 (${maxRetries}번 재시도): ${lastError?.message || '알 수 없는 오류'}. 네트워크 연결을 확인해주세요.`
  };
}

/**
 * Supabase Storage에서 파일 삭제
 * @param {string} fileName - 파일명
 * @param {string} bucket - 버킷명 (기본값: 'uploads')
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function deleteFile(fileName, bucket = 'uploads') {
  try {
    console.log('🗑️ Supabase Storage 파일 삭제:', fileName);
    
    const { error } = await supabase.storage
      .from(bucket)
      .remove([`files/${fileName}`]);

    if (error) {
      console.error('❌ Supabase 삭제 오류:', error);
      return { success: false, error: error.message };
    }

    console.log('✅ Supabase 파일 삭제 성공');
    return { success: true };
  } catch (error) {
    console.error('❌ 삭제 예외 오류:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 파일의 공개 URL 생성
 * @param {string} fileName - 파일명
 * @param {string} bucket - 버킷명 (기본값: 'uploads')
 * @returns {string} 공개 URL
 */
function getPublicUrl(fileName, bucket = 'uploads') {
  const { data } = supabase.storage
    .from(bucket)
    .getPublicUrl(`files/${fileName}`);
  
  return data.publicUrl;
}

/**
 * 매핑 데이터를 Supabase에 저장
 * @param {string} mappingName - 매핑명
 * @param {Object} mappingData - 매핑 데이터
 * @returns {Promise<{success: boolean, data?: any, error?: string}>}
 */
async function saveMappingData(mappingName, mappingData) {
  try {
    console.log('💾 매핑 데이터 저장:', mappingName);
    
    const jsonData = JSON.stringify(mappingData, null, 2);
    const buffer = Buffer.from(jsonData, 'utf8');
    
    const result = await uploadFile(buffer, `${mappingName}.json`, 'mappings');
    
    if (result.success) {
      console.log('✅ 매핑 데이터 저장 성공');
    }
    
    return result;
  } catch (error) {
    console.error('❌ 매핑 저장 오류:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 매핑 데이터를 Supabase에서 로드
 * @param {string} mappingName - 매핑명
 * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
 */
async function loadMappingData(mappingName) {
  try {
    console.log('📖 매핑 데이터 로드:', mappingName);
    
    const result = await downloadFile(`${mappingName}.json`, 'mappings');
    
    if (!result.success) {
      return result;
    }
    
    const jsonData = result.data.toString('utf8');
    const mappingData = JSON.parse(jsonData);
    
    console.log('✅ 매핑 데이터 로드 성공');
    return { success: true, data: mappingData };
  } catch (error) {
    console.error('❌ 매핑 로드 오류:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 파일명 매핑 관리 함수들
 * 원본 파일명(또는 캐시 ID)와 실제 저장된 파일명 간의 매핑을 관리
 */

/**
 * 파일명 매핑 저장
 * @param {string} originalId - 원본 파일 ID (캐시 ID 또는 인코딩된 파일명)
 * @param {string} actualFileName - 실제 저장된 파일명
 * @param {string} originalFileName - 원본 파일명 (사용자가 업로드한 파일명)
 * @param {string} bucket - 버킷명
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function saveFileMapping(originalId, actualFileName, originalFileName, bucket = 'uploads', metadata = {}) {
  try {
    const mappingData = {
      originalId: originalId,
      actualFileName: actualFileName,
      originalFileName: originalFileName,
      bucket: bucket,
      createdAt: new Date().toISOString(),
      // 추가 메타데이터
      fileSize: metadata.fileSize || null,
      mimeType: metadata.mimeType || null,
      isHancomExcel: metadata.isHancomExcel || false  // 한컴오피스 파일 정보 추가
    };

    console.log('💾 파일명 매핑 저장:', {
      originalId: originalId,
      actualFileName: actualFileName,
      originalFileName: originalFileName,
      bucket: bucket
    });

    // 한글 파일명을 안전한 키로 변환
    const safeKey = Buffer.from(originalId).toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    console.log('🔧 안전한 키 생성:', { originalId, safeKey });

    const { data, error } = await supabase.storage
      .from('mappings')
      .upload(`file-mappings/${safeKey}.json`, 
        Buffer.from(JSON.stringify(mappingData, null, 2)), {
          contentType: 'application/json',
          cacheControl: '3600',
          upsert: true
        });

    if (error) {
      console.error('❌ 파일명 매핑 저장 오류:', error);
      
      // Supabase 응답이 HTML인 경우 특별 처리
      if (error.message && error.message.includes('Unexpected token')) {
        console.error('⚠️ Supabase 응답이 JSON이 아닌 HTML입니다. 서비스 상태를 확인하세요.');
        return { success: false, error: 'Supabase 서비스 일시적 오류 - HTML 응답 수신' };
      }
      
      return { success: false, error: error.message };
    }

    console.log('✅ 파일명 매핑 저장 성공:', originalId);
    return { success: true, data };
  } catch (error) {
    console.error('❌ 파일명 매핑 저장 예외:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 파일명 매핑 조회
 * @param {string} originalId - 원본 파일 ID
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
async function loadFileMapping(originalId) {
  try {
    console.log('🔍 파일명 매핑 조회:', originalId);

    // 한글 파일명을 안전한 키로 변환 (저장 시와 동일한 방식)
    const safeKey = Buffer.from(originalId).toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    console.log('🔧 안전한 키로 조회:', { originalId, safeKey });

    const { data, error } = await supabase.storage
      .from('mappings')
      .download(`file-mappings/${safeKey}.json`);

    if (error) {
      console.log('❌ 파일명 매핑 조회 실패:', error.message);
      return { success: false, error: error.message };
    }

    const text = await data.text();
    const mappingData = JSON.parse(text);

    console.log('✅ 파일명 매핑 조회 성공:', {
      originalId: mappingData.originalId,
      actualFileName: mappingData.actualFileName,
      originalFileName: mappingData.originalFileName,
      isHancomExcel: mappingData.isHancomExcel || false,
      fileSize: mappingData.fileSize || null,
      mimeType: mappingData.mimeType || null
    });

    return { success: true, data: mappingData };
  } catch (error) {
    console.error('❌ 파일명 매핑 조회 예외:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 실제 파일명 조회 (매핑 테이블 + 대안 검색)
 * @param {string} fileId - 파일 ID (원본 또는 실제)
 * @param {string} bucket - 버킷명
 * @returns {Promise<{success: boolean, actualFileName?: string, error?: string}>}
 */
async function resolveActualFileName(fileId, bucket = 'uploads', expectedFileType = null) {
  try {
    console.log('🔍 실제 파일명 해석 시작:', fileId);

    // 1단계: 파일명이 이미 실제 파일명인지 확인 (orderFile-, supplierFile- 등으로 시작)
    if (fileId.match(/^(orderFile|supplierFile)-\d+-\d+\.(xlsx?|csv)$/)) {
      console.log('✅ 이미 실제 파일명:', fileId);
      return { success: true, actualFileName: fileId };
    }

    // 2단계: 매핑 테이블에서 조회
    const mappingResult = await loadFileMapping(fileId);
    if (mappingResult.success) {
      console.log('✅ 매핑 테이블에서 실제 파일명 찾음:', mappingResult.data.actualFileName);
      return { success: true, actualFileName: mappingResult.data.actualFileName };
    }

    // 3단계: 대안 검색 - 최근 파일 목록에서 검색
    console.log('🔍 대안 검색: 최근 파일 목록 조회...');
    const { data: fileList, error: listError } = await supabase.storage
      .from(bucket)
      .list('files', { 
        limit: 50,
        sortBy: { column: 'created_at', order: 'desc' }
      });

    if (listError) {
      console.log('❌ 파일 목록 조회 실패:', listError.message);
      return { success: false, error: `파일을 찾을 수 없습니다: ${fileId}` };
    }

    if (!fileList || fileList.length === 0) {
      console.log('❌ 파일 목록이 비어있음');
      return { success: false, error: '업로드된 파일이 없습니다.' };
    }

    // 파일 타입별 검색 (명시적 타입이 있으면 우선 사용)
    let fileType;
    if (expectedFileType === 'supplier') {
      fileType = 'supplierFile';
    } else if (expectedFileType === 'order') {
      fileType = 'orderFile';
    } else {
      // 기존 로직: fileId에서 추측
      fileType = fileId.includes('supplier') ? 'supplierFile' : 'orderFile';
    }
    

    
    const matchingFiles = fileList
      .filter(f => f.name.startsWith(fileType + '-'))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    if (matchingFiles.length > 0) {
      const foundFile = matchingFiles[0].name;
      console.log(`✅ 대안 검색 성공: 최근 ${fileType} 파일 찾음:`, foundFile);
      
      // 찾은 파일을 매핑 테이블에 저장 (다음번에 빠른 조회를 위해)
      await saveFileMapping(fileId, foundFile, `추정된 파일 (${new Date().toLocaleString()})`);
      
      return { success: true, actualFileName: foundFile };
    }

    console.log('❌ 대안 검색 실패: 해당 타입의 파일을 찾을 수 없음');
    return { success: false, error: `${fileType} 파일을 찾을 수 없습니다.` };

  } catch (error) {
    console.error('❌ 실제 파일명 해석 예외:', error);
    return { success: false, error: error.message };
  }
}

// =====================================================
// 📧 이메일 템플릿 관련 함수들
// =====================================================

/**
 * 이메일 템플릿 저장
 * @param {string} templateName - 템플릿명
 * @param {string} subject - 제목
 * @param {string} body - 내용
 * @param {Array} recipients - 수신자 목록
 * @returns {Promise<{success: boolean, data?: any, error?: string}>}
 */
async function saveEmailTemplate(templateName, subject, body, recipients = []) {
  try {
    console.log('💾 이메일 템플릿 저장:', templateName);
    
    const { data, error } = await supabase
      .from('email_templates')
      .upsert({
        template_name: templateName,
        subject: subject,
        body: body,
        recipients: recipients
      });

    if (error) {
      console.error('❌ 이메일 템플릿 저장 오류:', error);
      return { success: false, error: error.message };
    }

    console.log('✅ 이메일 템플릿 저장 성공');
    return { success: true, data };
  } catch (error) {
    console.error('❌ 이메일 템플릿 저장 예외:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 이메일 템플릿 조회 (단일)
 * @param {string} templateName - 템플릿명
 * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
 */
async function loadEmailTemplate(templateName) {
  try {
    console.log('📖 이메일 템플릿 조회:', templateName);
    
    const { data, error } = await supabase
      .from('email_templates')
      .select('*')
      .eq('template_name', templateName)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        console.log('⚠️ 템플릿을 찾을 수 없음:', templateName);
        return { success: false, error: '템플릿을 찾을 수 없습니다.' };
      }
      console.error('❌ 이메일 템플릿 조회 오류:', error);
      return { success: false, error: error.message };
    }

    console.log('✅ 이메일 템플릿 조회 성공');
    return { success: true, data };
  } catch (error) {
    console.error('❌ 이메일 템플릿 조회 예외:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 이메일 템플릿 목록 조회
 * @returns {Promise<{success: boolean, data?: Array, error?: string}>}
 */
async function loadEmailTemplates() {
  try {
    console.log('📋 이메일 템플릿 목록 조회');
    
    const { data, error } = await supabase
      .from('email_templates')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ 이메일 템플릿 목록 조회 오류:', error);
      return { success: false, error: error.message };
    }

    console.log('✅ 이메일 템플릿 목록 조회 성공:', data.length + '개');
    return { success: true, data };
  } catch (error) {
    console.error('❌ 이메일 템플릿 목록 조회 예외:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 이메일 템플릿 삭제
 * @param {string} templateName - 템플릿명
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function deleteEmailTemplate(templateName) {
  try {
    console.log('🗑️ 이메일 템플릿 삭제:', templateName);
    
    const { error } = await supabase
      .from('email_templates')
      .delete()
      .eq('template_name', templateName);

    if (error) {
      console.error('❌ 이메일 템플릿 삭제 오류:', error);
      return { success: false, error: error.message };
    }

    console.log('✅ 이메일 템플릿 삭제 성공');
    return { success: true };
  } catch (error) {
    console.error('❌ 이메일 템플릿 삭제 예외:', error);
    return { success: false, error: error.message };
  }
}

// =====================================================
// 📧 이메일 전송 이력 관련 함수들
// =====================================================

/**
 * 이메일 전송 이력 저장
 * @param {Object} historyData - 이력 데이터
 * @returns {Promise<{success: boolean, data?: any, error?: string}>}
 */
async function saveEmailHistory(historyData) {
  try {
    console.log('📝 이메일 전송 이력 저장:', historyData.to_email);
    
    const { data, error } = await supabase
      .from('email_history')
      .insert({
        to_email: historyData.to,
        subject: historyData.subject,
        attachment_name: historyData.attachmentName,
        sent_at: historyData.sentAt,
        message_id: historyData.messageId,
        status: historyData.status,
        error_message: historyData.error,
        template_name: historyData.templateName
      });

    if (error) {
      console.error('❌ 이메일 이력 저장 오류:', error);
      return { success: false, error: error.message };
    }

    console.log('✅ 이메일 이력 저장 성공');
    return { success: true, data };
  } catch (error) {
    console.error('❌ 이메일 이력 저장 예외:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 이메일 전송 이력 조회 (예약 대기중인 이메일만 제외)
 * @param {number} limit - 조회할 개수 (기본값: 100)
 * @returns {Promise<{success: boolean, data?: Array, error?: string}>}
 */
async function loadEmailHistory(limit = 100) {
  try {
    // 이메일 전송 이력 조회 시작
    
    // Supabase 연결 상태 확인
    if (!supabase) {
      console.error('❌ Supabase 클라이언트가 초기화되지 않음');
      return { success: false, error: 'Supabase 클라이언트 연결 실패' };
    }
    
    const { data, error } = await supabase
      .from('email_history')
      .select('*')
      .order('sent_at', { ascending: false })
      .limit(limit * 2); // 필터링을 고려해 더 많이 가져옴

    if (error) {
      console.error('❌ 이메일 이력 조회 오류:', error);
      return { success: false, error: `데이터베이스 오류: ${error.message}` };
    }
    
    // 데이터 유효성 검사
    if (!Array.isArray(data)) {
      console.error('❌ 잘못된 데이터 형식:', typeof data);
      return { success: false, error: '잘못된 데이터베이스 응답 형식' };
    }

            // 간단한 필터링: 예약 대기중인 이메일만 제외 (Vercel 환경 최적화)
    const filteredData = data.filter(item => {
      try {
        if (!item || typeof item !== 'object') return false;
        
        // SCH_로 시작하지 않는 일반 이메일은 포함
        if (!item.message_id || !item.message_id.startsWith('SCH_')) {
          return true;
        }
        
        // SCH_ 예약 이메일: status가 success/failed인 경우만 포함 (전송 완료)
        return item.status === 'success' || item.status === 'failed';
      } catch (error) {
        return false;
      }
    });
    
    // 제한 적용
    const limitedData = filteredData.slice(0, limit);

    // 이력 조회 성공 (로그 최소화)
    return { success: true, data: limitedData };
  } catch (error) {
    console.error('❌ 이메일 이력 조회 예외:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 이메일 전송 이력 삭제 (단일)
 * @param {string} historyId - 이력 ID
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function deleteEmailHistory(historyId) {
  try {
    console.log('🗑️ 이메일 이력 삭제:', historyId);
    
    const { error } = await supabase
      .from('email_history')
      .delete()
      .eq('id', historyId);

    if (error) {
      console.error('❌ 이메일 이력 삭제 오류:', error);
      return { success: false, error: error.message };
    }

    console.log('✅ 이메일 이력 삭제 성공');
    return { success: true };
  } catch (error) {
    console.error('❌ 이메일 이력 삭제 예외:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 전체 이메일 전송 이력 삭제
 * @returns {Promise<{success: boolean, data?: any, error?: string}>}
 */
async function clearEmailHistory() {
  try {
    console.log('🗑️ 전체 이메일 이력 삭제');
    
    const { data, error } = await supabase
      .from('email_history')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // 모든 레코드 삭제

    if (error) {
      console.error('❌ 전체 이메일 이력 삭제 오류:', error);
      return { success: false, error: error.message };
    }

    console.log('✅ 전체 이메일 이력 삭제 성공');
    return { success: true, data };
  } catch (error) {
    console.error('❌ 전체 이메일 이력 삭제 예외:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 예약된 이메일 저장 (email_history 테이블 활용 - 기존 컬럼만 사용)
 * @param {Object} scheduleData - 예약 데이터
 * @returns {Promise<{success: boolean, data?: any, error?: string}>}
 */
async function saveScheduledEmail(scheduleData) {
  try {
    console.log('📅 예약된 이메일 저장:', scheduleData.schedule_id);
    
    // 추가 예약 정보를 error_message 필드에 JSON으로 저장 (임시)
    const additionalInfo = JSON.stringify({
      body: scheduleData.body,
      attachmentPath: scheduleData.attachmentPath,
      createdAt: scheduleData.createdAt,
      status: 'scheduled' // 실제 상태를 여기에 저장
    });
    
    const { data, error } = await supabase
      .from('email_history')
      .insert({
        to_email: scheduleData.to,
        subject: scheduleData.subject,
        attachment_name: scheduleData.attachmentDisplayName || scheduleData.attachmentPath,
        sent_at: scheduleData.scheduleTime, // 예약 시간을 sent_at에 저장
        message_id: scheduleData.schedule_id, // schedule_id를 message_id로 저장
        status: 'simulation', // 기존 허용 값 사용 (실제 상태는 error_message에 저장)
        error_message: additionalInfo, // 추가 정보와 실제 상태를 여기에 저장
        template_name: scheduleData.templateId || 'manual'
      });

    if (error) {
      console.error('❌ 예약된 이메일 저장 오류:', error);
      return { success: false, error: error.message };
    }

    console.log('✅ 예약된 이메일 저장 성공');
    return { success: true, data };
  } catch (error) {
    console.error('❌ 예약된 이메일 저장 예외:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 예약된 이메일 목록 조회 (대기중인 것만)
 * @returns {Promise<{success: boolean, data?: Array, error?: string}>}
 */
async function loadScheduledEmails() {
  try {
    // 예약된 이메일 목록 조회 시작
    
    // Supabase 연결 상태 확인
    if (!supabase) {
      console.error('❌ Supabase 클라이언트가 초기화되지 않음');
      return { success: false, error: 'Supabase 클라이언트 연결 실패' };
    }
    
    // SCH_로 시작하는 모든 예약 이메일 조회
    const { data, error } = await supabase
      .from('email_history')
      .select('*')
      .like('message_id', 'SCH_%')
      .order('sent_at', { ascending: true }); // 예약 시간 순으로 정렬

    if (error) {
      console.error('❌ 예약된 이메일 목록 조회 오류:', error);
      return { success: false, error: `데이터베이스 오류: ${error.message}` };
    }
    
    // 데이터 유효성 검사
    if (!Array.isArray(data)) {
      console.error('❌ 잘못된 데이터 형식:', typeof data);
      return { success: false, error: '잘못된 데이터베이스 응답 형식' };
    }

    // 간단한 필터링: 기본 status만 체크 (Vercel 환경 최적화)
    const scheduledEmails = data.filter(item => {
      try {
        // 기본 안전성 검사
        if (!item || typeof item !== 'object') return false;
        
        // status가 success/failed면 제외 (전송 완료)
        if (item.status === 'success' || item.status === 'failed') return false;
        
        // 나머지는 예약된 이메일로 간주
        return true;
      } catch (error) {
        return false; // 오류 발생시 제외
      }
    });

    // 조회 성공 (로그 최소화)
    
    return { success: true, data: scheduledEmails };
  } catch (error) {
    console.error('❌ 예약된 이메일 목록 조회 예외:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 예약된 이메일 삭제 (실제 삭제)
 * @param {string} scheduleId - 예약 ID (SCH_YYYYMMDD_HHMMSS_XXX 형식)
 * @returns {Promise<{success: boolean, data?: any, error?: string}>}
 */
async function cancelScheduledEmail(scheduleId) {
  try {
    console.log('🗑️ 예약된 이메일 삭제:', scheduleId);
    
    // 먼저 해당 ID가 존재하는지 확인
    const { data: existingData, error: checkError } = await supabase
      .from('email_history')
      .select('message_id, status, error_message')
      .eq('message_id', scheduleId);
    
    if (checkError) {
      console.error('❌ 예약 ID 확인 오류:', checkError);
      return { success: false, error: checkError.message };
    }
    
    console.log('🔍 예약 ID 확인 결과:', {
      scheduleId,
      found: existingData?.length || 0,
      data: existingData
    });
    
    if (!existingData || existingData.length === 0) {
      console.warn('⚠️ 해당 예약 ID가 데이터베이스에 존재하지 않습니다:', scheduleId);
      return { success: false, error: '해당 예약 이메일을 찾을 수 없습니다.' };
    }
    
    // 실제로 행을 삭제
    const { data, error } = await supabase
      .from('email_history')
      .delete()
      .eq('message_id', scheduleId)
      .select(); // 삭제된 행을 반환하도록 select 추가

    if (error) {
      console.error('❌ 예약된 이메일 삭제 오류:', error);
      return { success: false, error: error.message };
    }

    console.log('🔄 삭제 결과:', {
      scheduleId,
      deletedRows: data?.length || 0,
      data: data
    });

    // 삭제된 행이 없는 경우 확인
    if (!data || data.length === 0) {
      console.warn('⚠️ 삭제된 행이 없습니다 - 이미 삭제되었거나 조건이 맞지 않음:', scheduleId);
      return { success: false, error: '해당 예약 이메일을 삭제할 수 없습니다.' };
    }

    console.log('✅ 예약된 이메일 삭제 성공:', data.length + '개 행 삭제됨');
    return { success: true, data };
  } catch (error) {
    console.error('❌ 예약된 이메일 삭제 예외:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 예약된 이메일 상태 업데이트 (전송 완료/실패)
 * @param {string} scheduleId - 예약 ID
 * @param {string} status - 상태 ('success', 'failed', 'simulation')
 * @param {string} messageId - 실제 전송된 메시지 ID
 * @param {string} errorMessage - 오류 메시지 (실패시)
 * @returns {Promise<{success: boolean, data?: any, error?: string}>}
 */
async function updateScheduledEmailStatus(scheduleId, status, messageId = null, errorMessage = null) {
  try {
    console.log('🔄 예약된 이메일 상태 업데이트:', scheduleId, '→', status);
    
    // 기존 예약 정보 가져오기
    const { data: existingData, error: fetchError } = await supabase
      .from('email_history')
      .select('*')
      .eq('message_id', scheduleId)
      .single();
    
    if (fetchError) {
      console.error('❌ 기존 데이터 조회 실패:', fetchError);
      return { success: false, error: fetchError.message };
    }
    
    // 기존 추가 정보 파싱
    let additionalInfo = {};
    try {
      if (existingData.error_message && existingData.error_message.startsWith('{')) {
        additionalInfo = JSON.parse(existingData.error_message);
      }
    } catch (e) {
      console.warn('기존 정보 파싱 실패:', e.message);
    }
    
    if (status === 'success' || status === 'failed' || status === 'simulation') {
      // 전송 완료/실패 시: 새로운 전송 이력 레코드 생성하고 예약 레코드 삭제
      console.log('📧 예약된 이메일 전송 완료 - 전송 이력으로 이동');
      
      const historyData = {
        to_email: existingData.to_email,
        subject: existingData.subject,
        attachment_name: existingData.attachment_name,
        sent_at: new Date().toISOString(),
        message_id: messageId || `completed-${scheduleId}`,
        status: status,
        error_message: errorMessage,
        template_name: existingData.template_name
      };
      
      // 새로운 전송 이력 레코드 생성
      const { error: insertError } = await supabase
        .from('email_history')
        .insert(historyData);
      
      if (insertError) {
        console.error('❌ 전송 이력 생성 실패:', insertError);
        return { success: false, error: insertError.message };
      }
      
      // 예약 레코드 삭제
      const { error: deleteError } = await supabase
        .from('email_history')
        .delete()
        .eq('message_id', scheduleId);
      
      if (deleteError) {
        console.error('❌ 예약 레코드 삭제 실패:', deleteError);
        return { success: false, error: deleteError.message };
      }
      
      console.log('✅ 예약된 이메일 → 전송 이력 이동 완료');
      return { success: true, data: historyData };
      
    } else {
      // 그 외 상태 업데이트 (cancelled 등)
      additionalInfo.status = status;
      additionalInfo.completedAt = new Date().toISOString();
      
      if (messageId) {
        additionalInfo.actualMessageId = messageId;
      }
      
      if (errorMessage) {
        additionalInfo.errorMessage = errorMessage;
      }
      
      const updateData = { 
        error_message: JSON.stringify(additionalInfo),
        sent_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('email_history')
        .update(updateData)
        .eq('message_id', scheduleId);

      if (error) {
        console.error('❌ 예약된 이메일 상태 업데이트 오류:', error);
        return { success: false, error: error.message };
      }

      console.log('✅ 예약된 이메일 상태 업데이트 성공');
      return { success: true, data };
    }
  } catch (error) {
    console.error('❌ 예약된 이메일 상태 업데이트 예외:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  uploadFile,
  downloadFile,
  deleteFile,
  getPublicUrl,
  saveMappingData,
  loadMappingData,
  // 파일명 매핑 함수들 (새로 추가)
  saveFileMapping,
  loadFileMapping,
  resolveActualFileName,
  // 이메일 템플릿 함수들
  saveEmailTemplate,
  loadEmailTemplate,
  loadEmailTemplates,
  deleteEmailTemplate,
  // 이메일 이력 함수들
  saveEmailHistory,
  loadEmailHistory,
  deleteEmailHistory,
  clearEmailHistory,
  // 예약된 이메일 관리 함수들 (새로 추가)
  saveScheduledEmail,
  loadScheduledEmails,
  cancelScheduledEmail,
  updateScheduledEmailStatus,
  supabase
}; 