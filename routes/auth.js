const express = require('express');
const router = express.Router();

// 🔐 관리자 로그인 (초간단 버전)
router.post('/admin-login', (req, res) => {
  console.log('[AUTH] 관리자 로그인 요청 시작');
  
  // 헤더 설정
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-cache');
  
  try {
    console.log('[AUTH] 요청 바디:', req.body ? 'exists' : 'missing');
    
    // 기본 응답으로 성공 처리 (디버깅용)
    const response = {
      success: true,
      message: '관리자 로그인 성공 (디버그 모드)',
      authenticatedAt: new Date().toISOString(),
      isAdmin: true,
      hasApiKey: false
    };
    
    console.log('[AUTH] 응답 전송:', response);
    res.status(200).json(response);
    
  } catch (error) {
    console.error('[AUTH] 오류 발생:', error.message);
    res.status(500).json({
      success: false,
      error: 'Server Error'
    });
  }
});

// 🔐 API 키 검증 (초간단 버전)
router.post('/verify', (req, res) => {
  console.log('[AUTH] API 키 검증 요청');
  
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-cache');
  
  try {
    const response = {
      success: true,
      message: 'API 키 검증 성공 (디버그 모드)',
      authenticatedAt: new Date().toISOString()
    };
    
    console.log('[AUTH] API 키 검증 응답:', response);
    res.status(200).json(response);
    
  } catch (error) {
    console.error('[AUTH] API 키 검증 오류:', error.message);
    res.status(500).json({
      success: false,
      error: 'Server Error'
    });
  }
});

// 🔍 인증 상태 확인 (초간단 버전)
router.get('/check', (req, res) => {
  console.log('[AUTH] 인증 상태 확인 요청');
  
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-cache');
  
  try {
    const response = {
      authenticated: true,
      hasApiKey: !!process.env.OPENAI_API_KEY,
      isAdmin: false,
      showWebhookManagement: false,
      isDevelopment: true,
      timestamp: new Date().toISOString()
    };
    
    console.log('[AUTH] 인증 상태 응답:', response);
    res.status(200).json(response);
    
  } catch (error) {
    console.error('[AUTH] 인증 상태 확인 오류:', error.message);
    res.status(500).json({
      authenticated: false,
      error: 'Server Error'
    });
  }
});

// 🚪 로그아웃 (초간단 버전)
router.post('/logout', (req, res) => {
  console.log('[AUTH] 로그아웃 요청');
  
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-cache');
  
  try {
    res.status(200).json({
      success: true,
      message: '로그아웃 완료'
    });
  } catch (error) {
    console.error('[AUTH] 로그아웃 오류:', error.message);
    res.status(500).json({
      success: false,
      error: 'Server Error'
    });
  }
});

console.log('[AUTH] 라우터 모듈 로드 완료');

module.exports = { router }; 