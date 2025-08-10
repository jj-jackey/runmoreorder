// 예제: Supabase email_history에서 id와 status 목록 가져오기
const { createClient } = require('@supabase/supabase-js');

export default async function handler(req, res) {
  console.log('[EXAMPLE] Email List API 호출됨');
  
  // CORS 헤더 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');
  
  // OPTIONS 요청 처리
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  // GET 요청만 허용
  if (req.method !== 'GET') {
    res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
    return;
  }
  
  try {
    // Supabase 클라이언트 초기화
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false
        }
      }
    );
    
    console.log('[EXAMPLE] Supabase에서 email_history 조회 중...');
    
    // email_history 테이블에서 id와 status만 선택하여 가져오기
    const { data, error } = await supabase
      .from('email_history')
      .select('id, status, message_id, sent_at')  // 기본 정보만 가져오기
      .order('sent_at', { ascending: false })      // 최신순 정렬
      .limit(50);                                  // 최대 50개
    
    if (error) {
      console.error('[EXAMPLE] Supabase 오류:', error);
      throw new Error(`Database error: ${error.message}`);
    }
    
    console.log(`[EXAMPLE] ${data?.length || 0}개 레코드 조회 완료`);
    
    // 응답 데이터 구성
    const response = {
      success: true,
      count: data?.length || 0,
      data: data || [],
      message: `총 ${data?.length || 0}개의 이메일 이력을 조회했습니다.`
    };
    
    res.status(200).json(response);
    
  } catch (error) {
    console.error('[EXAMPLE] API 오류:', error);
    
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
} 