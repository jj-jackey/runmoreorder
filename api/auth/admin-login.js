// Vercel 서버리스 함수 - 관리자 로그인
export default function handler(req, res) {
  console.log('[ADMIN-LOGIN] 요청 받음:', req.method);
  
  try {
    // CORS 헤더 설정
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-cache');
    
    // OPTIONS 요청 처리
    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }
    
    // POST 요청만 허용
    if (req.method !== 'POST') {
      res.status(405).json({
        success: false,
        error: 'Method not allowed'
      });
      return;
    }
    
    // 요청 바디 확인
    if (!req.body) {
      res.status(400).json({
        success: false,
        error: '요청 데이터가 없습니다.'
      });
      return;
    }
    
    const { username, password } = req.body;
    console.log('[ADMIN-LOGIN] 로그인 시도:', { username: username ? '***' : 'missing' });
    
    // 입력값 검증
    if (!username || !password) {
      res.status(400).json({
        success: false,
        error: '사용자명과 비밀번호를 입력해주세요.'
      });
      return;
    }
    
    // 환경변수 확인
    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin4321';
    
    // 인증 확인
    if (username !== adminUsername || password !== adminPassword) {
      res.status(401).json({
        success: false,
        error: '잘못된 관리자 계정 정보입니다.'
      });
      return;
    }
    
    // 성공 응답
    const response = {
      success: true,
      message: '관리자로 성공적으로 로그인되었습니다.',
      authenticatedAt: new Date().toISOString(),
      isAdmin: true,
      hasApiKey: !!process.env.OPENAI_API_KEY,
      vercel: true
    };
    
    console.log('[ADMIN-LOGIN] 로그인 성공');
    res.status(200).json(response);
    
  } catch (error) {
    console.error('[ADMIN-LOGIN] 오류:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
} 