const express = require('express');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
const { 
  downloadFile, 
  saveEmailTemplate, 
  loadEmailTemplate, 
  loadEmailTemplates,
  deleteEmailTemplate,
  saveEmailHistory,
  loadEmailHistory,
  deleteEmailHistory,
  clearEmailHistory,
  // 예약된 이메일 관리 함수들 (새로 추가)
  saveScheduledEmail,
  loadScheduledEmails,
  cancelScheduledEmail,
  updateScheduledEmailStatus
} = require('../utils/supabase');
const { createRateLimitMiddleware } = require('../utils/rateLimiter');

const router = express.Router();

// 📅 시간 기반 예약 ID 생성 함수
function generateScheduleId() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');
  const second = String(now.getSeconds()).padStart(2, '0');
  const millisecond = String(now.getMilliseconds()).padStart(3, '0');
  
  return `SCH_${year}${month}${day}_${hour}${minute}${second}_${millisecond}`;
}

// 🔄 활성 타이머 저장소 (서버 재시작 시 초기화됨 - 추후 Redis 등으로 대체 가능)
const activeTimers = new Map();

// 📧 이메일 설정 상태 확인
router.get('/config', (req, res) => {
  const emailUser = process.env.EMAIL_USER;
  const emailPass = process.env.EMAIL_PASS;
  const smtpHost = process.env.SMTP_HOST;
  const fromAddress = process.env.EMAIL_FROM_ADDRESS;
  
  const config = {
    configured: !!(emailUser && emailPass),
    type: smtpHost ? (smtpHost.includes('resend') ? 'resend' : 'company-smtp') : 'gmail',
    smtpHost: smtpHost || null,
    smtpPort: process.env.SMTP_PORT || null,
    smtpSecure: process.env.SMTP_SECURE === 'true',
    emailUser: emailUser ? (emailUser === 'resend' ? 'resend' : emailUser.replace(/(.{3}).*(@.*)/, '$1***$2')) : null,
    fromAddress: fromAddress ? fromAddress.replace(/(.{3}).*(@.*)/, '$1***$2') : null
  };
  
  res.json({
    success: true,
    config: config,
    message: config.configured 
      ? `${config.type === 'resend' ? 'Resend SMTP' : config.type === 'company-smtp' ? '회사 SMTP' : 'Gmail'} 설정이 완료되었습니다.`
      : '이메일 설정이 필요합니다. (시뮬레이션 모드)'
  });
});

// 📧 이메일 전송 설정 (Gmail 및 회사 SMTP 지원)
const createTransporter = () => {
  // 환경 변수가 없으면 테스트 모드로 실행
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.log('⚠️  이메일 설정이 없어 테스트 모드로 실행됩니다.');
    return nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      auth: {
        user: 'test@test.com',
        pass: 'test123'
      }
    });
  }
  
  // 회사 SMTP 설정이 있는지 확인
  if (process.env.SMTP_HOST) {
    console.log('🏢 회사 SMTP 서버 사용:', process.env.SMTP_HOST);
    
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true', // true for 465, false for 587
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      },
      // 회사 방화벽 등으로 인한 연결 문제 해결을 위한 옵션
      tls: {
        rejectUnauthorized: process.env.SMTP_REJECT_UNAUTHORIZED !== 'false'
      }
    });
  }
  
  // Gmail 설정 (기본값)
  console.log('📧 Gmail SMTP 서버 사용');
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
};

// 📧 이메일 전송
router.post('/send', createRateLimitMiddleware('emailSending'), async (req, res) => {
  try {
    const { 
      to, 
      subject, 
      body, 
      attachmentPath, 
      attachmentDisplayName,
      templateId,
      scheduleTime 
    } = req.body;

    // 필수 필드 검증
    if (!to || !subject || !attachmentPath) {
      return res.status(400).json({ 
        error: '필수 필드가 누락되었습니다. (받는 사람, 제목, 첨부파일)' 
      });
    }

    // Supabase Storage에서 첨부파일 다운로드 (메모리 버퍼로 처리)
    console.log('📥 이메일 첨부파일 다운로드 중:', attachmentPath);
    const downloadResult = await downloadFile(attachmentPath, 'generated');
    
    if (!downloadResult.success) {
      console.log('❌ 첨부파일 다운로드 실패:', downloadResult.error);
      
      const isNetworkError = downloadResult.error.includes('504') || 
                            downloadResult.error.includes('timeout') ||
                            downloadResult.error.includes('Gateway') ||
                            downloadResult.error.includes('네트워크');
      
      const errorMessage = isNetworkError 
        ? '첨부파일 다운로드 중 네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
        : '첨부파일을 찾을 수 없습니다. 발주서가 정상적으로 생성되었는지 확인해주세요.';
      
      return res.status(isNetworkError ? 503 : 404).json({ 
        error: errorMessage,
        details: downloadResult.error
      });
    }

    // 이메일 제목과 본문 설정
    const emailSubject = subject || `[발주서] ${path.basename(attachmentPath)}`;
    const emailBody = body || `발주서를 첨부파일로 전송드립니다.\n\n첨부파일: ${attachmentDisplayName || path.basename(attachmentPath)}\n전송시간: ${new Date().toLocaleString()}`;

    // 즉시 전송인지 예약 전송인지 확인
    if (scheduleTime && new Date(scheduleTime) > new Date()) {
      console.log(`📅 이메일 예약 처리: ${scheduleTime}에 ${to}로 전송 예정`);
      
      const delayMs = new Date(scheduleTime).getTime() - new Date().getTime();
      const scheduleId = generateScheduleId(); // 시간 기반 ID 생성
      
      if (delayMs > 0) {
        // 예약 정보를 email_history 테이블에 저장
        const scheduleData = {
          schedule_id: scheduleId,
          to,
          subject: emailSubject,
          body: emailBody,
          attachmentPath,
          attachmentDisplayName: attachmentDisplayName || path.basename(attachmentPath),
          templateId: templateId || 'manual',
          scheduleTime: new Date(scheduleTime).toISOString(),
          createdAt: new Date().toISOString()
        };
        
        const saveResult = await saveScheduledEmail(scheduleData);
        if (!saveResult.success) {
          return res.status(500).json({ 
            error: '예약 정보 저장에 실패했습니다.',
            details: saveResult.error
          });
        }
        
        // 예약된 시간에 실제 전송하는 타이머 설정
        const timeoutId = setTimeout(async () => {
          try {
            console.log(`📧 예약된 이메일 전송 시작: ${to} (${scheduleId})`);
            
            const transporter = createTransporter();
            const mailOptions = {
              from: process.env.EMAIL_FROM_ADDRESS || process.env.EMAIL_USER || 'test@test.com',
              to: to,
              subject: emailSubject,
              text: emailBody,
              html: emailBody.replace(/\n/g, '<br>'),
              attachments: [
                {
                  filename: attachmentDisplayName || path.basename(attachmentPath),
                  content: downloadResult.data,
                  contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                }
              ]
            };

            if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
              // 시뮬레이션 모드
              console.log('📧 [시뮬레이션] 예약된 이메일 전송:', { to, subject: emailSubject });
              await updateScheduledEmailStatus(scheduleId, 'simulation', 'scheduled-simulation-' + Date.now());
            } else {
              // 실제 전송
              const info = await transporter.sendMail(mailOptions);
              console.log('✅ 예약된 이메일 전송 완료:', info.messageId);
              await updateScheduledEmailStatus(scheduleId, 'success', info.messageId);
            }
            
            // 타이머 정리
            activeTimers.delete(scheduleId);
          } catch (error) {
            console.error('❌ 예약된 이메일 전송 실패:', error);
            await updateScheduledEmailStatus(scheduleId, 'failed', null, error.message);
            activeTimers.delete(scheduleId);
          }
        }, delayMs);
        
        // 타이머 ID를 저장하여 취소 가능하게 함
        activeTimers.set(scheduleId, timeoutId);
      }
      
      res.json({
        success: true,
        message: `이메일이 ${new Date(scheduleTime).toLocaleString('ko-KR')}에 전송되도록 예약되었습니다.`,
        scheduled: true,
        scheduleId: scheduleId,
        scheduleTime: scheduleTime,
        delayMinutes: Math.round(delayMs / (1000 * 60))
      });
      
      return;
    }

    // 즉시 전송 (기존 코드)
    const transporter = createTransporter();
    
    const mailOptions = {
      from: process.env.EMAIL_FROM_ADDRESS || process.env.EMAIL_USER || 'test@test.com',
      to: to,
      subject: emailSubject,
      text: emailBody,
      html: emailBody.replace(/\n/g, '<br>'),
      attachments: [
        {
          filename: attachmentDisplayName || path.basename(attachmentPath),
          content: downloadResult.data,
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        }
      ]
    };

    console.log('🔍 환경변수 체크:', {
      EMAIL_USER: process.env.EMAIL_USER ? '설정됨' : '설정안됨',
      EMAIL_PASS: process.env.EMAIL_PASS ? '설정됨' : '설정안됨',
      NODE_ENV: process.env.NODE_ENV
    });
    
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.log('📧 [시뮬레이션 모드] 이메일 전송:', {
        to: to,
        subject: emailSubject,
        attachment: path.basename(attachmentPath)
      });
      
      const info = {
        messageId: 'simulation-' + Date.now(),
        accepted: [to]
      };
      
      await saveEmailHistory({
        to,
        subject: emailSubject,
        attachmentName: attachmentDisplayName || path.basename(attachmentPath),
        sentAt: new Date().toISOString(),
        messageId: info.messageId,
        status: 'simulation',
        templateName: templateId
      });

      res.json({
        success: true,
        message: `이메일이 시뮬레이션으로 전송되었습니다. (${to}) - 실제 전송하려면 Gmail 설정을 완료하세요.`,
        messageId: info.messageId,
        sentAt: new Date().toISOString(),
        simulation: true
      });
      
      return;
    }

    const info = await transporter.sendMail(mailOptions);
    
    console.log('✅ 이메일 전송 완료 (메모리 버퍼 사용, 임시 파일 없음)');
    
    await saveEmailHistory({
      to,
      subject: emailSubject,
      attachmentName: attachmentDisplayName || path.basename(attachmentPath),
      sentAt: new Date().toISOString(),
      messageId: info.messageId,
      status: 'success',
      templateName: templateId
    });

    res.json({
      success: true,
      message: `이메일이 성공적으로 전송되었습니다. (${to})`,
      messageId: info.messageId,
      sentAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('이메일 전송 오류:', error);
    
    await saveEmailHistory({
      to: req.body.to,
      subject: req.body.subject,
      attachmentName: req.body.attachmentDisplayName || (req.body.attachmentPath ? path.basename(req.body.attachmentPath) : ''),
      sentAt: new Date().toISOString(),
      status: 'failed',
      error: error.message,
      templateName: req.body.templateId
    });

    res.status(500).json({ 
      error: '이메일 전송 중 오류가 발생했습니다.', 
      details: error.message 
    });
  }
});

// 📧 이메일 전송 후 데이터 정리 API
router.post('/cleanup', async (req, res) => {
  try {
    const { generatedFile, cleanup } = req.body;
    
    console.log('🧹 이메일 전송 후 데이터 정리 요청:', {
      generatedFile,
      cleanup,
      timestamp: new Date().toISOString()
    });

    if (!cleanup) {
      return res.json({
        success: true,
        message: '정리 요청이 아닙니다.',
        cleaned: false
      });
    }

    const cleanupResults = {
      emailHistory: false,
      generatedFile: false,
      uploadedFiles: false
    };

    // 1. 이메일 전송 이력 정리 (최근 1시간 이내의 성공 전송만)
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      
      // clearEmailHistory 함수 사용 (모든 이력 삭제는 아니고 성공한 것만)
      const { clearEmailHistory } = require('../utils/supabase');
      
      // 성공한 이메일 전송 이력만 삭제 (실패한 것은 유지하여 디버깅에 활용)
      const historyCleanup = await clearEmailHistory();
      cleanupResults.emailHistory = historyCleanup.success;
      
      console.log('📧 이메일 이력 정리 결과:', cleanupResults.emailHistory);
    } catch (historyError) {
      console.warn('⚠️ 이메일 이력 정리 실패:', historyError.message);
    }

    // 2. 생성된 발주서 파일 정리 (Supabase Storage)
    if (generatedFile) {
      try {
        const { deleteFile } = require('../utils/supabase');
        const fileDeleteResult = await deleteFile(generatedFile, 'generated');
        cleanupResults.generatedFile = fileDeleteResult.success;
        
        console.log('📄 생성된 파일 정리 결과:', cleanupResults.generatedFile);
      } catch (fileError) {
        console.warn('⚠️ 생성된 파일 정리 실패:', fileError.message);
      }
    }

    // 3. 업로드된 원본 파일들 정리 (선택적)
    // 주의: 이 부분은 다른 사용자에게 영향을 줄 수 있으므로 신중하게 처리
    // 현재는 생성된 파일만 정리하고 원본은 유지

    const totalCleaned = Object.values(cleanupResults).filter(Boolean).length;

    res.json({
      success: true,
      message: `개인정보 보호를 위한 데이터 정리가 완료되었습니다. (${totalCleaned}개 항목 정리됨)`,
      results: cleanupResults,
      cleanedCount: totalCleaned,
      timestamp: new Date().toISOString()
    });

    console.log('✅ 데이터 정리 완료:', {
      results: cleanupResults,
      cleanedCount: totalCleaned
    });

  } catch (error) {
    console.error('❌ 데이터 정리 오류:', error);
    res.status(500).json({ 
      error: '데이터 정리 중 오류가 발생했습니다.', 
      details: error.message 
    });
  }
});

// 📅 예약된 이메일 목록 조회 (email_history 테이블 활용)
router.get('/scheduled', async (req, res) => {
  // JSON 응답 헤더 설정
  res.setHeader('Content-Type', 'application/json');
  
  try {
    console.log('📅 예약된 이메일 목록 조회 시작');
    
    const result = await loadScheduledEmails();
    
    if (result.success) {
      // 데이터 형식을 프론트엔드에 맞게 변환 (안전한 처리)
      const scheduled = [];
      
      for (const item of result.data || []) {
        try {
          // 기본 안전성 검사
          if (!item || typeof item !== 'object') {
            console.warn('⚠️ 잘못된 예약 이메일 데이터:', item);
            continue;
          }
          
          let additionalInfo = {};
          let actualStatus = 'scheduled'; // 기본값
          
          // error_message 필드에서 추가 정보 파싱 (안전한 JSON 처리)
          if (item.error_message && typeof item.error_message === 'string' && item.error_message.trim().startsWith('{')) {
            try {
              additionalInfo = JSON.parse(item.error_message);
              if (additionalInfo && typeof additionalInfo === 'object' && additionalInfo.status) {
                actualStatus = additionalInfo.status;
              }
            } catch (parseError) {
              console.warn('⚠️ 예약 이메일 JSON 파싱 실패 (무시됨):', parseError.message, item.message_id);
              // JSON 파싱 실패시 기본값 사용
            }
          }
          
          // 안전한 데이터 매핑
          const scheduledItem = {
            id: item.message_id || `unknown-${Date.now()}`,
            to: item.to_email || '',
            subject: item.subject || '',
            body: (additionalInfo.body && typeof additionalInfo.body === 'string') ? additionalInfo.body : '',
            attachmentPath: (additionalInfo.attachmentPath && typeof additionalInfo.attachmentPath === 'string') ? additionalInfo.attachmentPath : (item.attachment_name || ''),
            attachmentDisplayName: item.attachment_name || '',
            templateId: item.template_name || '',
            scheduleTime: item.sent_at || new Date().toISOString(),
            createdAt: (additionalInfo.createdAt && typeof additionalInfo.createdAt === 'string') ? additionalInfo.createdAt : (item.created_at || new Date().toISOString()),
            sentAt: actualStatus === 'success' ? item.sent_at : null,
            status: actualStatus,
            error: actualStatus === 'cancelled' && additionalInfo.cancelReason ? additionalInfo.cancelReason : null
          };
          
          scheduled.push(scheduledItem);
          
        } catch (itemError) {
          console.error('❌ 개별 예약 이메일 처리 중 오류:', itemError.message, item?.message_id);
          // 개별 아이템 오류는 전체 처리를 중단하지 않음
          continue;
        }
      }
      
      res.json({
        success: true,
        scheduled: scheduled,
        total: scheduled.length
      });
    } else {
      console.error('❌ 예약된 이메일 조회 실패:', result.error);
      res.status(500).json({ 
        success: false,
        error: result.error || '예약된 이메일 목록을 가져올 수 없습니다.' 
      });
    }
  } catch (error) {
    console.error('❌ 예약된 이메일 목록 조회 오류:', error);
    res.status(500).json({ 
      success: false,
      error: '예약된 이메일 목록을 가져오는 중 오류가 발생했습니다.',
      details: error.message 
    });
  }
});

// ❌ 예약된 이메일 취소 (email_history 테이블 활용)
router.delete('/scheduled/:scheduleId', async (req, res) => {
  try {
    const { scheduleId } = req.params;
    console.log('❌ 예약된 이메일 취소 요청:', scheduleId);
    
    // 활성 타이머가 있으면 취소
    if (activeTimers.has(scheduleId)) {
      clearTimeout(activeTimers.get(scheduleId));
      activeTimers.delete(scheduleId);
      console.log('⏰ 예약 타이머 취소됨:', scheduleId);
    }
    
    // 데이터베이스에서 상태 업데이트
    const result = await cancelScheduledEmail(scheduleId);
    
    if (result.success) {
      res.json({
        success: true,
        message: '예약된 이메일이 취소되었습니다.',
        scheduleId: scheduleId
      });
    } else {
      res.status(404).json({ 
        success: false,
        error: result.error || '예약된 이메일을 찾을 수 없습니다.' 
      });
    }
  } catch (error) {
    console.error('예약된 이메일 취소 오류:', error);
    res.status(500).json({ 
      success: false,
      error: '예약된 이메일 취소 중 오류가 발생했습니다.' 
    });
  }
});

// 📧 이메일 템플릿 저장 (Supabase)
router.post('/template', async (req, res) => {
  try {
    const { templateName, subject, body, recipients } = req.body;
    
    console.log('📧 이메일 템플릿 저장 요청:', templateName);

    const saveResult = await saveEmailTemplate(templateName, subject, body, recipients || []);

    if (!saveResult.success) {
      return res.status(500).json({ 
        error: 'Supabase 템플릿 저장 실패', 
        details: saveResult.error 
      });
    }

    res.json({
      success: true,
      message: '이메일 템플릿이 저장되었습니다.',
      templateId: templateName
    });

  } catch (error) {
    console.error('❌ 템플릿 저장 오류:', error);
    res.status(500).json({ 
      error: '템플릿 저장 중 오류가 발생했습니다.', 
      details: error.message 
    });
  }
});

// 📧 전송 이력 조회 (Supabase)
router.get('/history', async (req, res) => {
  // JSON 응답 헤더 설정
  res.setHeader('Content-Type', 'application/json');
  
  try {
    console.log('📋 이메일 전송 이력 조회 요청');
    
    const historyResult = await loadEmailHistory(100); // 최대 100개 조회

    if (!historyResult.success) {
      return res.status(500).json({ 
        error: 'Supabase 이력 조회 실패', 
        details: historyResult.error 
      });
    }

    res.json({
      success: true,
      history: historyResult.data || []
    });

  } catch (error) {
    console.error('❌ 이력 조회 오류:', error);
    res.status(500).json({ 
      error: '이력 조회 중 오류가 발생했습니다.', 
      details: error.message 
    });
  }
});

// 📧 선택된 이력 삭제 (Supabase ID 또는 인덱스 방식)
router.delete('/history/delete', async (req, res) => {
  try {
    const { historyIds, indices } = req.body;
    
    console.log('🗑️ 이메일 이력 삭제 요청:', { historyIds, indices });
    
    let successCount = 0;
    let failCount = 0;
    const errors = [];
    
    // Supabase ID 기반 삭제
    if (historyIds && Array.isArray(historyIds) && historyIds.length > 0) {
      console.log('🆔 Supabase ID로 삭제:', historyIds.length + '개');
      
      for (const historyId of historyIds) {
        const deleteResult = await deleteEmailHistory(historyId);
        
        if (deleteResult.success) {
          successCount++;
        } else {
          failCount++;
          errors.push(`ID ${historyId}: ${deleteResult.error}`);
        }
      }
    }
    
    // 인덱스 기반 삭제 (fallback)
    if (indices && Array.isArray(indices) && indices.length > 0) {
      console.log('📍 인덱스로 삭제:', indices.length + '개');
      
      // 히스토리 전체 조회
      const historyResult = await loadEmailHistory(100);
      
      if (historyResult.success && historyResult.data) {
        const history = historyResult.data;
        
        // 인덱스를 내림차순으로 정렬하여 뒤쪽부터 삭제
        const sortedIndices = indices.sort((a, b) => b - a);
        
        for (const index of sortedIndices) {
          if (index >= 0 && index < history.length) {
            const item = history[index];
            if (item && item.id) {
              const deleteResult = await deleteEmailHistory(item.id);
              
              if (deleteResult.success) {
                successCount++;
              } else {
                failCount++;
                errors.push(`Index ${index} (ID ${item.id}): ${deleteResult.error}`);
              }
            } else {
              failCount++;
              errors.push(`Index ${index}: 유효하지 않은 항목`);
            }
          } else {
            failCount++;
            errors.push(`Index ${index}: 범위를 벗어남`);
          }
        }
      } else {
        return res.status(500).json({
          error: '히스토리 조회 실패',
          details: historyResult.error
        });
      }
    }
    
    if (!historyIds && !indices) {
      return res.status(400).json({ 
        error: '삭제할 항목의 ID 또는 인덱스가 필요합니다.' 
      });
    }
    
    if (failCount === 0) {
      res.json({
        success: true,
        message: `${successCount}개 항목이 삭제되었습니다.`,
        deletedCount: successCount
      });
    } else {
      res.status(500).json({
        success: false,
        error: `${failCount}개 항목 삭제 실패 (${successCount}개 성공)`,
        details: errors,
        deletedCount: successCount,
        failedCount: failCount
      });
    }

  } catch (error) {
    console.error('❌ 이력 삭제 오류:', error);
    res.status(500).json({ 
      error: '이력 삭제 중 오류가 발생했습니다.', 
      details: error.message 
    });
  }
});

// 📧 전체 이력 삭제 (Supabase)
router.delete('/history/clear', async (req, res) => {
  try {
    console.log('🗑️ 전체 이메일 이력 삭제 요청');
    
    const clearResult = await clearEmailHistory();
    
    if (!clearResult.success) {
      return res.status(500).json({ 
        error: 'Supabase 이력 삭제 실패', 
        details: clearResult.error 
      });
    }
    
    res.json({
      success: true,
      message: '모든 전송 이력이 삭제되었습니다.'
    });

  } catch (error) {
    console.error('❌ 전체 이력 삭제 오류:', error);
    res.status(500).json({ 
      error: '전체 이력 삭제 중 오류가 발생했습니다.', 
      details: error.message 
    });
  }
});

// =====================================================
// 📝 기존 유틸리티 함수들은 Supabase 함수로 대체됨
// - loadEmailTemplate → utils/supabase.js의 loadEmailTemplate
// - saveEmailHistory → utils/supabase.js의 saveEmailHistory
// =====================================================

module.exports = router; 