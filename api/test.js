// 최소한의 Vercel 테스트 API
export default function handler(req, res) {
  console.log('[TEST] API 호출됨:', req.method, req.url);
  
  try {
    // CORS 헤더
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json');
    
    // OPTIONS 요청 처리
    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }
    
    // 간단한 응답
    const response = {
      status: 'success',
      message: 'Vercel 테스트 API 작동 중',
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.url,
      userAgent: req.headers['user-agent'] || 'unknown'
    };
    
    console.log('[TEST] 응답 전송:', response);
    res.status(200).json(response);
    
  } catch (error) {
    console.error('[TEST] 오류:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
} 