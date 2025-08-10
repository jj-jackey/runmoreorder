// Vercel 서버리스 함수 - 인증 상태 확인
export default function handler(req, res) {
  console.log('[AUTH-CHECK] 요청 받음:', req.method);
  
  try {
    // CORS 헤더 설정
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-cache');
    
    // OPTIONS 요청 처리
    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }
    
    // GET 요청만 허용
    if (req.method !== 'GET') {
      res.status(405).json({
        error: 'Method not allowed'
      });
      return;
    }
    
    // 기본 응답
    const response = {
      authenticated: true,
      hasApiKey: !!process.env.OPENAI_API_KEY,
      isAdmin: false,
      showWebhookManagement: false,
      isDevelopment: process.env.NODE_ENV !== 'production',
      timestamp: new Date().toISOString(),
      vercel: true
    };
    
    console.log('[AUTH-CHECK] 응답 전송:', response);
    res.status(200).json(response);
    
  } catch (error) {
    console.error('[AUTH-CHECK] 오류:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
} 