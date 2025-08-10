// ============================================
// 📧 로컬 이메일 이력 관리 시스템
// ============================================

/**
 * 로컬 이메일 이력 관리 클래스
 * 개인정보 보호를 위해 민감한 정보는 마스킹하여 저장
 */
class LocalEmailHistory {
    constructor() {
        this.storageKey = 'autorder_email_history';
        this.maxRecords = 50; // 최대 50개 이력만 유지
    }

    /**
     * 이메일 전송 이력 저장
     * @param {Object} emailData - 이메일 전송 데이터
     * @param {Object} result - 서버 응답 결과
     */
    saveEmailRecord(emailData, result) {
        try {
            const record = {
                id: this.generateId(),
                toEmail: this.maskEmail(emailData.to), // 이메일 마스킹
                subject: emailData.subject,
                attachmentName: emailData.attachmentDisplayName || '발주서.xlsx',
                sentAt: new Date().toISOString(),
                status: result.success ? (result.simulation ? 'simulation' : 'success') : 'failed',
                messageId: result.messageId,
                scheduled: result.scheduled || false,
                errorMessage: result.success ? null : result.error,
                // 개인정보는 저장하지 않음 (본문 내용 등)
            };

            const history = this.getHistory();
            history.unshift(record); // 최신 항목을 앞에 추가

            // 최대 개수 제한
            if (history.length > this.maxRecords) {
                history.splice(this.maxRecords);
            }

            localStorage.setItem(this.storageKey, JSON.stringify(history));
            return record;
        } catch (error) {
            console.error('❌ 로컬 이메일 이력 저장 실패:', error);
            return null;
        }
    }

    /**
     * 이메일 이력 조회
     * @param {number} limit - 조회할 개수
     * @returns {Array} 이메일 이력 배열
     */
    getHistory(limit = 20) {
        try {
            const history = JSON.parse(localStorage.getItem(this.storageKey) || '[]');
            return limit ? history.slice(0, limit) : history;
        } catch (error) {
            console.error('❌ 로컬 이메일 이력 조회 실패:', error);
            return [];
        }
    }

    /**
     * 이메일 주소 마스킹 (개인정보 보호)
     * @param {string} email - 원본 이메일
     * @returns {string} 마스킹된 이메일
     */
    maskEmail(email) {
        if (!email || typeof email !== 'string') return '***@***.***';
        
        const [localPart, domain] = email.split('@');
        if (!localPart || !domain) return '***@***.***';

        // 로컬 부분 마스킹: 첫 글자와 마지막 글자만 보이도록
        let maskedLocal;
        if (localPart.length <= 2) {
            maskedLocal = '*'.repeat(localPart.length);
        } else if (localPart.length <= 4) {
            maskedLocal = localPart[0] + '*'.repeat(localPart.length - 2) + localPart[localPart.length - 1];
        } else {
            maskedLocal = localPart.substring(0, 2) + '*'.repeat(localPart.length - 4) + localPart.substring(localPart.length - 2);
        }

        // 도메인 부분 마스킹
        const [domainName, tld] = domain.split('.');
        const maskedDomain = domainName.length > 3 ? 
            domainName.substring(0, 2) + '*'.repeat(Math.max(1, domainName.length - 2)) :
            '*'.repeat(domainName.length);

        return `${maskedLocal}@${maskedDomain}.${tld || '***'}`;
    }

    /**
     * 고유 ID 생성
     * @returns {string} 고유 ID
     */
    generateId() {
        return 'email_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * 이력 삭제 (특정 항목)
     * @param {string} id - 삭제할 항목 ID
     */
    deleteRecord(id) {
        try {
            const history = this.getHistory();
            const filteredHistory = history.filter(record => record.id !== id);
            localStorage.setItem(this.storageKey, JSON.stringify(filteredHistory));
            return true;
        } catch (error) {
            console.error('❌ 로컬 이메일 이력 삭제 실패:', error);
            return false;
        }
    }

    /**
     * 전체 이력 삭제
     */
    clearHistory() {
        try {
            localStorage.removeItem(this.storageKey);
            return true;
        } catch (error) {
            console.error('❌ 로컬 이메일 이력 전체 삭제 실패:', error);
            return false;
        }
    }

    /**
     * 이력 통계 조회
     * @returns {Object} 통계 정보
     */
    getStats() {
        const history = this.getHistory();
        const stats = {
            total: history.length,
            success: history.filter(r => r.status === 'success').length,
            failed: history.filter(r => r.status === 'failed').length,
            simulation: history.filter(r => r.status === 'simulation').length,
            scheduled: history.filter(r => r.scheduled).length,
            lastSent: history.length > 0 ? history[0].sentAt : null
        };
        return stats;
    }
}

// ============================================
// 📧 로컬 이메일 이력 UI 관리 함수들
// ============================================

/**
 * 로컬 이메일 이력 UI 업데이트
 */
async function updateLocalEmailHistoryUI() {
    const localHistoryCount = document.getElementById('localHistoryCount');
    if (!localHistoryCount) return;

    const stats = localEmailHistory.getStats();
    
    // 로컬 이력 개수 업데이트
    localHistoryCount.textContent = stats.total;
    
    // 개수에 따라 색상 변경
    if (stats.total > 0) {
        localHistoryCount.style.background = '#28a745';
    } else {
        localHistoryCount.style.background = '#6c757d';
    }
}

/**
 * 로컬 이메일 이력 모달 표시
 */
function showLocalEmailHistory() {
    const history = localEmailHistory.getHistory();
    const stats = localEmailHistory.getStats();

    const modalHtml = `
        <div id="localEmailHistoryModal" class="modal-overlay" onclick="closeLocalEmailHistory()">
            <div class="modal-content" onclick="event.stopPropagation()" style="max-width: 800px; max-height: 80vh; overflow-y: auto;">
                <div class="modal-header">
                    <h3>📧 이메일 전송 이력 (로컬 저장)</h3>
                    <button onclick="closeLocalEmailHistory()" class="close-btn">&times;</button>
                </div>
                
                <div class="modal-body">
                    <!-- 통계 정보 -->
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 10px; margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                        <div style="text-align: center;">
                            <div style="font-size: 1.5em; font-weight: bold; color: #007bff;">${stats.total}</div>
                            <div style="font-size: 0.9em; color: #6c757d;">총 전송</div>
                        </div>
                        <div style="text-align: center;">
                            <div style="font-size: 1.5em; font-weight: bold; color: #28a745;">${stats.success}</div>
                            <div style="font-size: 0.9em; color: #6c757d;">성공</div>
                        </div>
                        <div style="text-align: center;">
                            <div style="font-size: 1.5em; font-weight: bold; color: #dc3545;">${stats.failed}</div>
                            <div style="font-size: 0.9em; color: #6c757d;">실패</div>
                        </div>
                        <div style="text-align: center;">
                            <div style="font-size: 1.5em; font-weight: bold; color: #ffc107;">${stats.simulation}</div>
                            <div style="font-size: 0.9em; color: #6c757d;">시뮬레이션</div>
                        </div>
                    </div>

                    <!-- 개인정보 보호 안내 -->
                    <div style="background: #e3f2fd; border: 1px solid #2196f3; border-radius: 8px; padding: 15px; margin-bottom: 20px;">
                        <h4 style="margin: 0 0 10px 0; color: #1976d2;">🔒 개인정보 보호 정책</h4>
                        <ul style="margin: 0; padding-left: 20px; color: #1565c0;">
                            <li>이메일 주소는 마스킹되어 저장됩니다 (예: jo***@ex***le.com)</li>
                            <li>이메일 본문 내용은 저장되지 않습니다</li>
                            <li>모든 데이터는 브라우저에만 저장되며 서버로 전송되지 않습니다</li>
                            <li>최대 50개의 최신 이력만 보관됩니다</li>
                        </ul>
                    </div>

                    <!-- 이력 목록 -->
                    <div style="margin-bottom: 20px;">
                        <div style="display: flex; justify-content: between; align-items: center; margin-bottom: 15px;">
                            <h4 style="margin: 0;">📋 전송 이력</h4>
                            <button onclick="clearLocalEmailHistory()" class="btn" style="background: #dc3545; color: white; font-size: 0.9em; padding: 8px 15px;">
                                🗑️ 전체 삭제
                            </button>
                        </div>
                        
                        ${history.length === 0 ? 
                            '<div style="text-align: center; padding: 40px; color: #6c757d;">전송 이력이 없습니다.</div>' :
                            history.map(record => `
                                <div class="email-history-item" style="border: 1px solid #dee2e6; border-radius: 8px; padding: 15px; margin-bottom: 10px; background: white;">
                                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                                        <div style="flex: 1;">
                                            <div style="font-weight: bold; margin-bottom: 5px;">
                                                ${record.subject}
                                                ${getStatusBadge(record.status)}
                                            </div>
                                            <div style="color: #6c757d; font-size: 0.9em;">
                                                📧 ${record.toEmail} | 📎 ${record.attachmentName}
                                            </div>
                                            <div style="color: #6c757d; font-size: 0.8em; margin-top: 5px;">
                                                📅 ${new Date(record.sentAt).toLocaleString('ko-KR')}
                                            </div>
                                            ${record.errorMessage ? `<div style="color: #dc3545; font-size: 0.9em; margin-top: 5px;">❌ ${record.errorMessage}</div>` : ''}
                                        </div>
                                        <button onclick="deleteLocalEmailRecord('${record.id}')" class="btn" style="background: #6c757d; color: white; font-size: 0.8em; padding: 5px 10px; margin-left: 10px;">
                                            삭제
                                        </button>
                                    </div>
                                </div>
                            `).join('')
                        }
                    </div>
                </div>
                
                <div class="modal-footer">
                    <button onclick="closeLocalEmailHistory()" class="btn" style="background: #6c757d; color: white;">닫기</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

/**
 * 상태 뱃지 생성
 */
function getStatusBadge(status) {
    const badges = {
        'success': '<span style="background: #28a745; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.8em; margin-left: 5px;">성공</span>',
        'failed': '<span style="background: #dc3545; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.8em; margin-left: 5px;">실패</span>',
        'simulation': '<span style="background: #ffc107; color: #212529; padding: 2px 8px; border-radius: 12px; font-size: 0.8em; margin-left: 5px;">시뮬레이션</span>',
        'scheduled': '<span style="background: #17a2b8; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.8em; margin-left: 5px;">예약</span>',
        'cancelled': '<span style="background: #6c757d; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.8em; margin-left: 5px;">취소</span>'
    };
    return badges[status] || '';
}

/**
 * 로컬 이메일 이력 모달 닫기
 */
function closeLocalEmailHistory() {
    const modal = document.getElementById('localEmailHistoryModal');
    if (modal) {
        modal.remove();
    }
}

/**
 * 로컬 이메일 이력 개별 삭제
 */
function deleteLocalEmailRecord(id) {
    if (confirm('이 전송 이력을 삭제하시겠습니까?')) {
        const success = localEmailHistory.deleteRecord(id);
        if (success) {
            // 탭 UI 새로고침
            loadLocalEmailHistoryContent();
            updateLocalEmailHistoryUI();
            showAlert('success', '전송 이력이 삭제되었습니다.');
        } else {
            showAlert('error', '전송 이력 삭제에 실패했습니다.');
        }
    }
}

/**
 * 로컬 이메일 이력 전체 삭제
 */
function clearLocalEmailHistory() {
    if (confirm('모든 전송 이력을 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.')) {
        const success = localEmailHistory.clearHistory();
        if (success) {
            // 탭 UI 새로고침
            loadLocalEmailHistoryContent();
            updateLocalEmailHistoryUI();
            showAlert('success', '모든 전송 이력이 삭제되었습니다.');
        } else {
            showAlert('error', '전송 이력 삭제에 실패했습니다.');
        }
    }
}

// ============================================
// 📧 통합 이메일 이력 관리 함수들
// ============================================

/**
 * 이메일 이력 탭 전환
 * @param {string} tabType - 'server' 또는 'local'
 */
function switchEmailHistoryTab(tabType) {
    // 탭 버튼 스타일 업데이트
    const serverTab = document.getElementById('serverHistoryTab');
    const localTab = document.getElementById('localHistoryTab');
    
    if (tabType === 'server') {
        serverTab.style.background = '#007bff';
        serverTab.style.color = 'white';
        localTab.style.background = '#f8f9fa';
        localTab.style.color = '#495057';
        
        // 컨텐츠 표시/숨김
        document.getElementById('emailHistoryList').style.display = 'block';
        document.getElementById('localEmailHistoryList').style.display = 'none';
        
        // 서버 이력 새로고침
        loadEmailHistory();
    } else {
        localTab.style.background = '#007bff';
        localTab.style.color = 'white';
        serverTab.style.background = '#f8f9fa';
        serverTab.style.color = '#495057';
        
        // 컨텐츠 표시/숨김
        document.getElementById('emailHistoryList').style.display = 'none';
        document.getElementById('localEmailHistoryList').style.display = 'block';
        
        // 로컬 이력 새로고침
        loadLocalEmailHistoryContent();
    }
}

/**
 * 통합 이메일 이력 새로고침
 */
async function refreshCombinedEmailHistory() {
    try {
        // 새로고침 버튼에 로딩 표시
        const refreshBtn = document.querySelector('button[onclick="refreshCombinedEmailHistory()"]');
        if (refreshBtn) {
            const originalText = refreshBtn.innerHTML;
            refreshBtn.innerHTML = '🔄 새로고침 중...';
            refreshBtn.disabled = true;
            
            // 서버 이력과 로컬 이력 모두 새로고침
            await Promise.all([
                loadEmailHistory(), // 기존 서버 이력 로드
                loadLocalEmailHistoryContent(), // 로컬 이력 로드
                updateLocalEmailHistoryUI() // 로컬 카운트 업데이트
            ]);
            
            // 원래 상태로 복원
            refreshBtn.innerHTML = originalText;
            refreshBtn.disabled = false;
            
            showAlert('success', '전송 이력이 새로고침되었습니다.');
        } else {
            await Promise.all([
                loadEmailHistory(),
                loadLocalEmailHistoryContent(),
                updateLocalEmailHistoryUI()
            ]);
        }
        
    } catch (error) {
        console.error('❌ 통합 이메일 이력 새로고침 오류:', error);
        
        // 버튼 상태 복원
        const refreshBtn = document.querySelector('button[onclick="refreshCombinedEmailHistory()"]');
        if (refreshBtn) {
            refreshBtn.innerHTML = '🔄 새로고침';
            refreshBtn.disabled = false;
        }
        
        showAlert('error', '전송 이력 새로고침 중 오류가 발생했습니다.');
    }
}

/**
 * 로컬 이메일 이력 컨텐츠 로드 (탭 전용)
 */
function loadLocalEmailHistoryContent() {
    const localHistoryList = document.getElementById('localEmailHistoryList');
    if (!localHistoryList) return;
    
    const history = localEmailHistory.getHistory();
    
    if (history.length === 0) {
        localHistoryList.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #6c757d;">
                <div style="font-size: 2em; margin-bottom: 10px;">📱</div>
                <div style="margin-bottom: 8px; font-weight: 500;">로컬 전송 이력이 없습니다</div>
                <div style="font-size: 0.9em; color: #6c757d;">이메일을 전송하면 이곳에 기록됩니다</div>
            </div>
        `;
        return;
    }
    
    localHistoryList.innerHTML = `
        <!-- 개인정보 보호 안내 -->
        <div style="background: #e3f2fd; border: 1px solid #2196f3; border-radius: 8px; padding: 12px; margin-bottom: 15px;">
            <h5 style="margin: 0 0 8px 0; color: #1976d2;">🔒 개인정보 보호</h5>
            <p style="margin: 0; font-size: 0.9em; color: #1565c0;">이메일 주소는 마스킹되어 저장되며, 본문 내용은 저장되지 않습니다. 모든 데이터는 브라우저에만 보관됩니다.</p>
        </div>
        
        <!-- 통계 -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(80px, 1fr)); gap: 10px; margin-bottom: 15px; padding: 12px; background: #f8f9fa; border-radius: 8px;">
            ${generateLocalHistoryStats()}
        </div>
        
        <!-- 이력 목록 -->
        <div style="margin-bottom: 15px;">
            <div style="display: flex; justify-content: between; align-items: center; margin-bottom: 10px;">
                <h5 style="margin: 0; color: #495057;">📋 최근 전송 이력</h5>
                <button onclick="clearLocalEmailHistory()" class="btn" style="background: #dc3545; color: white; font-size: 0.8em; padding: 6px 12px;">
                    🗑️ 전체 삭제
                </button>
            </div>
            
            ${history.map(record => `
                <div class="local-history-item" style="border: 1px solid #dee2e6; border-radius: 6px; padding: 12px; margin-bottom: 8px; background: white;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <div style="flex: 1;">
                            <div style="font-weight: bold; margin-bottom: 4px;">
                                ${record.subject}
                                ${getStatusBadge(record.status)}
                            </div>
                            <div style="color: #6c757d; font-size: 0.85em; margin-bottom: 2px;">
                                📧 ${record.toEmail} | 📎 ${record.attachmentName}
                            </div>
                            <div style="color: #6c757d; font-size: 0.75em;">
                                📅 ${new Date(record.sentAt).toLocaleString('ko-KR')}
                            </div>
                            ${record.errorMessage ? `<div style="color: #dc3545; font-size: 0.8em; margin-top: 4px;">❌ ${record.errorMessage}</div>` : ''}
                        </div>
                        <button onclick="deleteLocalEmailRecord('${record.id}')" class="btn" style="background: #6c757d; color: white; font-size: 0.75em; padding: 4px 8px; margin-left: 8px;">
                            삭제
                        </button>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

/**
 * 로컬 이력 통계 생성
 */
function generateLocalHistoryStats() {
    const stats = localEmailHistory.getStats();
    
    return `
        <div style="text-align: center;">
            <div style="font-size: 1.2em; font-weight: bold; color: #007bff;">${stats.total}</div>
            <div style="font-size: 0.8em; color: #6c757d;">총 전송</div>
        </div>
        <div style="text-align: center;">
            <div style="font-size: 1.2em; font-weight: bold; color: #28a745;">${stats.success}</div>
            <div style="font-size: 0.8em; color: #6c757d;">성공</div>
        </div>
        <div style="text-align: center;">
            <div style="font-size: 1.2em; font-weight: bold; color: #dc3545;">${stats.failed}</div>
            <div style="font-size: 0.8em; color: #6c757d;">실패</div>
        </div>
        <div style="text-align: center;">
            <div style="font-size: 1.2em; font-weight: bold; color: #ffc107;">${stats.simulation}</div>
            <div style="font-size: 0.8em; color: #6c757d;">시뮬레이션</div>
        </div>
    `;
}

/**
 * 이메일 전송 완료 후 서버 데이터 정리
 */
async function cleanupAfterEmailSent() {
    try {
    
        
        // 서버에 정리 요청 전송
        const response = await fetch('/api/email/cleanup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                generatedFile: generatedFileName,
                cleanup: true
            })
        });
        
        if (response.ok) {
            const result = await response.json();
        
        } else {
            console.warn('⚠️ 서버 데이터 정리 응답 오류:', response.status);
        }
    } catch (error) {
        console.warn('⚠️ 서버 데이터 정리 중 오류 (무시됨):', error.message);
        // 정리 실패는 치명적이지 않으므로 오류를 사용자에게 표시하지 않음
    }
}

/**
 * 발주서 다운로드 추적
 */
function trackFileDownload() {
    window.hasDownloadedFile = true;

}

// 글로벌 인스턴스 생성
const localEmailHistory = new LocalEmailHistory();

// ============================================
// 📊 사용량 제한 관리 시스템
// ============================================

/**
 * 사용량 표시 및 관리 클래스 (카테고리별)
 */
class UsageManager {
    constructor() {
        this.currentUsage = {
            orderGeneration: { current: 0, limit: 10, remaining: 10 },
            aiMapping: { current: 0, limit: 10, remaining: 10 },
            emailSending: { current: 0, limit: 5, remaining: 5 },
            resetTime: null
        };
        this.updateInterval = null;
    }

    /**
     * 서버에서 현재 사용량 조회 (카테고리별)
     */
    async fetchUsage() {
        try {
            const response = await fetch('/api/orders/usage');
            const data = await response.json();
            
            if (data.success) {
                this.currentUsage = data.usage;
                this.updateUsageDisplay();
                return data.usage;
            } else {
                console.warn('⚠️ 사용량 조회 실패:', data.error);
                return null;
            }
        } catch (error) {
            console.error('❌ 사용량 조회 오류:', error);
            return null;
        }
    }

    /**
     * 사용량 표시 업데이트 (카테고리별)
     */
    updateUsageDisplay() {
        const usageElement = document.getElementById('usageDisplay');
        if (!usageElement) return;

        const { orderGeneration, aiMapping, emailSending } = this.currentUsage;
        
        // 전체 사용량 계산
        const totalUsed = orderGeneration.current + aiMapping.current + emailSending.current;
        const totalLimit = orderGeneration.limit + aiMapping.limit + emailSending.limit;
        const percentage = Math.round((totalUsed / totalLimit) * 100);
        
        // 상태에 따른 색상 결정 
        let statusColor = '#28a745'; // 녹색 (안전)
        let statusText = '정상';
        
        if (percentage >= 90) {
            statusColor = '#dc3545'; // 빨간색 (위험)
            statusText = '주의';
        } else if (percentage >= 70) {
            statusColor = '#ffc107'; // 노란색 (경고)
            statusText = '경고';
        }

        usageElement.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 4px; font-size: 0.85em;">
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="color: ${statusColor};">📊</span>
                    <span style="color: #495057; font-weight: 600;">일일 사용량</span>
                    <span style="color: #6c757d; font-size: 0.8em;">(${statusText})</span>
                </div>
                <div style="display: flex; gap: 8px; font-size: 0.8em;">
                    <span style="color: #6f42c1;">🏭 발주서: ${orderGeneration.current}/${orderGeneration.limit}</span>
                </div>
                <div style="display: flex; gap: 8px; font-size: 0.8em;">
                    <span style="color: #17a2b8;">🤖 AI매핑: ${aiMapping.current}/${aiMapping.limit}</span>
                </div>
                <div style="display: flex; gap: 8px; font-size: 0.8em;">
                    <span style="color: #28a745;">📧 이메일: ${emailSending.current}/${emailSending.limit}</span>
                </div>
            </div>
        `;

        // 진행바 업데이트 (전체 진행률 기준)
        const progressElement = document.getElementById('usageProgress');
        if (progressElement) {
            progressElement.style.width = `${percentage}%`;
            progressElement.style.backgroundColor = statusColor;
        }
    }

    /**
     * 사용량 한도 도달 시 알림 표시 (카테고리별)
     */
    showLimitReachedAlert(category, categoryName, current, limit) {
        const resetTime = new Date(this.currentUsage.resetTime);
        const resetTimeStr = resetTime.toLocaleString('ko-KR');
        
        showAlert('error', 
            `${categoryName} 하루 사용 한도(${limit}회)에 도달했습니다!\n\n` +
            `현재 사용량: ${current}/${limit}회\n\n` +
            `🕐 초기화 시간: ${resetTimeStr}\n\n` +
            `잠시 후 다시 이용해주세요.`
        );
    }

    /**
     * 주기적으로 사용량 업데이트 (5분마다)
     */
    startPeriodicUpdate() {
        // 즉시 한 번 실행
        this.fetchUsage();
        
        // 5분마다 업데이트
        this.updateInterval = setInterval(() => {
            this.fetchUsage();
        }, 5 * 60 * 1000);
    }

    /**
     * 주기적 업데이트 중지
     */
    stopPeriodicUpdate() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }

    /**
     * 카테고리별 사용량 증가 처리
     * @param {string} category - 증가할 카테고리 ('orderGeneration', 'aiMapping', 'emailSending')
     */
    incrementUsage(category) {
        if (!this.currentUsage[category]) {
            console.warn('⚠️ 알 수 없는 카테고리:', category);
            return;
        }
        
        this.currentUsage[category].current += 1;
        this.currentUsage[category].remaining = Math.max(0, 
            this.currentUsage[category].limit - this.currentUsage[category].current
        );
        this.updateUsageDisplay();
        
        const categoryNames = {
            orderGeneration: '발주서 생성',
            aiMapping: 'AI 자동 매핑',
            emailSending: '이메일 전송'
        };
        
        console.log(`📊 ${categoryNames[category]} 사용량 증가: ${this.currentUsage[category].current}/${this.currentUsage[category].limit}`);
    }

    /**
     * 서버에서 받은 사용량 정보로 로컬 동기화
     * @param {Object} serverUsage - 서버에서 받은 사용량 정보
     */
    syncFromServer(serverUsage) {
        try {
            if (serverUsage && typeof serverUsage === 'object') {
                this.currentUsage = { ...this.currentUsage, ...serverUsage };
                this.updateUsageDisplay();
                console.log('✅ 사용량 서버 동기화 완료:', this.currentUsage);
            }
        } catch (error) {
            console.warn('⚠️ 사용량 동기화 실패:', error);
        }
    }
}

// 글로벌 인스턴스 생성
const usageManager = new UsageManager();

/**
 * API 응답에서 사용량 제한 처리 (카테고리별)
 * @param {Response} response - Fetch API 응답 객체
 * @returns {boolean} - 사용량 제한에 걸렸으면 true, 아니면 false
 */
async function handleRateLimitResponse(response) {
    if (response.status === 429) {
        try {
            const errorData = await response.json();
            
            // 카테고리별 제한 정보가 있는 경우
            if (errorData.category && errorData.usage) {
                const categoryNames = {
                    orderGeneration: '발주서 생성',
                    aiMapping: 'AI 자동 매핑',
                    emailSending: '이메일 전송'
                };
                
                const categoryName = categoryNames[errorData.category] || errorData.category;
                usageManager.showLimitReachedAlert(
                    errorData.category, 
                    categoryName, 
                    errorData.usage.current, 
                    errorData.usage.limit
                );
            } else {
                // 일반적인 제한 메시지
                showAlert('error', errorData.error || '서비스 사용 한도에 도달했습니다. 잠시 후 다시 시도해주세요.');
            }
            
            usageManager.fetchUsage(); // 최신 사용량 업데이트
            return true;
        } catch (e) {
            console.error('사용량 제한 응답 파싱 오류:', e);
            showAlert('error', '서비스 사용 한도에 도달했습니다. 잠시 후 다시 시도해주세요.');
            return true;
        }
    }
    return false;
}

// ============================================
// 전역 변수
// ============================================
let currentOrderFileId = null;

// 📊 서버 사용량 동기화 함수 (캐시 사용 시 호출)
async function syncUsageWithServer(action, cached = false, metadata = {}) {
    try {
        console.log('📊 서버 사용량 동기화 시작:', { action, cached, metadata });
        
        // 타임아웃 설정 (10초)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const response = await fetch('/api/orders/usage/sync', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                action,
                cached,
                metadata
            }),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            // 429 (Rate Limit) 에러는 정상적인 제한이므로 에러로 처리하지 않음
            if (response.status === 429) {
                const errorData = await response.json().catch(() => ({ message: 'Rate limit exceeded' }));
                console.log('📊 사용량 한도 도달:', errorData.message);
                return { success: false, limitReached: true, data: errorData };
            }
            
            // 500 에러나 기타 서버 에러는 조용히 처리
            if (response.status >= 500) {
                console.warn('⚠️ 서버 사용량 동기화 서버 에러 (무시됨):', response.status, response.statusText);
                return { success: false, serverError: true, status: response.status };
            }
            
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        console.log('✅ 서버 사용량 동기화 완료:', result.message);
        
        // 사용량 UI 업데이트 (선택적)
        if (window.usageManager && result.allUsage) {
            // 서버에서 받은 최신 사용량으로 로컬 동기화
            window.usageManager.syncFromServer(result.allUsage);
        }
        
        return { success: true, data: result };
        
    } catch (error) {
        // AbortError는 타임아웃이므로 조용히 처리
        if (error.name === 'AbortError') {
            console.warn('⚠️ 사용량 동기화 타임아웃 (무시됨)');
            return { success: false, timeout: true };
        }
        
        // 네트워크 에러 등은 조용히 처리
        console.warn('⚠️ 서버 사용량 동기화 실패 (무시됨):', error.message);
        return { success: false, error: error.message };
    }
}

// 파일 변경 함수 (다른 파일 선택)
function changeFile(type) {
    const uploadAreaId = type === 'order' ? 'uploadAreaOrder' : 'uploadAreaSupplier';
    const uploadResultId = type === 'order' ? 'uploadResultOrder' : 'uploadResultSupplier';
    const uploadAlertId = type === 'order' ? 'uploadAlertOrder' : 'uploadAlertSupplier';
    
    // 업로드 영역 다시 표시
    const uploadArea = document.getElementById(uploadAreaId);
    const uploadResult = document.getElementById(uploadResultId);
    const uploadAlert = document.getElementById(uploadAlertId);
    
    if (uploadArea) {
        uploadArea.style.display = 'block';
    }
    
    // 결과 영역 숨기기
    if (uploadResult) {
        uploadResult.classList.add('hidden');
    }
    

    if (uploadAlert) {
        uploadAlert.innerHTML = '';
    }
    

    if (type === 'order') {
        currentOrderFileId = null;
        orderFileHeaders = [];
    } else {
        currentSupplierFileId = null;
        supplierFileHeaders = [];
    }
    
    // 매핑 상태 초기화
    currentMapping = {};
    sessionStorage.setItem('mappingSaved', 'false');
    updateSaveMappingButton();
    updateGenerateOrderButton();
    
    const fileTypeText = type === 'order' ? '주문서' : '발주서';
    productionLog(`🔄 ${fileTypeText} 파일 변경 모드로 전환`);
}

// 템플릿 모드 파일 변경 함수
function changeTemplateFile() {
    const uploadArea = document.getElementById('uploadAreaTemplateMode');
    const uploadResult = document.getElementById('uploadResultTemplateMode');
    const uploadAlert = document.getElementById('uploadAlertTemplateMode');
    
    // 업로드 영역 다시 표시
    if (uploadArea) {
        uploadArea.style.display = 'block';
    }
    
    // 결과 영역 숨기기
    if (uploadResult) {
        uploadResult.classList.add('hidden');
    }
    
    // 알림 메시지 초기화
    if (uploadAlert) {
        uploadAlert.innerHTML = '';
    }
    
    // 파일 상태 초기화
    currentOrderFileId = null;
    orderFileHeaders = [];
    
    // 템플릿 처리 버튼 상태 업데이트
    updateTemplateProcessButton();
    
    productionLog('🔄 템플릿 모드 파일 변경 모드로 전환');
}
let currentSupplierFileId = null;
let currentMapping = {};
let generatedFileName = null;
let displayFileName = null; // 사용자 친화적 파일명 저장
let orderFileHeaders = [];
let supplierFileHeaders = [];

// 토글 기능을 위한 백업 상태 변수들
let backupMapping = null;          // 매칭 실행 전 상태 백업
let aiMappingExecuted = false;     // AI 자동매칭 실행 여부


// 진행 중인 요청 관리
let currentUploadController = null;
let currentProcessingController = null;
let isProcessing = false;

// 실시간 업데이트 관리 제거 (서버 부하 방지)

// 📁 localStorage 파일 캐싱 시스템
class FileCache {
    constructor() {
        this.maxFileSize = 5 * 1024 * 1024; // 5MB 제한
        this.maxTotalSize = 20 * 1024 * 1024; // 총 20MB 제한
        this.prefix = 'autorder_file_';
        this.metaPrefix = 'autorder_meta_';
    }

    // 파일을 localStorage에 저장
    async cacheFile(file, fileId, appFileType = null) {
        try {
            // 파일 크기 체크
            if (file.size > this.maxFileSize) {
                debugLog('파일이 너무 커서 캐시하지 않습니다:', file.name, `${(file.size / 1024 / 1024).toFixed(1)}MB`);
                return false;
            }

            // 공간 체크 및 정리
            await this.checkAndCleanSpace(file.size);

            // 파일을 Base64로 변환
            const base64Data = await this.fileToBase64(file);
            
            // 메타데이터 저장 (앱 파일 타입 추가)
            const metadata = {
                fileName: file.name,
                fileSize: file.size,
                fileType: file.type,
                lastModified: file.lastModified,
                cachedAt: Date.now(),
                fileId: fileId,
                appFileType: appFileType // 🔧 order/supplier 구분 추가
            };

            localStorage.setItem(this.prefix + fileId, base64Data);
            localStorage.setItem(this.metaPrefix + fileId, JSON.stringify(metadata));

            productionLog('✅ 파일 캐시 완료:', file.name, `${(file.size / 1024 / 1024).toFixed(1)}MB`);
            return true;

        } catch (error) {
            console.error('❌ 파일 캐싱 실패:', error);
            return false;
        }
    }

    // localStorage에서 파일 로드
    async loadCachedFile(fileId, expectedFileType = null) {
        try {
            const base64Data = localStorage.getItem(this.prefix + fileId);
            const metadata = localStorage.getItem(this.metaPrefix + fileId);

            if (!base64Data || !metadata) {
                return null;
            }

            const meta = JSON.parse(metadata);
            
            // 🔧 파일 타입 검증 (order/supplier 혼동 방지)
            if (expectedFileType && meta.appFileType && meta.appFileType !== expectedFileType) {
                debugLog(`⚠️ 캐시 파일 타입 불일치: 요청(${expectedFileType}) vs 캐시(${meta.appFileType})`);
                return null; // 타입이 다르면 캐시 미사용
            }
            
            // 캐시 만료 체크 (7일)
            const maxAge = 7 * 24 * 60 * 60 * 1000; // 7일
            if (Date.now() - meta.cachedAt > maxAge) {
                this.removeFromCache(fileId);
                debugLog('캐시 만료로 삭제:', meta.fileName);
                return null;
            }

            // Base64를 Blob으로 변환
            const blob = this.base64ToBlob(base64Data, meta.fileType);
            const file = new File([blob], meta.fileName, {
                type: meta.fileType,
                lastModified: meta.lastModified
            });

            debugLog('🚀 캐시에서 파일 로드:', meta.fileName);
            return { file, metadata: meta };

        } catch (error) {
            console.error('❌ 캐시 파일 로드 실패:', error);
            this.removeFromCache(fileId);
            return null;
        }
    }

    // 파일을 Base64로 변환
    fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    // Base64를 Blob으로 변환
    base64ToBlob(base64Data, contentType) {
        const base64 = base64Data.split(',')[1];
        const byteCharacters = atob(base64);
        const byteArray = new Uint8Array(byteCharacters.length);
        
        for (let i = 0; i < byteCharacters.length; i++) {
            byteArray[i] = byteCharacters.charCodeAt(i);
        }
        
        return new Blob([byteArray], { type: contentType });
    }

    // 공간 체크 및 정리
    async checkAndCleanSpace(requiredSize) {
        const currentSize = this.getCurrentCacheSize();
        
        if (currentSize + requiredSize > this.maxTotalSize) {
            productionLog('🧹 캐시 공간 부족, 오래된 파일 정리 중...');
            await this.cleanOldFiles(requiredSize);
        }
    }

    // 현재 캐시 크기 계산
    getCurrentCacheSize() {
        let totalSize = 0;
        for (let key in localStorage) {
            if (key.startsWith(this.prefix)) {
                const item = localStorage.getItem(key);
                if (item) {
                    totalSize += item.length;
                }
            }
        }
        return totalSize;
    }

    // 오래된 파일 정리
    async cleanOldFiles(requiredSize) {
        const files = [];
        
        // 모든 캐시 파일 정보 수집
        for (let key in localStorage) {
            if (key.startsWith(this.metaPrefix)) {
                try {
                    const fileId = key.replace(this.metaPrefix, '');
                    const metadata = JSON.parse(localStorage.getItem(key));
                    files.push({ fileId, metadata });
                } catch (error) {
                    // 손상된 메타데이터 삭제
                    localStorage.removeItem(key);
                }
            }
        }
        
        // 캐시 시간 순으로 정렬 (오래된 것부터)
        files.sort((a, b) => a.metadata.cachedAt - b.metadata.cachedAt);
        
        // 필요한 공간이 확보될 때까지 삭제
        let freedSpace = 0;
        for (const file of files) {
            const fileData = localStorage.getItem(this.prefix + file.fileId);
            if (fileData) {
                freedSpace += fileData.length;
                this.removeFromCache(file.fileId);
                debugLog('오래된 캐시 삭제:', file.metadata.fileName);
                
                if (freedSpace >= requiredSize) {
                    break;
                }
            }
        }
    }

    // 캐시에서 파일 제거
    removeFromCache(fileId) {
        localStorage.removeItem(this.prefix + fileId);
        localStorage.removeItem(this.metaPrefix + fileId);
    }

    // 캐시 상태 정보
    getCacheInfo() {
        const files = [];
        let totalSize = 0;
        
        for (let key in localStorage) {
            if (key.startsWith(this.metaPrefix)) {
                try {
                    const fileId = key.replace(this.metaPrefix, '');
                    const metadata = JSON.parse(localStorage.getItem(key));
                    const fileData = localStorage.getItem(this.prefix + fileId);
                    
                    if (fileData) {
                        const size = fileData.length;
                        totalSize += size;
                        files.push({ fileId, metadata, size });
                    }
                } catch (error) {
                    // 손상된 메타데이터 무시
                }
            }
        }
        
        return {
            totalFiles: files.length,
            totalSize,
            maxSize: this.maxTotalSize,
            usagePercent: (totalSize / this.maxTotalSize * 100).toFixed(1),
            files
        };
    }

    // 파일 ID 생성 (파일 내용 기반 해시)
    generateFileId(file, fileType = null) {
        // 파일명, 크기, 타입과 함께 파일 용도(order/supplier)도 포함
        const data = `${file.name}_${file.size}_${file.type}_${fileType || 'unknown'}`;
        return btoa(encodeURIComponent(data)).replace(/[^a-zA-Z0-9]/g, '').substring(0, 20); // 길이 증가
    }
}

// 글로벌 fileCache 인스턴스
const fileCache = new FileCache();

// 📁 캐시 관련 헬퍼 함수들

// 업로드 성공 후 공통 로직 처리
function handleUploadSuccess(type) {
    // 발주서가 업로드되었을 때 다음 단계로 이동하는 조건 개선
    if (type === 'supplier') {
        // 발주서만 업로드된 경우 - 직접 입력 모드로 안내
        if (!currentOrderFileId) {
            // 아래쪽 전체 alert는 제거하고 주문서 영역에만 메시지 표시
            
            // 발주서만 업로드된 상태에서 주문서 업로드 안내 표시
            const orderAlert = document.getElementById('uploadAlertOrder');
            const orderResult = document.getElementById('uploadResultOrder');
            
            if (orderAlert && !orderAlert.innerHTML.includes('주문서를 업로드')) {
                // 주문서 결과 영역을 보이게 하고 메시지 표시
                if (orderResult) {
                    orderResult.classList.remove('hidden');
                }
                orderAlert.innerHTML = '<div class="alert alert-info"><i class="fas fa-info-circle"></i> 주문서를 업로드해주세요.</div>';
            }
            
            // 주문서 업로드 영역으로 스크롤하여 다음 단계 안내
            setTimeout(() => {
                const orderUploadArea = document.querySelector('#step1 .order-upload');
                if (orderUploadArea) {
                    orderUploadArea.scrollIntoView({ 
                        behavior: 'smooth', 
                        block: 'center',
                        inline: 'nearest'
                    });
                }
            }, 800);
        } else {
            // 두 파일 모두 업로드된 경우만 STEP 2로 이동
            // 헤더가 로드될 때까지 기다린 후 매핑 설정
            setTimeout(() => {
                showStep(2);
                showHeaderLoadingState(); // 로딩 상태 표시
                waitForHeadersAndSetupMapping();
                
                // STEP 2 영역으로 부드럽게 스크롤
                setTimeout(() => {
                    const step2Element = document.getElementById('step2');
                    if (step2Element) {
                        step2Element.scrollIntoView({ 
                            behavior: 'smooth', 
                            block: 'start',
                            inline: 'nearest'
                        });
                    }
                }, 500);
            }, 1000);
        }
    } else if (type === 'order') {
        // 주문서가 업로드될 때 처리
        
        if (!currentSupplierFileId) {
            // 발주서가 없는 경우 발주서 영역에 안내 메시지 표시
            const supplierAlert = document.getElementById('uploadAlertSupplier');
            const supplierResult = document.getElementById('uploadResultSupplier');
            
            if (supplierAlert && !supplierAlert.innerHTML.includes('발주서를 업로드')) {
                // 발주서 결과 영역을 보이게 하고 메시지 표시
                if (supplierResult) {
                    supplierResult.classList.remove('hidden');
                }
                supplierAlert.innerHTML = '<div class="alert alert-info"><i class="fas fa-info-circle"></i> 발주서를 업로드해주세요.</div>';
            
            }
        } else {
            // 발주서가 이미 있는 경우 기존 경고 메시지 제거
            const supplierAlert = document.getElementById('uploadAlertSupplier');
            if (supplierAlert) {
                const warningDiv = supplierAlert.querySelector('div.alert-warning');
                if (warningDiv && warningDiv.textContent.includes('다음 단계를 진행하려면')) {
                    warningDiv.remove();
                }
            }
        }
        
        // 발주서도 이미 있는 경우 STEP 2로 이동
        if (currentSupplierFileId) {
            setTimeout(() => {
                showStep(2);
                showHeaderLoadingState(); // 로딩 상태 표시
                waitForHeadersAndSetupMapping();
                
                // STEP 2 영역으로 부드럽게 스크롤
                setTimeout(() => {
                    const step2Element = document.getElementById('step2');
                    if (step2Element) {
                        step2Element.scrollIntoView({ 
                            behavior: 'smooth', 
                            block: 'start',
                            inline: 'nearest'
                        });
                    }
                }, 500);
            }, 1000);
        }
    }
}

// 백그라운드에서 서버에 파일 업로드 (캐시 보완용)
async function uploadFileToServerInBackground(file, type, cacheFileId) {
    try {
        debugLog('🔄 백그라운드 서버 업로드 시작:', file.name);
        
        const formData = new FormData();
        formData.append('orderFile', file);
        formData.append('fileType', type);
        
        const response = await fetch('/api/orders/upload', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            // 캐시된 메타데이터에 서버 응답 추가
            const existingMeta = localStorage.getItem(fileCache.metaPrefix + cacheFileId);
            if (existingMeta) {
                const meta = JSON.parse(existingMeta);
                Object.assign(meta, {
                    cachedHeaders: result.headers || [],
                    cachedPreviewData: result.previewData || [],
                    cachedTotalRows: result.totalRows || 0,
                    cachedValidation: result.validation || { isValid: true },
                    serverFileId: result.fileId // 서버 파일 ID도 저장
                });
                localStorage.setItem(fileCache.metaPrefix + cacheFileId, JSON.stringify(meta));
                debugLog('✅ 백그라운드 업로드 완료, 캐시 업데이트:', file.name);
            }
        }
    } catch (error) {
        debugLog('⚠️ 백그라운드 업로드 실패 (무시됨):', error.message);
    }
}

// 캐시 상태 표시 함수
function showCacheStatus() {
    const info = fileCache.getCacheInfo();
    debugLog('📊 캐시 상태:', info);
    
    // 콘솔에 간단한 상태 출력
    if (info.totalFiles > 0) {
        productionLog(`📁 로컬 캐시: ${info.totalFiles}개 파일, ${(info.totalSize / 1024 / 1024).toFixed(1)}MB/${(info.maxSize / 1024 / 1024).toFixed(1)}MB (${info.usagePercent}%)`);
        
        // 🔧 파일별 상세 정보 표시 (디버깅용)
        if (isDevelopment) {
            info.files.forEach((file, index) => {
                const typeInfo = file.metadata.appFileType ? `[${file.metadata.appFileType}]` : '[타입미지정]';
                debugLog(`  ${index + 1}. ${typeInfo} ${file.metadata.fileName} (${(file.size / 1024).toFixed(1)}KB)`);
            });
        }
    }
}

// 캐시 전체 삭제 함수
function clearFileCache() {
    for (let key in localStorage) {
        if (key.startsWith('autorder_')) {
            localStorage.removeItem(key);
        }
    }
    productionLog('🧹 파일 캐시 전체 삭제 완료');
}

// 개발 환경 체크 (프로덕션에서는 로그 최소화)
const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

// 디버그 로그 함수 (개발 환경에서만 출력)
function debugLog(...args) {
    if (isDevelopment) {
        console.log(...args);
    }
}

// 프로덕션에서도 표시할 중요한 로그 (에러, 성공 메시지 등)
function productionLog(...args) {
    console.log(...args);
}

// XLS 파일을 XLSX로 변환하는 함수 (최적화된 버전)
async function convertXlsToXlsxOptimized(xlsFile, progressCallback = null) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = function(e) {
            try {
                if (progressCallback) progressCallback(10, '파일 데이터 분석 중...');
                
                // ArrayBuffer를 사용해서 XLS 파일 읽기
                const data = new Uint8Array(e.target.result);
                
                if (progressCallback) progressCallback(30, 'XLS 파일 파싱 중...');
                
                // XLSX 라이브러리로 워크북 읽기 (최적화된 옵션)
                const workbook = XLSX.read(data, { 
                    type: 'array',
                    cellText: true,      // 텍스트만 읽기
                    cellDates: false,    // 날짜 변환 생략
                    cellNF: false,       // 숫자 형식 생략
                    cellHTML: false,     // HTML 변환 생략
                    raw: true,           // 원시 데이터 사용
                    bookType: 'xls',     // XLS 형식으로 명시
                    sheetStubs: false,   // 빈 셀 생략
                    bookVBA: false,      // VBA 무시
                    bookFiles: false,    // 파일 메타데이터 무시
                    bookProps: false,    // 속성 무시
                    bookSheets: false,   // 시트 메타데이터 무시
                    bookDeps: false,     // 의존성 무시
                    dense: false         // sparse 모드 사용
                });
                
                if (progressCallback) progressCallback(60, 'XLSX 형식으로 변환 중...');
                
                // 워크북을 XLSX 형식으로 변환 (최적화된 옵션)
                const xlsxBuffer = XLSX.write(workbook, {
                    type: 'array',
                    bookType: 'xlsx',
                    cellDates: false,
                    cellNF: false,
                    cellStyles: false,
                    compression: true    // 압축 사용
                });
                
                if (progressCallback) progressCallback(80, '파일 객체 생성 중...');
                
                // 변환된 XLSX를 File 객체로 생성
                const originalName = xlsFile.name;
                const xlsxFileName = originalName.replace(/\.xls$/i, '.xlsx');
                
                const xlsxBlob = new Blob([xlsxBuffer], { 
                    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
                });
                const xlsxFile = new File([xlsxBlob], xlsxFileName, { 
                    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    lastModified: new Date().getTime() 
                });
                
                if (progressCallback) progressCallback(100, '변환 완료!');
                
                resolve(xlsxFile);
                
            } catch (error) {
                console.error('XLS 파일 변환 실패:', error);
                reject(new Error(`XLS 파일 변환 실패: ${error.message}`));
            }
        };
        
        reader.onerror = function() {
            console.error('❌ 파일 읽기 실패');
            reject(new Error('파일을 읽을 수 없습니다'));
        };
        
        if (progressCallback) progressCallback(5, '파일 읽기 시작...');
        
        // ArrayBuffer로 파일 읽기 시작
        reader.readAsArrayBuffer(xlsFile);
    });
}

// XLS 파일을 XLSX로 변환하는 함수 (기존 버전, 하위 호환성 유지)
async function convertXlsToXlsx(xlsFile) {
    return convertXlsToXlsxOptimized(xlsFile);
}

// 🔄 앱 버전 및 캐시 관리
const APP_VERSION = '2025.08.01'; // 업데이트 시마다 변경

function checkAndClearOldCache() {
    try {
        const storedVersion = localStorage.getItem('appVersion');
        
        if (storedVersion !== APP_VERSION) {
            console.log('🔄 새 버전 감지 - 캐시 정리 중...', {
                이전버전: storedVersion,
                현재버전: APP_VERSION
            });
            
            // 안전한 캐시 정리 (중요 데이터는 보존)
            const importantKeys = ['emailHistory', 'authToken', 'hasOpenAIKey'];
            const allKeys = Object.keys(localStorage);
            
            let removedCount = 0;
            allKeys.forEach(key => {
                if (!importantKeys.includes(key)) {
                    localStorage.removeItem(key);
                    removedCount++;
                }
            });
            
            localStorage.setItem('appVersion', APP_VERSION);
            console.log(`✅ 캐시 정리 완료 (${removedCount}개 항목 제거)`);
            
            // 사용자에게 알림 (한 번만)
            setTimeout(() => {
                if (document.getElementById('uploadAlert')) {
                    document.getElementById('uploadAlert').innerHTML = `
                        <div class="alert alert-info">
                            ℹ️ 앱이 업데이트되어 캐시를 정리했습니다. 더욱 안정적으로 사용하실 수 있습니다.
                        </div>
                    `;
                    
                    setTimeout(() => {
                        if (document.getElementById('uploadAlert')) {
                            document.getElementById('uploadAlert').innerHTML = '';
                        }
                    }, 5000);
                }
            }, 1000);
        }
    } catch (error) {
        console.warn('⚠️ 캐시 정리 중 오류:', error);
    }
}

// 🛠️ 고객용 문제 해결 도구
function addTroubleshootingTools() {
    // 더블클릭 5번으로 활성화되는 숨겨진 도구
    let clickCount = 0;
    let lastClickTime = 0;
    
    document.addEventListener('dblclick', function(e) {
        const now = Date.now();
        if (now - lastClickTime < 3000) { // 3초 내 연속 더블클릭
            clickCount++;
        } else {
            clickCount = 1;
        }
        lastClickTime = now;
        
        if (clickCount >= 5) { // 5번 더블클릭 시 활성화
            showTroubleshootingDialog();
            clickCount = 0;
        }
    });
}

function showTroubleshootingDialog() {
    const dialog = document.createElement('div');
    dialog.innerHTML = `
        <div style="
            position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
            background: rgba(0,0,0,0.7); z-index: 10000; 
            display: flex; align-items: center; justify-content: center;
        ">
            <div style="
                background: white; padding: 30px; border-radius: 12px; 
                max-width: 500px; width: 90%; box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            ">
                <h3 style="margin: 0 0 20px 0; color: #333;">🛠️ 문제 해결 도구</h3>
                <p style="margin-bottom: 20px; color: #666; line-height: 1.5;">
                    파일 업로드나 변환에 문제가 있나요?<br>
                    아래 버튼을 클릭하면 앱을 초기화합니다.
                </p>
                
                <div style="display: flex; gap: 10px; justify-content: flex-end;">
                    <button onclick="this.closest('div').parentElement.remove()" 
                            style="padding: 10px 20px; border: 1px solid #ddd; background: white; border-radius: 6px; cursor: pointer;">
                        취소
                    </button>
                    <button onclick="resetAppAndReload()" 
                            style="padding: 10px 20px; background: #dc3545; color: white; border: none; border-radius: 6px; cursor: pointer;">
                        🔄 앱 초기화
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(dialog);
}

function resetAppAndReload() {
    try {
        // localStorage 완전 정리 (중요 데이터 제외)
        const importantKeys = ['emailHistory'];
        const backup = {};
        
        importantKeys.forEach(key => {
            if (localStorage.getItem(key)) {
                backup[key] = localStorage.getItem(key);
            }
        });
        
        localStorage.clear();
        
        // 중요 데이터 복원
        Object.keys(backup).forEach(key => {
            localStorage.setItem(key, backup[key]);
        });
        
        alert('✅ 앱이 초기화되었습니다. 페이지를 새로고침합니다.');
        location.reload();
    } catch (error) {
        alert('❌ 초기화 중 오류가 발생했습니다: ' + error.message);
    }
}

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', async function() {
    try {
        // 🔄 캐시 버전 체크 및 정리 (최우선)
        checkAndClearOldCache();
        
        // 📁 캐시 시스템 초기화
        showCacheStatus();
        debugLog('📁 localStorage 파일 캐싱 시스템 활성화');
        
        // 🛡️ 재시도 카운터 초기화 (무한 루프 방지)
        window.orderHeaderRetryCount = 0;
        window.supplierHeaderRetryCount = 0;
        
        // 🛠️ 고객용 문제 해결 도구 추가
        addTroubleshootingTools();
        
        // 개발 환경에서는 캐시 관리 함수를 전역으로 노출
        if (isDevelopment) {
            window.fileCache = fileCache;
            window.showCacheStatus = showCacheStatus;
            window.clearFileCache = clearFileCache;
            debugLog('🔧 개발 모드: 캐시 관리 함수가 window 객체에 노출됨');
            debugLog('🔧 사용법: showCacheStatus(), clearFileCache()');
        }
        
        // 🔘 버튼 상태 초기화
        updateSaveMappingButton(); // 매칭 저장 버튼 초기 상태 설정
        
        // 🔐 인증 상태 확인 (API 키 없이도 사용 가능)
        await checkAuthenticationStatus();
        
        // 🔧 추가 안전장치: 관리자 로그인 버튼 강제 표시
        setTimeout(() => {
            const existingBtn = document.querySelector('.admin-login-btn');
            if (!existingBtn) {
                console.log('🚨 DOMContentLoaded에서 관리자 버튼 없음 - 강제 생성');
                addAdminLoginButton();
            } else {
                debugLog('✅ 관리자 로그인 버튼 이미 존재');
            }
        }, 1000);
        
        // 기본 초기화
        initializeApp();
        
        // 초기 상태 설정 (resetAllSteps는 changeWorkMode에서 이미 호출됨)
        currentMapping = {};
        generatedFileName = null;
        displayFileName = null;
        
        // 매핑 상태 초기화
        sessionStorage.setItem('mappingSaved', 'false');
        
        // GENERATE ORDER 버튼 초기 비활성화
        setTimeout(() => {
            updateGenerateOrderButton();
        }, 100);
        
        // 진행률 초기 숨김
        hideProgress();
        
        // 자동 API 호출 제거 - 사용자가 새로고침 버튼을 클릭했을 때만 로드
        debugLog('✅ 페이지 초기화 완료 - 새로고침 버튼을 클릭하여 데이터를 로드하세요');
        
        // 초기 상태에서 빈 목록과 안내 메시지 표시
        displayInitialEmptyState();
        
    } catch (error) {
        console.error('페이지 초기화 중 오류 발생:', error);
        // 기본 기능은 동작하도록 최소한의 초기화 수행
        initializeApp();
        hideProgress();
    }
    
    // 예약 전송 라디오 버튼 이벤트 리스너
    const sendNowRadio = document.getElementById('sendNow');
    const sendScheduledRadio = document.getElementById('sendScheduled');
    const scheduleTimeGroup = document.getElementById('scheduleTimeGroup');
    
    if (sendNowRadio && sendScheduledRadio && scheduleTimeGroup) {
        sendNowRadio.addEventListener('change', function() {
            if (this.checked) {
                scheduleTimeGroup.style.display = 'none';
            }
        });
        
        sendScheduledRadio.addEventListener('change', function() {
            if (this.checked) {
                scheduleTimeGroup.style.display = 'block';
                // 예약 시간 기본값 설정 (현재 시간 + 1시간)
                setCurrentTimePlus1Hour();
            }
        });
        
        // datetime-local 입력 필드 변경 이벤트 리스너 추가
        const scheduleTimeInput = document.getElementById('scheduleTime');
        if (scheduleTimeInput) {
            scheduleTimeInput.addEventListener('change', function() {
                const selectedDate = new Date(this.value);
                if (!isNaN(selectedDate.getTime())) {
                    updateSelectedTimeDisplay(selectedDate);
                    updateQuickTimeButtons();
                }
            });
        }
    }
});

// 앱 초기화
function initializeApp() {
    
    
    setupFileUploadEvents();
    
    // 📊 사용량 관리 시작
    usageManager.startPeriodicUpdate();
    
    // 페이지 종료 시 정리
    window.addEventListener('beforeunload', () => {
        usageManager.stopPeriodicUpdate();
    });

}


function setupFileUploadEvents() {
    // 주문서 파일 업로드
    const uploadAreaOrder = document.getElementById('uploadAreaOrder');
    const fileInputOrder = document.getElementById('fileInputOrder');
    
    if (uploadAreaOrder && fileInputOrder) {
        // 기존 이벤트 리스너 정리 (중복 방지)
        uploadAreaOrder.onclick = null;
        uploadAreaOrder.ondragover = null;
        uploadAreaOrder.ondragleave = null;
        uploadAreaOrder.ondrop = null;
        fileInputOrder.onchange = null;
        
        // 새로운 클릭 핸들러 생성 (한 번만 실행되도록)
        const clickHandlerOrder = function(e) {
            // 이미 처리 중이면 무시
            if (isProcessing) {
                return;
            }
            
            try {
                // 방법 1: 임시로 보이게 만들고 클릭
                const originalStyle = {
                    position: fileInputOrder.style.position,
                    opacity: fileInputOrder.style.opacity,
                    zIndex: fileInputOrder.style.zIndex
                };
                
                // 임시로 보이게 설정
                fileInputOrder.style.position = 'static';
                fileInputOrder.style.opacity = '1';
                fileInputOrder.style.zIndex = '9999';
                
                // 클릭 시도
                fileInputOrder.click();
                
                // 즉시 다시 숨기기
                setTimeout(() => {
                    fileInputOrder.style.position = originalStyle.position || '';
                    fileInputOrder.style.opacity = originalStyle.opacity || '';
                    fileInputOrder.style.zIndex = originalStyle.zIndex || '';
                }, 10);
                
            } catch (error) {
                console.error('fileInputOrder.click() 오류:', error);
            }
        };
        
        // 파일 선택 핸들러 생성 (한 번만 실행되도록)
        const changeHandlerOrder = function(e) {
            handleFileSelect(e, 'order');
        };
        
        // 이벤트 리스너 등록
        uploadAreaOrder.onclick = clickHandlerOrder;
        uploadAreaOrder.addEventListener('dragover', handleDragOver);
        uploadAreaOrder.addEventListener('dragleave', handleDragLeave);
        uploadAreaOrder.addEventListener('drop', (e) => handleDrop(e, 'order'));
        fileInputOrder.onchange = changeHandlerOrder;
        
    } else {
        console.error('주문서 업로드 요소를 찾을 수 없습니다');
    }
    
    // 발주서 파일 업로드
    const uploadAreaSupplier = document.getElementById('uploadAreaSupplier');
    const fileInputSupplier = document.getElementById('fileInputSupplier');
    
    if (uploadAreaSupplier && fileInputSupplier) {
        // 기존 이벤트 리스너 정리 (중복 방지)
        uploadAreaSupplier.onclick = null;
        uploadAreaSupplier.ondragover = null;
        uploadAreaSupplier.ondragleave = null;
        uploadAreaSupplier.ondrop = null;
        fileInputSupplier.onchange = null;
        
        // 새로운 클릭 핸들러 생성 (한 번만 실행되도록)
        const clickHandlerSupplier = function(e) {
            // 이미 처리 중이면 무시
            if (isProcessing) {
                return;
            }
            
            try {
                // 임시로 보이게 만들고 클릭 (브라우저 보안 정책 우회)
                const originalStyle = {
                    position: fileInputSupplier.style.position,
                    opacity: fileInputSupplier.style.opacity,
                    zIndex: fileInputSupplier.style.zIndex
                };
                
                // 임시로 보이게 설정
                fileInputSupplier.style.position = 'static';
                fileInputSupplier.style.opacity = '1';
                fileInputSupplier.style.zIndex = '9999';
                
                // 클릭 시도
                fileInputSupplier.click();
                
                // 즉시 다시 숨기기
                setTimeout(() => {
                    fileInputSupplier.style.position = originalStyle.position || '';
                    fileInputSupplier.style.opacity = originalStyle.opacity || '';
                    fileInputSupplier.style.zIndex = originalStyle.zIndex || '';
                }, 10);
                
            } catch (error) {
                console.error('fileInputSupplier.click() 오류:', error);
            }
        };
        
        // 파일 선택 핸들러 생성 (한 번만 실행되도록)
        const changeHandlerSupplier = function(e) {
            handleFileSelect(e, 'supplier');
        };
        
        // 이벤트 리스너 등록
        uploadAreaSupplier.onclick = clickHandlerSupplier;
        uploadAreaSupplier.addEventListener('dragover', handleDragOver);
        uploadAreaSupplier.addEventListener('dragleave', handleDragLeave);
        uploadAreaSupplier.addEventListener('drop', (e) => handleDrop(e, 'supplier'));
        fileInputSupplier.onchange = changeHandlerSupplier;
        
    } else {
        console.error('발주서 업로드 요소를 찾을 수 없습니다');
    }
    
    // 전송 옵션 변경 이벤트
    document.querySelectorAll('input[name="sendOption"]').forEach(radio => {
        radio.addEventListener('change', function() {
            const scheduleTimeGroup = document.getElementById('scheduleTimeGroup');
            if (this.value === 'scheduled') {
                scheduleTimeGroup.style.display = 'block';
                // 예약 시간을 현재 시간 + 1시간으로 기본 설정
                const now = new Date();
                now.setHours(now.getHours() + 1);
                const scheduleInput = document.getElementById('scheduleTime');
                scheduleInput.value = now.toISOString().slice(0, 16);
            } else {
                scheduleTimeGroup.style.display = 'none';
            }
        });
    });
    
    // 작업 모드 변경 이벤트 리스너 추가
    document.querySelectorAll('input[name="workMode"]').forEach(radio => {
        radio.addEventListener('change', function() {
            changeWorkMode(this.value);
        });
    });
    
    // 초기 모드 설정 (파일 업로드 모드)
    changeWorkMode('fileUpload');
}



// 드래그 오버 처리
function handleDragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add('drag-over');
}

// 드래그 떠남 처리
function handleDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
}

// 드롭 처리
function handleDrop(e, type) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        const file = files[0];
        
        // 중복 처리 방지
        if (isProcessing) {
            return;
        }
        
        // 📋 드래그 앤 드롭 즉시 진행바 표시 (사용자 피드백 개선)
        const fileTypeText = type === 'order' ? '주문서' : '발주서';
        showProgress(`${fileTypeText} 파일 "${file.name}"을(를) 처리하고 있습니다...`);
        updateProgress(1, '파일 드롭 완료, 처리를 시작합니다...');
        
        processFile(file, type).catch((error) => {
            console.error('파일 처리 오류:', error);
            hideProgress(); // 오류 시 진행바 숨김
        });
    }
}

// 파일 선택 처리
function handleFileSelect(e, type) {
    const file = e.target.files[0];
    if (file) {
        // 중복 처리 방지
        if (isProcessing) {
            // input value 초기화
            e.target.value = '';
            return;
        }
        
        // 📋 파일 선택 즉시 진행바 표시 (사용자 피드백 개선)
        const fileTypeText = type === 'order' ? '주문서' : '발주서';
        showProgress(`${fileTypeText} 파일 "${file.name}"을(를) 처리하고 있습니다...`);
        updateProgress(1, '파일 선택 완료, 처리를 시작합니다...');
        
        // 파일 처리 시작 전에 input value 초기화 (브라우저 이슈 방지)
        const inputValue = e.target.value;
        e.target.value = '';
        
        processFile(file, type).then(() => {
            // 파일 처리 완료
        }).catch((error) => {
            console.error('파일 처리 오류:', error);
            hideProgress(); // 오류 시 진행바 숨김
        });
    }
}

// 파일이 매우 구형 BIFF 포맷인지 확인하는 함수 (Excel 2016+ 호환)
async function checkIfBinaryXLS(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            const arrayBuffer = e.target.result;
            const bytes = new Uint8Array(arrayBuffer);
            

            
            // 1. ZIP 형식 확인 (OOXML, BIFF12 등)
            if (bytes.length >= 4) {
                const isZIP = bytes[0] === 0x50 && bytes[1] === 0x4B &&
                             (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07) &&
                             (bytes[3] === 0x04 || bytes[3] === 0x06 || bytes[3] === 0x08);
                
                if (isZIP) {
                
                    resolve(false); // ZIP 형식이면 OOXML 또는 BIFF12 (허용)
                    return;
                }
            }
            
            // 2. 매우 구형인 BIFF 시그니처만 확인 (Excel 2016+ 호환)
            if (bytes.length >= 4) {
                // BIFF2: 0x0009, BIFF3: 0x0209, BIFF4: 0x0409, BIFF5: 0x0805
                // BIFF8: 0x0809 (Excel 97-2003)는 현대 Excel에서도 사용 가능하므로 제외
                const biffSignature = (bytes[1] << 8) | bytes[0]; // Little-endian
                const biffVersion = (bytes[3] << 8) | bytes[2];
                
                // 매우 구형인 BIFF2-BIFF5만 차단 (BIFF8은 Excel 2016+ 호환)
                if (biffSignature === 0x0009 || biffSignature === 0x0209 || 
                    biffSignature === 0x0409 || biffSignature === 0x0805) {
                    console.log('❌ 매우 구형 BIFF 시그니처 감지:', file.name, 'Signature:', biffSignature.toString(16));
                    resolve(true); // 매우 구형 BIFF 형식 (차단)
                    return;
                }
            }
            
            // OLE2 구조 감지
            if (bytes.length >= 8) {
                const isOLE2 = bytes[0] === 0xD0 && bytes[1] === 0xCF && 
                              bytes[2] === 0x11 && bytes[3] === 0xE0 &&
                              bytes[4] === 0xA1 && bytes[5] === 0xB1 &&
                              bytes[6] === 0x1A && bytes[7] === 0xE1;
                
                if (isOLE2) {
            
                    
                    // .xls 확장자인 경우 경고 표시 (하지만 차단하지는 않음)
                    if (file.name.toLowerCase().endsWith('.xls')) {
                        console.log('⚠️ .xls 파일 감지 - 호환성 경고 필요');
                        // 경고는 하되 업로드는 허용 (사용자 선택권 제공)
                    }
                    
                
                    resolve(false); // 허용하되 서버에서 적절히 처리
                    return;
                }
            }
            
            // 4. CSV 파일 확인
            if (bytes.length >= 3) {
                // UTF-8 BOM 확인
                const hasUTF8BOM = bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF;
                
                // 텍스트 파일인지 확인 (처음 100바이트가 모두 ASCII/UTF-8 범위인지)
                let isTextFile = true;
                const checkLength = Math.min(100, bytes.length);
                for (let i = hasUTF8BOM ? 3 : 0; i < checkLength; i++) {
                    const byte = bytes[i];
                    // 일반적인 텍스트 문자 범위 (개행, 탭, 출력 가능한 ASCII)
                    if (!(byte >= 0x20 && byte <= 0x7E) && byte !== 0x09 && byte !== 0x0A && byte !== 0x0D) {
                        isTextFile = false;
                        break;
                    }
                }
                
                if (isTextFile || hasUTF8BOM) {
                
                    resolve(false);
                    return;
                }
            }
            
            // 5. 알 수 없는 형식은 안전하게 허용
            console.log('⚠️ 알 수 없는 파일 형식 (허용):', file.name);
            resolve(false);
        };
        
        reader.onerror = function() {
            console.error('파일 읽기 오류:', file.name);
            resolve(false); // 읽기 오류 시 안전하게 허용
        };
        
        // 파일의 첫 1024바이트만 읽어서 헤더 확인
        const blob = file.slice(0, 1024);
        reader.readAsArrayBuffer(blob);
    });
}

// 파일 처리
async function processFile(file, type) {
    // 📋 파일 정보 확인 단계 (이미 handleFileSelect/handleDrop에서 진행바 시작됨)
    updateProgress(3, '파일 정보를 확인하고 있습니다...');
    
    // 새로운 모드별 처리가 있는 경우 해당 함수 호출
    if (type === 'supplier-direct' || type === 'template-mode') {
        return await processFileForMode(file, type);
    }
    
    // 진행률 업데이트
    updateProgress(7, '파일 형식을 검증하고 있습니다...');
    
    // 파일 형식 검증 - 매우 구형 BIFF 포맷만 차단 (Excel 2016+ 호환)
    updateProgress(10, '파일 호환성을 검사하고 있습니다...');
    const isBiffBlocked = await checkIfBinaryXLS(file);
    if (isBiffBlocked) {
        hideProgress();
        showUploadResult(null, type, true, 
            '❌ 매우 구형 BIFF 포맷 Excel 파일은 지원되지 않습니다.<br><br>' +
            '📋 <strong>해결 방법:</strong><br>' +
            '1. Excel에서 해당 파일을 열어주세요<br>' +
            '2. "파일 → 다른 이름으로 저장" 메뉴를 선택하세요<br>' +
            '3. 파일 형식을 <strong>"Excel 통합 문서(*.xlsx)"</strong>로 변경하세요<br>' +
            '4. 변환된 .xlsx 파일을 다시 업로드해주세요<br><br>' +
            '💡 Excel 2016+ 에서 저장한 파일은 정상적으로 업로드됩니다.'
        );
        return;
    }
    
    // 허용되는 파일 형식 검증 (Excel, CSV 허용)
    updateProgress(12, '파일 확장자를 확인하고 있습니다...');
    const allowedExtensions = ['.xlsx', '.xls', '.csv'];
    const hasValidExtension = allowedExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
    
    if (!hasValidExtension) {
        hideProgress();
        showUploadResult(null, type, true, 
            '❌ 지원하지 않는 파일 형식입니다.<br><br>' +
            '📋 <strong>지원 형식:</strong><br>' +
            '• Excel 파일(.xlsx, .xls) - Excel 2016+ 호환<br>' +
            '• CSV 파일(.csv)<br><br>' +
            '💡 매우 구형 BIFF 포맷 파일은 .xlsx로 변환 후 업로드해주세요.'
        );
        return;
    }
    
    // 파일 크기 검증 (10MB)
    updateProgress(8, '파일 크기 확인 중...');
    if (file.size > 10 * 1024 * 1024) {
        hideProgress();
        showStep1Alert('error', '파일 크기가 너무 큽니다. 10MB 이하의 파일을 업로드해주세요.');
        return;
    }
    
    // .xls 파일 자동 변환 처리
    if (file.name.toLowerCase().endsWith('.xls')) {
        // XLS 변환 시작
        updateProgress(12, '구형 Excel 파일(.xls) 변환 준비 중...');
        
        showUploadWarning(type, 
            '🔄 구형 Excel 파일(.xls)을 호환 형식으로 자동 변환 중입니다...<br><br>' +
            '💡 <strong>자동 처리:</strong><br>' +
            '• XLS 파일을 XLSX 형식으로 변환합니다<br>' +
            '• 변환 후 자동으로 업로드를 진행합니다<br>' +
            '• 잠시만 기다려주세요...'
        );
        
        try {
            // 변환 중 진행률 표시
            updateProgress(15, 'XLS 파일 분석 중...');
            
            // XLS 파일을 XLSX로 자동 변환 (최적화)
            const convertedFile = await convertXlsToXlsxOptimized(file, (progress, message) => {
                updateProgress(15 + (progress * 20), message); // 15-35% 범위
            });
            file = convertedFile; // 변환된 XLSX 파일로 교체
            
            updateProgress(40, 'XLS → XLSX 변환 완료!');
            
            showUploadWarning(type, 
                '✅ XLS 파일이 XLSX로 성공적으로 변환되었습니다!<br><br>' +
                '🔄 변환된 파일을 업로드 중입니다...'
            );
        } catch (convertError) {
            console.error('XLS 변환 실패:', convertError);
            hideProgress();
            showUploadResult(null, type, true, 
                '❌ XLS 파일 변환에 실패했습니다.<br><br>' +
                '💡 <strong>해결 방법:</strong><br>' +
                '1. Excel에서 파일을 열고 "다른 이름으로 저장" 선택<br>' +
                '2. 파일 형식을 "Excel 통합 문서(.xlsx)" 또는 "CSV(.csv)"로 변경<br>' +
                '3. 변환된 파일을 다시 업로드해주세요<br><br>' +
                `상세 오류: ${convertError.message}`
            );
            return;
        }
    } else {
        // XLS가 아닌 경우에도 진행률 업데이트
        updateProgress(12, `${type === 'order' ? '주문서' : '발주서'} 파일 확인 완료`);
    }
    
    try {
        // 이미 처리 중인 경우 중단
        if (isProcessing) {
            hideProgress();
            showUploadResult(null, type, true, 
                '⚠️ 이미 파일 처리가 진행 중입니다.<br><br>' +
                '💡 현재 다른 파일을 처리하고 있습니다. 잠시 후 다시 시도해주세요.'
            );
            return;
        }
        
        // 🔄 새 파일 업로드 시 해당 파일 타입만 초기화
        debugLog(`🔄 ${type} 파일 업로드로 인한 상태 초기화 시작`);
        
        // 해당 파일 타입의 이전 데이터만 초기화 (다른 파일은 유지)
        if (type === 'order') {
            currentOrderFileId = null;
            orderFileHeaders = [];
            // 재시도 카운터 리셋
            window.orderHeaderRetryCount = 0;
        } else {
            currentSupplierFileId = null;
            supplierFileHeaders = [];
            // 재시도 카운터 리셋
            window.supplierHeaderRetryCount = 0;
        }
        
        // 매핑 관련 상태만 초기화 (파일 변경 시 매핑 다시 설정 필요)
        console.log('🧹 processFile에서 currentMapping 초기화:', Object.keys(currentMapping));
        currentMapping = {};
        sessionStorage.setItem('mappingSaved', 'false');
        
        // 직접 입력 모드 해제
        window.isDirectInputMode = false;
        window.directInputData = null;
        
        // UI 상태 초기화 - STEP 2, 3, 4 숨기기 (매핑을 다시 해야 하므로)
        document.getElementById('step2').classList.add('hidden');
        document.getElementById('step3').classList.add('hidden');
        document.getElementById('step4').classList.add('hidden');
        
        // 매핑 관련 컨테이너 초기화
        const sourceFields = document.getElementById('sourceFields');
        const targetFields = document.getElementById('targetFields');
        if (sourceFields) sourceFields.innerHTML = '';
        if (targetFields) {
            targetFields.querySelectorAll('.field-item').forEach(field => {
                field.style.background = '';
                field.style.color = '';
                field.classList.remove('selected');
                field.innerHTML = field.dataset.target;
            });
        }
        
        // 필수 필드 입력 폼 숨기기
        const missingFieldsForm = document.getElementById('missingFieldsForm');
        if (missingFieldsForm) {
            missingFieldsForm.classList.add('hidden');
        }
        
        // ⚠️ 다른 파일 타입의 업로드 결과는 유지 (삭제하지 않음)
        // 각 파일은 독립적으로 관리되어야 함
        
        debugLog(`✅ ${type} 파일 업로드로 인한 상태 초기화 완료 (다른 파일 타입 유지)`);
        
        // 처리 상태 설정
        isProcessing = true;
        
        // 이전 요청이 있으면 정리하고 잠시 대기
        if (currentUploadController) {
            currentUploadController.abort();
            currentUploadController = null;
            // 이전 요청 정리 대기
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // 🚫 이전 진행바 완전히 숨기기 (115% 방지)
        hideProgress();
        await new Promise(resolve => setTimeout(resolve, 100)); // 짧은 딜레이로 완전히 숨김 보장
        
        // 📁 1단계: 캐시에서 파일 확인 (타임아웃 없는 로컬 작업)
        updateProgress(15, '로컬 캐시에서 파일 확인 중...');
        
        const fileId = fileCache.generateFileId(file, type); // 🔧 파일 타입 추가
        updateProgress(18, '캐시 파일 ID 생성 완료...');
        
        const cachedResult = await fileCache.loadCachedFile(fileId, type); // 🔧 파일 타입 검증 추가
        updateProgress(20, '캐시 검색 완료...');

        
        if (cachedResult) {
            // 🏢 한컴오피스 파일 특수 처리: 헤더가 없는 경우 캐시 무효화
            const isHancomFile = cachedResult.metadata.fileName && 
                               (cachedResult.metadata.fileName.includes('한컴') || 
                                file.type === 'application/haansoftxlsx');
            
            if (isHancomFile && (!cachedResult.cachedHeaders || cachedResult.cachedHeaders.length === 0)) {
                console.log('🔄 한컴오피스 파일 캐시 무효화 - 헤더 정보 없음:', file.name);
                // 캐시 삭제하고 서버에서 다시 처리
                fileCache.removeFromCache(fileId);
                updateProgress(25, '캐시 무효화 완료, 서버에서 재처리 중...');
                // 캐시를 무효화했으므로 서버 업로드 로직으로 이동 (아래 코드 실행)
            } else {
                // 🚀 캐시 히트! 즉시 처리
                debugLog('🚀 캐시에서 파일 로드 완료:', file.name);
                
                // 📊 캐시 사용도 실제 사용으로 카운트 (방안 3: 혼합 방식)
                usageManager.incrementUsage('orderGeneration');
                console.log('📊 캐시 히트 - 로컬 사용량 증가:', type, file.name);
                
                // 🚀 초고속 캐시 로딩 (캐시의 진정한 속도 이점)
                updateProgress(50, `캐시에서 ${type === 'order' ? '주문서' : '발주서'} 파일을 로드 중...`);
                await new Promise(resolve => setTimeout(resolve, 50)); // 최소 딜레이
                
                updateProgress(100, '✅ 캐시 로드 완료!');
                await new Promise(resolve => setTimeout(resolve, 100)); // 짧은 완료 표시
                hideProgress();
                
                // 🔍 캐시 완성도 확인 (변수 사용 전 먼저 선언)
                const hasCompleteCache = cachedResult.cachedHeaders && 
                                       cachedResult.cachedHeaders.length > 0 && 
                                       cachedResult.cachedTotalRows > 0;
            
            // 캐시된 메타데이터를 사용해서 결과 생성
            const cachedFileResult = {
                success: true,
                fileName: cachedResult.metadata.fileName,
                fileId: fileId, // 캐시 ID 사용
                headers: cachedResult.cachedHeaders || [], // 헤더가 캐시되어 있다면 사용
                previewData: cachedResult.cachedPreviewData || [],
                totalRows: cachedResult.cachedTotalRows || 0,
                validation: cachedResult.cachedValidation || {
                    isValid: true,
                    totalRows: cachedResult.cachedTotalRows || 0,
                    validRows: cachedResult.cachedTotalRows || 0,
                    errorRows: 0,
                    warningRows: 0,
                    errors: [],
                    warnings: [],
                    summary: {
                        successRate: 100,
                        totalIssues: 0
                    }
                },
                message: hasCompleteCache ? 
                    `⚡ 캐시에서 즉시 로드 완료! (${cachedResult.metadata.fileName})` :
                    `📋 캐시에서 로드 (백그라운드 업데이트 중) (${cachedResult.metadata.fileName})`,
                fromCache: true
            };
            
            // 결과 처리는 기존과 동일
            if (type === 'order') {
                currentOrderFileId = cachedFileResult.fileId;
                orderFileHeaders = cachedFileResult.headers;
            } else {
                currentSupplierFileId = cachedFileResult.fileId;
                supplierFileHeaders = cachedFileResult.headers;
            }
            
            showUploadResult(cachedFileResult, type);
            
            // 📊 서버 사용량 동기화 (백그라운드, 비동기) - 에러는 내부에서 처리됨
            try {
                syncUsageWithServer('fileUpload', true, {
                    fileName: file.name,
                    fileType: type,
                    cacheHit: true
                }).catch(() => {
                    // syncUsageWithServer는 이제 에러를 throw하지 않으므로 이 catch는 실행되지 않음
                });
            } catch (error) {
                // 혹시나 하는 추가 안전장치
                console.warn('⚠️ 사용량 동기화 호출 실패 (무시됨):', error.message);
            }
            
            // 🔄 캐시된 파일이지만 헤더 정보가 없거나 불완전하다면 백그라운드에서 업데이트
            if (!hasCompleteCache) {
                debugLog('📤 헤더 정보 부족으로 백그라운드 업데이트 시작');
            } else {
                debugLog('✅ 완전한 캐시 발견 - 백그라운드 업데이트 생략');
            }
            
            if (!hasCompleteCache) {
                
                // 즉시 백그라운드에서 서버 업로드하여 실제 데이터 가져오기
                setTimeout(async () => {
                    try {
                
                        const formData = new FormData();
                        formData.append('orderFile', file);
                        
                        const response = await fetch('/api/orders/upload', {
                            method: 'POST',
                            body: formData
                        });
                        
                        const serverResult = await response.json();
                        if (serverResult.success && serverResult.headers && serverResult.headers.length > 0) {
                            // 헤더 정보를 전역 변수에 업데이트
                            if (type === 'order') {
                                orderFileHeaders = serverResult.headers;
                                
                                // 🔄 캐시된 주문서 파일도 매핑 완전 초기화 (발주서 파일은 유지)
                                console.log('🔄 캐시된 주문서 업로드 - 매핑 완전 초기화 (발주서 파일 유지)');
                                currentMapping = {}; // 매핑 규칙 초기화
                                backupMapping = null; // 백업 매핑도 초기화 (의도치 않은 복원 방지)
                                
                                // 매핑 관련 UI 상태 초기화
                                sessionStorage.setItem('mappingSaved', 'false');
                                
                                // 기존 발주서 파일이 있으면 자동으로 STEP 2로 이동
                                if (supplierFileHeaders?.length > 0) {
                                    console.log('✅ 캐시된 파일 - 기존 발주서 파일 있음, STEP 2로 자동 이동');
                                    setTimeout(() => {
                                        showStep(2);
                                        setupMapping();
                                    }, 1000); // 1초 후 이동
                                } else {
                                    // 발주서 파일이 없으면 안내 메시지 표시
                                    const targetFieldsContainer = document.getElementById('targetFields');
                                    if (targetFieldsContainer) {
                                        targetFieldsContainer.innerHTML = '<p style="color: #6c757d; font-style: italic;">새 주문서가 업로드되었습니다. 발주서 파일을 업로드해주세요.</p>';
                                    }
                                }
                            } else {
                                supplierFileHeaders = serverResult.headers;
                            }
                            
                            // 캐시도 업데이트
                            const existingMeta = localStorage.getItem(fileCache.metaPrefix + fileId);
                            if (existingMeta) {
                                const meta = JSON.parse(existingMeta);
                                meta.cachedHeaders = serverResult.headers;
                                meta.cachedTotalRows = serverResult.totalRows || 0;
                                meta.cachedValidation = serverResult.validation || { isValid: true };
                                localStorage.setItem(fileCache.metaPrefix + fileId, JSON.stringify(meta));
                            }
                            
                            // UI 업데이트
                            showUploadResult(serverResult, type);
                        
                        }
                    } catch (error) {
                        console.warn('⚠️ 백그라운드 헤더 갱신 실패:', error.message);
                    }
                }, 100);
                }
                
                // 업로드 완료 후 로직 실행
                handleUploadSuccess(type);
                updateUploadStatusAndButtons();
                isProcessing = false;
                return;
            } // else 블록 닫기
        }
        
        // 📤 2단계: 캐시에 없으면 서버 업로드 (네트워크 요청에만 타임아웃 적용)
        productionLog('📤 캐시에 없음, 서버 업로드 진행:', file.name);
        
        // 🔧 네트워크 요청용 AbortController 생성 (캐시 작업과 분리)
        currentUploadController = new AbortController();
        
        // 진행율 업데이트 (캐시 확인 후)
        updateProgress(22, `${type === 'order' ? '주문서' : '발주서'} 파일을 서버에 업로드 중...`);
        
        // 진행율 단계 정의 (95%까지만, 완료는 실제 응답 후)
        const progressSteps = [
            { percent: 30, message: '업로드 데이터 준비 중...' },
            { percent: 45, message: '서버로 파일 전송 중...' },
            { percent: 65, message: '서버에서 데이터 분석 중...' },
            { percent: 80, message: '파일 헤더 추출 중...' },
            { percent: 95, message: '최종 처리 중...' }
        ];
        
        const formData = new FormData();
        formData.append('orderFile', file);
        formData.append('fileType', type);
        
        // 🚀 스마트 진행바: 업로드 완료 시 즉시 완료 처리
        let progressCancelled = false;
        
        // 진행율 시뮬레이션 (95%까지, 중단 가능)
        const progressPromise = simulateProgress(progressSteps, 2000).then(() => {
            if (!progressCancelled) {
                return new Promise(resolve => {
                    const checkInterval = setInterval(() => {
                        if (progressCancelled) {
                            clearInterval(checkInterval);
                            resolve();
                        }
                    }, 100);
                });
            }
        });
        
        const uploadPromise = (async () => {
            try {
                const response = await fetch('/api/orders/upload', {
                    method: 'POST',
                    body: formData,
                    signal: currentUploadController.signal
                });
                
                // 🚀 업로드 완료 시 즉시 진행바 완료 처리
                progressCancelled = true;
                updateProgress(100, '✅ 업로드 완료!');
                
                return response;
            } catch (error) {
                // AbortError 처리 개선
                if (error.name === 'AbortError') {
                    throw new Error('⏰ 파일 업로드 시간이 초과되었습니다. 파일 크기가 크거나 네트워크가 불안정할 수 있습니다.');
                }
                throw error;
            }
        })();
        
        // 30초 타임아웃 설정 (네트워크 요청에만 적용)
        const timeoutId = setTimeout(() => {
            if (currentUploadController && !currentUploadController.signal.aborted) {
                console.log('⏰ 파일 업로드 타임아웃 (30초)');
                currentUploadController.abort();
            }
        }, 30000);
        
        // 업로드 완료만 기다림 (진행바는 자동으로 처리됨)
        const response = await uploadPromise;
        
        // 타임아웃 정리
        clearTimeout(timeoutId);
        
        // 🚫 사용량 제한 확인
        if (await handleRateLimitResponse(response)) {
            hideProgress();
            return;
        }
        
        const result = await response.json();
        
        if (result.success) {
            // 진행바는 이미 uploadPromise에서 100% 처리됨
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        hideProgress();
        
        if (result.success) {
            // 📁 3단계: 서버 업로드 성공 시 캐시에 저장 (로컬 fileId 사용)
            try {
                const cacheSuccess = await fileCache.cacheFile(file, fileId, type); // 🔧 파일 타입 추가
                
                if (cacheSuccess) {
                    // 헤더 및 미리보기 데이터도 캐시에 추가 저장
                    const extendedMetadata = {
                        cachedHeaders: result.headers || [],
                        cachedPreviewData: result.previewData || [],
                        cachedTotalRows: result.totalRows || 0,
                        cachedValidation: result.validation || { isValid: true }
                    };
                    
                    // 메타데이터 업데이트 (로컬 fileId 사용)
                    const existingMeta = localStorage.getItem(fileCache.metaPrefix + fileId);
                    if (existingMeta) {
                        const meta = JSON.parse(existingMeta);
                        Object.assign(meta, extendedMetadata);
                        localStorage.setItem(fileCache.metaPrefix + fileId, JSON.stringify(meta));
                        productionLog('✅ 서버 응답 데이터를 캐시에 추가 저장:', file.name);
                    }
                }
            } catch (cacheError) {
                console.warn('⚠️ 캐시 저장 실패 (무시됨):', cacheError.message);
            }
            
            // 파일 타입에 따라 저장
            if (type === 'order') {
                currentOrderFileId = result.fileId;
                orderFileHeaders = result.headers;
                
                // 🔄 새 주문서 업로드 시 매핑 완전 초기화 (발주서 파일은 유지)
                console.log('🔄 새 주문서 업로드 - 매핑 완전 초기화 (발주서 파일 유지)');
                currentMapping = {}; // 매핑 규칙 초기화
                backupMapping = null; // 백업 매핑도 초기화 (의도치 않은 복원 방지)
                
                // 매핑 관련 UI 상태 초기화
                sessionStorage.setItem('mappingSaved', 'false');
                
                // 기존 발주서 파일이 있으면 자동으로 STEP 2로 이동
                if (supplierFileHeaders?.length > 0) {
                    console.log('✅ 기존 발주서 파일 있음 - STEP 2로 자동 이동');
                    setTimeout(() => {
                        showStep(2);
                        setupMapping();
                    }, 1000); // 1초 후 이동
                } else {
                    // 발주서 파일이 없으면 안내 메시지 표시
                    const targetFieldsContainer = document.getElementById('targetFields');
                    if (targetFieldsContainer) {
                        targetFieldsContainer.innerHTML = '<p style="color: #6c757d; font-style: italic;">새 주문서가 업로드되었습니다. 발주서 파일을 업로드해주세요.</p>';
                    }
                }
            } else {
                currentSupplierFileId = result.fileId;
                supplierFileHeaders = result.headers;
                
                // 🔄 새 발주서 업로드 시에도 백업 매핑 초기화
                console.log('🔄 새 발주서 업로드 - 백업 매핑 초기화');
                console.log('📊 발주서 파일 정보:', {
                    파일ID: result.fileId,
                    헤더개수: result.headers ? result.headers.length : 0,
                    헤더목록: result.headers ? result.headers.slice(0, 3) : [],
                    한컴오피스: result.isHancomExcel || false,
                    구형파일변환: result.xlsConverted || false
                });
                backupMapping = null; // 의도치 않은 복원 방지
            }
            
            // 먼저 업로드 결과를 표시
            showUploadResult(result, type);
            
            // 업로드 완료 후 공통 로직 실행
            handleUploadSuccess(type);
            updateUploadStatusAndButtons();
            
        } else {
            console.error('서버 응답 오류:', result);
            
            // 서버에서 보낸 구체적인 오류 메시지 처리
            let errorMessage = result.error || '파일 업로드 중 오류가 발생했습니다.';
            
            // .xls 파일 관련 오류인 경우 친화적인 메시지로 변경
            if (errorMessage.includes('Can\'t find end of central directory') || 
                errorMessage.includes('ZIP') || 
                errorMessage.includes('BIFF') ||
                errorMessage.includes('구형 Excel 파일') ||
                errorMessage.includes('.xls 파일 처리 실패') ||
                errorMessage.includes('legacy-xls') ||
                result.fileType === 'legacy-xls' ||
                file.name.toLowerCase().endsWith('.xls')) {
                
                const fileName = file.name || result.fileName || '파일';
                
                // 서버에서 이미 .xlsx 처리를 시도했지만 실패한 경우
                if (errorMessage.includes('.xls 파일 처리 실패') || errorMessage.includes('.xlsx 확장자로 처리를 시도했지만')) {
                    errorMessage = `❌ .xls 파일 처리 실패<br><br>` +
                                `📁 <strong>파일명:</strong> ${fileName}<br><br>` +
                                `🔄 <strong>시도한 처리:</strong> 자동으로 .xlsx 형식으로 처리를 시도했습니다.<br><br>` +
                                `📋 <strong>해결 방법:</strong><br>` +
                                `1. Excel에서 해당 파일을 열어주세요<br>` +
                                `2. "파일 → 다른 이름으로 저장" 메뉴를 선택하세요<br>` +
                                `3. 파일 형식을 <strong>"Excel 통합 문서(*.xlsx)"</strong>로 저장하세요<br>` +
                                `4. 변환된 .xlsx 파일을 다시 업로드해주세요<br><br>` +
                                `💡 <strong>또는:</strong> Google Sheets에서 파일을 열고 .xlsx로 다운로드하세요`;
                } else {
                    errorMessage = `❌ 구형 Excel 파일(.xls)은 지원에 제한이 있습니다.<br><br>` +
                                `📁 <strong>파일명:</strong> ${fileName}<br><br>` +
                                `📋 <strong>해결 방법:</strong><br>` +
                                `1. Excel에서 해당 파일을 열어주세요<br>` +
                                `2. "파일 → 다른 이름으로 저장" 메뉴를 선택하세요<br>` +
                                `3. 파일 형식을 <strong>"Excel 통합 문서(*.xlsx)"</strong>로 변경하세요<br>` +
                                `4. 변환된 .xlsx 파일을 다시 업로드해주세요<br><br>` +
                                `💡 <strong>또는:</strong> Google Sheets에서 파일을 열고 .xlsx로 다운로드하세요<br><br>` +
                                `✅ 최신 Excel 형식(.xlsx)을 사용하시면 안정적으로 업로드됩니다.`;
                }
            }
            
            // 해당 업로드 영역에 오류 메시지 표시
            showUploadResult(null, type, true, errorMessage);
        }
        
        // 처리 완료 후 상태 초기화
        isProcessing = false;
        currentUploadController = null;
        
    } catch (error) {
        hideProgress();
        console.error('업로드 오류:', error);
        
        // 타임아웃 정리 (존재하는 경우)
        if (typeof timeoutId !== 'undefined') {
            clearTimeout(timeoutId);
        }
        
        // 처리 상태 초기화
        isProcessing = false;
        currentUploadController = null;
        
        // 요청 취소 오류인 경우 조용히 처리 (사용자에게 알리지 않음)
        if (error.name === 'AbortError') {
            console.log('업로드 요청이 취소되었습니다.');
            // AbortError는 의도적인 취소이므로 별도 알림 없이 조용히 처리
            return;
        }
        
        // catch 블록의 오류도 해당 업로드 영역에 표시
        showUploadResult(null, type, true, '파일 업로드 중 오류가 발생했습니다.');
    }
}

// 업로드 결과 표시 (성공 및 실패 케이스 모두 처리)
function showUploadResult(result, type, isError = false, errorMessage = '') {
    const uploadResultId = type === 'order' ? 'uploadResultOrder' : 'uploadResultSupplier';
    const uploadAlertId = type === 'order' ? 'uploadAlertOrder' : 'uploadAlertSupplier';
    
    const uploadResult = document.getElementById(uploadResultId);
    const uploadAlert = document.getElementById(uploadAlertId);
    
    // 요소가 존재하지 않으면 기본 알림으로 대체
    if (!uploadResult || !uploadAlert) {
        const fileTypeText = type === 'order' ? '주문서' : '발주서';
        if (isError) {
            showStep1Alert('error', `❌ ${fileTypeText} 파일 업로드 실패: ${errorMessage}`);
        } else {
            // .xls 파일 변환 안내 메시지
            let xlsMessage = '';
            if (result.xlsConverted) {
                xlsMessage = ' (.xls → .xlsx 자동 변환됨)';
            }
            
            showStep1Alert('success', `✅ ${fileTypeText} 파일이 성공적으로 업로드되었습니다!${xlsMessage} (${result.headers.length}개 필드)`);
        }
        return;
    }
    
    uploadResult.classList.remove('hidden');
    uploadResult.classList.add('upload-result');
    
    const fileTypeText = type === 'order' ? '주문서' : '발주서';
    
    // 오류 케이스 처리
    if (isError) {
        // 실패한 파일의 상태 초기화
        if (type === 'order') {
            currentOrderFileId = null;
            orderFileHeaders = [];
        } else {
            currentSupplierFileId = null;
            supplierFileHeaders = [];
        }
        
        // STEP 2 숨기기 (두 파일이 모두 업로드되지 않았으므로)
        if (!currentOrderFileId || !currentSupplierFileId) {
            showStep(1);
            
            // 매핑 관련 상태 초기화
            currentMapping = {};
            
            // STEP 2 UI 완전히 초기화
            const step2 = document.getElementById('step2');
            if (step2) {
                step2.classList.add('hidden');
            }
            
            // 매핑 관련 컨테이너 초기화
            const sourceFieldsContainer = document.getElementById('sourceFields');
            const targetFieldsContainer = document.getElementById('targetFields');
            if (sourceFieldsContainer) sourceFieldsContainer.innerHTML = '';
            if (targetFieldsContainer) {
                const targetFields = targetFieldsContainer.querySelectorAll('.field-item');
                targetFields.forEach(field => {
                    field.style.background = '';
                    field.style.color = '';
                    field.innerHTML = field.dataset.target;
                });
            }
        }
        
        // 업로드 상태 및 버튼 업데이트
        updateUploadStatusAndButtons();
        
        uploadAlert.innerHTML = `
            <div class="alert alert-error">
                ❌ ${fileTypeText} 파일 업로드 실패<br>
                <strong>오류:</strong> ${errorMessage}
                <div style="margin-top: 10px; padding: 8px; background-color: #f8f9fa; border-left: 4px solid #17a2b8; border-radius: 4px;">
                    💡 위의 ${fileTypeText} 업로드 영역에서 다른 파일을 선택해주세요.
                </div>
            </div>
        `;
        return;
    }
    
    // 성공 케이스 처리
    // 빈 템플릿 경고 확인
    const emptyTemplateWarning = result.validation.warnings.find(w => w.type === 'empty_template');
    
    if (result.validation.isValid) {
        // .xls 파일 변환 안내 메시지
        let xlsMessage = '';
        if (result.xlsConverted) {
            xlsMessage = `<div style="font-size: 0.9em; color: #666; margin-top: 5px;">🔄 자동 변환: .xls → .xlsx 형식으로 처리됨</div>`;
        }
        
        // 업로드 영역 숨기기
        const uploadAreaId = type === 'order' ? 'uploadAreaOrder' : 'uploadAreaSupplier';
        const uploadArea = document.getElementById(uploadAreaId);
        if (uploadArea) {
            uploadArea.style.display = 'none';
        }
        
        // 간결한 파일 상태 표시
        uploadAlert.innerHTML = `
            <div style="background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 8px; padding: 16px; margin: 10px 0;">
                <div style="display: flex; align-items: center; justify-content: space-between;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div style="color: #28a745; font-size: 1.2em;">✓</div>
                        <div>
                            <div style="font-weight: 600; color: #495057; margin-bottom: 2px;">${result.fileName}</div>
                            <div style="font-size: 0.85em; color: #6c757d;">
                                ${result.validation.validRows}/${result.validation.totalRows}행 · ${result.headers.length}개 필드 
                                ${result.fromCache ? '· 캐시됨' : ''}
                            </div>
                        </div>
                    </div>
                    <button onclick="changeFile('${type}')" style="background: #6c757d; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 0.85em;">
                        변경
                    </button>
                </div>
                ${emptyTemplateWarning ? `
                <div style="margin-top: 12px; padding: 8px 12px; background: #fff3cd; border-left: 3px solid #ffc107; border-radius: 4px; font-size: 0.85em; color: #856404;">
                    ⚠️ ${emptyTemplateWarning.message}
                </div>
                ` : ''}
            </div>
        `;
    } else {
        // .xls 파일 변환 안내 메시지
        let xlsMessage = '';
        if (result.xlsConverted) {
            xlsMessage = `<div style="font-size: 0.9em; color: #666; margin-top: 5px;">🔄 자동 변환: .xls → .xlsx 형식으로 처리됨</div>`;
        }
        
        // 업로드 영역 숨기기
        const uploadAreaId = type === 'order' ? 'uploadAreaOrder' : 'uploadAreaSupplier';
        const uploadArea = document.getElementById(uploadAreaId);
        if (uploadArea) {
            uploadArea.style.display = 'none';
        }
        
        const validationMessages = result.validation.errors.map(error => `• ${error.message}`).join('<br>');
        
        // 간결한 파일 상태 표시 (경고 있음)
        uploadAlert.innerHTML = `
            <div style="background: #f8f9fa; border: 1px solid #ffc107; border-radius: 8px; padding: 16px; margin: 10px 0;">
                <div style="display: flex; align-items: center; justify-content: space-between;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div style="color: #ffc107; font-size: 1.2em;">⚠</div>
                        <div>
                            <div style="font-weight: 600; color: #495057; margin-bottom: 2px;">${result.fileName}</div>
                            <div style="font-size: 0.85em; color: #6c757d;">
                                ${result.validation.validRows}/${result.validation.totalRows}행 · ${result.headers.length}개 필드 
                                ${result.fromCache ? '· 캐시됨' : ''} · 경고 있음
                            </div>
                        </div>
                    </div>
                    <button onclick="changeFile('${type}')" style="background: #6c757d; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 0.85em;">
                        변경
                    </button>
                </div>
                <div style="margin-top: 12px; padding: 8px 12px; background: #fff3cd; border-left: 3px solid #ffc107; border-radius: 4px; font-size: 0.85em; color: #856404;">
                    ⚠️ ${validationMessages}
                </div>
            </div>
        `;
    }
    
    // 빈 템플릿 경고가 있으면 추가 안내
    if (emptyTemplateWarning) {
        const existingAlert = uploadAlert.querySelector('.alert');
        if (existingAlert) {
            existingAlert.innerHTML += `
                <div style="margin-top: 10px; padding: 10px; background-color: #fff3cd; border: 1px solid #ffeaa7; border-radius: 4px;">
                    <strong>💡 템플릿 안내:</strong><br>
                    ${emptyTemplateWarning.message}
                </div>
            `;
        }
    }
    
    // 업로드 상태에 따른 안내 메시지 및 버튼 가시성 제어
    updateUploadStatusAndButtons();
    
    // 두 파일이 모두 업로드되었을 때 안내 메시지 추가 (성공 케이스에서만)
    if (!isError && currentOrderFileId && currentSupplierFileId) {
        // 양쪽 모두에 완료 메시지 추가
        const completeMessage = `
            <div class="alert alert-info" style="margin-top: 10px;">
                🎉 두 파일이 모두 업로드되었습니다. 필드 매칭을 설정해주세요.
            </div>
        `;
        
        const orderAlert = document.getElementById('uploadAlertOrder');
        const supplierAlert = document.getElementById('uploadAlertSupplier');
        
        if (orderAlert && !orderAlert.innerHTML.includes('두 파일이 모두 업로드되었습니다')) {
            orderAlert.innerHTML += completeMessage;
        }
        if (supplierAlert && !supplierAlert.innerHTML.includes('두 파일이 모두 업로드되었습니다')) {
            supplierAlert.innerHTML += completeMessage;
        }
    } else if (!isError && !currentOrderFileId && currentSupplierFileId) {
        // 발주서만 업로드된 경우 - 주문서 업로드 영역에 안내 메시지 표시
        const orderAlert = document.getElementById('uploadAlertOrder');
        // "두 파일이 모두 업로드되었습니다" 메시지가 이미 있는 경우 덮어쓰지 않음
        if (orderAlert && !orderAlert.innerHTML.includes('주문서를 업로드하거나') && !orderAlert.innerHTML.includes('두 파일이 모두 업로드되었습니다')) {
            orderAlert.innerHTML = `
                <div class="alert alert-info">
                    📝 주문서를 업로드해주세요.
                </div>
            `;
            
            // 주문서 업로드 결과 영역 표시
            const orderResult = document.getElementById('uploadResultOrder');
            if (orderResult) {
                orderResult.classList.remove('hidden');
            }
        }
        
        // 발주서 업로드 시 추가 경고 메시지는 제거 (주문서 영역에만 표시)
    }
}

// STEP 2에 헤더 로딩 상태 표시
function showHeaderLoadingState() {
    const sourceFieldsContainer = document.getElementById('sourceFields');
    const targetFieldsContainer = document.getElementById('targetFields');
    
    // 재시도 카운터 초기화 (깔끔한 상태에서 시작)
    window.orderHeaderRetryCount = 0;
    window.supplierHeaderRetryCount = 0;
    
    if (sourceFieldsContainer) {
        sourceFieldsContainer.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; color: #6c757d;">
                <div style="display: inline-block; width: 20px; height: 20px; border: 2px solid #007bff; border-top: 2px solid transparent; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 15px;"></div>
                <div style="font-size: 14px; font-weight: 500;">주문서 필드 정보를 불러오는 중...</div>
                <div style="font-size: 12px; color: #adb5bd; margin-top: 5px;">잠시만 기다려주세요</div>
            </div>
        `;
    }
    
    if (targetFieldsContainer) {
        targetFieldsContainer.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; color: #6c757d;">
                <div style="display: inline-block; width: 20px; height: 20px; border: 2px solid #28a745; border-top: 2px solid transparent; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 15px;"></div>
                <div style="font-size: 14px; font-weight: 500;">발주서 필드 정보를 불러오는 중...</div>
                <div style="font-size: 12px; color: #adb5bd; margin-top: 5px;">잠시만 기다려주세요</div>
            </div>
        `;
    }
}

// 헤더 로딩을 기다린 후 매핑 설정
async function waitForHeadersAndSetupMapping() {

    
    const maxWaitTime = 10000; // 10초 최대 대기
    const checkInterval = 500; // 0.5초마다 체크
    let waited = 0;
    
    while (waited < maxWaitTime) {
        // 헤더가 둘 다 있는지 확인
        const hasOrderHeaders = orderFileHeaders && orderFileHeaders.length > 0;
        const hasSupplierHeaders = supplierFileHeaders && supplierFileHeaders.length > 0;
        

        
        if (hasOrderHeaders && hasSupplierHeaders) {
        
            setupMapping();
            return;
        }
        
        // 0.5초 대기
        await new Promise(resolve => setTimeout(resolve, checkInterval));
        waited += checkInterval;
    }
    
    // 타임아웃 발생 시에도 매핑 설정 시도
    console.log('⚠️ 헤더 로딩 타임아웃, 매핑 설정 강제 시작');
    setupMapping();
}

// 매핑 설정
function setupMapping() {
    console.log('🎯 setupMapping 호출됨');
    
    // 🔄 헤더 재시도 카운터 초기화 (115% 방지)
    window.orderHeaderRetryCount = 0;
    window.supplierHeaderRetryCount = 0;
    
    // 현재 작업 모드 확인
    const currentMode = window.currentWorkMode || 'fileUpload';

    
    // 파일 업로드 모드인 경우에만 파일 체크
    if (currentMode === 'fileUpload') {
        if (!currentOrderFileId) {
            console.warn('⚠️ 주문서 파일이 업로드되지 않았습니다.');
            showStep2Alert('warning', '주문서 파일을 먼저 업로드해주세요.');
            return;
        }
        
        if (!currentSupplierFileId) {
            console.warn('⚠️ 발주서 파일이 업로드되지 않았습니다.');
            showStep2Alert('warning', '발주서 파일을 먼저 업로드해주세요.');
            return;
        }
    }
    
    // 직접 입력 또는 템플릿 모드인 경우 필드 헤더가 있는지 확인

    
    // 파일 업로드 모드가 아닌 경우에만 헤더 체크
    if (currentMode !== 'fileUpload' && (!orderFileHeaders || orderFileHeaders.length === 0)) {
        console.warn('⚠️ 주문서 필드 데이터가 없습니다.');
        showStep2Alert('warning', '주문서 데이터를 먼저 입력해주세요.');
        return;
    }
    
    // 파일 업로드 모드가 아닌 경우에만 발주서 헤더 체크
    if (currentMode !== 'fileUpload' && (!supplierFileHeaders || supplierFileHeaders.length === 0)) {
        console.warn('⚠️ 발주서 필드 데이터가 없습니다.');
        if (currentMode === 'directInput') {
            showStep2Alert('warning', '오른쪽 발주서 파일을 업로드해주세요. 업로드된 발주서의 양식에 맞춰 변환됩니다.');
        } else {
            showAlert('warning', '발주서 템플릿이 설정되지 않았습니다.');
        }
        return;
    }
    
    try {
        // 🔄 AI 매핑 상태 초기화 (버튼 상태 리셋)
        aiMappingExecuted = false;
        
        // 소스 필드 초기화 - 주문서 필드만
        const sourceFieldsContainer = document.getElementById('sourceFields');
        if (!sourceFieldsContainer) {
            throw new Error('sourceFields 요소를 찾을 수 없습니다.');
        }
        sourceFieldsContainer.innerHTML = '';
        
        // 주문서 필드 추가
    
        if (orderFileHeaders && orderFileHeaders.length > 0) {
            // 헤더가 성공적으로 로드되면 재시도 카운터 리셋
            window.orderHeaderRetryCount = 0;
            orderFileHeaders.forEach(header => {
                const fieldDiv = document.createElement('div');
                fieldDiv.className = 'field-item';
                fieldDiv.textContent = header;
                fieldDiv.dataset.source = header;
                fieldDiv.dataset.fileType = 'order';
                fieldDiv.onclick = () => selectSourceField(fieldDiv);
                sourceFieldsContainer.appendChild(fieldDiv);
            });
        
        } else {
            // 파일 업로드 모드에서 헤더가 아직 로드되지 않은 경우
            if (currentMode === 'fileUpload' && currentOrderFileId) {
                // 🚨 115% 버그 방지: 기존 진행률 완전히 숨기기
                hideProgress();
                
                // 첫 로딩인지 재시도인지 확인
                const isFirstLoad = (window.orderHeaderRetryCount || 0) === 0;
                
                // 재시도 횟수 증가
                window.orderHeaderRetryCount = (window.orderHeaderRetryCount || 0) + 1;
                
                if (window.orderHeaderRetryCount <= 5) { // 최대 5번까지만 재시도
                    // 첫 번째 시도인 경우에만 로딩바 표시 (showHeaderLoadingState와 중복 방지)
                    if (window.orderHeaderRetryCount === 1) {
                        // showHeaderLoadingState에서 이미 로딩 상태를 표시했으므로 건너뜀
                        console.log(`⏳ 주문서 헤더 로딩 중... (초기 로딩)`);
                    } else {
                        // 재시도 시에만 진행률 표시
                        sourceFieldsContainer.innerHTML = createHeaderLoadingProgress('order', window.orderHeaderRetryCount, 5);
                        console.log(`⏳ 주문서 헤더 로딩 중... (${window.orderHeaderRetryCount}/5)`);
                    }
                    
                    // 첫 로딩은 1.5초, 재시도는 3초 후
                    const retryDelay = isFirstLoad ? 1500 : 3000;
                    
                    // 자동 재시도 (안전장치 추가)
                    setTimeout(() => {
                        // 🛡️ 안전장치: 기본 조건만 체크 (workMode 체크 제거)
                        console.log('🔍 주문서 재시도 조건 체크:', {
                            orderFileHeadersLength: orderFileHeaders?.length || 0,
                            currentOrderFileId: !!currentOrderFileId,
                            retryCount: window.orderHeaderRetryCount,
                            currentWorkMode: window.currentWorkMode
                        });
                        
                        if ((!orderFileHeaders || orderFileHeaders.length === 0) && 
                            currentOrderFileId && 
                            window.orderHeaderRetryCount < 5) {
                            
                            console.log(`⏳ ${retryDelay/1000}초 후 자동 재시도... (${window.orderHeaderRetryCount + 1}/5)`);
                            setupMapping();
                        } else {
                            console.log('🛡️ 주문서 재시도 조건 불충족 - 재시도 중단');
                        }
                    }, retryDelay);
                } else {
                    // 재시도 횟수 초과 시 오류 메시지 표시
                    sourceFieldsContainer.innerHTML = `
                        <div style="padding: 20px; text-align: center; color: #dc3545;">
                            ❌ 주문서 헤더 로드에 실패했습니다.<br>
                            파일을 다시 업로드해주세요.<br>
                            <button onclick="restartFileUpload('order')" style="margin-top: 10px; background: #dc3545; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">
                                📄 파일 다시 업로드
                            </button>
                        </div>
                    `;
                    console.error('❌ 주문서 헤더 로드 최대 재시도 횟수 초과');
                }
            } else {
                console.warn('⚠️ 주문서 헤더가 비어있습니다.');
            }
        }
        
        // 타겟 필드 초기화 - 발주서 필드 또는 기본 템플릿
        const targetFieldsContainer = document.getElementById('targetFields');
        if (!targetFieldsContainer) {
            throw new Error('targetFields 요소를 찾을 수 없습니다.');
        }
        targetFieldsContainer.innerHTML = '';
        
        // 발주서 필드 추가 또는 기본 템플릿 사용
    
        if (supplierFileHeaders && supplierFileHeaders.length > 0) {
            // 헤더가 성공적으로 로드되면 재시도 카운터 리셋
            window.supplierHeaderRetryCount = 0;
            // 발주서 파일이 업로드된 경우
            supplierFileHeaders.forEach(header => {
                const fieldDiv = document.createElement('div');
            fieldDiv.className = 'field-item';
            fieldDiv.textContent = header;
            fieldDiv.dataset.target = header;
            fieldDiv.dataset.fileType = 'supplier';
            fieldDiv.onclick = () => selectTargetField(fieldDiv);
            targetFieldsContainer.appendChild(fieldDiv);
        });
    } else {
        // 파일 업로드 모드에서 발주서 파일이 있지만 헤더가 아직 로드되지 않은 경우
        if (currentMode === 'fileUpload' && currentSupplierFileId) {
            // 🚨 115% 버그 방지: 기존 진행률 완전히 숨기기
            hideProgress();
            
            // 첫 로딩인지 재시도인지 확인
            const isFirstLoad = (window.supplierHeaderRetryCount || 0) === 0;
            
            // 재시도 횟수 증가
            window.supplierHeaderRetryCount = (window.supplierHeaderRetryCount || 0) + 1;
            
            if (window.supplierHeaderRetryCount <= 5) { // 최대 5번까지만 재시도
                // 첫 번째 시도인 경우에만 로딩바 표시 (showHeaderLoadingState와 중복 방지)
                if (window.supplierHeaderRetryCount === 1) {
                    // showHeaderLoadingState에서 이미 로딩 상태를 표시했으므로 건너뜀
                    console.log(`⏳ 발주서 헤더 로딩 중... (초기 로딩)`);
                } else {
                    // 재시도 시에만 진행률 표시
                    targetFieldsContainer.innerHTML = createHeaderLoadingProgress('supplier', window.supplierHeaderRetryCount, 5);
                    console.log(`⏳ 발주서 헤더 로딩 중... (${window.supplierHeaderRetryCount}/5)`);
                }
                
                // 첫 로딩은 1.5초, 재시도는 3초 후
                const retryDelay = isFirstLoad ? 1500 : 3000;
                
                // 자동 재시도 (안전장치 추가)
                setTimeout(() => {
                    // 🛡️ 안전장치: 기본 조건만 체크 (workMode 체크 제거)
                    console.log('🔍 재시도 조건 체크:', {
                        supplierFileHeadersLength: supplierFileHeaders?.length || 0,
                        currentSupplierFileId: !!currentSupplierFileId,
                        retryCount: window.supplierHeaderRetryCount,
                        currentWorkMode: window.currentWorkMode
                    });
                    
                    if ((!supplierFileHeaders || supplierFileHeaders.length === 0) && 
                        currentSupplierFileId && 
                        window.supplierHeaderRetryCount < 5) {
                        
                        console.log(`⏳ ${retryDelay/1000}초 후 자동 재시도... (${window.supplierHeaderRetryCount + 1}/5)`);
                        setupMapping();
                    } else {
                        console.log('🛡️ 재시도 조건 불충족 - 재시도 중단');
                    }
                }, retryDelay);
            } else {
                // 재시도 횟수 초과 시 오류 메시지 표시
                targetFieldsContainer.innerHTML = `
                    <div style="padding: 20px; text-align: center; color: #dc3545;">
                        ❌ 발주서 헤더 로드에 실패했습니다.<br>
                        파일을 다시 업로드해주세요.<br>
                        <button onclick="restartFileUpload('supplier')" style="margin-top: 10px; background: #dc3545; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">
                            📄 파일 다시 업로드
                        </button>
                    </div>
                `;
                console.error('❌ 발주서 헤더 로드 최대 재시도 횟수 초과');
            }
        } else {
            // 🚫 기본 템플릿은 오직 "기본 템플릿 사용" 모드에서만 사용
            if (window.currentWorkMode === 'defaultTemplate') {
                // 기본 템플릿 모드에서만 기본 템플릿 사용
                const defaultTemplate = getDefaultSupplierTemplate();
                defaultTemplate.forEach(field => {
                    const fieldDiv = document.createElement('div');
                    fieldDiv.className = 'field-item';
                    fieldDiv.textContent = field;
                    fieldDiv.dataset.target = field;
                    fieldDiv.dataset.fileType = 'default';
                    fieldDiv.onclick = () => selectTargetField(fieldDiv);
                    targetFieldsContainer.appendChild(fieldDiv);
                });
                
                // 기본 템플릿 사용 안내
                const infoDiv = document.createElement('div');
                infoDiv.style.cssText = `
                    background: #e3f2fd;
                    color: #1976d2;
                    padding: 10px;
                    border-radius: 6px;
                    margin-bottom: 10px;
                    font-size: 0.9em;
                    text-align: center;
                `;
                infoDiv.innerHTML = '📋 기본 발주서 템플릿을 사용합니다';
                targetFieldsContainer.insertBefore(infoDiv, targetFieldsContainer.firstChild);
            } else {
                // 파일 업로드 모드에서는 발주서 파일 업로드 요구
                targetFieldsContainer.innerHTML = `
                    <div style="padding: 30px; text-align: center; color: #dc3545; background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 8px;">
                        <div style="font-size: 2em; margin-bottom: 15px;">📋</div>
                        <h4 style="color: #721c24; margin-bottom: 10px;">발주서 파일이 필요합니다</h4>
                        <p style="margin-bottom: 0;">발주서 생성을 위해 발주서 엑셀 파일을 업로드해주세요.</p>
                    </div>
                `;
            }
        }
    }
    
    // 타겟 필드 초기화 (이전 매핑 상태 제거)
    resetTargetFields();
    
    // 타겟 필드 클릭 이벤트
    document.querySelectorAll('#targetFields .field-item').forEach(item => {
        item.onclick = () => selectTargetField(item);
    });
    
        // 매핑 상태 초기화
        sessionStorage.setItem('mappingSaved', 'false');
        
        // 버튼 상태 초기화
        updateSaveMappingButton();
        updateGenerateOrderButton();
        
        // 🔄 AI 버튼 상태 즉시 업데이트 (API 키 보유 시)
        if (window.hasOpenAIKey) {
            updateAIFeatureButtons(true);
        }
        
        // 디버깅: setupMapping 완료 시 currentMapping 상태 확인
        console.log('✅ setupMapping 완료 - currentMapping 상태:', Object.keys(currentMapping).length > 0 ? currentMapping : '비어있음');
    
    } catch (error) {
        console.error('❌ setupMapping 함수 오류:', error);
        showAlert('error', '매칭 설정 중 오류가 발생했습니다: ' + error.message);
    }
}

// 업로드 영역에 경고 메시지 표시
function showUploadWarning(type, message) {
    const uploadResultId = type === 'order' ? 'uploadResultOrder' : 'uploadResultSupplier';
    const uploadAlertId = type === 'order' ? 'uploadAlertOrder' : 'uploadAlertSupplier';
    
    const uploadResult = document.getElementById(uploadResultId);
    const uploadAlert = document.getElementById(uploadAlertId);
    
    const fileTypeText = type === 'order' ? '주문서' : '발주서';
    
    if (uploadResult && uploadAlert) {
        uploadResult.classList.remove('hidden');
        uploadAlert.innerHTML = `
            <div class="alert alert-warning">
                ${message}
                <div style="margin-top: 10px; padding: 8px; background-color: #f8f9fa; border-left: 4px solid #ffc107; border-radius: 4px;">
                    💡 다른 ${fileTypeText} 파일을 사용하려면 위의 업로드 영역을 이용해주세요.
                </div>
            </div>
        `;
    } else {
        // 요소가 없으면 전역 알림으로 대체
        showAlert('warning', message);
    }
}

// 업로드 상태에 따른 버튼 가시성 제어
function updateUploadStatusAndButtons() {
    const directInputButtonContainer = document.getElementById('directInputButtonContainer');
    
    if (!directInputButtonContainer) return;
    
    // 주문서 파일이 업로드되지 않은 경우에만 직접 입력 버튼 표시
    if (!currentOrderFileId) {
        directInputButtonContainer.style.display = 'block';
        
        // 발주서 파일만 업로드된 경우 버튼 텍스트 변경
        const button = directInputButtonContainer.querySelector('button');
        if (currentSupplierFileId) {
            button.innerHTML = '📝 주문서 없이 직접 입력하기 (발주서 파일 준비됨)';
            button.style.background = 'linear-gradient(135deg, #28a745 0%, #20c997 100%)';
        } else {
            button.innerHTML = '📝 주문서 없이 직접 입력하기';
            button.style.background = 'linear-gradient(135deg, #17a2b8 0%, #138496 100%)';
        }
    } else {
        directInputButtonContainer.style.display = 'none';
    }
}

// 소스 필드 선택
function selectSourceField(element) {
    document.querySelectorAll('#sourceFields .field-item').forEach(item => {
        item.classList.remove('selected');
    });
    element.classList.add('selected');
}

// 타겟 필드 선택 및 매핑
function selectTargetField(element) {
    const targetField = element.dataset.target;
    
    // 이미 매핑된 필드인지 확인 (매핑 취소 기능)
    if (currentMapping[targetField]) {
        // 매핑 취소
        const sourceField = currentMapping[targetField];
        delete currentMapping[targetField];
        
        // 타겟 필드 원래대로 복원
        element.style.background = '';
        element.style.color = '';
        element.innerHTML = targetField;
        
        // 소스 필드를 다시 SOURCE FIELDS에 추가
        const sourceFieldsContainer = document.getElementById('sourceFields');
        const fieldDiv = document.createElement('div');
        fieldDiv.className = 'field-item';
        fieldDiv.textContent = sourceField;
        fieldDiv.dataset.source = sourceField;
        fieldDiv.onclick = () => selectSourceField(fieldDiv);
        sourceFieldsContainer.appendChild(fieldDiv);
        
        showStep2Alert('info', `${sourceField} → ${targetField} 매칭이 취소되었습니다.`);
        
        // 버튼 상태 업데이트
        updateSaveMappingButton();
        updateGenerateOrderButton();
        return;
    }
    
    // 새로운 매핑 생성
    const selectedSource = document.querySelector('#sourceFields .field-item.selected');
    
    if (!selectedSource) {
        showStep2Alert('warning', '먼저 주문서 컬럼을 선택해주세요.');
        return;
    }
    
    const sourceField = selectedSource.dataset.source;
    
    // 매핑 저장
    currentMapping[targetField] = sourceField;
    console.log(`👆 수동 매핑 추가: ${targetField} ← ${sourceField}`);
    
    // 시각적 표시
    element.style.background = '#28a745';
    element.style.color = 'white';
    element.innerHTML = `${targetField} ← ${sourceField}`;
    
    // 선택된 소스 필드 제거
    selectedSource.remove();
    
            showStep2Alert('success', `${sourceField} → ${targetField} 매칭이 완료되었습니다.`);
    
    // 버튼 상태 업데이트
    updateSaveMappingButton();
    updateGenerateOrderButton();
}

// GENERATE ORDER 버튼 상태 업데이트 (모든 발주서 생성 버튼)
function updateGenerateOrderButton() {
    const generateBtns = document.querySelectorAll('button[onclick="generateOrder()"]');
    const isMappingSaved = sessionStorage.getItem('mappingSaved') === 'true';
    
    generateBtns.forEach(generateBtn => {
        if (isMappingSaved && Object.keys(currentMapping).length > 0) {
            // 활성화 상태 - 매칭저장 버튼과 동일한 스타일
            generateBtn.disabled = false;
            generateBtn.style.opacity = '1';
            generateBtn.style.cursor = 'pointer';
            generateBtn.style.background = 'linear-gradient(135deg, #007bff 0%, #0056b3 100%)';
            generateBtn.title = '발주서 생성을 시작합니다';
        } else {
            // 비활성화 상태 - 매칭저장 버튼과 동일한 회색 스타일
            generateBtn.disabled = true;
            generateBtn.style.opacity = '0.5';
            generateBtn.style.cursor = 'not-allowed';
            generateBtn.style.background = 'linear-gradient(135deg, #6c757d 0%, #868e96 100%)';
            generateBtn.title = '매칭을 먼저 저장해주세요';
        }
    });
}

// 매칭저장 버튼 상태 업데이트 (단순 버전 - 토글 기능 제거)
function updateSaveMappingButton() {
    const saveMappingBtn = document.getElementById('saveMappingBtn');
    
    if (!saveMappingBtn) return;
    
    // 매핑된 내역이 하나라도 있으면 활성화, 없으면 비활성화
    if (Object.keys(currentMapping).length > 0) {
        saveMappingBtn.disabled = false;
        saveMappingBtn.style.opacity = '1';
        saveMappingBtn.style.cursor = 'pointer';
        saveMappingBtn.innerHTML = '매칭저장';
        saveMappingBtn.style.background = 'linear-gradient(135deg, #28a745 0%, #20c997 100%)';
        saveMappingBtn.title = '현재 매칭 규칙을 저장합니다';
    } else {
        // 매핑이 없으면 비활성화
        saveMappingBtn.disabled = true;
        saveMappingBtn.style.opacity = '0.5';
        saveMappingBtn.style.cursor = 'not-allowed';
        saveMappingBtn.innerHTML = '매칭저장';
        saveMappingBtn.style.background = 'linear-gradient(135deg, #6c757d 0%, #868e96 100%)';
        saveMappingBtn.title = '매칭을 먼저 진행해주세요';
    }
}

// 📋 AI 자동 매칭 토글
async function toggleAIMapping() {

    
    const aiButton = document.getElementById('aiMappingBtn');
    
    // 버튼이 비활성화된 경우 실행하지 않음
    if (aiButton && aiButton.disabled) {
        // console.log('⚠️ AI 자동매칭 버튼이 비활성화되어 있습니다.'); // Production: 로그 제거
        return;
    }
    

    
    // API 키 체크
    if (!window.hasOpenAIKey) {
        console.log('❌ API 키 없음');
        showAlert('warning', '🤖 AI 자동 매칭 기능을 사용하려면 OpenAI API 키가 필요합니다.\n\n💡 대신 수동으로 드래그앤드롭 매칭을 사용하거나 저장된 템플릿을 이용해보세요!');
        return;
    }
    
    if (!aiMappingExecuted) {
        // AI 자동매칭 실행
        console.log('🤖 AI 자동매칭 실행');
        
        // 현재 매칭 상태 백업
        backupMapping = JSON.parse(JSON.stringify(currentMapping));
        console.log('💾 매칭 상태 백업 완료:', backupMapping);
        
        // 버튼 상태 변경
        aiButton.innerHTML = 'AI 자동매칭 취소';
        aiButton.style.background = 'linear-gradient(135deg, #dc3545 0%, #c82333 100%)';
        aiButton.title = 'AI 자동매칭을 취소하고 이전 상태로 돌아갑니다';
        
        // AI 매핑 실행
        try {
            await aiAutoMapping();
            aiMappingExecuted = true;
        
        } catch (error) {
            // AI 매핑 실패 시 원래 상태로 복원
            console.error('❌ AI 자동매칭 실패:', error);
            restoreAIMapping();
        }
        
    } else {
        // AI 자동매칭 취소

        restoreAIMapping();
    }
}

// 📋 AI 자동매칭 상태 복원
function restoreAIMapping() {
    const aiButton = document.getElementById('aiMappingBtn');
    
    if (backupMapping) {
        // 백업된 매칭 상태로 복원
        currentMapping = JSON.parse(JSON.stringify(backupMapping));
        
        // 드래그앤드롭 UI 복원 (임시 비활성화 - 의도치 않은 매핑 방지)
        // restoreMappingUI();
        

        showStep2Alert('info', 'AI 자동매칭이 취소되었습니다. 이전 매칭 상태로 돌아갔습니다.');
    } else {
        // 백업이 없으면 매칭 초기화
        currentMapping = {};
        clearAllMappings();

        showStep2Alert('info', 'AI 자동매칭이 취소되었습니다. 매칭이 초기화되었습니다.');
    }
    
    // 버튼 상태 복원
    if (aiButton) {
        aiButton.innerHTML = 'AI 자동매칭';
        aiButton.style.background = 'linear-gradient(135deg, #6f42c1 0%, #5a32a3 100%)';
        aiButton.title = 'AI가 자동으로 필드를 매핑합니다';
    }
    
    // 상태 변수 초기화
    aiMappingExecuted = false;
    backupMapping = null;
}

// AI 자동 매핑 실행
async function aiAutoMapping() {
    // OpenAI API 키 체크
    if (!window.hasOpenAIKey) {
        showAlert('warning', '🤖 AI 자동 매칭 기능을 사용하려면 OpenAI API 키가 필요합니다.\n\n💡 대신 수동으로 드래그앤드롭 매칭을 사용하거나 저장된 템플릿을 이용해보세요!');
        return;
    }
    
    const isDirectMode = window.isDirectInputMode === true;
    
    // 디버깅: 현재 상태 확인
    // AI 자동 매칭 시작
    
    // 주문서 필드가 없으면 중단
    if (orderFileHeaders.length === 0) {
        showAlert('warning', '주문서 데이터가 필요합니다.');
        return;
    }
    
    // 🚫 기본 템플릿은 오직 "기본 템플릿 사용" 모드에서만 사용
    if (supplierFileHeaders.length === 0 && !currentSupplierFileId) {
        // 파일 업로드 모드에서는 발주서 파일이 반드시 필요
        if (window.currentWorkMode === 'defaultTemplate') {
            // 기본 템플릿 모드에서만 기본 템플릿 사용
            supplierFileHeaders = getDefaultSupplierTemplate();
            // setupMapping 다시 호출하여 UI 업데이트
            setupMapping();
        } else {
            // 파일 업로드 모드에서는 발주서 파일 업로드 요구
            console.log('⚠️ 파일 업로드 모드 - 발주서 파일이 필요함');
            const targetFieldsContainer = document.getElementById('targetFields');
            if (targetFieldsContainer) {
                targetFieldsContainer.innerHTML = '<p style="color: #dc3545; font-weight: bold; text-align: center; padding: 20px;">📋 발주서 파일을 업로드해주세요</p>';
            }
            return; // 더 이상 진행하지 않음
        }
    } else if (supplierFileHeaders.length === 0 && currentSupplierFileId) {
        console.log('⚠️ supplier 파일은 업로드되었으나 헤더가 없음. 파일을 다시 읽어야 함');
        
    }
    
    try {
        // 🚫 이전 진행바 완전히 숨기기 (115% 방지)
        hideProgress();
        await new Promise(resolve => setTimeout(resolve, 50)); // 짧은 딜레이
        
        const progressMessage = isDirectMode ? 
            'AI가 직접 입력 데이터와 발주서 템플릿을 분석하고 자동 매칭을 생성하고 있습니다...' :
            'AI가 필드를 분석하고 자동 매칭을 생성하고 있습니다...';
        
        showProgress(progressMessage);
        
        // 진행율 단계 정의
        const progressSteps = isDirectMode ? [
            { percent: 20, message: '직접 입력 데이터를 분석하고 있습니다...' },
            { percent: 40, message: 'AI 모델에 요청을 전송하고 있습니다...' },
            { percent: 60, message: '발주서 템플릿과 최적의 매칭을 찾고 있습니다...' },
            { percent: 80, message: '매칭 결과를 처리하고 있습니다...' },
            { percent: 95, message: '매칭 결과를 UI에 적용하고 있습니다...' }
        ] : [
            { percent: 20, message: '필드 목록을 분석하고 있습니다...' },
            { percent: 40, message: 'AI 모델에 요청을 전송하고 있습니다...' },
            { percent: 60, message: '최적의 매칭을 찾고 있습니다...' },
            { percent: 80, message: '매칭 결과를 처리하고 있습니다...' },
            { percent: 95, message: '매칭 결과를 UI에 적용하고 있습니다...' }
        ];
        
        const requestData = {
            orderFields: orderFileHeaders,
            supplierFields: supplierFileHeaders
        };
        
    
        
        // 진행률 시뮬레이션 시작 (백그라운드)
        let progressCompleted = false;
        const progressPromise = simulateProgress(progressSteps, 3000).then(() => {
            progressCompleted = true;
        });
        
        // 실제 API 호출
        console.log('🚀 AI 매핑 API 호출 시작:', requestData);
        
        // 타임아웃 설정 (60초)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);
        
        let result;
        try {
            const response = await fetch('/api/orders/ai-mapping', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestData),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            console.log('✅ AI 매핑 서버 응답 받음:', response.status, response.statusText);
            
            // 인증 오류 확인
            if (response.status === 401) {
                hideProgress();
                showAlert('warning', '🔐 OpenAI API 키 인증이 필요합니다. 인증 페이지로 이동합니다.');
                setTimeout(() => {
                    window.location.href = '/auth.html';
                }, 2000);
                return;
            }
            
            // 🚫 사용량 제한 확인 (429 오류)
            if (response.status === 429) {
                const errorData = await response.json().catch(() => ({ error: '하루 AI 자동 매핑 횟수를 모두 사용했습니다.' }));
                throw new Error(errorData.error || '하루 AI 자동 매핑 횟수를 모두 사용했습니다.');
            }
            
            if (!response.ok) {
                throw new Error(`서버 오류: ${response.status} ${response.statusText}`);
            }
            
            result = await response.json();
            console.log('✅ AI 매핑 응답 파싱 완료:', result);
        } catch (error) {
            clearTimeout(timeoutId);
            console.error('❌ AI 매핑 fetch 오류:', error);
            hideProgress();
            
            // 인증 오류인 경우 처리
            if (error.name === 'AbortError') {
                showAlert('error', '⏰ AI 매핑 요청이 시간 초과되었습니다. 다시 시도해주세요.');
            } else {
                showAlert('error', 'AI 자동 매칭 중 오류가 발생했습니다. 수동으로 매칭해주세요.');
            }
            return;
        }
        
    
        
        if (result.success) {
            // 📊 AI 매핑 성공시 사용량 증가 (방안 3: 혼합 방식)
            usageManager.incrementUsage('aiMapping');
            
            // 📊 서버 사용량 동기화 (백그라운드, 비동기) - 에러는 내부에서 처리됨
            try {
                syncUsageWithServer('aiMapping', false, {
                    mappingsCount: Object.keys(result.mappings).length,
                    isDirectMode: isDirectMode
                });
            } catch (error) {
                // 혹시나 하는 추가 안전장치
                console.warn('⚠️ AI 매핑 사용량 동기화 호출 실패 (무시됨):', error.message);
            }
            
            // AI 매핑 결과 적용 (기존 매핑에 추가)
            applyAutoMapping(result.mappings);
            
            // 모든 작업 완료 후 100% 표시
            updateProgress(100, isDirectMode ? '직접 입력 데이터 자동 매칭이 완료되었습니다!' : '자동 매칭이 완료되었습니다!');
            
            // 0.2초 후 진행바 숨김
            setTimeout(() => {
                hideProgress();
            }, 200);
            
            const successMessage = isDirectMode ? 
                `✅ 직접 입력 데이터 AI 자동 매칭이 완료되었습니다! ${Object.keys(result.mappings).length}개의 필드가 매칭되었습니다.` :
                `✅ AI 자동 매칭이 완료되었습니다! ${Object.keys(result.mappings).length}개의 필드가 매칭되었습니다.`;
            
            showStep2Alert('success', successMessage);
            
            // 버튼 상태 업데이트 (매핑 저장 필요)
            sessionStorage.setItem('mappingSaved', 'false');
            updateSaveMappingButton();
            updateGenerateOrderButton();
            
        } else {
            // 실패 시에도 진행바 숨김
            hideProgress();
            
            // 인증이 필요한 경우 처리
            if (result.requireAuth) {
                showAlert('warning', '🔐 OpenAI API 키 인증이 필요합니다. 인증 페이지로 이동합니다.');
                setTimeout(() => {
                    window.location.href = '/auth.html';
                }, 2000);
            } else {
                showAlert('error', result.error || 'AI 자동 매칭에 실패했습니다.');
            }
        }
        
    } catch (error) {
        hideProgress();
        console.error('AI 자동 매칭 전체 오류:', error);
        showAlert('error', 'AI 자동 매칭 중 예상치 못한 오류가 발생했습니다.');
    }
}

// 매핑 상태 초기화
function resetMappingState() {
    // 기존 매핑 초기화
    currentMapping = {};
    
    // 모든 타겟 필드 초기화
    const targetFields = document.querySelectorAll('#targetFields .field-item');
    targetFields.forEach(field => {
        field.style.background = '';
        field.style.color = '';
        field.innerHTML = field.dataset.target;
    });
    
    // 소스 필드 다시 표시 (주문서 헤더가 있는 경우에만)
    const sourceFieldsContainer = document.getElementById('sourceFields');
    if (sourceFieldsContainer) {
        sourceFieldsContainer.innerHTML = '';
        
        if (orderFileHeaders && orderFileHeaders.length > 0) {
            orderFileHeaders.forEach(header => {
                const fieldDiv = document.createElement('div');
                fieldDiv.className = 'field-item';
                fieldDiv.textContent = header;
                fieldDiv.dataset.source = header;
                fieldDiv.dataset.fileType = 'order';
                fieldDiv.onclick = () => selectSourceField(fieldDiv);
                sourceFieldsContainer.appendChild(fieldDiv);
            });
        }
    }
}

// CSS 선택자용 특수문자 이스케이프 함수
function escapeSelector(str) {
    // 브라우저 내장 CSS.escape() 함수 사용 (더 안전)
    if (typeof CSS !== 'undefined' && CSS.escape) {
        return CSS.escape(str);
    }
    
    // 폴백: 수동 이스케이프 (CSS.escape가 없는 경우)
    return str.replace(/[!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~\s]/g, '\\$&');
}

// 자동 매핑 적용
function applyAutoMapping(mappings) {


    
    // 🚨 중요: supplierFileHeaders 순서에 따라 매핑 적용 (순서 보장)
    if (supplierFileHeaders && supplierFileHeaders.length > 0) {
    
        supplierFileHeaders.forEach(targetField => {
            const sourceField = mappings[targetField];
            if (sourceField) {
                // 매핑 저장
                currentMapping[targetField] = sourceField;
                console.log(`🔗 순서 보장 매핑: ${targetField} ← ${sourceField}`);
                
                // UI 업데이트 호출
                updateSingleMappingUI(targetField, sourceField);
            } else {
                console.log(`⚠️ ${targetField}에 대한 매핑이 없음`);
            }
        });
    } else {
        console.warn('⚠️ supplierFileHeaders가 없어서 기존 방식 사용 (순서 불보장)');
        Object.entries(mappings).forEach(([targetField, sourceField]) => {
            // 매핑 저장
            currentMapping[targetField] = sourceField;
            console.log(`🔗 기존 방식 매핑: ${targetField} ← ${sourceField}`);
            
            // UI 업데이트 호출
            updateSingleMappingUI(targetField, sourceField);
        });
    }
    


}

// UI 업데이트를 별도 함수로 분리 (단일 매핑용)
function updateSingleMappingUI(targetField, sourceField) {
    // 타겟 필드 시각적 업데이트 (안전한 검색)
    let targetElement = null;
    try {
        const escapedTargetField = escapeSelector(targetField);
        targetElement = document.querySelector(`[data-target="${escapedTargetField}"]`);
        //console.log(`🔍 타겟 필드 찾기 (CSS.escape): ${targetField}`, targetElement);
    } catch (e) {
        console.warn('CSS 선택자 오류, 대안 방법 사용:', e.message);
        // 대안: 모든 타겟 필드를 순회하며 직접 비교
        const allTargets = document.querySelectorAll('[data-target]');
        targetElement = Array.from(allTargets).find(el => 
            el.getAttribute('data-target') === targetField
        );
        //console.log(`🔍 타겟 필드 찾기 (직접 비교): ${targetField}`, targetElement);
    }
    
    if (targetElement) {
        targetElement.style.background = '#6f42c1';
        targetElement.style.color = 'white';
        targetElement.innerHTML = `${targetField} ← ${sourceField} 🤖`;
    } else {
        console.log(`❌ 타겟 필드를 찾을 수 없음: ${targetField}`);
    }
    
    // 소스 필드 제거 (안전한 검색)
    let sourceElement = null;
    try {
        const escapedSourceField = escapeSelector(sourceField);
        sourceElement = document.querySelector(`[data-source="${escapedSourceField}"]`);
        //console.log(`🔍 소스 필드 찾기 (CSS.escape): ${sourceField}`, sourceElement);
    } catch (e) {
        console.warn('CSS 선택자 오류, 대안 방법 사용:', e.message);
        // 대안: 모든 소스 필드를 순회하며 직접 비교
        const allSources = document.querySelectorAll('[data-source]');
        sourceElement = Array.from(allSources).find(el => 
            el.getAttribute('data-source') === sourceField
        );
        //console.log(`🔍 소스 필드 찾기 (직접 비교): ${sourceField}`, sourceElement);
    }
    
    if (sourceElement) {
        sourceElement.remove();
    } else {
        console.log(`❌ 소스 필드를 찾을 수 없음: ${sourceField}`);
    }
}

// 📋 매칭저장 (토글 기능 제거)
async function saveMapping() {
    console.log('💾 매칭저장 클릭됨');
    
    const saveButton = document.getElementById('saveMappingBtn');
    
    // 버튼이 비활성화된 경우 실행하지 않음
    if (saveButton && saveButton.disabled) {
        // console.log('⚠️ 매칭저장 버튼이 비활성화되어 있습니다.'); // Production: 로그 제거
        showStep2Alert('warning', '매칭된 필드가 없습니다. 먼저 필드 매칭을 진행해주세요.');
        return;
    }
    
    if (Object.keys(currentMapping).length === 0) {
        showStep2Alert('warning', '매칭 규칙을 설정해주세요.');
        return;
    }
    
    // 매핑 검증
    const validation = validateRequiredFields(currentMapping);
    if (!validation.isValid) {
        showStep2Alert('warning', validation.message);
        return;
    }
    
    // 매핑되지 않은 필드는 빈 값으로 처리 (자동입력 없음)
    const finalMapping = { ...currentMapping };
    const targetFields = document.querySelectorAll('#targetFields .field-item');
    
    targetFields.forEach(field => {
        const fieldName = field.dataset.target;
        if (!finalMapping[fieldName]) {
            // 매핑되지 않은 필드는 아예 포함하지 않음 (빈 값으로 처리)
            field.style.background = '#f8f9fa';
            field.style.color = '#6c757d';
            field.innerHTML = `${fieldName} (매칭 안됨)`;
        }
    });
    
    try {
        const mappingData = {
            mappingName: `mapping_${Date.now()}`,
            sourceFields: Object.values(finalMapping),
            targetFields: Object.keys(finalMapping),
            mappingRules: finalMapping
        };
        
    
        console.log('🔗 현재 매핑:', currentMapping);
        
        
        const response = await fetch('/api/orders/mapping', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(mappingData)
        });
        
        const result = await response.json();
        
        if (result.success) {
            // 전역 매핑 업데이트
            currentMapping = finalMapping;
            
            const mappedCount = Object.keys(finalMapping).length;
            const totalTargetFields = document.querySelectorAll('#targetFields .field-item').length;
            const unmappedCount = totalTargetFields - mappedCount;
            
            let message = `✅ 매핑 규칙이 저장되었습니다.`;
            if (mappedCount > 0) message += ` ${mappedCount}개 필드가 매칭되었습니다.`;
            if (unmappedCount > 0) message += ` ${unmappedCount}개 필드는 빈 값으로 처리됩니다.`;
            
            showStep2Alert('success', message);
            
            // 매핑 저장 상태 표시 및 매핑 ID 저장
            sessionStorage.setItem('mappingSaved', 'true');
            sessionStorage.setItem('savedMappingId', mappingData.mappingName);
            
            console.log('💾 매핑 ID 저장됨:', mappingData.mappingName);
            
            // 발주서 생성 버튼 활성화
            updateGenerateOrderButton();
            
        } else {
            showStep2Alert('error', result.error || '매칭 저장에 실패했습니다.');
        }
        
    } catch (error) {
        console.error('매핑 저장 오류:', error);
        showStep2Alert('error', '매칭 저장 중 오류가 발생했습니다.');
        throw error;
    }
}

// 📋 매칭저장 토글 관련 함수 제거됨

// 📋 드래그앤드롭 매칭 UI 복원
function restoreMappingUI() {
    
    // 백업된 매핑을 임시 저장
    const mappingToRestore = { ...currentMapping };
    
    // 1. UI만 초기화 (매핑 데이터는 보존)
    resetUIOnly();
    
    // 2. 매핑 데이터 복원
    currentMapping = mappingToRestore;
    
    // 3. 백업된 매핑에 따라 UI 다시 적용
    Object.keys(currentMapping).forEach(targetField => {
        const sourceField = currentMapping[targetField];
        
        if (sourceField && sourceField !== '') {
            // 타겟 필드 시각적 업데이트 (안전한 검색)
            let targetElement = null;
            try {
                const escapedTargetField = escapeSelector(targetField);
                targetElement = document.querySelector(`[data-target="${escapedTargetField}"]`);
            } catch (e) {
                console.warn('CSS 선택자 오류, 대안 방법 사용:', e.message);
                const allTargets = document.querySelectorAll('[data-target]');
                targetElement = Array.from(allTargets).find(el => 
                    el.getAttribute('data-target') === targetField
                );
            }
            
            if (targetElement) {
                targetElement.style.background = '#28a745';
                targetElement.style.color = 'white';
                targetElement.innerHTML = `${targetField} ← ${sourceField}`;
                
                //console.log(`🔗 매칭 복원: ${sourceField} → ${targetField}`);
            } else {
                console.warn(`❌ 타겟 필드를 찾을 수 없음: ${targetField}`);
            }
            
            // 소스 필드 제거 (안전한 검색)
            let sourceElement = null;
            try {
                const escapedSourceField = escapeSelector(sourceField);
                sourceElement = document.querySelector(`[data-source="${escapedSourceField}"]`);
            } catch (e) {
                console.warn('CSS 선택자 오류, 대안 방법 사용:', e.message);
                const allSources = document.querySelectorAll('[data-source]');
                sourceElement = Array.from(allSources).find(el => 
                    el.getAttribute('data-source') === sourceField
                );
            }
            if (sourceElement) {
                sourceElement.remove();
                console.log(`🗑️ 소스 필드 제거: ${sourceField}`);
            }
        }
    });
    
    // 4. 발주서 생성 버튼 상태 업데이트
    updateGenerateOrderButton();
    

}

// 📋 UI만 초기화 (매핑 데이터는 보존)
function resetUIOnly() {
    // 모든 타겟 필드 초기화
    const targetFields = document.querySelectorAll('#targetFields .field-item');
    targetFields.forEach(field => {
        field.style.background = '';
        field.style.color = '';
        field.innerHTML = field.dataset.target;
    });
    
    // 소스 필드 다시 표시 (주문서 헤더가 있는 경우에만)
    const sourceFieldsContainer = document.getElementById('sourceFields');
    if (sourceFieldsContainer) {
        sourceFieldsContainer.innerHTML = '';
        
        if (orderFileHeaders && orderFileHeaders.length > 0) {
            orderFileHeaders.forEach(header => {
                const fieldDiv = document.createElement('div');
                fieldDiv.className = 'field-item';
                fieldDiv.textContent = header;
                fieldDiv.dataset.source = header;
                fieldDiv.dataset.fileType = 'order';
                fieldDiv.onclick = () => selectSourceField(fieldDiv);
                sourceFieldsContainer.appendChild(fieldDiv);
            });
        }
    }
}

// 📋 모든 매칭 초기화
function clearAllMappings() {
    console.log('🧹 모든 매칭 초기화');
    
    // 1. 매핑 데이터 초기화
    currentMapping = {};
    
    // 2. 기존 resetMappingState 함수 사용 (이미 구현되어 있음)
    resetMappingState();
    
    // 3. 버튼 상태 업데이트
    updateSaveMappingButton();
    updateGenerateOrderButton();
    
}

// 발주서 생성
async function generateOrder() {
    // 직접 입력 모드 또는 파일 업로드 모드 확인
    const isDirectMode = window.isDirectInputMode === true;
    
    if (!isDirectMode && !currentOrderFileId) {
        showAlert('error', '주문서 파일이 업로드되지 않았습니다.');
        return;
    }
    
    // 🔍 발주서 파일 및 매핑 규칙 검증
    if (!isDirectMode && !currentSupplierFileId) {
        showAlert('warning', '새 주문서가 업로드되었습니다. 발주서 파일을 다시 업로드하고 매핑을 설정해주세요.');
        return;
    }
    
    // 매핑 규칙 존재 여부 확인
    if (!currentMapping || Object.keys(currentMapping).length === 0) {
        showAlert('warning', '필드 매핑이 설정되지 않았습니다. 주문서와 발주서 필드를 매핑해주세요.');
        return;
    }
    
    // 매핑이 저장되어 있는지 확인
    if (sessionStorage.getItem('mappingSaved') !== 'true') {
        showAlert('warning', '매칭을 먼저 저장해주세요.');
        return;
    }
    
    try {
        // 🚫 이전 진행바 완전히 숨기기 (115% 방지)
        hideProgress();
        await new Promise(resolve => setTimeout(resolve, 50)); // 짧은 딜레이
        
        // 진행률 표시 시작
        showProgress('발주서 생성을 준비하고 있습니다...');
        
        // 진행률 단계 정의 (95%까지만 시뮬레이션, 마지막 5%는 실제 완료 후)
        const progressSteps = [
            { percent: 15, message: '저장된 매핑 규칙을 불러오고 있습니다...' },
            { percent: 35, message: '파일 데이터를 읽고 있습니다...' },
            { percent: 55, message: '데이터를 변환하고 있습니다...' },
            { percent: 75, message: '발주서를 생성하고 있습니다...' },
            { percent: 95, message: '발주서 생성을 완료하고 있습니다...' }
        ];
        
        // 저장된 매핑 ID 가져오기 (sessionStorage에서)
        const savedMappingId = sessionStorage.getItem('savedMappingId');
        if (!savedMappingId) {
            showAlert('error', '저장된 매칭을 찾을 수 없습니다. 매칭을 다시 저장해주세요.');
            return;
        }
        
        let requestData, apiEndpoint;
        
        // 💡 STEP 2에서 입력한 수동 필드 데이터 확인
        const hasManualFieldsStep2 = manualFieldsDataStep2 && Object.keys(manualFieldsDataStep2).length > 0;
        
        if (isDirectMode) {
            // 직접 입력 모드에서 발주서 파일이 없으면 경고만 표시 (임시)
            if (!currentSupplierFileId) {
                console.warn('⚠️ 직접 입력 모드에서 발주서 파일이 없음 - 기본 템플릿 사용될 예정');
            }
            
            // 직접 입력 모드: generate-direct API 사용
            requestData = {
                mappingId: savedMappingId,
                inputData: window.directInputData,
                templateType: 'standard',
                supplierFileId: currentSupplierFileId,
                workMode: window.currentWorkMode || 'directInput', // 작업 모드 추가
                // 🔧 STEP 2 수동 필드 데이터 추가
                manualFields: hasManualFieldsStep2 ? manualFieldsDataStep2 : {}
            };
            apiEndpoint = '/api/orders/generate-direct';
            //console.log('📝 직접 입력 발주서 생성 시작');
            //console.log('📊 직접 입력 데이터:', window.directInputData);
            //console.log('📂 현재 supplierFileId:', currentSupplierFileId);
        } else {
            // 파일 업로드 모드: generate API 사용
            requestData = {
                fileId: currentOrderFileId,
                mappingId: savedMappingId,
                templateType: 'standard',
                supplierFileId: currentSupplierFileId,
                // 🔧 STEP 2 수동 필드 데이터 추가
                manualFields: hasManualFieldsStep2 ? manualFieldsDataStep2 : {}
            };
            apiEndpoint = '/api/orders/generate';
        
            //console.log('📂 파일 ID:', currentOrderFileId);
        }
        
        // 🔧 수동 필드 데이터 로그
        if (hasManualFieldsStep2) {
            //console.log('💾 STEP 2 수동 필드 데이터가 발주서 생성에 적용됩니다:', manualFieldsDataStep2);
            //console.log('📊 수동 필드 개수:', Object.keys(manualFieldsDataStep2).length);
        } else {
            //console.log('💭 STEP 2 수동 필드 데이터 없음 - 기본 매핑만 사용');
        }
        
        //console.log('🗂️ 저장된 매핑 ID:', savedMappingId);
        //console.log('🔗 현재 매핑 규칙:', currentMapping);
        
        // 🚀 스마트 진행바: 서버 작업 완료 시 즉시 100%로 
        let progressCancelled = false;
        
        // 진행률 시뮬레이션 시작 (95%까지, 중단 가능)
        const progressPromise = simulateProgress(progressSteps, 3500).then(() => {
            // 시뮬레이션이 끝까지 완료된 경우에만 (중단되지 않은 경우)
            if (!progressCancelled) {
                // 95%에서 대기 (서버 작업 완료 대기)
                return new Promise(resolve => {
                    const checkInterval = setInterval(() => {
                        if (progressCancelled) {
                            clearInterval(checkInterval);
                            resolve();
                        }
                    }, 100);
                });
            }
        });
        
        // 실제 API 호출
        const workPromise = (async () => {
            console.log('🔗 API 엔드포인트:', apiEndpoint);
            console.log('📤 요청 데이터:', requestData);
            
            // 타임아웃 설정 (60초)
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 60000);
            
            try {
                const response = await fetch(apiEndpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestData),
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                console.log('✅ 서버 응답 받음:', response.status, response.statusText);
                
                // 🚫 사용량 제한 확인 (429 오류)
                if (response.status === 429) {
                    const errorData = await response.json().catch(() => ({ error: '하루 발주서 생성 횟수를 모두 사용했습니다.' }));
                    throw new Error(errorData.error || '하루 발주서 생성 횟수를 모두 사용했습니다.');
                }
                
                if (!response.ok) {
                    throw new Error(`서버 오류: ${response.status} ${response.statusText}`);
                }
                
                const result = await response.json();
                console.log('✅ 응답 파싱 완료:', result);
                
                // 🚀 서버 작업 완료 시 즉시 진행바 완료 처리
                progressCancelled = true;
                updateProgress(100, '발주서 생성이 완료되었습니다! 🎉');
                
                return result;
            } catch (error) {
                clearTimeout(timeoutId);
                console.error('❌ fetch 오류:', error);
                throw error;
            }
        })();
        
        // 서버 작업 완료만 기다림 (진행바는 자동으로 처리됨)
        const result = await workPromise;
        
        // 100% 완료 표시를 잠깐 보여준 후 화면 전환
        await new Promise(resolve => setTimeout(resolve, 800)); // 0.8초 대기
        
        // 진행률 숨기기
        hideProgress();
        
        if (result.success) {
            // 📊 발주서 생성 성공시 사용량 증가 (방안 3: 혼합 방식)
            usageManager.incrementUsage('orderGeneration');
            
            // 📊 서버 사용량 동기화 (백그라운드, 비동기) - 에러는 내부에서 처리됨
            try {
                syncUsageWithServer('orderGeneration', false, {
                    generatedFile: result.generatedFile,
                    processedRows: result.processedRows
                });
            } catch (error) {
                // 혹시나 하는 추가 안전장치
                console.warn('⚠️ 발주서 생성 사용량 동기화 호출 실패 (무시됨):', error.message);
            }
            
            generatedFileName = result.generatedFile;
            displayFileName = result.displayFileName || result.userFriendlyFileName;
            showGenerateResult(result);
            showStep(3);
            showStep(4);
            
            // 🔒 발주서 생성 완료 후 매핑 관련 버튼들 비활성화
            disableMappingButtons();
            
            // STEP 3 (발주서 다운로드/미리보기) 영역으로 자동 스크롤
            setTimeout(() => {
                const step3Element = document.getElementById('step3');
                if (step3Element) {
                    step3Element.scrollIntoView({ 
                        behavior: 'smooth', 
                        block: 'start',
                        inline: 'nearest'
                    });
                }
            }, 800);
        } else {
            showStep3Alert('error', result.error || '발주서 생성에 실패했습니다.');
        }
        
    } catch (error) {
        hideProgress();
        console.error('발주서 생성 오류:', error);
        
        // AbortError 처리 (타임아웃)
        if (error.name === 'AbortError') {
            showStep3Alert('error', '⏰ 발주서 생성 시간이 초과되었습니다.\n\n파일 크기가 크거나 네트워크가 불안정할 수 있습니다.\n잠시 후 다시 시도해주세요.');
        } else if (error.message && error.message.includes('timeout')) {
            showStep3Alert('error', '⏰ 발주서 생성 시간이 초과되었습니다.\n\n파일 크기가 크거나 네트워크가 불안정할 수 있습니다.\n잠시 후 다시 시도해주세요.');
        } else {
            showStep3Alert('error', '발주서 생성 중 오류가 발생했습니다.\n\n' + (error.message || '알 수 없는 오류'));
        }
    }
}

// 발주서 생성 결과 표시
function showGenerateResult(result) {
    const generateResult = document.getElementById('generateResult');
    
    generateResult.innerHTML = `
        <div class="alert alert-success">
            ✅ 발주서가 성공적으로 생성되었습니다!<br>
            <strong>처리 결과:</strong> ${result.processedRows}/${result.processedRows}행 처리 완료<br>
            <strong>생성된 파일:</strong> ${result.generatedFile}
        </div>
        
        <div style="text-align: center; margin: 20px 0; display: grid; grid-template-columns: ${window.isTemplateMode ? '1fr 1fr' : '1fr 1fr 1fr'}; gap: 15px; width: 100%;">
            <a href="${result.downloadUrl}" class="btn" download onclick="trackFileDownload()" style="background: linear-gradient(135deg, #6f42c1 0%, #5a32a3 100%); color: white; padding: 12px 24px; font-size: 0.9em; font-weight: 600; text-decoration: none; box-shadow: 0 3px 8px rgba(111, 66, 193, 0.3); width: 100%;"> 다운받기</a>
            <button onclick="toggleFilePreview('${result.generatedFile}')" class="btn" style="background: linear-gradient(135deg, #17a2b8 0%, #138496 100%); color: white; padding: 12px 24px; font-size: 0.9em; font-weight: 600; width: 100%;"> 미리보기</button>
            ${window.isTemplateMode ? '' : '<button id="thirdStepButton" onclick="toggleTemplateSave()" class="btn" style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; padding: 12px 24px; font-size: 0.9em; font-weight: 600; width: 100%;"> 템플릿 저장</button>'}
        </div>
        
        <!-- 파일 미리보기 섹션 (기본적으로 숨김) -->
        <div id="filePreviewSection" class="hidden" style="margin: 20px 0; padding: 15px; background: linear-gradient(145deg, #f8f9fa 0%, #e9ecef 100%); border-radius: 8px; border: 1px solid #dee2e6;">
            <h5 style="color: #495057; margin-bottom: 15px; display: flex; align-items: center; justify-content: space-between;">
                <span>📋 생성된 파일 미리보기</span>
                <button onclick="loadFilePreview('${result.generatedFile}', 0, 5)" class="btn" style="background: #6c757d; color: white; padding: 5px 12px; font-size: 0.8em;">🔄 새로고침</button>
            </h5>
            <div id="filePreviewContent">
                <div style="text-align: center; color: #6c757d; padding: 20px;">
                    <div style="display: inline-block; width: 20px; height: 20px; border: 2px solid #6c757d; border-radius: 50%; border-top: 2px solid transparent; animation: spin 1s linear infinite; margin-right: 10px;"></div>
                    미리보기를 불러오고 있습니다...
                </div>
            </div>
        </div>
        
        <!-- 템플릿 저장 UI (기본적으로 숨김) -->
        <div id="templateSaveSection" class="hidden" style="margin-top: 20px; padding: 20px; background: linear-gradient(145deg, #e8f5e8 0%, #d4edda 100%); border-radius: 8px; border: 2px solid #28a745;">
            <h4 style="color: #155724; margin-bottom: 15px; text-align: center;">이 매칭을 템플릿으로 저장하시겠습니까?</h4>
            <p style="color: #155724; text-align: center; margin-bottom: 20px;">같은 형태의 주문서를 반복적으로 처리할 때 매칭 과정을 생략할 수 있습니다.</p>
            
            <!-- 쇼핑몰과 택배사 입력 -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px;">
                <div>
                    <label for="shoppingMallName" style="display: block; margin-bottom: 5px; font-weight: 600; color: #155724;">쇼핑몰 이름 <span style="color: #dc3545;">*</span></label>
                    <input type="text" id="shoppingMallName" placeholder="쿠팡, 11번가, 옥션..." style="width: 100%; padding: 8px; border: 1px solid #28a745; border-radius: 4px;" oninput="updateTemplateNamePreview()">
                </div>
                <div>
                    <label for="courierName" style="display: block; margin-bottom: 5px; font-weight: 600; color: #155724;">택배사 <span style="color: #dc3545;">*</span></label>
                    <input type="text" id="courierName" placeholder="CJ대한통운, 로젠택배..." style="width: 100%; padding: 8px; border: 1px solid #28a745; border-radius: 4px;" oninput="updateTemplateNamePreview()">
                </div>
            </div>
            
            <!-- 템플릿명 미리보기 -->
            <div style="margin-bottom: 15px; padding: 12px; background-color: #f8f9fa; border: 1px solid #dee2e6; border-radius: 4px;">
                <label style="display: block; margin-bottom: 5px; font-weight: 600; color: #495057; font-size: 0.9em;">템플릿명 미리보기:</label>
                <div id="templateNamePreview" style="font-family: monospace; color: #007bff; font-weight: 600; font-size: 1.1em; min-height: 20px;">쇼핑몰_택배사</div>
                <input type="hidden" id="templateName" />
            </div>
            
            <!-- 설명 입력 -->
            <div style="margin-bottom: 15px;">
                <label for="templateDescription" style="display: block; margin-bottom: 5px; font-weight: 600; color: #155724;">설명 (선택)</label>
                <input type="text" id="templateDescription" placeholder="템플릿 설명을 입력하세요" style="width: 100%; padding: 8px; border: 1px solid #28a745; border-radius: 4px;">
            </div>
            
            <div style="text-align: center;">
                <button onclick="saveCurrentMappingAsTemplate()" class="btn" style="background: #28a745; color: white; margin-right: 10px; padding: 12px 24px; font-size: 0.9em; font-weight: 600;">저장</button>
                <button onclick="hideTemplateSaveSection()" class="btn" style="background: #6c757d; color: white; padding: 12px 24px; font-size: 0.9em; font-weight: 600;">취소</button>
            </div>
            
            <div id="templateSaveResult" style="margin-top: 15px;"></div>
        </div>
    `;
    
    if (result.errors && result.errors.length > 0) {
        generateResult.innerHTML += `
            <div class="alert alert-warning" style="margin-top: 15px;">
                <strong>오류 내역:</strong><br>
                ${result.errors.map(err => `행 ${err.row}: ${err.error}`).join('<br>')}
            </div>
        `;
    }
    
    // 저장된 템플릿 사용 모드에서는 템플릿 보기 버튼을 제거 (템플릿 목록에서 개별 보기 사용)
}

// 이메일 전송 완료 후 발주서 관련 버튼들 비활성화
function disableGeneratedFileButtons() {
    //console.log('🔒 이메일 전송 완료로 인한 발주서 버튼들 비활성화 시작');
    
    const generateResult = document.getElementById('generateResult');
    if (!generateResult) {
        console.warn('⚠️ generateResult 영역을 찾을 수 없습니다.');
        return;
    }
    
    // 다운받기 버튼 (a 태그) 비활성화
    const downloadBtn = generateResult.querySelector('a[download]');
    if (downloadBtn) {
        downloadBtn.style.background = '#6c757d';
        downloadBtn.style.opacity = '0.6';
        downloadBtn.style.cursor = 'not-allowed';
        downloadBtn.style.pointerEvents = 'none';
        downloadBtn.title = '이메일 전송이 완료되어 더 이상 다운로드할 수 없습니다';
    
    }
    
    // 미리보기 버튼 비활성화
    const previewBtn = generateResult.querySelector('button[onclick*="toggleFilePreview"]');
    if (previewBtn) {
        previewBtn.style.background = '#6c757d';
        previewBtn.style.opacity = '0.6';
        previewBtn.style.cursor = 'not-allowed';
        previewBtn.disabled = true;
        previewBtn.title = '이메일 전송이 완료되어 더 이상 미리보기할 수 없습니다';

    }
    
    // 템플릿 저장 버튼 비활성화
    const templateBtn = generateResult.querySelector('button[onclick*="toggleTemplateSave"]');
    if (templateBtn) {
        templateBtn.style.background = '#6c757d';
        templateBtn.style.opacity = '0.6';
        templateBtn.style.cursor = 'not-allowed';
        templateBtn.disabled = true;
        templateBtn.title = '이메일 전송이 완료되어 더 이상 템플릿을 저장할 수 없습니다';

    }
    
    debugLog('🔒 발주서 관련 버튼 비활성화 완료 (이메일 전송 완료)');
}

// 템플릿 저장 섹션 숨기기
function hideTemplateSaveSection() {
    const templateSaveSection = document.getElementById('templateSaveSection');
    if (templateSaveSection) {
        templateSaveSection.classList.add('hidden');
        
        // 템플릿 저장 버튼 상태도 원래대로
        const templateButtons = document.querySelectorAll('button[onclick="toggleTemplateSave()"]');
        templateButtons.forEach(btn => {
            btn.innerHTML = '템플릿 저장';
            btn.style.background = 'linear-gradient(135deg, #28a745 0%, #20c997 100%)';
        });
    }
}

// 템플릿명 실시간 미리보기 업데이트
function updateTemplateNamePreview() {
    const shoppingMall = document.getElementById('shoppingMallName').value.trim();
    const courier = document.getElementById('courierName').value.trim();
    const preview = document.getElementById('templateNamePreview');
    const hiddenInput = document.getElementById('templateName');
    
    if (shoppingMall && courier) {
        const templateName = `${shoppingMall}_${courier}`;
        preview.textContent = templateName;
        preview.style.color = '#007bff';
        hiddenInput.value = templateName;
        
        // 중복 체크 (디바운싱)
        clearTimeout(updateTemplateNamePreview.timeout);
        updateTemplateNamePreview.timeout = setTimeout(() => {
            checkTemplateDuplicate(templateName);
        }, 500);
    } else if (shoppingMall || courier) {
        preview.textContent = `${shoppingMall || '쇼핑몰'}_${courier || '택배사'}`;
        preview.style.color = '#6c757d';
        hiddenInput.value = '';
        clearDuplicateMessage();
    } else {
        preview.textContent = '쇼핑몰_택배사';
        preview.style.color = '#6c757d';
        hiddenInput.value = '';
        clearDuplicateMessage();
    }
}

// 템플릿 중복 확인
async function checkTemplateDuplicate(templateName) {
    try {
        const response = await fetch('/api/templates');
        if (response.ok) {
            const templates = await response.json();
            const isDuplicate = templates.some(template => template.name === templateName);
            
            showDuplicateMessage(isDuplicate, templateName);
        }
    } catch (error) {
        console.warn('⚠️ 템플릿 중복 확인 실패:', error.message);
    }
}

// 중복 메시지 표시
function showDuplicateMessage(isDuplicate, templateName) {
    let messageDiv = document.getElementById('duplicateMessage');
    
    if (!messageDiv) {
        messageDiv = document.createElement('div');
        messageDiv.id = 'duplicateMessage';
        messageDiv.style.cssText = `
            margin-top: 5px;
            padding: 8px;
            border-radius: 4px;
            font-size: 0.9em;
            font-weight: 500;
        `;
        document.getElementById('templateNamePreview').parentNode.appendChild(messageDiv);
    }
    
    if (isDuplicate) {
        messageDiv.textContent = `⚠️ "${templateName}" 템플릿이 이미 존재합니다.`;
        messageDiv.style.backgroundColor = '#fff3cd';
        messageDiv.style.color = '#856404';
        messageDiv.style.border = '1px solid #ffeaa7';
    } else {
        messageDiv.textContent = `✅ "${templateName}" 사용 가능한 템플릿명입니다.`;
        messageDiv.style.backgroundColor = '#d4edda';
        messageDiv.style.color = '#155724';
        messageDiv.style.border = '1px solid #c3e6cb';
    }
}

// 중복 메시지 제거
function clearDuplicateMessage() {
    const messageDiv = document.getElementById('duplicateMessage');
    if (messageDiv) {
        messageDiv.remove();
    }
}

// 자동완성 데이터 (추후 서버에서 가져올 수 있음)
const commonShoppingMalls = ['쿠팡', '11번가', '옥션', 'G마켓', '인터파크', '롯데온', '위메프', '티몬', '스마트스토어', '아이허브'];
const commonCouriers = ['CJ대한통운', '로젠택배', '한진택배', '롯데택배', '우체국택배', 'GSPostbox', '경동택배', '합동택배', 'CVSnet', 'GTX로지스'];

// 자동완성 기능 초기화 (템플릿 저장 섹션이 표시될 때 호출)
function initializeAutoComplete() {
    const shoppingMallInput = document.getElementById('shoppingMallName');
    const courierInput = document.getElementById('courierName');
    
    if (shoppingMallInput && courierInput) {
        // 쇼핑몰 자동완성
        setupAutoComplete(shoppingMallInput, commonShoppingMalls);
        
        // 택배사 자동완성
        setupAutoComplete(courierInput, commonCouriers);
        
        //console.log('✅ 자동완성 초기화 완료');
    }
}

// 간단한 자동완성 설정
function setupAutoComplete(input, suggestions) {
    input.addEventListener('input', function() {
        const value = this.value.toLowerCase();
        
        // 기존 자동완성 목록 제거
        const existingList = document.getElementById(this.id + '_autocomplete');
        if (existingList) {
            existingList.remove();
        }
        
        if (value.length > 0) {
            const matches = suggestions.filter(item => 
                item.toLowerCase().includes(value)
            );
            
            if (matches.length > 0) {
                const list = document.createElement('div');
                list.id = this.id + '_autocomplete';
                list.style.cssText = `
                    position: absolute;
                    background: white;
                    border: 1px solid #ccc;
                    border-top: none;
                    max-height: 150px;
                    overflow-y: auto;
                    z-index: 1000;
                    width: ${this.offsetWidth}px;
                `;
                
                matches.forEach(match => {
                    const item = document.createElement('div');
                    item.textContent = match;
                    item.style.cssText = `
                        padding: 8px;
                        cursor: pointer;
                        border-bottom: 1px solid #eee;
                    `;
                    item.addEventListener('mouseenter', () => item.style.background = '#f8f9fa');
                    item.addEventListener('mouseleave', () => item.style.background = 'white');
                    item.addEventListener('click', () => {
                        input.value = match;
                        updateTemplateNamePreview();
                        list.remove();
                    });
                    list.appendChild(item);
                });
                
                this.parentNode.style.position = 'relative';
                this.parentNode.appendChild(list);
            }
        }
    });
    
    // 포커스 잃을 때 자동완성 목록 제거
    input.addEventListener('blur', function() {
        setTimeout(() => {
            const list = document.getElementById(this.id + '_autocomplete');
            if (list) list.remove();
        }, 200);
    });
}

// 현재 매핑을 템플릿으로 저장
async function saveCurrentMappingAsTemplate() {
    try {
        const shoppingMall = document.getElementById('shoppingMallName').value.trim();
        const courier = document.getElementById('courierName').value.trim();
        const templateDescription = document.getElementById('templateDescription').value.trim();
        
        // 입력 검증
        if (!shoppingMall) {
            showAlert('error', '쇼핑몰 이름을 입력해주세요.');
            document.getElementById('shoppingMallName').focus();
            return;
        }
        
        if (!courier) {
            showAlert('error', '택배사를 입력해주세요.');
            document.getElementById('courierName').focus();
            return;
        }
        
        // 템플릿명 생성
        const templateName = `${shoppingMall}_${courier}`;
        //console.log('🏷️ 생성된 템플릿명:', templateName);
        
        // 최종 중복 체크
        try {
            const response = await fetch('/api/templates');
            if (response.ok) {
                const templates = await response.json();
                const isDuplicate = templates.some(template => template.name === templateName);
                
                if (isDuplicate) {
                    showAlert('error', `"${templateName}" 템플릿이 이미 존재합니다. 다른 이름을 사용해주세요.`);
                    return;
                }
            }
        } catch (error) {
            console.warn('⚠️ 템플릿 중복 확인 실패:', error.message);
        }
        
        if (!currentMapping || Object.keys(currentMapping).length === 0) {
            showAlert('error', '저장할 매핑 데이터가 없습니다.');
            return;
        }
        
        // 로딩 표시
        document.getElementById('templateSaveResult').innerHTML = `
            <div style="text-align: center; color: #155724;">
                <div style="display: inline-block; width: 20px; height: 20px; border: 2px solid #28a745; border-radius: 50%; border-top: 2px solid transparent; animation: spin 1s linear infinite; margin-right: 10px;"></div>
                템플릿을 저장하고 있습니다...
            </div>
        `;
        
        // 현재 저장된 발주서 매핑 데이터 가져오기
        const savedMappingId = sessionStorage.getItem('savedMappingId');
        let supplierFieldMapping = {};
        
        if (savedMappingId) {
            try {
                const mappingResponse = await fetch(`/api/orders/mapping/${savedMappingId}`);
                const mappingResult = await mappingResponse.json();
                
                if (mappingResult.success && mappingResult.supplierMapping) {
                    supplierFieldMapping = mappingResult.supplierMapping;
                }
            } catch (error) {
                console.warn('발주서 매핑 정보를 가져오는데 실패했습니다:', error);
            }
        }
        
        // 🔥 ALWAYS 실제 업로드된 supplier 파일 헤더 순서로 재생성 (순서 보존을 위해)
    

        
        // 순서 보장을 위해 배열 형태로 생성
        let supplierFieldMappingArray = [];
        
        // 🎯 현재 업로드된 supplier 파일의 헤더 순서 사용 (각 템플릿마다 고유)
    

        
        // 🚨 중요: supplier 파일 헤더와 파일 ID 일치성 검증
        if (!currentSupplierFileId) {
            console.error('❌ currentSupplierFileId가 없습니다. 발주서 파일을 먼저 업로드해주세요.');
            showAlert('error', '발주서 파일을 먼저 업로드해주세요.');
            return;
        }
        
        if (!supplierFileHeaders || supplierFileHeaders.length === 0) {
            console.error('❌ supplierFileHeaders가 비어있습니다. 발주서 파일을 다시 업로드해주세요.');
            showAlert('error', '발주서 파일의 헤더를 읽을 수 없습니다. 파일을 다시 업로드해주세요.');
            return;
        }
        
        //console.log('✅ 발주서 파일과 헤더 검증 완료');

        
        if (supplierFileHeaders && supplierFileHeaders.length > 0) {
            //console.log('✅ 현재 supplier 파일 헤더 순서 사용 (템플릿마다 고유)');
            
            // 🚀 순서 보장: 빈 객체로 시작해서 파일 순서대로 추가
            supplierFieldMapping = {}; // 초기화
            
            supplierFileHeaders.forEach((headerName, index) => {
                // 현재 매핑에서 이 supplier 필드와 연결된 order 필드 찾기
                // currentMapping 구조: {order필드: supplier필드} - 역방향으로 찾아야 함
                let mappedOrderField = null;
                
                // currentMapping에서 value가 headerName과 일치하는 key를 찾기
                for (const [orderField, supplierField] of Object.entries(currentMapping)) {
                    if (supplierField === headerName) {
                        mappedOrderField = orderField;
                        break;
                    }
                }
                
                // 모든 필드를 저장 (매핑이 없어도 헤더는 유지, 값은 빈 문자열)
                const finalOrderField = mappedOrderField || ''; // 매핑이 없으면 빈 문자열
                
                // 순서를 보장하기 위해 배열에 객체로 저장
                supplierFieldMappingArray.push({
                    supplierField: headerName,
                    orderField: finalOrderField,
                    order: index
                });
                
                // 🎯 파일 순서대로 객체에 추가 (순서 보장)
                supplierFieldMapping[headerName] = finalOrderField;
                
                if (mappedOrderField) {
                    //console.log(`📋 ${index + 1}. ${headerName} → ${mappedOrderField} (매핑됨)`);
                } else {
                    //console.log(`📋 ${index + 1}. ${headerName} → (빈 값) [헤더 유지]`);
                }
            });
            
        
            console.log('📊 파일 헤더 순서와 일치 확인:', 
                JSON.stringify(supplierFileHeaders) === JSON.stringify(Object.keys(supplierFieldMapping))
            );
        
    
        } else {
            console.error('❌ supplier 파일 헤더가 없습니다.');
            showAlert('error', '템플릿 저장을 위해서는 supplier 파일이 업로드되어야 합니다.');
            document.getElementById('templateSaveResult').innerHTML = `
                <div style="background: #f8d7da; color: #721c24; padding: 10px; border-radius: 4px; text-align: center;">
                    ❌ 템플릿 저장 실패: supplier 파일이 업로드되지 않았습니다.<br>
                    <small>supplier 파일을 업로드한 후 템플릿을 저장해주세요.</small>
                </div>
            `;
            return;
        }
        
        // 템플릿 저장 전 최종 검증
        if (!supplierFieldMapping || Object.keys(supplierFieldMapping).length === 0) {
            showAlert('error', '발주서 필드 매핑이 없습니다. 템플릿을 저장하려면 발주서 필드가 필요합니다.');
            document.getElementById('templateSaveResult').innerHTML = '';
            return;
        }
        
        // 필수 필드 데이터 포함 (STEP 2에서 입력한 수동 필드)
        const fixedFieldsData = manualFieldsDataStep2 && Object.keys(manualFieldsDataStep2).length > 0 ? manualFieldsDataStep2 : {};
        
        console.log('💾 템플릿 저장 시 필수 필드 데이터 포함:', fixedFieldsData);
        console.log('📊 필수 필드 개수:', Object.keys(fixedFieldsData).length);
        
        // 템플릿 저장 요청
        const templateData = {
            templateName: templateName,
            description: templateDescription,
            orderFieldMapping: currentMapping,
            supplierFieldMapping: supplierFieldMapping,
            supplierFieldMappingArray: supplierFieldMappingArray, // 순서 보장을 위한 배열 추가
            fixedFields: fixedFieldsData, // 필수 필드 데이터 포함
            createdBy: 'anonymous' // 향후 사용자 시스템과 연동 시 실제 사용자명 사용
        };
        
        //console.log('💾 템플릿 저장 최종 확인:');
        //console.log('📋 currentSupplierFileId:', currentSupplierFileId);
        //console.log('📋 supplierFileHeaders:', supplierFileHeaders);
        //console.log('📋 supplierFileHeaders 순서:', supplierFileHeaders.map((h, i) => `${i}: ${h}`));
        //console.log('📋 supplierFieldMapping:', supplierFieldMapping);
        //console.log('📋 currentMapping:', currentMapping);
        //console.log('📋 순서 보장 배열 상세:', JSON.stringify(supplierFieldMappingArray, null, 2));
        
        //console.log('💾 템플릿 저장 요청:', templateData);
        
        const response = await fetch('/api/templates', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(templateData)
        });
        
        const result = await response.json();
        
        if (result.success) {
            // 필수 필드 포함 여부 확인
            const fixedFieldsCount = Object.keys(fixedFieldsData).length;
            const fixedFieldsMessage = fixedFieldsCount > 0 ? `<br><strong>📝 필수 필드:</strong> ${fixedFieldsCount}개 포함` : '';
            
            // 성공 메시지 표시
            document.getElementById('templateSaveResult').innerHTML = `
                <div style="background: #d1f2d1; color: #155724; padding: 10px; border-radius: 4px; text-align: center;">
                    ✅ 템플릿이 성공적으로 저장되었습니다!<br>
                    <strong>템플릿명:</strong> ${result.template.name}${fixedFieldsMessage}
                </div>
            `;
            
            // 3초 후 템플릿 저장 섹션 자동 숨김
            setTimeout(() => {
                hideTemplateSaveSection();
            }, 3000);
            
            console.log('✅ 템플릿 저장 성공:', result.template);
            if (fixedFieldsCount > 0) {
                console.log('📝 포함된 필수 필드:', fixedFieldsData);
            }
            
        } else {
            // 오류 메시지 표시
            console.error('❌ 템플릿 저장 실패 응답:', result);
            document.getElementById('templateSaveResult').innerHTML = `
                <div style="background: #f8d7da; color: #721c24; padding: 10px; border-radius: 4px; text-align: center;">
                    ❌ ${result.error || '템플릿 저장에 실패했습니다.'}
                    ${result.details ? `<br><small>상세: ${JSON.stringify(result.details)}</small>` : ''}
                </div>
            `;
        }
        
    } catch (error) {
        console.error('❌ 템플릿 저장 네트워크 오류:', error);
        document.getElementById('templateSaveResult').innerHTML = `
            <div style="background: #f8d7da; color: #721c24; padding: 10px; border-radius: 4px; text-align: center;">
                ❌ 템플릿 저장 중 네트워크 오류가 발생했습니다.
                <br><small>${error.message}</small>
            </div>
        `;
    }
}

// 전역 변수: 현재 로드된 템플릿 목록 (검색용)
let currentTemplateList = [];

// 템플릿 목록 불러오기
async function loadTemplateList() {
    try {
    
        
        // 로딩 메시지 표시
        const templateLoadingMessage = document.getElementById('templateLoadingMessage');
        const templateList = document.getElementById('templateList');
        const noTemplatesMessage = document.getElementById('noTemplatesMessage');
        
        if (templateLoadingMessage) templateLoadingMessage.style.display = 'block';
        if (templateList) templateList.style.display = 'none';
        if (noTemplatesMessage) noTemplatesMessage.style.display = 'none';
        
        const response = await fetch('/api/templates');
        const result = await response.json();
        
        if (result.success) {
            const templates = result.templates;
            currentTemplateList = templates; // 검색용으로 저장
            //console.log(`✅ 템플릿 ${templates.length}개 로드 완료`);
            
            // 로딩 메시지 숨기기
            if (templateLoadingMessage) templateLoadingMessage.style.display = 'none';
            
            if (templates.length === 0) {
                // 템플릿이 없는 경우
                if (noTemplatesMessage) noTemplatesMessage.style.display = 'block';
            } else {
                // 템플릿 목록 표시
                displayTemplateList(templates);
                if (templateList) templateList.style.display = 'block';
            }
        } else {
            throw new Error(result.error || '템플릿 목록을 불러올 수 없습니다.');
        }
        
    } catch (error) {
        console.error('❌ 템플릿 목록 로드 오류:', error);
        if (templateLoadingMessage) {
            templateLoadingMessage.innerHTML = `
                <div style="color: #dc3545; text-align: center;">
                    ❌ 템플릿 목록을 불러오는데 실패했습니다.<br>
                    <button onclick="loadTemplateList()" class="btn" style="background: #9c27b0; color: white; margin-top: 10px;">🔄 다시 시도</button>
                </div>
            `;
        }
    }
}

// 템플릿 목록 표시
let allTemplatesData = []; // 전역으로 템플릿 데이터 저장

function displayTemplateList(templates) {
    allTemplatesData = templates; // 정렬용으로 데이터 저장
    const templateCards = document.getElementById('templateCards');
    
    // 현재 선택된 정렬 옵션에 따라 정렬
    const sortOption = document.getElementById('templateSortOption')?.value || 'latest';
    const sortedTemplates = sortTemplatesByOption(templates, sortOption);
    
    templateCards.innerHTML = sortedTemplates.map(template => `
        <div class="template-card" data-template-id="${template.id}" style="
            background: linear-gradient(145deg, #ffffff 0%, #f8f9fa 100%); 
            border: 1px solid #e1bee7; 
            border-radius: 8px; 
            padding: 15px; 
            margin-bottom: 10px; 
            transition: all 0.3s ease;
        ">
            <div style="display: flex; justify-content: space-between; align-items: start;">
                <div style="flex: 1; cursor: pointer;" onclick="selectTemplate('${template.id}')" 
                     onmouseover="this.parentElement.parentElement.style.borderColor='#9c27b0'; this.parentElement.parentElement.style.transform='translateY(-2px)'" 
                     onmouseout="if (!this.parentElement.parentElement.style.boxShadow.includes('rgba(156, 39, 176, 0.3)')) { this.parentElement.parentElement.style.borderColor='#e1bee7'; this.parentElement.parentElement.style.transform='translateY(0)'; }">
                    <h5 style="color: #4a148c; margin-bottom: 8px; font-size: 1em;">${template.name}</h5>
                    <p style="color: #6a1b9a; font-size: 0.85em; margin-bottom: 8px; opacity: 0.8;">
                        ${template.description || '설명이 없습니다.'}
                    </p>
                    <div style="display: flex; justify-content: space-between; font-size: 0.75em; color: #7b1fa2;">
                        <span>사용: ${template.usageCount || 0}회</span>
                        <span>${new Date(template.createdAt).toLocaleDateString()}</span>
                    </div>
                </div>
                <div style="display: flex; flex-direction: column; gap: 5px; margin-left: 15px;">
                    <button onclick="viewTemplate('${template.id}', event)" class="btn" style="
                        background: linear-gradient(135deg, #e91e63 0%, #c2185b 100%); 
                        color: white; 
                        padding: 6px 12px; 
                        font-size: 0.8em; 
                        border-radius: 5px; 
                        white-space: nowrap;
                        border: none;
                        cursor: pointer;
                        box-shadow: 0 2px 4px rgba(233, 30, 99, 0.3);
                    "> 보기</button>
                    <button onclick="downloadTemplate('${template.id}', event)" class="btn" style="
                        background: linear-gradient(135deg, #4caf50 0%, #388e3c 100%); 
                        color: white; 
                        padding: 6px 12px; 
                        font-size: 0.8em; 
                        border-radius: 5px; 
                        white-space: nowrap;
                        border: none;
                        cursor: pointer;
                        box-shadow: 0 2px 4px rgba(76, 175, 80, 0.3);
                    "> 다운</button>
                </div>
            </div>
        </div>
    `).join('');
}

// 템플릿 정렬 함수
function sortTemplatesByOption(templates, sortOption) {
    switch (sortOption) {
        case 'latest':
            return templates.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        case 'name':
            return templates.sort((a, b) => a.name.localeCompare(b.name, 'ko-KR'));
        case 'usage':
            return templates.sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0));
        default:
            return templates;
    }
}

// 정렬 옵션 변경 시 호출
function sortTemplates() {
    if (allTemplatesData.length > 0) {
        displayTemplateList(allTemplatesData);
    }
}

// 템플릿 보기 함수
async function viewTemplate(templateId, event) {
    if (event) {
        event.stopPropagation(); // 카드 클릭 이벤트 방지
    }
    
    try {
        console.log('📋 템플릿 보기 요청:', templateId);
        
        const response = await fetch(`/api/templates/${templateId}`);
        const result = await response.json();
        
        if (result.success && (result.data || result.template)) {
            // 템플릿 미리보기 모달 표시
            const templateData = result.data || result.template;
            //console.log('📋 템플릿 데이터:', templateData);
            
            // 데이터 검증
            if (!templateData || typeof templateData !== 'object') {
                throw new Error('유효하지 않은 템플릿 데이터입니다.');
            }
            
            const modal = document.createElement('div');
            modal.style.cssText = `
                position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
                background: rgba(0,0,0,0.7); z-index: 10000; display: flex; 
                justify-content: center; align-items: center;
            `;
            
            modal.innerHTML = `
                <div style="background: white; border-radius: 12px; max-width: 80%; max-height: 80%; 
                     overflow-y: auto; padding: 30px; position: relative; box-shadow: 0 10px 30px rgba(0,0,0,0.3);">
                    <button onclick="this.parentElement.parentElement.remove()" style="
                        position: absolute; top: 15px; right: 15px; background: #dc3545; color: white; 
                        border: none; border-radius: 50%; width: 30px; height: 30px; cursor: pointer; 
                        font-size: 16px; display: flex; align-items: center; justify-content: center;
                    ">×</button>
                    
                    <h3 style="color: #4a148c; margin-bottom: 20px; text-align: center;">
                        📋 템플릿 미리보기: ${templateData.name || templateData.template_name || '이름 없음'}
                    </h3>
                    
                    <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                        <p><strong>설명:</strong> ${templateData.description || '설명이 없습니다.'}</p>
                        <p><strong>생성일:</strong> ${templateData.createdAt ? new Date(templateData.createdAt).toLocaleString() : templateData.created_at ? new Date(templateData.created_at).toLocaleString() : '알 수 없음'}</p>
                        <p><strong>사용횟수:</strong> ${templateData.usageCount || templateData.usage_count || 0}회</p>
                    </div>
                    
                    <div style="max-height: 400px; overflow-y: auto; border: 1px solid #dee2e6; border-radius: 8px;">
                        <table style="width: 100%; border-collapse: collapse;">
                            <thead style="background: #6a1b9a; color: white; position: sticky; top: 0;">
                                <tr>
                                    <th style="padding: 12px; text-align: left;">주문서 필드</th>
                                    <th style="padding: 12px; text-align: left;">발주서 필드</th>
                                    <th style="padding: 8px; text-align: center; width: 60px; font-size: 0.9em;">순서</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${(() => {

                                    
                                    // 🎯 1순위: supplierFieldMappingArray 사용 (순서 보장)
                                    if (templateData.supplierFieldMappingArray && Array.isArray(templateData.supplierFieldMappingArray) && templateData.supplierFieldMappingArray.length > 0) {
                                        console.log('✅ 템플릿 보기에서 순서 배열 사용');

                                        
                                        const sortedArray = templateData.supplierFieldMappingArray
                                            .sort((a, b) => a.order - b.order); // 순서대로 정렬
                                        

                                        
                                        if (sortedArray.length === 0) {
                                            return '<tr><td colspan="3" style="padding: 20px; text-align: center; color: #6c757d;">매핑 규칙이 없습니다.</td></tr>';
                                        }
                                        
                                        // 배열 기반으로 테이블 행 생성 (순서 보장)
                                        return sortedArray.map((item, index) => `
                                            <tr style="border-bottom: 1px solid #f0f0f0; ${index % 2 === 0 ? 'background: #f8f9fa;' : ''}">
                                                <td style="padding: 10px; font-size: 0.9em; color: #666;">${item.orderField || '(매핑 없음)'}</td>
                                                <td style="padding: 10px; font-weight: 500; color: #4a148c;">${item.supplierField}</td>
                                                <td style="padding: 5px; font-size: 0.8em; color: #999; text-align: center; width: 50px;">${item.order}</td>
                                            </tr>
                                        `).join('');
                                    }
                                    
                                    // 🔄 2순위: 기존 방식 (객체 기반 - 순서 불확실)
                                    console.log('⚠️ 템플릿 보기에서 객체 기반 매핑 사용 (순서 불확실)');
                                    let rules = {};
                                    
                                    if (templateData.mappingRules?.rules) {
                                        rules = templateData.mappingRules.rules;
                                    } else if (templateData.mapping_rules?.rules) {
                                        rules = templateData.mapping_rules.rules;
                                    } else if (templateData.orderFieldMapping) {
                                        // 백엔드 API 응답 구조
                                        const orderMapping = templateData.orderFieldMapping || {};
                                        const supplierMapping = templateData.supplierFieldMapping || templateData.supplier_field_mapping || {};
                                        
                                        // supplierMapping 기준으로 순서 생성 (역방향 매핑)
                                        Object.entries(supplierMapping).forEach(([supplierField, orderField]) => {
                                            rules[supplierField] = orderField || '(매핑 없음)';
                                        });
                                    } else if (templateData.mappingRules) {
                                        rules = templateData.mappingRules;
                                    } else if (templateData.mapping_rules) {
                                        rules = templateData.mapping_rules;
                                    }
                                    
                                    if (Object.keys(rules).length === 0) {
                                        return '<tr><td colspan="3" style="padding: 20px; text-align: center; color: #6c757d;">매핑 규칙이 없습니다.</td></tr>';
                                    }
                                    
                                    return Object.entries(rules).map(([supplierField, orderField], index) => `
                                        <tr style="border-bottom: 1px solid #f0f0f0; ${index % 2 === 0 ? 'background: #f8f9fa;' : ''}">
                                            <td style="padding: 10px; font-size: 0.9em; color: #666;">${orderField || '(매핑 없음)'}</td>
                                            <td style="padding: 10px; font-weight: 500; color: #4a148c;">${supplierField}</td>
                                            <td style="padding: 5px; font-size: 0.8em; color: #999; text-align: center; width: 50px;">-</td>
                                        </tr>
                                    `).join('');
                                })()}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
            
        } else {
            console.error('템플릿 API 응답 오류:', result);
            showAlert('error', result.error || '템플릿을 불러오는데 실패했습니다.');
        }
    } catch (error) {
        console.error('템플릿 보기 오류:', error);
        showAlert('error', '템플릿 보기 중 오류가 발생했습니다.');
    }
}

// 템플릿 다운로드 함수 (Excel 양식 파일)
async function downloadTemplate(templateId, event) {
    if (event) {
        event.stopPropagation(); // 카드 클릭 이벤트 방지
    }
    
    try {
        //console.log('💾 템플릿 Excel 양식 다운로드 요청:', templateId);
        
        // 먼저 템플릿 데이터를 가져옴
        const response = await fetch(`/api/templates/${templateId}`);
        const result = await response.json();
        
        if (result.success && (result.data || result.template)) {
            const templateData = result.data || result.template;
            const templateName = templateData.name || templateData.template_name || 'template';
            
            console.log('📋 템플릿 데이터:', templateData);
            
            // 🎯 발주서 필드 순서대로 헤더 생성 (배열 우선 사용)
            let headers = [];
            

            
            // 1. 🎯 supplierFieldMappingArray가 있으면 순서 활용 (절대 우선)
            if (templateData.supplierFieldMappingArray && Array.isArray(templateData.supplierFieldMappingArray) && templateData.supplierFieldMappingArray.length > 0) {
                //console.log('✅ 순서 배열 사용 (파일 순서 보장):', templateData.supplierFieldMappingArray.slice(0, 3));
                
                // 🚨 배열을 order로 정렬하고 모든 필드 포함 (빈 매핑도 포함)
                const sortedArray = templateData.supplierFieldMappingArray
                    .sort((a, b) => a.order - b.order); // 순서대로 정렬
                

                
                headers = sortedArray
                    .map(item => item.supplierField)
                    .filter(field => field && field.trim()); // supplierField가 있는 것만
                
                //console.log('🔥 강제 배열 순서 적용:', headers.slice(0, 5));
                //console.log('📊 배열 기반 헤더 순서 (최종):', headers.slice(0, 5));
                
                // 🎯 객체 무시 선언
                //console.log('🚫 supplier_field_mapping 객체는 무시하고 배열만 사용합니다.');
            }
            // 2. supplierFieldMapping에서 필드 추출 (객체 순서 - 순서 보장 불확실)
            else if (templateData.supplierFieldMapping || templateData.supplier_field_mapping) {
                const supplierMapping = templateData.supplierFieldMapping || templateData.supplier_field_mapping;
                //console.log('⚠️ 객체 기반 매핑 사용 (순서 불확실):', supplierMapping);
                //console.log('💡 기존 템플릿 감지: 배열이 없는 이전 버전 템플릿으로 추정됩니다.');
                
                // 빈 값('')인 필드도 헤더로 포함 (supplier 필드명이 있으면 포함)
                headers = Object.keys(supplierMapping).filter(key => key && key.trim());
                /*
                console.log('📋 매핑 상태:', Object.entries(supplierMapping).map(([key, value]) => 
                    `${key} → ${value || '(빈 값)'}`
                ));
                */
                //console.log('📊 객체 기반 헤더 순서 (순서 불확실):', headers);
                
                // 🔧 기존 템플릿을 위한 임시 배열 생성 (순서 개선 시도)
        
                const tempArray = headers.map((field, index) => ({
                    supplierField: field,
                    orderField: supplierMapping[field] || '',
                    order: index
                }));
            
            }
            // 3. orderFieldMapping 사용 (백업)
            else if (templateData.orderFieldMapping || templateData.order_field_mapping) {
                const orderMapping = templateData.orderFieldMapping || templateData.order_field_mapping;
                //console.log('📋 주문서 매핑 (백업):', orderMapping);
                headers = Object.keys(orderMapping).filter(key => key && key.trim());
                //console.log('📊 주문서 기반 헤더 순서:', headers);
            }
            
            //console.log('📊 최종 헤더 순서:', headers);
            
            if (headers.length === 0) {
                showAlert('warning', '매핑된 필드가 없어서 빈 Excel 파일을 생성합니다.');
                headers = ['필드1', '필드2', '필드3']; // 기본 헤더
            }
            
            // 🎨 ExcelJS로 스타일링이 적용된 Excel 파일 생성
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet(`${templateName}_양식`);
            
            // 헤더 행 추가
            const headerRow = worksheet.addRow(headers);
            
            // 🎨 헤더 스타일링 적용
            headerRow.eachCell((cell, colNumber) => {
                cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; // 굵은 흰색 글씨
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FF808080' } // 회색 배경
                };
                cell.alignment = { horizontal: 'center', vertical: 'middle' }; // 가운데 정렬
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                };
            });
            
            // 빈 데이터 행들 추가 (10개)
            for (let i = 0; i < 10; i++) {
                const dataRow = worksheet.addRow(new Array(headers.length).fill(''));
                // 데이터 행에 테두리 추가
                dataRow.eachCell((cell, colNumber) => {
                    cell.border = {
                        top: { style: 'thin' },
                        left: { style: 'thin' },
                        bottom: { style: 'thin' },
                        right: { style: 'thin' }
                    };
                });
            }
            
            // 열 너비 자동 조정
            headers.forEach((header, index) => {
                const columnWidth = Math.max(header.length + 3, 12);
                worksheet.getColumn(index + 1).width = columnWidth;
            });
            
            // Excel 파일로 다운로드
            const filename = `${templateName}_입력양식.xlsx`;
            workbook.xlsx.writeBuffer().then(function(buffer) {
                const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                a.click();
                window.URL.revokeObjectURL(url);
            });
            
            showAlert('success', `${headers.length}개 필드가 포함된 Excel 입력 양식이 다운로드되었습니다! 📊<br>헤더: ${headers.slice(0, 3).join(', ')}${headers.length > 3 ? '...' : ''}`);
        } else {
            showAlert('error', result.error || '템플릿 데이터를 가져올 수 없습니다.');
        }
    } catch (error) {
        console.error('템플릿 Excel 양식 다운로드 오류:', error);
        showAlert('error', '템플릿 다운로드 중 오류가 발생했습니다.');
    }
}

// 템플릿 선택
let selectedTemplate = null;

async function selectTemplate(templateId) {
    try {
        //console.log('📋 템플릿 선택:', templateId);
        
        // 모든 템플릿 카드의 선택 상태 초기화
        document.querySelectorAll('.template-card').forEach(card => {
            card.style.borderColor = '#e1bee7';
            card.style.backgroundColor = 'white';
        });
        
        // 선택된 템플릿 카드 강조 (이벤트가 있는 경우에만)
        if (event && event.currentTarget) {
            event.currentTarget.style.borderColor = '#9c27b0';
            event.currentTarget.style.backgroundColor = '#f3e5f5';
        } else {
            // 코드에서 직접 호출된 경우, templateId로 카드 찾아서 강조
            const targetCard = document.querySelector(`[data-template-id="${templateId}"]`);
            if (targetCard) {
                targetCard.style.borderColor = '#9c27b0';
                targetCard.style.backgroundColor = '#f3e5f5';
            }
        }
        
        // 템플릿 상세 정보 로드
        const response = await fetch(`/api/templates/${templateId}`);
        const result = await response.json();
        
        if (result.success) {
            selectedTemplate = result.template;
            //console.log('✅ 템플릿 상세 정보 로드 완료:', selectedTemplate.name);
            
            // 템플릿의 필수 필드를 자동으로 적용
            if (selectedTemplate.fixedFields && Object.keys(selectedTemplate.fixedFields).length > 0) {
                manualFieldsDataStep2 = { ...selectedTemplate.fixedFields };
                //console.log('📝 템플릿의 필수 필드 자동 적용:', manualFieldsDataStep2);
                //console.log('📊 적용된 필수 필드 개수:', Object.keys(manualFieldsDataStep2).length);
                
                // 사용자에게 알림
                showAlert('info', `✅ 템플릿의 필수 필드 ${Object.keys(manualFieldsDataStep2).length}개가 자동으로 적용되었습니다.`);
            } else {
                // 템플릿에 필수 필드가 없으면 기존 데이터 유지 (초기화하지 않음)
                //console.log('📝 선택한 템플릿에 필수 필드가 없습니다.');
            }
            
            // 선택된 템플릿 정보 표시
            displaySelectedTemplateInfo(selectedTemplate);
            
            // 파일 업로드 이벤트 리스너 재설정 (중요!)
            setupSavedTemplateModeEvents();
            
            // 파일 업로드 상태 확인하여 버튼 활성화
            updateTemplateProcessButton();
            
        } else {
            throw new Error(result.error || '템플릿 정보를 불러올 수 없습니다.');
        }
        
    } catch (error) {
        console.error('❌ 템플릿 선택 오류:', error);
        showAlert('error', '템플릿 정보를 불러오는데 실패했습니다.');
    }
}

// 선택된 템플릿 표시 (색상 변경 및 버튼 활성화)
function displaySelectedTemplateInfo(template) {
    // 모든 템플릿 카드의 선택 상태 해제
    const allCards = document.querySelectorAll('.template-card');
    allCards.forEach(card => {
        card.style.border = '1px solid #e1bee7';
        card.style.background = 'linear-gradient(145deg, #ffffff 0%, #f8f9fa 100%)';
    });
    
    // 선택된 템플릿 카드의 색상 변경
    const selectedCard = document.querySelector(`[data-template-id="${template.id}"]`);
    if (selectedCard) {
        selectedCard.style.border = '3px solid #9c27b0';
        selectedCard.style.background = 'linear-gradient(145deg, #f3e5f5 0%, #e1bee7 100%)';
        selectedCard.style.boxShadow = '0 4px 12px rgba(156, 39, 176, 0.3)';
    }
    
    // 자동 변환 시작 버튼 활성화
    updateTemplateProcessButton();
}

// 템플릿 처리 버튼 상태 업데이트
function updateTemplateProcessButton() {
    const processBtn = document.getElementById('templateProcessBtn');
    if (!processBtn) return;
    
    const hasTemplate = selectedTemplate !== null;
    
    if (hasTemplate) {
        processBtn.disabled = false;
        processBtn.style.opacity = '1';
        processBtn.style.cursor = 'pointer';
        processBtn.style.background = 'linear-gradient(135deg, #28a745 0%, #20c997 100%)';
    } else {
        processBtn.disabled = true;
        processBtn.style.opacity = '0.5';
        processBtn.style.cursor = 'not-allowed';
        processBtn.style.background = 'linear-gradient(135deg, #6c757d 0%, #5a6268 100%)';
    }
}

// 템플릿 목록 새로고침
async function refreshTemplateList() {
    await loadTemplateList();
}

// 🔍 템플릿 이름으로 검색하고 자동 선택
async function searchAndSelectTemplate() {
    const searchInput = document.getElementById('templateSearchInput');
    const searchResult = document.getElementById('searchResult');
    
    if (!searchInput || !searchResult) {
        console.error('❌ 검색 UI 요소를 찾을 수 없습니다.');
        return;
    }
    
    const searchTerm = searchInput.value.trim();
    
    if (!searchTerm) {
        searchResult.innerHTML = `<span style="color: #ff6b6b;">⚠️ 검색할 템플릿 이름을 입력해주세요.</span>`;
        return;
    }
    

    
    // 현재 템플릿 목록이 없으면 먼저 로드
    if (currentTemplateList.length === 0) {

        searchResult.innerHTML = `<span style="color: #9c27b0;">📋 템플릿 목록을 불러오는 중...</span>`;
        
        try {
            await loadTemplateList();
        } catch (error) {
            searchResult.innerHTML = `<span style="color: #ff6b6b;">❌ 템플릿 목록을 불러오는데 실패했습니다.</span>`;
            return;
        }
    }
    
    // 이름으로 검색 (부분 일치, 대소문자 무관)
    const foundTemplates = currentTemplateList.filter(template => 
        template.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    console.log(`🔍 검색 결과: ${foundTemplates.length}개 템플릿 발견`);
    
    if (foundTemplates.length === 0) {
        searchResult.innerHTML = `<span style="color: #ff6b6b;">❌ "${searchTerm}"과 일치하는 템플릿을 찾을 수 없습니다.</span>`;
        
        // 비슷한 이름 제안
        const suggestions = currentTemplateList
            .filter(template => template.name.toLowerCase().includes(searchTerm.toLowerCase().substring(0, 2)))
            .slice(0, 3);
            
        if (suggestions.length > 0) {
            const suggestionText = suggestions.map(t => `"${t.name}"`).join(', ');
            searchResult.innerHTML += `<br><span style="color: #9c27b0; font-size: 0.85em;">💡 비슷한 이름: ${suggestionText}</span>`;
        }
        return;
    }
    
    if (foundTemplates.length === 1) {
        // 정확히 하나 찾은 경우 - 자동 선택
        const template = foundTemplates[0];
        //console.log(`✅ 템플릿 자동 선택: ${template.name} (ID: ${template.id})`);
        
        searchResult.innerHTML = `<span style="color: #28a745;">✅ "${template.name}" 템플릿이 자동 선택됩니다!</span>`;
        
        // 템플릿 선택 실행
        await selectTemplate(template.id);
        
        // 템플릿 카드 하이라이트
        highlightSelectedTemplateCard(template.id);
        
        // 입력 필드 초기화
        searchInput.value = '';
        
    } else {
        // 여러 개 찾은 경우 - 목록 표시
        const templateList = foundTemplates.map(t => `"${t.name}"`).join(', ');
        searchResult.innerHTML = `
            <span style="color: #ff9800;">⚠️ ${foundTemplates.length}개의 템플릿이 발견되었습니다:</span><br>
            <span style="color: #9c27b0; font-size: 0.85em;">${templateList}</span><br>
            <span style="color: #6c757d; font-size: 0.8em;">💡 더 구체적인 이름을 입력하거나 아래 목록에서 직접 선택하세요.</span>
        `;
        
        // 찾은 템플릿들 하이라이트
        foundTemplates.forEach(template => {
            highlightFoundTemplateCard(template.id);
        });
    }
}

// 선택된 템플릿 카드 하이라이트
function highlightSelectedTemplateCard(templateId) {
    // 모든 카드 스타일 초기화
    document.querySelectorAll('.template-card').forEach(card => {
        card.style.borderColor = '#e1bee7';
        card.style.boxShadow = 'none';
        card.style.transform = 'translateY(0)';
    });
    
    // 선택된 카드 하이라이트
    const selectedCard = document.querySelector(`[data-template-id="${templateId}"]`);
    if (selectedCard) {
        selectedCard.style.borderColor = '#28a745';
        selectedCard.style.boxShadow = '0 4px 12px rgba(40, 167, 69, 0.3)';
        selectedCard.style.transform = 'translateY(-3px)';
        
        // 스크롤하여 보이도록
        selectedCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

// 검색된 템플릿 카드들 하이라이트
function highlightFoundTemplateCard(templateId) {
    const card = document.querySelector(`[data-template-id="${templateId}"]`);
    if (card) {
        card.style.borderColor = '#ff9800';
        card.style.boxShadow = '0 3px 8px rgba(255, 152, 0, 0.3)';
        card.style.transform = 'translateY(-2px)';
    }
}

// 템플릿 모드 처리 (자동 변환)
async function processTemplateMode() {
    if (!selectedTemplate || !currentOrderFileId) {
        showAlert('error', '템플릿과 주문서 파일을 모두 선택해주세요.');
        return;
    }
    
    try {
        //console.log('🚀 템플릿 기반 자동 변환 시작');
        //console.log('📋 선택된 템플릿:', selectedTemplate.name);
        //console.log('📂 주문서 파일 ID:', currentOrderFileId);
        
        // 🚫 이전 진행바 완전히 숨기기 (115% 방지)
        hideProgress();
        await new Promise(resolve => setTimeout(resolve, 50)); // 짧은 딜레이
        
        // 진행률 표시 시작
        showProgress('템플릿 기반 자동 변환을 시작합니다...');
        
        // 진행률 단계 정의 (95%까지만 시뮬레이션)
        const progressSteps = [
            { percent: 15, message: '템플릿 매핑 규칙을 적용하고 있습니다...' },
            { percent: 35, message: '주문서 데이터를 분석하고 있습니다...' },
            { percent: 55, message: '자동 매핑을 수행하고 있습니다...' },
            { percent: 75, message: '발주서를 생성하고 있습니다...' },
            { percent: 95, message: '템플릿 기반 변환을 완료하고 있습니다...' }
        ];
        
        // 템플릿 사용 통계 업데이트
        const statsResponse = await fetch(`/api/templates/${selectedTemplate.id}/use`, {
            method: 'POST'
        });
        
        // 🚀 스마트 진행바: 서버 작업 완료 시 즉시 100%로 
        let progressCancelled = false;
        
        // 진행률 시뮬레이션 (95%까지, 중단 가능)
        const progressPromise = simulateProgress(progressSteps, 3000).then(() => {
            if (!progressCancelled) {
                return new Promise(resolve => {
                    const checkInterval = setInterval(() => {
                        if (progressCancelled) {
                            clearInterval(checkInterval);
                            resolve();
                        }
                    }, 100);
                });
            }
        });
        
        // 템플릿 기반 자동 변환 API 호출
        const workPromise = (async () => {
            console.log('🚀 템플릿 기반 변환 API 호출 준비:', {
                currentOrderFileId: currentOrderFileId,
                selectedTemplateId: selectedTemplate.id,
                selectedTemplateName: selectedTemplate.name,
                isOrderFile: currentOrderFileId && currentOrderFileId.includes('orderFile'),
                isSupplierFile: currentOrderFileId && currentOrderFileId.includes('supplierFile')
            });
            
            // 파일 ID 검증
            if (!currentOrderFileId) {
                throw new Error('주문서 파일이 업로드되지 않았습니다.');
            }
            
            if (currentOrderFileId.includes('supplierFile')) {
                throw new Error('잘못된 파일 타입입니다. 주문서 파일을 업로드해주세요.');
            }
            
            const requestData = {
                fileId: currentOrderFileId,
                templateId: selectedTemplate.id,
                templateType: 'standard'
            };
            
            console.log('📤 템플릿 요청 데이터:', requestData);
            
            // 타임아웃 설정 (60초)
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 60000);
            
            try {
                const response = await fetch('/api/orders/generate-with-template', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestData),
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                console.log('✅ 템플릿 서버 응답 받음:', response.status, response.statusText);
                
                // 🚫 사용량 제한 확인 (429 오류)
                if (response.status === 429) {
                    const errorData = await response.json().catch(() => ({ error: '하루 발주서 생성 횟수를 모두 사용했습니다.' }));
                    throw new Error(errorData.error || '하루 발주서 생성 횟수를 모두 사용했습니다.');
                }
                
                if (!response.ok) {
                    throw new Error(`서버 오류: ${response.status} ${response.statusText}`);
                }
                
                const result = await response.json();
                console.log('✅ 템플릿 응답 파싱 완료:', result);
                
                // 🚀 서버 작업 완료 시 즉시 진행바 완료 처리
                progressCancelled = true;
                updateProgress(100, '템플릿 기반 변환이 완료되었습니다! 🎉');
                
                return result;
            } catch (error) {
                clearTimeout(timeoutId);
                console.error('❌ 템플릿 fetch 오류:', error);
                throw error;
            }
        })();
        
        // 서버 작업 완료만 기다림 (진행바는 자동으로 처리됨)
        const result = await workPromise;
        
        // 100% 완료 표시를 잠깐 보여준 후 화면 전환
        await new Promise(resolve => setTimeout(resolve, 800)); // 0.8초 대기
        
        // 진행률 숨기기
        hideProgress();
        
        if (result.success) {
            // 📊 발주서 생성 성공시 사용량 증가 (방안 3: 혼합 방식)
            usageManager.incrementUsage('orderGeneration');
            
            // 📊 서버 사용량 동기화 (백그라운드, 비동기) - 에러는 내부에서 처리됨
            try {
                syncUsageWithServer('orderGeneration', false, {
                    generatedFile: result.generatedFile,
                    templateUsed: result.templateUsed,
                    processedRows: result.processedRows
                });
            } catch (error) {
                // 혹시나 하는 추가 안전장치
                console.warn('⚠️ 템플릿 모드 사용량 동기화 호출 실패 (무시됨):', error.message);
            }
            
            generatedFileName = result.generatedFile;
            displayFileName = result.displayFileName || result.userFriendlyFileName;
            showGenerateResult(result);
            showStep(3);
            showStep(4);
            
            // 템플릿 저장 섹션은 숨김 (이미 템플릿 사용중이므로)
            const templateSaveSection = document.getElementById('templateSaveSection');
            if (templateSaveSection) {
                templateSaveSection.style.display = 'none';
            }
            
            // STEP 3 (발주서 다운로드/미리보기) 영역으로 자동 스크롤
            setTimeout(() => {
                const step3Element = document.getElementById('step3');
                if (step3Element) {
                    step3Element.scrollIntoView({ 
                        behavior: 'smooth', 
                        block: 'start',
                        inline: 'nearest'
                    });
                }
            }, 800);
            
            console.log('✅ 템플릿 기반 자동 변환 완료');
        } else {
            showAlert('error', result.error || '템플릿 기반 변환에 실패했습니다.');
        }
        
    } catch (error) {
        hideProgress();
        console.error('❌ 템플릿 기반 변환 오류:', error);
        
        // 타임아웃 에러 특별 처리
        if (error.message && error.message.includes('timeout')) {
            showAlert('error', '⏰ 템플릿 기반 변환 시간이 초과되었습니다.\n\n파일 크기가 크거나 네트워크가 불안정할 수 있습니다.\n잠시 후 다시 시도해주세요.');
        } else {
            showAlert('error', '템플릿 기반 변환 중 오류가 발생했습니다.\n\n' + (error.message || '알 수 없는 오류'));
        }
    }
}

// 이메일 전송
async function sendEmail() {
    //console.log('📧 이메일 전송 함수 시작');
    
    const emailTo = document.getElementById('emailTo').value;
    const emailSubject = document.getElementById('emailSubject').value;
    const emailBody = document.getElementById('emailBody').value;
    const sendOption = document.querySelector('input[name="sendOption"]:checked')?.value;
    const scheduleTime = document.getElementById('scheduleTime').value;
    
    /*
    console.log('📋 이메일 폼 데이터:', {
        emailTo,
        emailSubject,
        emailBody,
        sendOption,
        scheduleTime,
        generatedFileName,
        displayFileName
    });
    */
    
    // 개별 필수 항목 체크 및 구체적인 안내
    const missingItems = [];
    if (!emailTo) missingItems.push('받는 사람 이메일');
    if (!emailSubject) missingItems.push('이메일 제목');
    if (!generatedFileName) missingItems.push('첨부할 발주서 파일');
    
    if (missingItems.length > 0) {
        //console.log('❌ 필수 항목 누락:', { emailTo, emailSubject, generatedFileName });
        const errorMessage = `다음 필수 항목을 입력해주세요:\n• ${missingItems.join('\n• ')}`;
        showAlert('error', errorMessage);
        
        // 누락된 첫 번째 입력 필드에 포커스
        if (!emailTo) {
            document.getElementById('emailTo')?.focus();
        } else if (!emailSubject) {
            document.getElementById('emailSubject')?.focus();
        }
        
        return;
    }
    
    try {
        // 🚫 이전 진행바 완전히 숨기기 (115% 방지)
        hideProgress();
        await new Promise(resolve => setTimeout(resolve, 50)); // 짧은 딜레이
        
        // 📊 진행바 시작
        showProgress('이메일 데이터를 준비하고 있습니다...');
        updateProgress(10, '이메일 데이터를 준비하고 있습니다...');
        
        const emailData = {
            to: emailTo,
            subject: emailSubject,
            body: emailBody,
            attachmentPath: generatedFileName,
            attachmentDisplayName: displayFileName // 사용자 친화적 파일명 추가
        };
        
        if (sendOption === 'scheduled' && scheduleTime) {
            emailData.scheduleTime = scheduleTime;
        }
        
        //console.log('📋 전송할 이메일 데이터:', emailData);
        
        // 📊 진행률 업데이트 (전송 방식에 따라 메시지 변경)
        const isScheduled = sendOption === 'scheduled' && scheduleTime;
        const progressMessage = isScheduled ? 
            '이메일 예약을 설정하고 있습니다...' : 
            '서버로 이메일을 전송하고 있습니다...';
        
        updateProgress(30, progressMessage);
        
        const response = await fetch('/api/email/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(emailData)
        });
        
        //console.log('📡 서버 응답 상태:', response.status, response.statusText);
        
        // 📊 진행률 업데이트
        const processMessage = isScheduled ? 
            '예약 전송을 등록하고 있습니다...' : 
            '서버에서 이메일을 처리하고 있습니다...';
        
        updateProgress(70, processMessage);
        
        // 🚫 사용량 제한 확인
        if (await handleRateLimitResponse(response)) {
            hideProgress();
            return;
        }
        
        const result = await response.json();
        //console.log('📋 서버 응답 결과:', result);
        
        // 📊 진행률 업데이트
        const completingMessage = isScheduled ? 
            '예약 전송 등록을 완료하고 있습니다...' : 
            '이메일 전송을 완료하고 있습니다...';
        
        updateProgress(90, completingMessage);
        
        // 짧은 딜레이로 사용자가 진행률을 볼 수 있도록 함
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const finalMessage = isScheduled ? 
            '예약 전송 등록 완료!' : 
            '이메일 전송 완료!';
        
        updateProgress(100, finalMessage);
        
        // 짧은 딜레이 후 진행바 숨김
        setTimeout(() => {
            hideProgress();
        }, 1000);
        
        // 📝 로컬 이력 저장 (성공/실패 관계없이)
        localEmailHistory.saveEmailRecord(emailData, result);
        
        if (result.success) {
            //console.log('✅ 이메일 전송 성공');
            
            // 📊 이메일 전송 성공시 사용량 증가
            usageManager.incrementUsage('emailSending');
            
             // 🔒 이메일 전송 성공 메시지
             let successMessage = result.message;
            
            if (result.scheduled) {
                // 예약 전송 성공
                showEmailResult('success', successMessage + ` (예약 ID: ${result.scheduleId})`);
            } else {
                // 즉시 전송 성공
                showEmailResult('success', successMessage);
            }
            
            // STEP 4 영역으로 스크롤하여 결과를 보기 쉽게 함
            setTimeout(() => {
                const step4Element = document.getElementById('step4');
                if (step4Element) {
                    step4Element.scrollIntoView({ 
                        behavior: 'smooth', 
                        block: 'start',
                        inline: 'nearest'
                    });
                }
            }, 500);
            
            // 모든 이메일 전송 후 관련 데이터 새로고침
            await Promise.all([
                loadEmailHistory(),
                refreshScheduledEmails(),
                updateLocalEmailHistoryUI(), // 로컬 이력 카운트 업데이트
                loadLocalEmailHistoryContent() // 로컬 이력 컨텐츠 업데이트
            ]);

            // 📧 이메일 전송 완료 시 서버 데이터 삭제 (즉시 전송의 경우에만)
            if (!result.scheduled) {
                await cleanupAfterEmailSent();
            }
            
            // 🔒 이메일 전송 완료 후 발주서 관련 버튼들 비활성화
            disableGeneratedFileButtons();
        } else {
            //console.log('❌ 이메일 전송 실패:', result.error);
            
            // 네트워크 오류인 경우 재시도 안내 추가
            let errorMessage = result.error || '이메일 전송에 실패했습니다.';
            if (result.suggestion) {
                errorMessage += '\n\n💡 ' + result.suggestion;
            }
            
            // 503 오류인 경우 재시도 버튼 표시
            if (response.status === 503) {
                errorMessage += '\n\n잠시 후 "이메일 전송" 버튼을 다시 클릭해주세요.';
            }
            
            showEmailResult('error', errorMessage);
        }
        
    } catch (error) {
        hideProgress();
        console.error('❌ 이메일 전송 오류:', error);
        showEmailResult('error', '이메일 전송 중 오류가 발생했습니다: ' + error.message);
        
        // 추가 알림으로 확실히 사용자에게 알림
        showAlert('error', '이메일 전송 중 오류가 발생했습니다: ' + error.message);
    }
}

// 이메일 전송 결과 표시
function showEmailResult(type, message) {
    const emailResult = document.getElementById('emailResult');
    const alertClass = type === 'success' ? 'alert-success' : 'alert-error';
    const icon = type === 'success' ? '●' : '●';
    
    emailResult.innerHTML = `
        <div class="alert ${alertClass}" style="margin-top: 20px;">
            <span style="color: ${type === 'success' ? '#28a745' : '#dc3545'}">${icon}</span> ${message}
        </div>
    `;
    
    // 이메일 결과 메시지 표시 후 해당 위치로 부드럽게 스크롤
    setTimeout(() => {
        emailResult.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'start',
            inline: 'nearest'
        });
    }, 200);
}

// 이메일 이력 로드
async function loadEmailHistory() {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10초 타임아웃
        
        const response = await fetch('/api/email/history', {
            signal: controller.signal,
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        const historyList = document.getElementById('emailHistoryList');
        const controlsContainer = document.getElementById('emailHistoryControls');
        
        if (result.success && result.history.length > 0) {
            // 이메일 이력이 있으면 컨트롤 영역 표시
            if (controlsContainer) {
                controlsContainer.style.display = 'flex';
            }
            
            historyList.innerHTML = result.history.slice(0, 10).map((item, displayIndex) => {
                const statusClass = item.status === 'success' ? '' : 'failed';
                const statusIcon = item.status === 'success' ? '●' : '●';
                
                // Supabase 필드명 매핑 (sent_at → sentAt, to_email → to)
                const sentAt = item.sent_at || item.sentAt;
                const toEmail = item.to_email || item.to;
                let errorMessage = item.error_message || item.error;
                
                // 예약 정보인지 확인 (JSON 형태이고 예약 관련 정보가 있으면 오류가 아님)
                let isScheduleInfo = false;
                if (errorMessage && errorMessage.startsWith('{')) {
                    try {
                        const parsed = JSON.parse(errorMessage);
                        if (parsed.status || parsed.body || parsed.attachmentPath || parsed.createdAt) {
                            isScheduleInfo = true; // 예약 정보로 판단
                            // 실제 오류가 있는 경우만 표시
                            errorMessage = parsed.errorMessage || null;
                        }
                    } catch (e) {
                        // JSON 파싱 실패시 원본 오류 메시지 유지
                    }
                }
                
                // ID 또는 인덱스 사용 (Supabase ID가 없으면 인덱스로 fallback)
                const historyId = item.id || `index_${displayIndex}`; // UUID 또는 인덱스 기반 ID
                const isRealId = !!item.id; // 실제 DB ID인지 확인
                
                // ID 검증 완료
                
                // 예약 완료된 이메일인지 표시
                let emailTypeIndicator = '';
                if (item.message_id && item.message_id.startsWith('SCH_')) {
                    emailTypeIndicator = '<span style="background: #e3f2fd; color: #1976d2; padding: 2px 6px; border-radius: 3px; font-size: 0.8em; margin-left: 8px;">📅 예약전송</span>';
                }
                
                return `
                    <div class="history-item ${statusClass}" style="display: flex; align-items: center; justify-content: space-between;">
                        <div style="display: flex; align-items: center; flex: 1;">
                            <input type="checkbox" class="history-checkbox" data-id="${historyId}" data-is-real-id="${isRealId}" onchange="updateDeleteButton()" style="margin-right: 10px;">
                            <div style="flex: 1;">
                                <div><strong><span style="color: ${item.status === 'success' ? '#28a745' : '#dc3545'}">${statusIcon}</span> ${toEmail || 'Unknown'}${emailTypeIndicator}</strong></div>
                                <div>${item.subject || 'No Subject'}</div>
                                <div class="history-time">${sentAt ? new Date(sentAt).toLocaleString() : 'Unknown Time'}</div>
                                ${errorMessage && !isScheduleInfo ? `<div style="color: #dc3545; font-size: 0.9em;">ERROR: ${errorMessage}</div>` : ''}
                            </div>
                        </div>
                        <button class="btn" onclick="deleteSingleHistory('${historyId}', ${isRealId})" style="background: linear-gradient(135deg, #dc3545 0%, #c82333 100%); margin-left: 10px; padding: 5px 10px; font-size: 0.8em;">삭제</button>
                    </div>
                `;
            }).join('');
        } else {
            historyList.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #666; font-size: 0.95em;">
                    <div style="font-size: 2em; margin-bottom: 10px;">📧</div>
                    <div style="margin-bottom: 8px; font-weight: 500;">전송 이력이 없습니다</div>
                </div>
            `;
            // 이메일 이력이 없으면 컨트롤 영역 숨기기
            if (controlsContainer) {
                controlsContainer.style.display = 'none';
            }
        }
        
        // 전체 선택 체크박스 초기화
        const selectAllCheckbox = document.getElementById('selectAllHistory');
        if (selectAllCheckbox) {
            selectAllCheckbox.checked = false;
        }
        updateDeleteButton();
        
    } catch (error) {
        console.error('이력 로드 오류:', error);
        // 오류 발생 시에도 기본 UI 표시
        const historyList = document.getElementById('emailHistoryList');
        const controlsContainer = document.getElementById('emailHistoryControls');
        
        if (historyList) {
            historyList.innerHTML = '<p style="text-align: center; color: #6c757d;">전송 이력을 불러오는 중 문제가 발생했습니다.</p>';
        }
        
        if (controlsContainer) {
            controlsContainer.style.display = 'none';
        }
        
        // 개발 환경에서만 사용자에게 알림
        if (isDevelopment) {
            showAlert('warning', '이메일 이력을 불러오는 중 문제가 발생했습니다.');
        }
    }
}



// 🔄 전송 이력 새로고침 (수동)
async function refreshEmailHistory() {
    //console.log('📧 전송 이력 수동 새로고침 시작');
    
    try {
        // 새로고침 버튼에 로딩 표시
        const refreshBtn = document.querySelector('button[onclick="refreshEmailHistory()"]');
        if (refreshBtn) {
            const originalText = refreshBtn.innerHTML;
            refreshBtn.innerHTML = '🔄 새로고침 중...';
            refreshBtn.disabled = true;
            
            // 이력 로드
            await loadEmailHistory();
            
            // 원래 상태로 복원
            refreshBtn.innerHTML = originalText;
            refreshBtn.disabled = false;
            
            showAlert('success', '전송 이력이 새로고침되었습니다.');
        } else {
            await loadEmailHistory();
        }
        
        //console.log('✅ 전송 이력 새로고침 완료');
        
    } catch (error) {
        console.error('❌ 전송 이력 새로고침 오류:', error);
        
        // 버튼 상태 복원
        const refreshBtn = document.querySelector('button[onclick="refreshEmailHistory()"]');
        if (refreshBtn) {
            refreshBtn.innerHTML = '🔄 새로고침';
            refreshBtn.disabled = false;
        }
        
        showAlert('error', '전송 이력 새로고침 중 오류가 발생했습니다.');
    }
}

// 🔄 예약된 이메일 목록 새로고침
async function refreshScheduledEmails() {
    try {
        //console.log('📅 예약된 이메일 목록 새로고침 시작');
        
        // 새로고침 버튼에 로딩 표시
        const refreshBtn = document.querySelector('button[onclick="refreshScheduledEmails()"]');
        let originalText = '';
        if (refreshBtn) {
            originalText = refreshBtn.innerHTML;
            refreshBtn.innerHTML = '🔄 새로고침 중...';
            refreshBtn.disabled = true;
        }
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10초 타임아웃
        
        const response = await fetch('/api/email/scheduled', {
            signal: controller.signal,
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
            displayScheduledEmails(result.scheduled || []);
            console.log('✅ 예약된 이메일 목록 갱신 완료:', result.total || 0);
            
            // 성공 시 알림
            if (refreshBtn) {
                showAlert('success', '예약된 이메일 목록이 새로고침되었습니다.');
            }
        } else {
            console.error('❌ 예약된 이메일 목록 조회 실패:', result.error);
            // 오류가 발생해도 빈 목록으로 표시
            displayScheduledEmails([]);
        }
        
        // 버튼 상태 복원
        if (refreshBtn) {
            refreshBtn.innerHTML = originalText;
            refreshBtn.disabled = false;
        }
        
    } catch (error) {
        console.error('❌ 예약된 이메일 목록 새로고침 오류:', error);
        
        // 버튼 상태 복원
        const refreshBtn = document.querySelector('button[onclick="refreshScheduledEmails()"]');
        if (refreshBtn) {
            refreshBtn.innerHTML = '🔄 새로고침';
            refreshBtn.disabled = false;
        }
        
        // 네트워크 오류 시에도 빈 목록으로 표시하여 UI가 깨지지 않도록 함
        displayScheduledEmails([]);
        
        // 사용자에게 알림
        showAlert('error', '예약된 이메일 목록을 가져오는 중 오류가 발생했습니다.');
    }
}

// 📅 예약된 이메일 목록 표시
function displayScheduledEmails(scheduledEmails) {
    const container = document.getElementById('scheduledEmailsList');
    const controlsContainer = document.getElementById('scheduledEmailsControls');
    
    // 안전성 검사
    if (!container) {
        console.error('scheduledEmailsList 요소를 찾을 수 없습니다.');
        return;
    }
    
    if (!scheduledEmails || scheduledEmails.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #666; font-size: 0.95em;">
                <div style="font-size: 2em; margin-bottom: 10px;">📅</div>
                <div style="margin-bottom: 8px; font-weight: 500;">예약된 이메일이 없습니다</div>
            </div>
        `;
        // 컨트롤 영역 숨기기
        if (controlsContainer) {
            controlsContainer.style.display = 'none';
        }
        return;
    }
    
    // 예약된 이메일이 있으면 컨트롤 영역 표시
    if (controlsContainer) {
        controlsContainer.style.display = 'flex';
    }
    
    let html = '<div class="scheduled-list">';
    
    scheduledEmails.forEach(email => {
        const scheduleTime = new Date(email.scheduleTime);
        const now = new Date();
        const isPending = email.status === 'scheduled'; // 'pending' → 'scheduled'로 변경
        const canCancel = isPending && scheduleTime > now;
        
        // 상태에 따른 스타일링
        let statusStyle = '';
        let statusText = '';
        
        switch (email.status) {
            case 'scheduled': // 'pending' → 'scheduled'로 변경
                statusStyle = 'background: #fff3cd; color: #856404; border-left: 4px solid #ffc107;';
                statusText = '⏳ 대기중';
                break;
            case 'success': // 'sent' → 'success'로 추가
            case 'simulation': // 시뮬레이션도 전송완료로 표시
            case 'sent':
                statusStyle = 'background: #d1f2eb; color: #155724; border-left: 4px solid #28a745;';
                statusText = email.status === 'simulation' ? '✅ 전송완료 (시뮬레이션)' : '✅ 전송완료';
                break;
            case 'cancelled':
                statusStyle = 'background: #f8d7da; color: #721c24; border-left: 4px solid #dc3545;';
                statusText = '❌ 취소됨';
                break;
            case 'failed':
                statusStyle = 'background: #f8d7da; color: #721c24; border-left: 4px solid #dc3545;';
                statusText = '💥 실패';
                break;
            default:
                statusStyle = 'background: #f8f9fa; color: #6c757d; border-left: 4px solid #dee2e6;';
                statusText = `❓ ${email.status}`;
        }
        
        // 안전한 날짜 처리
        const safeScheduleTime = scheduleTime && !isNaN(scheduleTime.getTime()) ? 
            scheduleTime.toLocaleString('ko-KR') : '시간 정보 없음';
        
        const safeCreatedAt = email.createdAt ? 
            (() => {
                const createdDate = new Date(email.createdAt);
                return !isNaN(createdDate.getTime()) ? createdDate.toLocaleString('ko-KR') : '등록시간 정보 없음';
            })() : '등록시간 정보 없음';
        
        const safeSentAt = email.sentAt ? 
            (() => {
                const sentDate = new Date(email.sentAt);
                return !isNaN(sentDate.getTime()) ? sentDate.toLocaleString('ko-KR') : null;
            })() : null;
        
        html += `
            <div class="scheduled-item" style="margin-bottom: 15px; padding: 15px; border-radius: 8px; ${statusStyle}">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                    <div style="display: flex; align-items: flex-start; flex: 1;">
                        <input type="checkbox" class="scheduled-checkbox" data-id="${email.id || 'ID 없음'}" onchange="updateDeleteScheduledButton()" style="margin-right: 15px; margin-top: 5px; transform: scale(1.2);">
                        <div style="flex: 1;">
                            <div style="font-weight: 600; margin-bottom: 5px;">${email.subject || '제목 없음'}</div>
                        <div style="font-size: 0.9em; opacity: 0.8;">받는사람: ${email.to || '수신자 정보 없음'}</div>
                        <div style="font-size: 0.9em; opacity: 0.8;">예약시간: ${safeScheduleTime}</div>
                        <div style="font-size: 0.9em; opacity: 0.8;">등록시간: ${safeCreatedAt}</div>
                        ${safeSentAt ? `<div style="font-size: 0.9em; opacity: 0.8;">전송시간: ${safeSentAt}</div>` : ''}
                        ${email.error ? (
                            email.status === 'cancelled' && email.error.includes('취소') ?
                            `<div style="font-size: 0.8em; color: #856404; margin-top: 5px;">취소 사유: ${email.error}</div>` :
                            `<div style="font-size: 0.8em; color: #dc3545; margin-top: 5px;">오류: ${email.error}</div>`
                        ) : ''}
                        <div style="font-size: 0.8em; opacity: 0.6; margin-top: 5px;">ID: ${email.id || 'ID 없음'}</div>
                        </div>
                    </div>
                    <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 8px;">
                        <span style="padding: 4px 8px; border-radius: 4px; font-size: 0.8em; font-weight: 600; background: rgba(255,255,255,0.3);">
                            ${statusText}
                        </span>
                        ${canCancel ? `
                            <button onclick="cancelScheduledEmail('${email.id}')" 
                                    class="btn" 
                                    style="background: #dc3545; color: white; font-size: 0.8em; padding: 6px 12px;">
                                예약 취소
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    container.innerHTML = html;
    
    // 전체 선택 체크박스 초기화
    const selectAllCheckbox = document.getElementById('selectAllScheduled');
    if (selectAllCheckbox) {
        selectAllCheckbox.checked = false;
    }
    updateDeleteScheduledButton();
}

// ❌ 예약된 이메일 취소
async function cancelScheduledEmail(scheduleId) {

    
    if (!confirm('이 예약된 이메일을 취소하시겠습니까?')) {
        return;
    }
    
    try {
        //console.log('❌ 예약된 이메일 취소 시작:', scheduleId);
        
        const response = await fetch(`/api/email/scheduled/${scheduleId}`, {
            method: 'DELETE'
        });
        
        //console.log('📡 서버 응답 상태:', response.status, response.statusText);
        
        const result = await response.json();
        //console.log('📋 서버 응답 결과:', result);
        
        if (result.success) {
            showAlert('success', '예약된 이메일이 취소되었습니다.');
            // 목록 새로고침
            refreshScheduledEmails();
            //console.log('✅ 예약된 이메일 취소 완료:', scheduleId);
        } else {
            console.error('❌ 취소 실패:', result.error);
            showAlert('error', result.error || '예약된 이메일 취소에 실패했습니다.');
        }
    } catch (error) {
        console.error('❌ 예약된 이메일 취소 오류:', error);
        showAlert('error', '예약된 이메일 취소 중 오류가 발생했습니다.');
    }
}

// 예약된 이메일 전체 선택/해제
function toggleAllScheduled() {
    const selectAll = document.getElementById('selectAllScheduled');
    const checkboxes = document.querySelectorAll('.scheduled-checkbox');
    
    checkboxes.forEach(checkbox => {
        checkbox.checked = selectAll.checked;
    });
    
    updateDeleteScheduledButton();
}

// 선택 삭제 버튼 상태 업데이트
function updateDeleteScheduledButton() {
    const checkboxes = document.querySelectorAll('.scheduled-checkbox');
    const checkedBoxes = document.querySelectorAll('.scheduled-checkbox:checked');
    const deleteBtn = document.getElementById('deleteSelectedScheduled');
    const selectAllCheckbox = document.getElementById('selectAllScheduled');
    
    // 버튼이 존재하는 경우에만 상태 업데이트
    if (deleteBtn) {
        if (checkedBoxes.length > 0) {
            deleteBtn.style.display = 'inline-block';
        } else {
            deleteBtn.style.display = 'none';
        }
    }
    
    // 전체 선택 체크박스가 존재하는 경우에만 상태 업데이트
    if (selectAllCheckbox && checkboxes.length > 0) {
        if (checkedBoxes.length === checkboxes.length) {
            selectAllCheckbox.checked = true;
            selectAllCheckbox.indeterminate = false;
        } else if (checkedBoxes.length > 0) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = true;
        } else {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        }
    }
}

// 선택된 예약 이메일 삭제
async function deleteSelectedScheduled() {
    const checkedBoxes = document.querySelectorAll('.scheduled-checkbox:checked');
    

    
    if (checkedBoxes.length === 0) {
        showAlert('error', '삭제할 예약 이메일을 선택해주세요.');
        return;
    }
    
    // 선택된 scheduleId들 출력
    const scheduleIds = Array.from(checkedBoxes).map(checkbox => {
        const scheduleId = checkbox.getAttribute('data-id');
        //console.log('📋 체크박스 data-id:', scheduleId);
        return scheduleId;
    });

    
    if (!confirm(`선택한 ${checkedBoxes.length}개의 예약 이메일을 삭제하시겠습니까?`)) {
        return;
    }
    
    try {
        const deletePromises = Array.from(checkedBoxes).map(checkbox => {
            const scheduleId = checkbox.getAttribute('data-id');
            //console.log('🔥 삭제 요청 전송:', scheduleId);
            return fetch(`/api/email/scheduled/${scheduleId}`, { method: 'DELETE' });
        });
        
        const results = await Promise.all(deletePromises);

        /*
        console.log('📊 삭제 결과:', results.map((r, i) => ({ 
            index: i, 
            status: r.status, 
            ok: r.ok,
            scheduleId: scheduleIds[i]
        })));
        */
        
        const successCount = results.filter(result => result.ok).length;
        
        if (successCount === checkedBoxes.length) {
            showAlert('success', `${successCount}개의 예약 이메일이 삭제되었습니다.`);
        } else {
            showAlert('warning', `${successCount}개 삭제 완료, ${checkedBoxes.length - successCount}개 삭제 실패`);
        }
        
    
        refreshScheduledEmails();
        
    } catch (error) {
        console.error('❌ 선택 삭제 오류:', error);
        showAlert('error', '예약 이메일 삭제 중 오류가 발생했습니다.');
    }
}

// 모든 예약 이메일 삭제
async function deleteAllScheduled() {
    const checkboxes = document.querySelectorAll('.scheduled-checkbox');
    
    if (checkboxes.length === 0) {
        showAlert('error', '삭제할 예약 이메일이 없습니다.');
        return;
    }
    
    if (!confirm(`모든 예약 이메일(${checkboxes.length}개)을 삭제하시겠습니까?\n\n⚠️ 이 작업은 되돌릴 수 없습니다.`)) {
        return;
    }
    
    try {
        const deletePromises = Array.from(checkboxes).map(checkbox => {
            const scheduleId = checkbox.getAttribute('data-id');
            return fetch(`/api/email/scheduled/${scheduleId}`, { method: 'DELETE' });
        });
        
        const results = await Promise.all(deletePromises);
        const successCount = results.filter(result => result.ok).length;
        
        if (successCount === checkboxes.length) {
            showAlert('success', `모든 예약 이메일(${successCount}개)이 삭제되었습니다.`);
        } else {
            showAlert('warning', `${successCount}개 삭제 완료, ${checkboxes.length - successCount}개 삭제 실패`);
        }
        
        refreshScheduledEmails();
        
    } catch (error) {
        console.error('❌ 전체 삭제 오류:', error);
        showAlert('error', '예약 이메일 삭제 중 오류가 발생했습니다.');
    }
}

// 빠른 시간 선택 함수
function setQuickTime(minutesToAdd) {
    const now = new Date();
    const targetTime = new Date(now.getTime() + minutesToAdd * 60 * 1000);
    
    //console.log('⚡ 빠른 선택 디버깅:');
    //console.log('- 현재 시간:', now.toLocaleString('ko-KR'));
    //console.log('- 목표 시간:', targetTime.toLocaleString('ko-KR'));
    
    // datetime-local을 위한 올바른 형식 생성 (시간대 오프셋 고려)
    const year = targetTime.getFullYear();
    const month = String(targetTime.getMonth() + 1).padStart(2, '0');
    const day = String(targetTime.getDate()).padStart(2, '0');
    const hours = String(targetTime.getHours()).padStart(2, '0');
    const minutes = String(targetTime.getMinutes()).padStart(2, '0');
    const datetimeLocalValue = `${year}-${month}-${day}T${hours}:${minutes}`;
    
    //console.log('- datetime-local 형식 (수정됨):', datetimeLocalValue);
    
    // datetime-local 형식으로 변환
    const scheduleTimeInput = document.getElementById('scheduleTime');
    if (scheduleTimeInput) {
        scheduleTimeInput.value = datetimeLocalValue;
        updateSelectedTimeDisplay(targetTime);
    }
    
    // 빠른 선택 버튼들의 활성 상태 업데이트
    updateQuickTimeButtons();
    
    //console.log(`⚡ 빠른 선택: ${minutesToAdd}분 후 (${targetTime.toLocaleString('ko-KR')})`);
}

// 현재 시간 + 1시간 설정
function setCurrentTimePlus1Hour() {
    const now = new Date();
    
    // 디버깅: 현재 시간대 정보 출력
    //console.log('🕐 시간대 디버깅 정보:');
    //console.log('- 현재 시간 (local):', now.toString());
    //console.log('- UTC 시간:', now.toUTCString());
    //console.log('- 한국 시간:', now.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }));
    //console.log('- 시간대 오프셋 (분):', now.getTimezoneOffset());
    //console.log('- 브라우저 시간대:', Intl.DateTimeFormat().resolvedOptions().timeZone);
    
    // 현재 로컬 시간에 1시간 추가 (사용자의 시간대 기준)
    const targetTime = new Date(now.getTime() + 60 * 60 * 1000);
    
    // datetime-local을 위한 올바른 형식 생성 (시간대 오프셋 고려)
    const year = targetTime.getFullYear();
    const month = String(targetTime.getMonth() + 1).padStart(2, '0');
    const day = String(targetTime.getDate()).padStart(2, '0');
    const hours = String(targetTime.getHours()).padStart(2, '0');
    const mins = String(targetTime.getMinutes()).padStart(2, '0');
    const datetimeLocalValue = `${year}-${month}-${day}T${hours}:${mins}`;
    
    //console.log('- 설정할 시간 (로컬 + 1시간):', targetTime.toString());
    //console.log('- datetime-local 형식 (수정됨):', datetimeLocalValue);
    
    const scheduleTimeInput = document.getElementById('scheduleTime');
    if (scheduleTimeInput) {
        scheduleTimeInput.value = datetimeLocalValue;
        updateSelectedTimeDisplay(targetTime);
    }
    
    updateQuickTimeButtons();
    //console.log(`🕐 현재+1시간 설정 완료: ${targetTime.toLocaleString('ko-KR')}`);
}

// 선택된 시간 표시 업데이트
function updateSelectedTimeDisplay(dateTime) {
    const selectedTimeText = document.getElementById('selectedTimeText');
    if (selectedTimeText && dateTime) {
        const now = new Date();
        const timeDiff = dateTime.getTime() - now.getTime();
        const minutesDiff = Math.round(timeDiff / (1000 * 60));
        
        let timeDescription = '';
        if (minutesDiff < 60) {
            timeDescription = `약 ${minutesDiff}분 후`;
        } else if (minutesDiff < 1440) {
            const hours = Math.round(minutesDiff / 60);
            timeDescription = `약 ${hours}시간 후`;
        } else {
            const days = Math.round(minutesDiff / 1440);
            timeDescription = `약 ${days}일 후`;
        }
        
        selectedTimeText.innerHTML = `${dateTime.toLocaleString('ko-KR')} (${timeDescription})`;
    }
}

// 빠른 선택 버튼들의 활성 상태 업데이트
function updateQuickTimeButtons() {
    const quickTimeButtons = document.querySelectorAll('.quick-time-btn');
    quickTimeButtons.forEach(btn => {
        btn.style.fontWeight = 'normal';
        btn.style.transform = 'none';
    });
}




// 날짜시간을 YYYYMMDDHHMM 형태로 포맷팅
function formatDateTimeForSubject() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    
    return `${year}${month}${day}${hours}${minutes}`;
}

// 이메일 제목 자동 설정 (비어있을 때만)
function setEmailSubject() {
    const emailSubjectInput = document.getElementById('emailSubject');
    if (emailSubjectInput && !emailSubjectInput.value.trim()) {
        const dateTime = formatDateTimeForSubject();
        emailSubjectInput.value = `런모아 ${dateTime}_`;
        console.log(`📧 이메일 제목 자동 설정: 런모아 ${dateTime}`);
    } else if (emailSubjectInput && emailSubjectInput.value.trim()) {
        console.log('📧 이메일 제목이 이미 설정되어 있어 자동 설정을 건너뜁니다:', emailSubjectInput.value);
    }
}



// 유틸리티 함수들
function showStep(stepNumber) {
    const stepElement = document.getElementById(`step${stepNumber}`);
    if (!stepElement) {
        console.error(`❌ STEP ${stepNumber} 요소를 찾을 수 없습니다.`);
        return;
    }
    
    stepElement.classList.remove('hidden');
    //console.log(`✅ STEP ${stepNumber} 표시 완료`);
    
    // STEP 4 (이메일 전송)가 표시될 때 예약된 이메일 목록 갱신 및 제목 설정
    if (stepNumber === 4) {
        setTimeout(() => {
            refreshScheduledEmails();
            setEmailSubject(); // 이메일 제목 자동 설정 추가
        }, 100);
    }
}

// 🎯 STEP별 메시지 표시 함수들 (스크롤 없음)
function showStepAlert(stepNumber, type, message) {
    const alertId = `step${stepNumber}Alert`;
    const alertElement = document.getElementById(alertId);
    
    // 요소가 없는 경우 기본 showAlert 사용
    if (!alertElement) {
        //console.log(`[STEP${stepNumber} ${type.toUpperCase()}] ${message}`);
        return showAlert(type, message);
    }
    
    const alertClass = type === 'success' ? 'alert-success' : 
                      type === 'warning' ? 'alert-warning' : 
                      type === 'info' ? 'alert-info' : 'alert-error';
    const icon = type === 'success' ? '●' : 
                type === 'warning' ? '▲' : 
                type === 'info' ? 'ℹ' : '●';
    
    alertElement.innerHTML = `
        <div class="alert ${alertClass}">
            ${icon} ${message}
        </div>
    `;
    
    // 🚫 스크롤 이동 없음 - 현재 위치 유지
    
    // 7초 후 자동 제거
    setTimeout(() => {
        if (alertElement && alertElement.innerHTML.includes(message)) {
            alertElement.innerHTML = '';
        }
    }, 7000);
}

// STEP별 편의 함수들
function showStep1Alert(type, message) {
    showStepAlert(1, type, message);
}

function showStep2Alert(type, message) {
    showStepAlert(2, type, message);
}

function showStep3Alert(type, message) {
    showStepAlert(3, type, message);
}

// 기존 showAlert 함수 (호환성 유지, 스크롤 제거)
function showAlert(type, message) {
    const uploadAlert = document.getElementById('uploadAlert');
    
    // 요소가 없는 경우 콘솔로 출력하고 종료
    if (!uploadAlert) {
        console.log(`[${type.toUpperCase()}] ${message}`);
        return;
    }
    
    const alertClass = type === 'success' ? 'alert-success' : 
                      type === 'warning' ? 'alert-warning' : 
                      type === 'info' ? 'alert-info' : 'alert-error';
    const icon = type === 'success' ? '●' : 
                type === 'warning' ? '▲' : 
                type === 'info' ? 'ℹ' : '●';
    
    uploadAlert.innerHTML = `
        <div class="alert ${alertClass}">
            ${icon} ${message}
        </div>
    `;
    
    // 🚫 스크롤 이동 제거 - 화면이 위로 올라가지 않음
    
    // 7초 후 자동 제거 (길어진 메시지를 위해 연장)
    setTimeout(() => {
        if (uploadAlert && uploadAlert.innerHTML.includes(message)) {
            uploadAlert.innerHTML = '';
        }
    }, 7000);
}

function showLoading(message) {
    const uploadAlert = document.getElementById('uploadAlert');
    
    if (!uploadAlert) {
        console.log(`[LOADING] ${message}`);
        return;
    }
    
    uploadAlert.innerHTML = `
        <div class="alert alert-success">
            <div class="loading"></div> ${message}
        </div>
    `;
}

function hideLoading() {
    const uploadAlert = document.getElementById('uploadAlert');
    
    if (!uploadAlert) {
        return;
    }
    
    uploadAlert.innerHTML = '';
}

// 진행률 표시 시작
function showProgress(message = '처리 중...') {
    const progressContainer = document.getElementById('progressContainer');
    const progressMessage = document.getElementById('progressMessage');
    const progressPercent = document.getElementById('progressPercent');
    const progressFill = document.getElementById('progressFill');
    
    progressMessage.textContent = message;
    progressPercent.textContent = '0%';
    progressFill.style.width = '0%';
    
    progressContainer.classList.remove('hidden');
}

// 진행률 업데이트
function updateProgress(percent, message = null) {
    const progressMessage = document.getElementById('progressMessage');
    const progressPercent = document.getElementById('progressPercent');
    const progressFill = document.getElementById('progressFill');
    
    if (message) {
        progressMessage.textContent = message;
    }
    
    progressPercent.textContent = `${percent}%`;
    progressFill.style.width = `${percent}%`;
}

// 진행률 숨기기
function hideProgress() {
    const progressContainer = document.getElementById('progressContainer');
    const progressPercent = document.getElementById('progressPercent');
    const progressFill = document.getElementById('progressFill');
    
    // 🔄 진행바 완전 리셋 (115% 방지)
    if (progressPercent) progressPercent.textContent = '0%';
    if (progressFill) progressFill.style.width = '0%';
    
    progressContainer.classList.add('hidden');
}

// 진행률 시뮬레이션 (중단 가능)
function simulateProgress(steps, totalDuration = 3000) {
    let currentStep = 0;
    let timeoutId = null;
    let cancelled = false;
    const stepDuration = totalDuration / steps.length;
    
    const processStep = (resolve) => {
        if (cancelled) {
            resolve();
            return;
        }
        
        if (currentStep < steps.length) {
            const step = steps[currentStep];
            updateProgress(step.percent, step.message);
            currentStep++;
            timeoutId = setTimeout(() => processStep(resolve), stepDuration);
        } else {
            resolve();
        }
    };
    
    const promise = new Promise((resolve) => {
        processStep(resolve);
    });
    
    // 중단 함수 추가
    promise.cancel = () => {
        cancelled = true;
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
    };
    
    return promise;
}

// 모든 단계 초기화
function resetAllSteps() {
    // 전역 변수 초기화 (중요!)
    currentOrderFileId = null;
    currentSupplierFileId = null;
    currentMapping = {};
    generatedFileName = null;
    displayFileName = null;
    orderFileHeaders = [];
    supplierFileHeaders = [];
    
    // 직접 입력 모드 변수 초기화
    if (window.directInputData) delete window.directInputData;
    if (window.isDirectInputMode) delete window.isDirectInputMode;
    if (window.pendingDirectInputData) delete window.pendingDirectInputData;
    if (window.pendingMappedData) delete window.pendingMappedData;
    if (window.pendingAIMappings) delete window.pendingAIMappings;
    
    // STEP 2, 3, 4 숨기기
    document.getElementById('step2').classList.add('hidden');
    document.getElementById('step3').classList.add('hidden');
    document.getElementById('step4').classList.add('hidden');
    
    // 직접 입력 폼 숨기기
    const directInputStep = document.getElementById('directInputStep');
    if (directInputStep) {
        directInputStep.classList.add('hidden');
    }
    
    // AI 매핑 확인 UI 숨기기/제거
    const aiMappingConfirmation = document.getElementById('aiMappingConfirmation');
    if (aiMappingConfirmation) {
        aiMappingConfirmation.remove();
    }
    
    // 업로드 결과 초기화
    const uploadResultOrder = document.getElementById('uploadResultOrder');
    const uploadResultSupplier = document.getElementById('uploadResultSupplier');
    const uploadAlertOrder = document.getElementById('uploadAlertOrder');
    const uploadAlertSupplier = document.getElementById('uploadAlertSupplier');
    
    if (uploadResultOrder) {
        uploadResultOrder.classList.add('hidden');
    }
    if (uploadResultSupplier) {
        uploadResultSupplier.classList.add('hidden');
    }
    if (uploadAlertOrder) {
        uploadAlertOrder.innerHTML = '';
    }
    if (uploadAlertSupplier) {
        uploadAlertSupplier.innerHTML = '';
    }
    
    // 생성 결과 초기화
    const generateResult = document.getElementById('generateResult');
    if (generateResult) {
        generateResult.innerHTML = '';
    }
    
    // 이메일 결과 초기화
    const emailResult = document.getElementById('emailResult');
    if (emailResult) {
        emailResult.innerHTML = '';
    }
    
    // 필수 필드 입력 폼 숨기기
    const missingFieldsForm = document.getElementById('missingFieldsForm');
    if (missingFieldsForm) {
        missingFieldsForm.classList.add('hidden');
    }
    
    // 수동필드 입력 섹션 숨기기
    const manualFieldsSection = document.getElementById('manualFieldsSection');
    if (manualFieldsSection) {
        manualFieldsSection.classList.add('hidden');
    }
    
    // 파일 입력 초기화
    const fileInputOrder = document.getElementById('fileInputOrder');
    const fileInputSupplier = document.getElementById('fileInputSupplier');
    if (fileInputOrder) {
        fileInputOrder.value = '';
    }
    if (fileInputSupplier) {
        fileInputSupplier.value = '';
    }
    
    // 매핑 상태 초기화
    sessionStorage.setItem('mappingSaved', 'false');
    
    // 타겟 필드 초기화
    resetTargetFields();
    
    // GENERATE ORDER 버튼 비활성화
    setTimeout(() => {
        updateGenerateOrderButton();
    }, 100);
    
    // 매핑 관련 버튼들 활성화
    enableMappingButtons();
    
    // 진행률 숨기기
    hideProgress();
    
    // 업로드 상태에 따른 버튼 가시성 제어
    updateUploadStatusAndButtons();
}

// 타겟 필드 초기화
function resetTargetFields() {
    const targetFields = document.querySelectorAll('#targetFields .field-item');
    targetFields.forEach(field => {
        // 원래 텍스트로 복원
        const targetName = field.dataset.target;
        field.innerHTML = targetName;
        
        // 스타일 초기화
        field.style.background = '';
        field.style.color = '';
        
        // 기본 클래스만 유지
        field.className = 'field-item';
    });
}

// 전체 선택/해제
function toggleSelectAll() {
    const selectAllCheckbox = document.getElementById('selectAllHistory');
    const historyCheckboxes = document.querySelectorAll('.history-checkbox');
    
    historyCheckboxes.forEach(checkbox => {
        checkbox.checked = selectAllCheckbox.checked;
    });
    
    updateDeleteButton();
}

// 삭제 버튼 상태 업데이트
function updateDeleteButton() {
    const checkedBoxes = document.querySelectorAll('.history-checkbox:checked');
    const deleteBtn = document.getElementById('deleteSelectedBtn');
    
    if (checkedBoxes.length > 0) {
        deleteBtn.style.display = 'inline-block';
    } else {
        deleteBtn.style.display = 'none';
    }
    
    // 전체 선택 체크박스 상태 업데이트
    const allCheckboxes = document.querySelectorAll('.history-checkbox');
    const selectAllCheckbox = document.getElementById('selectAllHistory');
    
    if (allCheckboxes.length > 0) {
        selectAllCheckbox.checked = checkedBoxes.length === allCheckboxes.length;
    }
}

// 선택된 이력 삭제 (Supabase ID 기반)
async function deleteSelectedHistory() {
    const checkedBoxes = document.querySelectorAll('.history-checkbox:checked');
    
    if (checkedBoxes.length === 0) {
        showAlert('warning', '삭제할 항목을 선택해주세요.');
        return;
    }
    
    if (!confirm(`선택된 ${checkedBoxes.length}개 항목을 삭제하시겠습니까?`)) {
        return;
    }
    
    try {
        showLoading('선택된 이력을 삭제하고 있습니다...');
        
        // 체크박스에서 ID 수집 및 타입 구분
        const checkboxData = Array.from(checkedBoxes).map(checkbox => ({
            id: checkbox.dataset.id,
            isRealId: checkbox.dataset.isRealId === 'true'
        }));
        
        // 실제 ID와 인덱스로 분류
        const realIds = checkboxData.filter(item => item.isRealId && !item.id.startsWith('index_')).map(item => item.id);
        const indexIds = checkboxData.filter(item => !item.isRealId || item.id.startsWith('index_')).map(item => {
            return item.id.startsWith('index_') ? parseInt(item.id.replace('index_', '')) : parseInt(item.id);
        });
        
        // 요청 데이터 구성
        let requestBody = {};
        if (realIds.length > 0) {
            requestBody.historyIds = realIds;
        }
        if (indexIds.length > 0) {
            requestBody.indices = indexIds;
        }
        
        const response = await fetch('/api/email/history/delete', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });
        
        const result = await response.json();
        
        hideLoading();
        
        if (result.success) {
            const totalCount = (realIds.length || 0) + (indexIds.length || 0);
            showAlert('success', `${result.deletedCount || totalCount}개 항목이 삭제되었습니다.`);
            loadEmailHistory();
        } else {
            showAlert('error', result.error || '이력 삭제에 실패했습니다.');
        }
        
    } catch (error) {
        hideLoading();
        console.error('이력 삭제 오류:', error);
        showAlert('error', '이력 삭제 중 오류가 발생했습니다.');
    }
}

// 단일 이력 삭제 (Supabase ID 또는 인덱스 기반)
async function deleteSingleHistory(historyId, isRealId = true) {
    if (!confirm('이 이력을 삭제하시겠습니까?')) {
        return;
    }
    
    try {
        showLoading('이력을 삭제하고 있습니다...');
        
        let requestBody;
        if (isRealId && !historyId.startsWith('index_')) {
            // 실제 Supabase ID 사용
            requestBody = { historyIds: [historyId] };
        } else {
            // 인덱스 기반 - 인덱스 추출
            const index = historyId.startsWith('index_') ? 
                parseInt(historyId.replace('index_', '')) : 
                parseInt(historyId);
            requestBody = { indices: [index] };
        }
        
        const response = await fetch('/api/email/history/delete', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });
        
        const result = await response.json();
        
        hideLoading();
        
        if (result.success) {
            showAlert('success', '이력이 삭제되었습니다.');
            loadEmailHistory();
        } else {
            showAlert('error', result.error || '이력 삭제에 실패했습니다.');
        }
        
    } catch (error) {
        hideLoading();
        console.error('이력 삭제 오류:', error);
        showAlert('error', '이력 삭제 중 오류가 발생했습니다.');
    }
}

// 전체 이력 삭제
async function clearAllHistory() {
    if (!confirm('모든 전송 이력을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
        return;
    }
    
    try {
        showLoading('모든 이력을 삭제하고 있습니다...');
        
        const response = await fetch('/api/email/history/clear', {
            method: 'DELETE'
        });
        
        const result = await response.json();
        
        hideLoading();
        
        if (result.success) {
            showAlert('success', '모든 이력이 삭제되었습니다.');
            loadEmailHistory();
        } else {
            showAlert('error', result.error || '이력 삭제에 실패했습니다.');
        }
        
    } catch (error) {
        hideLoading();
        console.error('이력 삭제 오류:', error);
        showAlert('error', '이력 삭제 중 오류가 발생했습니다.');
    }
}

// 🎯 표준 타겟 필드 설정


// 📊 필드 검증 (필수 체크 제거)
function validateRequiredFields(mapping) {
    // 매핑된 필드가 있는지만 확인
    return {
        isValid: Object.keys(mapping).length > 0,
        missingFields: [],
        message: Object.keys(mapping).length > 0 ? 
            '매핑이 설정되었습니다.' : 
            '최소 1개 이상의 필드를 매핑해주세요.'
    };
}

// 🔄 필수 필드 입력 폼 표시
function showMissingFieldsForm(missingFields) {
    const form = document.getElementById('missingFieldsForm');
    const container = document.getElementById('missingFieldsContainer');
    
    // 기존 내용 초기화
    container.innerHTML = '';
    
    // 각 누락된 필드에 대해 입력 필드 생성
    missingFields.forEach(field => {
        const fieldDiv = document.createElement('div');
        fieldDiv.className = 'form-group';
        fieldDiv.style.marginBottom = '15px';
        
        const label = document.createElement('label');
        label.textContent = field;
        label.style.fontWeight = '600';
        label.style.color = '#856404';
        label.style.marginBottom = '5px';
        label.style.display = 'block';
        
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'form-control';
        input.id = `missing_${field}`;
        input.placeholder = `${field}를 입력하세요`;
        input.style.width = '100%';
        input.style.padding = '8px 12px';
        input.style.border = '1px solid #dee2e6';
        input.style.borderRadius = '4px';
        input.style.fontSize = '0.9em';
        
        fieldDiv.appendChild(label);
        fieldDiv.appendChild(input);
        container.appendChild(fieldDiv);
    });
    
    // 폼 표시
    form.classList.remove('hidden');
    
    // 폼으로 스크롤
    form.scrollIntoView({ behavior: 'smooth' });
}

// 💾 필수 필드 저장
async function saveMissingFields() {
    const form = document.getElementById('missingFieldsForm');
    const inputs = form.querySelectorAll('input[id^="missing_"]');
    
    // 입력값 검증
    let hasEmptyFields = false;
    const fieldValues = {};
    
    inputs.forEach(input => {
        const fieldName = input.id.replace('missing_', '');
        const value = input.value.trim();
        
        if (value === '') {
            hasEmptyFields = true;
            input.style.borderColor = '#dc3545';
        } else {
            input.style.borderColor = '#dee2e6';
            fieldValues[fieldName] = value;
        }
    });
    
    if (hasEmptyFields) {
        showAlert('warning', '모든 필수 필드를 입력해주세요.');
        return;
    }
    
    try {
        // 현재 매핑에 입력값들을 추가 (고정값으로 설정)
        Object.keys(fieldValues).forEach(field => {
            currentMapping[field] = `[고정값: ${fieldValues[field]}]`;
        });
        
        // 매핑 저장
        const mappingData = {
            mappingName: `mapping_${Date.now()}`,
            sourceFields: Object.values(currentMapping),
            targetFields: Object.keys(currentMapping),
            mappingRules: currentMapping,
            fixedValues: fieldValues // 고정값들을 별도로 전송
        };
        
        showLoading('매핑 규칙을 저장하고 있습니다...');
        
        const response = await fetch('/api/orders/mapping', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(mappingData)
        });
        
        const result = await response.json();
        
        hideLoading();
        
        if (result.success) {
            // 타겟 필드들의 매핑 상태 업데이트 (안전한 검색)
            Object.keys(fieldValues).forEach(field => {
                let targetField = null;
                try {
                    const escapedField = escapeSelector(field);
                    targetField = document.querySelector(`[data-target="${escapedField}"]`);
                } catch (e) {
                    console.warn('CSS 선택자 오류, 대안 방법 사용:', e.message);
                    const allTargets = document.querySelectorAll('[data-target]');
                    targetField = Array.from(allTargets).find(el => 
                        el.getAttribute('data-target') === field
                    );
                }
                if (targetField) {
                    targetField.classList.add('selected');
                    targetField.textContent = `${field} ← [고정값]`;
                }
            });
            
            showAlert('success', '✅ 필수 정보가 저장되었습니다. 매칭이 완료되었습니다.');
            
            // 매핑 저장 상태 표시
            sessionStorage.setItem('mappingSaved', 'true');
            
            // GENERATE ORDER 버튼 활성화
            updateGenerateOrderButton();
            
            // 폼 숨기기
            hideMissingFieldsForm();
            
        } else {
            showAlert('error', result.error || '매핑 저장에 실패했습니다.');
        }
        
    } catch (error) {
        hideLoading();
        console.error('필수 필드 저장 오류:', error);
        showAlert('error', '필수 필드 저장 중 오류가 발생했습니다.');
    }
}

// 🚫 필수 필드 입력 폼 숨기기
function hideMissingFieldsForm() {
    const form = document.getElementById('missingFieldsForm');
    form.classList.add('hidden');
}

// 📝 직접 입력 폼 표시
function showDirectInputForm() {
    // 필요한 단계만 숨기기 (발주서 파일 업로드 결과는 유지)
    document.getElementById('step2').classList.add('hidden');
    document.getElementById('step3').classList.add('hidden');
    document.getElementById('step4').classList.add('hidden');
    
    // 필수 필드 입력 폼 숨기기
    const missingFieldsForm = document.getElementById('missingFieldsForm');
    if (missingFieldsForm) {
        missingFieldsForm.classList.add('hidden');
    }
    
    // 매핑 상태 초기화
    currentMapping = {};
    sessionStorage.setItem('mappingSaved', 'false');
    
    // 직접 입력 폼 표시
    const directInputStep = document.getElementById('directInputStep');
    directInputStep.classList.remove('hidden');
    
    // 폼으로 스크롤
    directInputStep.scrollIntoView({ behavior: 'smooth' });
}

// 📋 직접 입력 데이터로 STEP 2 매핑 설정
function setupDirectInputMapping(inputData) {
    console.log('📋 직접 입력 데이터로 매핑 설정 시작:', inputData);
    
    // 직접 입력 데이터를 가상의 source fields로 설정
    const directInputFields = Object.keys(inputData);
    
    // 전역 변수 설정 (기존 파일 업로드와 동일한 방식)
    orderFileHeaders = directInputFields;
    currentOrderFileId = 'direct_input'; // 가상 파일 ID
    
    // 직접 입력 데이터 저장 (매핑 완료 후 사용)
    window.directInputData = inputData;
    window.isDirectInputMode = true;
    
    // console.log('✅ 직접 입력 모드 설정 완료'); // Production: 로그 제거
    //console.log('📊 Source Fields:', directInputFields);
    //console.log('📊 Target Fields:', supplierFileHeaders);
    
    // 직접 입력 폼 숨기기
    document.getElementById('directInputStep').classList.add('hidden');
    
    // STEP 2 매핑 설정으로 이동
    setupMapping();
    showStep(2);
    
    // 사용자 안내 메시지
            showAlert('info', '📋 직접 입력된 데이터와 업로드된 발주서 템플릿의 필드를 매칭해주세요.');
}

// 🔄 직접 입력 데이터를 기본 템플릿 필드로 자동 매핑
function mapDirectInputToTemplate(inputData) {

    
    // 직접 입력 필드 → 기본 템플릿 필드 매핑 규칙
    const fieldMappings = {
        '상품명': '품목명',
        '연락처': '전화번호',
        '주소': '주소',
        '수량': '주문수량',
        '단가': '단가',
        '고객명': '담당자'
    };
    
    const mappedData = {};
    
    // 기본 필드 매핑 적용
    Object.keys(inputData).forEach(directField => {
        const templateField = fieldMappings[directField];
        if (templateField) {
            mappedData[templateField] = inputData[directField];
            console.log(`✅ 매핑: ${directField} → ${templateField} = "${inputData[directField]}"`);
        } else {
            // 매핑 규칙이 없는 경우 원본 필드명 사용
            mappedData[directField] = inputData[directField];
            console.log(`ℹ️ 직접 매핑: ${directField} = "${inputData[directField]}"`);
        }
    });
    
    // 자동 계산 및 기본값 추가
    if (mappedData['주문수량'] && mappedData['단가']) {
        const quantity = parseInt(mappedData['주문수량']) || 0;
        const price = parseFloat(mappedData['단가']) || 0;
        const total = quantity * price;
        
        if (total > 0) {
            mappedData['공급가액'] = total;
            console.log(`💰 공급가액 자동 계산: ${quantity} × ${price} = ${total}`);
        }
    }
    
    // 자동 생성 필드 추가
    const now = new Date();
    mappedData['발주일자'] = now.toISOString().split('T')[0]; // YYYY-MM-DD
    mappedData['발주번호'] = `PO-${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}-${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}`;
    
    // 공급처 기본값 (고객명이 있으면 고객명 사용, 없으면 기본값)
    if (!mappedData['공급처']) {
        mappedData['공급처'] = mappedData['담당자'] || '미입력';
    }
    
    // console.log('✅ 직접 입력 데이터 매핑 완료:', mappedData); // Production: 로그 제거
    return mappedData;
}

// 💾 직접 입력 데이터 저장 및 발주서 생성
async function saveDirectInput() {
    const inputData = {};
    let hasAnyInput = false;
    
    // 모든 필드 값 수집
    ['상품명', '연락처', '주소', '수량', '단가', '고객명'].forEach(field => {
        const input = document.getElementById(`direct_${field}`);
        const value = input.value.trim();
        
        input.style.borderColor = '#dee2e6';
        if (value !== '') {
            inputData[field] = value;
            hasAnyInput = true;
        }
    });
    
    if (!hasAnyInput) {
        showAlert('warning', '최소 1개 이상의 필드를 입력해주세요.');
        return;
    }
    
    try {
        // 발주서 템플릿 업로드 여부에 따른 분기 처리
        if (currentSupplierFileId && supplierFileHeaders.length > 0) {
            // 1. 발주서 템플릿이 업로드된 경우 → STEP 2 매핑 설정으로 이동
        
            setupDirectInputMapping(inputData);
        } else {
            // 2. 발주서 템플릿이 없는 경우 → 기본 템플릿 자동 매핑
    
            await processDirectInputWithDefaultTemplate(inputData);
        }
        
    } catch (error) {
        hideLoading();
        console.error('직접 입력 저장 오류:', error);
        showAlert('error', '직접 입력 처리 중 오류가 발생했습니다.');
    }
}

// 🤖 발주서 템플릿과 AI 매핑을 사용한 직접 입력 처리
async function processDirectInputWithAIMapping(inputData) {
    showLoading('AI가 직접 입력 데이터와 발주서 템플릿을 매핑하고 있습니다...');
    
    try {
        // 직접 입력 필드 목록 생성
        const directInputFields = Object.keys(inputData);
        
        /*
        console.log('🤖 AI 매핑 요청:', {
            directInputFields,
            supplierFields: supplierFileHeaders
        });
        */
        // AI 매핑 요청
        const mappingResponse = await fetch('/api/orders/ai-mapping', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                orderFields: directInputFields,
                supplierFields: supplierFileHeaders
            })
        });
        
        if (mappingResponse.status === 401) {
            hideLoading();
            showAlert('warning', '🔐 OpenAI API 키 인증이 필요합니다. 인증 페이지로 이동합니다.');
            setTimeout(() => window.location.href = '/auth.html', 2000);
            return;
        }
        
        // 🚫 사용량 제한 확인 (429 오류)
        if (mappingResponse.status === 429) {
            hideLoading();
            const errorData = await mappingResponse.json().catch(() => ({ error: '하루 AI 자동 매핑 횟수를 모두 사용했습니다.' }));
            showAlert('warning', errorData.error || '하루 AI 자동 매핑 횟수를 모두 사용했습니다.');
            return;
        }
        
        const mappingResult = await mappingResponse.json();
        
        if (!mappingResult.success) {
            if (mappingResult.requireAuth) {
                hideLoading();
                showAlert('warning', '🔐 OpenAI API 키 인증이 필요합니다. 인증 페이지로 이동합니다.');
                setTimeout(() => window.location.href = '/auth.html', 2000);
                return;
            }
            throw new Error(mappingResult.error || 'AI 매핑에 실패했습니다.');
        }
        
        // AI 매핑 결과 적용
        const aiMappings = mappingResult.mappings;
        const mappedData = {};
        
        // AI 매핑 결과를 바탕으로 데이터 변환
        Object.entries(aiMappings).forEach(([targetField, sourceField]) => {
            if (inputData[sourceField]) {
                mappedData[targetField] = inputData[sourceField];
                console.log(`🤖 AI 매핑: ${sourceField} → ${targetField} = "${inputData[sourceField]}"`);
            }
        });
        
        // 매핑되지 않은 직접 입력 데이터도 포함
        Object.entries(inputData).forEach(([field, value]) => {
            const isMapped = Object.values(aiMappings).includes(field);
            if (!isMapped) {
                mappedData[field] = value;
                console.log(`ℹ️ 직접 포함: ${field} = "${value}"`);
            }
        });
        
        hideLoading();
        
        // AI 매핑 결과를 사용자에게 보여주고 확인받기
        showDirectInputMappingConfirmation(inputData, mappedData, aiMappings);
        
    } catch (error) {
        hideLoading();
        console.error('AI 매핑 처리 오류:', error);
        showAlert('error', 'AI 매핑 중 오류가 발생했습니다.');
    }
}

// 📋 기본 템플릿을 사용한 직접 입력 처리
async function processDirectInputWithDefaultTemplate(inputData) {
    showLoading('직접 입력 데이터로 발주서를 생성하고 있습니다...');
    
    try {
        // 직접 입력 데이터를 기본 템플릿 필드로 자동 매핑
        const mappedData = mapDirectInputToTemplate(inputData);
        
        // 직접 입력 데이터를 매핑 형태로 변환
        const mappingData = {
            mappingName: `direct_input_${Date.now()}`,
            sourceFields: [],
            targetFields: Object.keys(mappedData),
            mappingRules: {},
            fixedValues: mappedData,
            isDirect: true // 직접 입력 플래그
        };
        
        // 매핑 저장
        const mappingResponse = await fetch('/api/orders/mapping', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(mappingData)
        });
        
        const mappingResult = await mappingResponse.json();
        
        if (!mappingResult.success) {
            throw new Error(mappingResult.error || '매핑 저장에 실패했습니다.');
        }
        
        // 직접 입력 데이터로 발주서 생성
        const generateResponse = await fetch('/api/orders/generate-direct', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                mappingId: mappingData.mappingName,
                inputData: mappedData,
                templateType: 'standard',
                supplierFileId: currentSupplierFileId
            })
        });
        
        // 🚫 사용량 제한 확인 (429 오류)
        if (generateResponse.status === 429) {
            hideLoading();
            const errorData = await generateResponse.json().catch(() => ({ error: '하루 발주서 생성 횟수를 모두 사용했습니다.' }));
            showAlert('warning', errorData.error || '하루 발주서 생성 횟수를 모두 사용했습니다.');
            return;
        }
        
        const generateResult = await generateResponse.json();
        
        hideLoading();
        
        if (generateResult.success) {
            // 📊 발주서 생성 성공시 사용량 증가
            usageManager.incrementUsage('orderGeneration');
            
            generatedFileName = generateResult.generatedFile;
            displayFileName = generateResult.displayFileName || generateResult.userFriendlyFileName;
            
            // 성공 결과 표시
            showAlert('success', '✅ 직접 입력 데이터로 발주서가 생성되었습니다!');
            
            // 결과 표시 및 이메일 단계로 이동
            showDirectInputResult(generateResult, mappedData);
            showStep(3);
            showStep(4);
            
            // STEP 3 (발주서 다운로드/미리보기) 영역으로 자동 스크롤
            setTimeout(() => {
                const step3Element = document.getElementById('step3');
                if (step3Element) {
                    step3Element.scrollIntoView({ 
                        behavior: 'smooth', 
                        block: 'start',
                        inline: 'nearest'
                    });
                }
            }, 800);
            
        } else {
            showAlert('error', generateResult.error || '발주서 생성에 실패했습니다.');
        }
        
    } catch (error) {
        hideLoading();
        console.error('기본 템플릿 처리 오류:', error);
        
        // 타임아웃 에러 특별 처리
        if (error.message && error.message.includes('timeout')) {
            showAlert('error', '⏰ 기본 템플릿 처리 시간이 초과되었습니다.\n\n파일 크기가 크거나 네트워크가 불안정할 수 있습니다.\n잠시 후 다시 시도해주세요.');
        } else {
            showAlert('error', '기본 템플릿 처리 중 오류가 발생했습니다.\n\n' + (error.message || '알 수 없는 오류'));
        }
    }
}

// 🤖 AI 매핑 결과 확인 UI 표시
function showDirectInputMappingConfirmation(inputData, mappedData, aiMappings) {
    // 직접 입력 폼 숨기기
    document.getElementById('directInputStep').classList.add('hidden');
    
    // 매핑 확인 UI 표시
    const confirmationHtml = `
        <div class="step" id="aiMappingConfirmation">
            <h3>🤖 AI 매핑 결과 확인</h3>
            <p>AI가 직접 입력된 데이터를 발주서 템플릿과 자동 매핑했습니다. 결과를 확인하고 진행해주세요.</p>
            
            <div style="background: linear-gradient(145deg, #e8f4fd 0%, #b3e5fc 100%); padding: 20px; border-radius: 10px; margin: 20px 0;">
                <h4 style="color: #1976d2; margin-bottom: 15px;">🤖 AI 매핑 결과</h4>
                
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 15px;">
                    ${Object.entries(aiMappings).map(([targetField, sourceField]) => `
                        <div style="background: white; padding: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                            <div style="display: flex; align-items: center; justify-content: space-between;">
                                <span style="font-weight: bold; color: #1976d2;">${targetField}</span>
                                <span style="color: #666;">←</span>
                                <span style="color: #4caf50;">${sourceField}</span>
                            </div>
                            <div style="margin-top: 8px; color: #666; font-size: 0.9em;">
                                값: "${inputData[sourceField] || ''}"
                            </div>
                        </div>
                    `).join('')}
                </div>
                
                ${Object.keys(aiMappings).length === 0 ? 
                    '<div style="text-align: center; color: #ff9800; padding: 20px;"><strong>⚠️ AI가 자동 매핑할 수 있는 필드를 찾지 못했습니다.</strong></div>' : 
                    `<div style="text-align: center; margin-top: 15px; color: #4caf50;">
                        <strong>✅ ${Object.keys(aiMappings).length}개 필드가 자동 매핑되었습니다!</strong>
                    </div>`
                }
            </div>
            
            <div style="text-align: center; margin-top: 20px;">
                <button class="btn btn-success" onclick="confirmAIMapping()">✅ 매핑 확인 및 발주서 생성</button>
                <button class="btn" onclick="cancelAIMapping()">🔙 직접 입력으로 돌아가기</button>
            </div>
        </div>
    `;
    
    // 기존 확인 UI 제거 후 새로 추가
    const existingConfirmation = document.getElementById('aiMappingConfirmation');
    if (existingConfirmation) {
        existingConfirmation.remove();
    }
    
    // step2 다음에 삽입
    const step2 = document.getElementById('step2');
    step2.insertAdjacentHTML('afterend', confirmationHtml);
    
    // 전역 변수에 저장 (확인 시 사용)
    window.pendingDirectInputData = inputData;
    window.pendingMappedData = mappedData;
    window.pendingAIMappings = aiMappings;
}

// ✅ AI 매핑 확인 및 발주서 생성
async function confirmAIMapping() {
    try {
        showLoading('AI 매핑 결과로 발주서를 생성하고 있습니다...');
        
        const mappedData = window.pendingMappedData;
        const aiMappings = window.pendingAIMappings;
        
        // 매핑 데이터 준비
        const mappingData = {
            mappingName: `ai_direct_input_${Date.now()}`,
            sourceFields: Object.keys(window.pendingDirectInputData),
            targetFields: Object.keys(aiMappings),
            mappingRules: aiMappings,
            fixedValues: mappedData,
            isDirect: true,
            isAIMapped: true
        };
        
        // 매핑 저장
        const mappingResponse = await fetch('/api/orders/mapping', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(mappingData)
        });
        
        const mappingResult = await mappingResponse.json();
        
        if (!mappingResult.success) {
            throw new Error(mappingResult.error || '매핑 저장에 실패했습니다.');
        }
        
        // 발주서 생성
        const generateResponse = await fetch('/api/orders/generate-direct', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                mappingId: mappingData.mappingName,
                inputData: mappedData,
                templateType: 'standard',
                supplierFileId: currentSupplierFileId
            })
        });
        
        // 🚫 사용량 제한 확인 (429 오류)
        if (generateResponse.status === 429) {
            hideLoading();
            const errorData = await generateResponse.json().catch(() => ({ error: '하루 발주서 생성 횟수를 모두 사용했습니다.' }));
            showAlert('warning', errorData.error || '하루 발주서 생성 횟수를 모두 사용했습니다.');
            return;
        }
        
        const generateResult = await generateResponse.json();
        
        hideLoading();
        
        if (generateResult.success) {
            // 📊 발주서 생성 성공시 사용량 증가
            usageManager.incrementUsage('orderGeneration');
            
            generatedFileName = generateResult.generatedFile;
            displayFileName = generateResult.displayFileName || generateResult.userFriendlyFileName;
            
            // AI 매핑 확인 UI 숨기기
            document.getElementById('aiMappingConfirmation').classList.add('hidden');
            
            // 성공 결과 표시
            showAlert('success', '✅ AI 매핑 결과로 발주서가 생성되었습니다!');
            
            // 결과 표시 및 이메일 단계로 이동
            showDirectInputResult(generateResult, mappedData, aiMappings);
            showStep(3);
            showStep(4);
            
            // STEP 3 (발주서 다운로드/미리보기) 영역으로 자동 스크롤
            setTimeout(() => {
                const step3Element = document.getElementById('step3');
                if (step3Element) {
                    step3Element.scrollIntoView({ 
                        behavior: 'smooth', 
                        block: 'start',
                        inline: 'nearest'
                    });
                }
            }, 800);
            
        } else {
            showAlert('error', generateResult.error || '발주서 생성에 실패했습니다.');
        }
        
    } catch (error) {
        hideLoading();
        console.error('AI 매핑 확인 처리 오류:', error);
        
        // 타임아웃 에러 특별 처리
        if (error.message && error.message.includes('timeout')) {
            showAlert('error', '⏰ AI 매핑 발주서 생성 시간이 초과되었습니다.\n\n파일 크기가 크거나 네트워크가 불안정할 수 있습니다.\n잠시 후 다시 시도해주세요.');
        } else {
            showAlert('error', 'AI 매핑 발주서 생성 중 오류가 발생했습니다.\n\n' + (error.message || '알 수 없는 오류'));
        }
    }
}

// 🔙 AI 매핑 취소 및 직접 입력으로 돌아가기
function cancelAIMapping() {
    // AI 매핑 확인 UI 숨기기
    const confirmationElement = document.getElementById('aiMappingConfirmation');
    if (confirmationElement) {
        confirmationElement.classList.add('hidden');
    }
    
    // 직접 입력 폼 다시 표시
    document.getElementById('directInputStep').classList.remove('hidden');
    
    // 전역 변수 정리
    delete window.pendingDirectInputData;
    delete window.pendingMappedData;
    delete window.pendingAIMappings;
    
    showAlert('info', '직접 입력 화면으로 돌아갔습니다. 다시 입력해주세요.');
}

// 📂 Storage 파일 목록 확인
async function checkStorageFiles() {
    console.log('📂 Storage 파일 목록 확인');
    
    try {
        const response = await fetch('/api/orders/storage/files');
        const result = await response.json();
        
        if (result.success) {
            //console.log(`✅ Storage 파일 목록 조회 완료: 총 ${result.count}개 파일`);
            //console.log('📊 Bucket별 파일 개수:', result.buckets);
            
            return result;
        } else {
            console.error('❌ Storage 파일 목록 조회 실패:', result.error);
            return null;
        }
        
    } catch (error) {
        console.error('❌ Storage 파일 목록 조회 오류:', error);
        return null;
    }
}

// 📏 파일 크기 포맷팅 헬퍼 함수
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 📋 파일 미리보기 로드 (재시도 로직 포함)
async function loadFilePreview(fileName, retryCount = 0, maxRetries = 5) {
    const previewContent = document.getElementById('filePreviewContent');
    
    if (!previewContent) {
        console.warn('⚠️ 미리보기 컨테이너를 찾을 수 없습니다.');
        return;
    }
    
    try {
        // 로딩 상태 표시 (재시도 횟수 표시)
        const retryText = retryCount > 0 ? ` (재시도 ${retryCount}/${maxRetries})` : '';
        previewContent.innerHTML = `
            <div style="text-align: center; color: #6c757d; padding: 20px;">
                <div style="display: inline-block; width: 20px; height: 20px; border: 2px solid #6c757d; border-radius: 50%; border-top: 2px solid transparent; animation: spin 1s linear infinite; margin-right: 10px;"></div>
                미리보기를 불러오고 있습니다${retryText}...
            </div>
        `;
        
        console.log(`🔍 파일 미리보기 요청${retryText}:`, fileName);
        
        // 미리보기 API 호출
        const response = await fetch(`/api/orders/preview/${fileName}`);
        const result = await response.json();
        
        if (result.success && result.headers && result.data) {
            console.log('✅ 미리보기 데이터 로드 완료:', {
                headers: result.headers.length,
                rows: result.data.length
            });
            
            // 미리보기 테이블 생성
            let tableHtml = `
                <div style="margin-bottom: 10px; color: #6c757d; font-size: 0.9em;">
                    📊 <strong>${result.data.length}행</strong>의 데이터가 표시됩니다 (전체 미리보기)
                </div>
                <div style="max-height: 300px; overflow-y: auto; border: 1px solid #dee2e6; border-radius: 6px; background: white;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 0.75em;">
                        <thead style="background: linear-gradient(135deg, #495057 0%, #6c757d 100%); color: white; position: sticky; top: 0; z-index: 10;">
                            <tr>
            `;
            
            // 헤더 생성
            result.headers.forEach(header => {
                tableHtml += `<th style="padding: 8px 6px; text-align: left; border-right: 1px solid rgba(255,255,255,0.2); font-weight: 600; font-size: 0.85em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 120px;" title="${header}">${header}</th>`;
            });
            
            tableHtml += `
                            </tr>
                        </thead>
                        <tbody>
            `;
            
            // 데이터 행 생성
            result.data.forEach((row, rowIndex) => {
                const isEvenRow = rowIndex % 2 === 0;
                const rowBgColor = isEvenRow ? '#f8f9fa' : 'white';
                
                tableHtml += `<tr style="background: ${rowBgColor}; border-bottom: 1px solid #e9ecef;" onmouseover="this.style.background='#e3f2fd'" onmouseout="this.style.background='${rowBgColor}'">`;
                
                result.headers.forEach(header => {
                    const cellValue = row[header] || '';
                    const displayValue = cellValue.length > 15 ? cellValue.substring(0, 15) + '...' : cellValue;
                    
                    tableHtml += `<td style="padding: 6px; border-right: 1px solid #e9ecef; font-size: 0.8em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 120px;" title="${cellValue}">${displayValue}</td>`;
                });
                
                tableHtml += '</tr>';
            });
            
            tableHtml += `
                        </tbody>
                    </table>
                </div>
                <div style="margin-top: 10px; text-align: center; color: #6c757d; font-size: 0.8em;">
                    💡 스크롤을 이용해서 내용을 볼 수 있습니다
                </div>
            `;
            
            previewContent.innerHTML = tableHtml;
            
        } else {
            console.error('❌ 미리보기 데이터 로드 실패:', result.error || '알 수 없는 오류');
            
            // 404 오류이고 재시도 가능한 경우 자동 재시도
            if ((result.error && result.error.includes('찾을 수 없습니다')) || 
                (response.status === 404) || 
                (result.error && result.error.includes('{}'))) {
                
                if (retryCount < maxRetries) {
                    const nextRetry = retryCount + 1;
                    const waitTime = Math.min(2000 + (retryCount * 1000), 8000); // 2초부터 시작해서 점진적으로 증가
                    
                    console.log(`🔄 파일이 아직 준비되지 않음. ${waitTime}ms 후 재시도 (${nextRetry}/${maxRetries})`);
                    
                    previewContent.innerHTML = `
                        <div style="text-align: center; color: #ffc107; padding: 20px; background: #fff3cd; border-radius: 6px; border: 1px solid #ffeaa7;">
                            ⏳ 파일 업로드가 완료되기를 기다리고 있습니다...<br>
                            <small style="color: #856404; margin-top: 5px; display: block;">${Math.round(waitTime/1000)}초 후 자동으로 재시도합니다 (${nextRetry}/${maxRetries})</small>
                            <div style="margin-top: 10px;">
                                <div style="display: inline-block; width: 16px; height: 16px; border: 2px solid #ffc107; border-radius: 50%; border-top: 2px solid transparent; animation: spin 1s linear infinite;"></div>
                            </div>
                        </div>
                    `;
                    
                    setTimeout(() => {
                        loadFilePreview(fileName, nextRetry, maxRetries);
                    }, waitTime);
                    
                    return;
                }
            }
            
            previewContent.innerHTML = `
                <div style="text-align: center; color: #dc3545; padding: 20px; background: #f8d7da; border-radius: 6px; border: 1px solid #f5c6cb;">
                    ❌ 미리보기를 불러올 수 없습니다<br>
                    <small style="color: #721c24; margin-top: 5px; display: block;">${result.error || '파일을 읽는 중 오류가 발생했습니다'}</small>
                    <button onclick="loadFilePreview('${fileName}', 0, ${maxRetries})" class="btn" style="background: #dc3545; color: white; padding: 5px 12px; font-size: 0.8em; margin-top: 10px;">🔄 다시 시도</button>
                </div>
            `;
        }
        
    } catch (error) {
        console.error('❌ 미리보기 로드 오류:', error);
        
        // 네트워크 오류인 경우에도 재시도 로직 적용
        if (retryCount < maxRetries && 
           (error.message.includes('fetch') || error.message.includes('network') || error.name === 'TypeError')) {
            
            const nextRetry = retryCount + 1;
            const waitTime = Math.min(3000 + (retryCount * 1500), 10000);
            
            //console.log(`🔄 네트워크 오류로 인한 재시도. ${waitTime}ms 후 재시도 (${nextRetry}/${maxRetries})`);
            
            previewContent.innerHTML = `
                <div style="text-align: center; color: #ffc107; padding: 20px; background: #fff3cd; border-radius: 6px; border: 1px solid #ffeaa7;">
                    🌐 네트워크 연결을 재시도하고 있습니다...<br>
                    <small style="color: #856404; margin-top: 5px; display: block;">${Math.round(waitTime/1000)}초 후 자동으로 재시도합니다 (${nextRetry}/${maxRetries})</small>
                    <div style="margin-top: 10px;">
                        <div style="display: inline-block; width: 16px; height: 16px; border: 2px solid #ffc107; border-radius: 50%; border-top: 2px solid transparent; animation: spin 1s linear infinite;"></div>
                    </div>
                </div>
            `;
            
            setTimeout(() => {
                loadFilePreview(fileName, nextRetry, maxRetries);
            }, waitTime);
            
            return;
        }
        
        previewContent.innerHTML = `
            <div style="text-align: center; color: #dc3545; padding: 20px; background: #f8d7da; border-radius: 6px; border: 1px solid #f5c6cb;">
                ❌ 네트워크 오류가 발생했습니다<br>
                <small style="color: #721c24; margin-top: 5px; display: block;">서버와의 연결을 확인해주세요</small>
                <button onclick="loadFilePreview('${fileName}', 0, ${maxRetries})" class="btn" style="background: #dc3545; color: white; padding: 5px 12px; font-size: 0.8em; margin-top: 10px;">🔄 다시 시도</button>
            </div>
        `;
    }
}

// 📋 파일 미리보기 토글 (버튼 클릭 시 열기/닫기)
async function toggleFilePreview(fileName) {
    const previewSection = document.getElementById('filePreviewSection');
    const templateSection = document.getElementById('templateSaveSection');
    const previewButton = event.target; // 클릭된 버튼
    
    if (!previewSection) {
        console.warn('⚠️ 미리보기 섹션을 찾을 수 없습니다.');
        return;
    }
    
    // 템플릿 저장 섹션이 열려있으면 닫기
    if (templateSection && !templateSection.classList.contains('hidden')) {
        templateSection.classList.add('hidden');
        // 템플릿 저장 버튼도 원래대로
        const templateButtons = document.querySelectorAll('button[onclick="toggleTemplateSave()"]');
        templateButtons.forEach(btn => {
            btn.innerHTML = '템플릿 저장';
            btn.style.background = 'linear-gradient(135deg, #28a745 0%, #20c997 100%)';
        });
    }
    
    // 현재 숨겨져 있으면 보여주기
    if (previewSection.classList.contains('hidden')) {
        previewSection.classList.remove('hidden');
        previewButton.innerHTML = '미리보기 닫기';
        previewButton.style.background = 'linear-gradient(135deg, #dc3545 0%, #c82333 100%)';
        
        // Storage 파일 목록 먼저 확인
    
        //console.log('📂 먼저 Storage 파일 목록을 확인합니다...');
        
        const storageFiles = await checkStorageFiles();
        if (storageFiles && storageFiles.files) {
            const targetFile = storageFiles.files.find(file => file.name === fileName);
            if (targetFile) {
                console.log('✅ 파일 발견:', targetFile);
                loadFilePreview(fileName, 0, 5);
            } else {
                console.warn('⚠️ 파일을 Storage에서 찾을 수 없습니다:', fileName);
                console.log('📋 Storage에 있는 파일들:', storageFiles.files.map(f => f.name));
                
                                 // 파일이 없다는 메시지를 미리보기 창에 표시
                 const previewContent = document.getElementById('filePreviewContent');
                 if (previewContent) {
                     const generatedCount = storageFiles.buckets?.generated || 0;
                     const uploadsCount = storageFiles.buckets?.uploads || 0;
                     
                     previewContent.innerHTML = `
                         <div style="text-align: center; color: #dc3545; padding: 20px; background: #f8d7da; border-radius: 6px; border: 1px solid #f5c6cb;">
                             ❌ 파일을 찾을 수 없습니다<br>
                             <small style="color: #721c24; margin-top: 10px; display: block;">
                                 찾는 파일: <strong>${fileName}</strong><br>
                                 📋 generated bucket: ${generatedCount}개 파일<br>
                                 📁 uploads bucket: ${uploadsCount}개 파일<br>
                                 전체: ${storageFiles.count}개 파일
                             </small>
                             <button onclick="checkStorageFiles()" class="btn" style="background: #17a2b8; color: white; padding: 5px 12px; font-size: 0.8em; margin-top: 10px;">
                                 📂 Storage 파일 목록 다시 확인
                             </button>
                         </div>
                     `;
                 }
            }
        } else {
            console.error('❌ Storage 파일 목록을 가져올 수 없습니다.');
            loadFilePreview(fileName, 0, 5);
        }
    } else {
        // 현재 보여지고 있으면 숨기기
        previewSection.classList.add('hidden');
        previewButton.innerHTML = '미리보기';
        previewButton.style.background = 'linear-gradient(135deg, #17a2b8 0%, #138496 100%)';
        
    
    }
}

// 📋 템플릿 저장 토글 (버튼 클릭 시 열기/닫기)
function toggleTemplateSave() {
    const templateSection = document.getElementById('templateSaveSection');
    const previewSection = document.getElementById('filePreviewSection');
    const templateButton = event.target; // 클릭된 버튼
    
    if (!templateSection) {
        console.warn('⚠️ 템플릿 저장 섹션을 찾을 수 없습니다.');
        return;
    }
    
    // 미리보기 섹션이 열려있으면 닫기
    if (previewSection && !previewSection.classList.contains('hidden')) {
        previewSection.classList.add('hidden');
        // 미리보기 버튼도 원래대로
        const previewButtons = document.querySelectorAll('button[onclick*="toggleFilePreview"]');
        previewButtons.forEach(btn => {
            btn.innerHTML = '미리보기';
            btn.style.background = 'linear-gradient(135deg, #17a2b8 0%, #138496 100%)';
        });
    }
    
    // 현재 숨겨져 있으면 보여주기
    if (templateSection.classList.contains('hidden')) {
        templateSection.classList.remove('hidden');
        templateButton.innerHTML = '템플릿 저장 닫기';
        templateButton.style.background = 'linear-gradient(135deg, #dc3545 0%, #c82333 100%)';
        
        // 자동완성 초기화 (약간의 지연을 두어 DOM 업데이트 완료 후 실행)
        setTimeout(() => {
            initializeAutoComplete();
        }, 100);
        
        console.log('💾 템플릿 저장 창 열기');
    } else {
        // 현재 보여지고 있으면 숨기기
        templateSection.classList.add('hidden');
        templateButton.innerHTML = '템플릿 저장';
        templateButton.style.background = 'linear-gradient(135deg, #28a745 0%, #20c997 100%)';
        
        console.log('💾 템플릿 저장 창 닫기');
    }
}

// 📋 직접 입력 결과 표시
function showDirectInputResult(result, mappedData, aiMappings = null) {
    const generateResult = document.getElementById('generateResult');
    
    // 매핑된 데이터 표시
    const mappedFieldsHtml = Object.entries(mappedData || {})
        .map(([field, value]) => `<li><strong>${field}:</strong> ${value}</li>`)
        .join('');
    
    // AI 매핑 여부에 따른 제목과 설명
    const isAIMapped = aiMappings && Object.keys(aiMappings).length > 0;
    const titleText = isAIMapped ? 
        '🤖 AI 매핑으로 발주서가 성공적으로 생성되었습니다!' : 
        '✅ 직접 입력 데이터로 발주서가 성공적으로 생성되었습니다!';
    
    const mappingTypeText = isAIMapped ? 
        `🤖 AI가 업로드된 발주서 템플릿으로 자동 매핑한 데이터 (${Object.keys(aiMappings).length}개 필드 매핑):` : 
        '📋 기본 템플릿으로 매핑된 데이터:';
    
    generateResult.innerHTML = `
        <div class="alert alert-success">
            ${titleText}<br>
            <strong>매핑된 정보:</strong> ${Object.keys(mappedData || {}).length}개 필드<br>
            <strong>생성된 파일:</strong> ${result.generatedFile}
        </div>
        
        <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 15px 0;">
            <h5 style="color: #495057; margin-bottom: 10px;">${mappingTypeText}</h5>
            <ul style="margin: 0; padding-left: 20px; color: #6c757d;">
                ${mappedFieldsHtml}
            </ul>
        </div>
        
        ${isAIMapped ? `
        <div style="background: #e3f2fd; padding: 15px; border-radius: 8px; margin: 15px 0;">
            <h5 style="color: #1976d2; margin-bottom: 10px;">🤖 AI 매핑 상세:</h5>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px;">
                ${Object.entries(aiMappings).map(([targetField, sourceField]) => `
                    <div style="background: white; padding: 10px; border-radius: 6px; font-size: 0.9em;">
                        <strong>${sourceField}</strong> → ${targetField}
                    </div>
                `).join('')}
            </div>
        </div>
                ` : ''}
        
                 <div style="text-align: center; margin: 20px 0; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px; width: 100%;">
             <a href="${result.downloadUrl}" class="btn" download onclick="trackFileDownload()" style="background: linear-gradient(135deg, #6f42c1 0%, #5a32a3 100%); color: white; padding: 12px 24px; font-size: 0.9em; font-weight: 600; text-decoration: none; box-shadow: 0 3px 8px rgba(111, 66, 193, 0.3); width: 100%;"> 다운받기</a>
             <button onclick="toggleFilePreview('${result.generatedFile}')" class="btn" style="background: linear-gradient(135deg, #17a2b8 0%, #138496 100%); color: white; padding: 12px 24px; font-size: 0.9em; font-weight: 600; width: 100%;"> 미리보기</button>
             <button onclick="toggleTemplateSave()" class="btn" style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; padding: 12px 24px; font-size: 0.9em; font-weight: 600; width: 100%;">💾 템플릿 저장</button>
         </div>
        
        <!-- 파일 미리보기 섹션 (기본적으로 숨김) -->
        <div id="filePreviewSection" class="hidden" style="margin: 20px 0; padding: 15px; background: linear-gradient(145deg, #f8f9fa 0%, #e9ecef 100%); border-radius: 8px; border: 1px solid #dee2e6;">
            <h5 style="color: #495057; margin-bottom: 15px; display: flex; align-items: center; justify-content: space-between;">
                <span>📋 생성된 파일 미리보기</span>
                <button onclick="loadFilePreview('${result.generatedFile}', 0, 5)" class="btn" style="background: #6c757d; color: white; padding: 5px 12px; font-size: 0.8em;">🔄 새로고침</button>
            </h5>
            <div id="filePreviewContent">
                <div style="text-align: center; color: #6c757d; padding: 20px;">
                    <div style="display: inline-block; width: 20px; height: 20px; border: 2px solid #6c757d; border-radius: 50%; border-top: 2px solid transparent; animation: spin 1s linear infinite; margin-right: 10px;"></div>
                    미리보기를 불러오고 있습니다...
                </div>
            </div>
        </div>
    `;
    
    // 🔒 직접 입력 발주서 생성 완료 후 매핑 관련 버튼들 비활성화
    disableMappingButtons();
}

// 🚫 직접 입력 취소
function cancelDirectInput() {
    // 직접 입력 폼의 입력값 초기화
    ['상품명', '연락처', '주소', '수량', '단가', '고객명'].forEach(field => {
        const input = document.getElementById(`direct_${field}`);
        if (input) {
            input.value = '';
            input.style.borderColor = '#dee2e6';
        }
    });
    
    // 모든 상태 초기화 (resetAllSteps 사용)
    resetAllSteps();
    
    // 1단계만 표시
    const step1 = document.getElementById('step1');
    if (step1) {
        step1.classList.remove('hidden');
    }
    

}

// 🔐 인증 상태 확인 함수 (OpenAI API 키 선택적)
async function checkAuthenticationStatus() {

    
    try {
        // 타임아웃 설정
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5초 타임아웃
        
        const response = await fetch('/api/auth/check', {
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        // 응답 상태 확인
        if (!response.ok) {
            console.warn('⚠️ Auth API 응답 오류:', response.status, response.statusText);
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        // 안전한 JSON 파싱
        let result;
        try {
            const responseText = await response.text();
            result = JSON.parse(responseText);
        } catch (parseError) {
            console.error('❌ JSON 파싱 오류:', parseError);
            throw new Error('Invalid JSON response');
        }
        
        console.log('✅ 인증 API 응답:', result);
        
        // 전역 변수에 API 키 상태 저장
        window.hasOpenAIKey = result.hasApiKey || false;
        
        // 인증 상태 표시 - 관리자 권한 포함
        const isAdmin = result.isAdmin || false;
        const hasApiKey = result.hasApiKey || false;
        const authenticatedAt = result.authenticatedAt || result.timestamp || new Date().toISOString();
        const username = result.username || null;
        
        addAuthenticationIndicator(authenticatedAt, isAdmin, username, hasApiKey);
        
        // 관리자 기능 버튼 추가 (API 키와 별개)
        if (isAdmin) {
            addAdminButtons();
        } else {
            // 관리자가 아닌 경우에도 로그인 버튼 표시
            debugLog('🔐 비관리자 상태 - 관리자 로그인 버튼 표시');
            addAdminLoginButton();
        }
        
        // AI 기능 버튼 상태 업데이트
        updateAIFeatureButtons(hasApiKey);
        
        return true;
        
    } catch (error) {
        console.error('❌ 인증 상태 확인 오류:', error);
        console.log('⚠️ 인증 확인 실패 - 관리자 로그인 버튼 강제 표시');
        
        // 기본값 설정
        window.hasOpenAIKey = false;
        
        // 기본 상태 표시기 + 관리자 로그인 버튼 항상 표시
        addAuthenticationIndicator(new Date().toISOString(), false, null, false);
        
        // 관리자 로그인 버튼 강제 표시 (API 오류 시에도)
        addAdminLoginButton();
        
        updateAIFeatureButtons(false);
        return true;
    }
    
    // 추가 안전장치: 페이지 로드 후 2초 뒤에 버튼 강제 확인
    setTimeout(() => {
        const existingBtn = document.querySelector('.admin-login-btn');
        if (!existingBtn) {
    
            addAdminLoginButton();
        }
    }, 2000);
}

// 🔧 관리자 로그인 버튼 추가 (독립적)
function addAdminLoginButton() {
    // 기존 버튼 제거
    const existingBtn = document.querySelector('.admin-login-btn');
    if (existingBtn) {
        existingBtn.remove();
    }
    
    const adminBtn = document.createElement('button');
    adminBtn.className = 'admin-login-btn';
    adminBtn.style.cssText = `
        position: fixed;
        top: 50px;
        right: 10px;
        background: linear-gradient(135deg, #6f42c1 0%, #5a32a3 100%);
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 500;
        box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        z-index: 1000;
        cursor: pointer;
        transition: all 0.3s ease;
        display: none;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    `;
    
    adminBtn.innerHTML = '🔑 API 키 설정';
    adminBtn.title = 'OpenAI API 키 설정 및 관리자 로그인';
    
    adminBtn.addEventListener('click', () => {
        window.location.href = '/auth.html';
    });
    
    adminBtn.addEventListener('mouseenter', () => {
        adminBtn.style.transform = 'scale(1.05)';
    });
    
    adminBtn.addEventListener('mouseleave', () => {
        adminBtn.style.transform = 'scale(1)';
    });
    
    document.body.appendChild(adminBtn);
}

// 🔧 관리자 기능 버튼들 추가
function addAdminButtons() {
    // 관리자 로그인 버튼 제거 (이미 로그인됨)
    const loginBtn = document.querySelector('.admin-login-btn');
    if (loginBtn) {
        loginBtn.remove();
    }
    
    // 템플릿 모드 버튼 추가
    addTemplateToggleButton();
    
    // API 키 설정 버튼 추가 (통합된 버튼 사용)
    // addAdminLoginButton은 이미 다른 곳에서 호출됨
}

// 📝 템플릿 모드 토글 버튼
function addTemplateToggleButton() {
    const existingBtn = document.querySelector('.template-toggle-btn');
    if (existingBtn) {
        existingBtn.remove();
    }
    
    const templateBtn = document.createElement('button');
    templateBtn.className = 'template-toggle-btn';
    templateBtn.style.cssText = `
        position: fixed;
        top: 90px;
        right: 10px;
        background: linear-gradient(135deg, #17a2b8 0%, #138496 100%);
        color: white;
        border: none;
        padding: 8px 15px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 500;
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        z-index: 998;
        cursor: pointer;
        transition: all 0.3s ease;
        display: none;
    `;
    
    templateBtn.innerHTML = '📝 수정/템플릿 모드';
    templateBtn.title = '템플릿 파일 업로드 및 수정';
    
    templateBtn.addEventListener('click', () => {
        toggleMode(); // 기존 함수 사용
    });
    
    document.body.appendChild(templateBtn);
}



// 🔐 인증 상태 표시기 추가 (구식 버전 - 사용 안 함)
function addAuthenticationIndicatorOld(authenticatedAt, isAdmin = false, username = null) {
    const header = document.querySelector('.header');
    if (!header) return;
    
    const authIndicator = document.createElement('div');
    authIndicator.style.cssText = `
        position: absolute;
        top: 10px;
        right: 20px;
        background: ${isAdmin ? 'rgba(255, 193, 7, 0.3)' : 'rgba(255, 255, 255, 0.2)'};
        color: #f8f9fa;
        padding: 5px 12px;
        border-radius: 15px;
        font-size: 0.8em;
        backdrop-filter: blur(10px);
        border: 1px solid ${isAdmin ? 'rgba(255, 193, 7, 0.5)' : 'rgba(255, 255, 255, 0.3)'};
        cursor: pointer;
        box-shadow: ${isAdmin ? '0 2px 8px rgba(255, 193, 7, 0.3)' : 'none'};
    `;
    
    const authTime = new Date(authenticatedAt).toLocaleString('ko-KR');
    let displayText = '';
    
    if (isAdmin) {
        displayText = `👨‍💼 관리자 (${username || 'admin'}) - ${authTime}`;
    } else {
        displayText = `🔐 인증됨 (${authTime})`;
    }
    
    authIndicator.innerHTML = displayText;
    
    // 로그아웃 기능 추가
    authIndicator.addEventListener('click', showAuthMenu);
    
    header.appendChild(authIndicator);
}

// 🔐 인증 메뉴 표시
function showAuthMenu() {
    if (confirm('로그아웃하시겠습니까?')) {
        logout();
    }
}

// 🚪 로그아웃 함수
async function logout() {
    try {
        const response = await fetch('/api/auth/logout', {
            method: 'POST'
        });
        
        const result = await response.json();
        
        if (result.success) {
            alert('로그아웃되었습니다.');
            window.location.href = '/auth.html';
        } else {
            alert('로그아웃 중 오류가 발생했습니다.');
        }
        
    } catch (error) {
        console.error('로그아웃 오류:', error);
        alert('로그아웃 중 오류가 발생했습니다.');
    }
}

// 🔄 특정 파일 다시 업로드 함수
function restartFileUpload(type) {
    const fileTypeText = type === 'order' ? '주문서' : '발주서';
    
    if (confirm(`${fileTypeText} 파일을 다시 업로드하시겠습니까?`)) {
        // 진행 중인 요청 취소
        if (currentUploadController) {
            currentUploadController.abort();
            currentUploadController = null;
        }
        
        // 처리 상태 초기화
        isProcessing = false;
        
        // 진행률 표시 및 로딩 상태 강제 해제
        hideProgress();
        hideLoading();
        
        // 해당 파일 타입의 전역 변수만 초기화
        if (type === 'order') {
            currentOrderFileId = null;
            orderFileHeaders = [];
        } else if (type === 'supplier') {
            currentSupplierFileId = null;
            supplierFileHeaders = [];
        }
        
        // 해당 파일 타입의 UI 요소 초기화
        const uploadResultId = type === 'order' ? 'uploadResultOrder' : 'uploadResultSupplier';
        const uploadAlertId = type === 'order' ? 'uploadAlertOrder' : 'uploadAlertSupplier';
        const fileInputId = type === 'order' ? 'fileInputOrder' : 'fileInputSupplier';
        
        // 업로드 결과 숨기기
        const uploadResult = document.getElementById(uploadResultId);
        if (uploadResult) {
            uploadResult.classList.add('hidden');
        }
        
        // 알림 영역 초기화
        const uploadAlert = document.getElementById(uploadAlertId);
        if (uploadAlert) {
            uploadAlert.innerHTML = '';
        }
        
        // 파일 입력 초기화
        const fileInput = document.getElementById(fileInputId);
        if (fileInput) {
            fileInput.value = '';
        }
        
        // 매핑이 설정되어 있었다면 초기화 (다른 파일이 있는 경우만)
        if (type === 'order' && currentSupplierFileId) {
            // 주문서를 다시 업로드하는 경우, 발주서가 있으면 매핑 재설정 필요
            currentMapping = {};
            resetMappingState();
            showAlert('info', `${fileTypeText} 파일이 초기화되었습니다. 다시 업로드해주세요.`);
        } else if (type === 'supplier' && currentOrderFileId) {
            // 발주서를 다시 업로드하는 경우, 주문서가 있으면 매핑 재설정 필요
            currentMapping = {};
            resetMappingState();
            showAlert('info', `${fileTypeText} 파일이 초기화되었습니다. 다시 업로드해주세요.`);
        } else {
            showAlert('info', `${fileTypeText} 파일이 초기화되었습니다. 다시 업로드해주세요.`);
        }
        
        // 업로드 상태 및 버튼 업데이트
        updateUploadStatusAndButtons();
        
        // STEP 1으로 돌아가기 (두 파일이 모두 없어진 경우)
        if (!currentOrderFileId && !currentSupplierFileId) {
            showStep(1);
        } else if (currentOrderFileId && currentSupplierFileId) {
            // 두 파일이 모두 있는 경우 매핑 재설정
            try {
                showStep(2);
                setupMapping();
            } catch (error) {
                console.error('매핑 재설정 오류:', error);
            }
        }
        
        console.log(`🔄 ${fileTypeText} 파일 재시작 완료`);
    }
}

// 🔄 전체 프로세스 재시작 함수
function restartProcess() {
    // 진행 중인 작업이 있는지 확인
    const confirmMessage = isProcessing ? 
        '현재 파일 처리가 진행 중입니다. 작업을 취소하고 처음부터 다시 시작하시겠습니까?' :
        '모든 진행사항이 초기화됩니다. 처음부터 다시 시작하시겠습니까?';
    
    if (confirm(confirmMessage)) {
        // 진행 중인 요청 취소
        if (currentUploadController) {
            currentUploadController.abort();
            currentUploadController = null;
        }
        
        if (currentProcessingController) {
            currentProcessingController.abort();
            currentProcessingController = null;
        }
        
        // 처리 상태 초기화
        isProcessing = false;
        
        // 진행률 표시 및 로딩 상태 강제 해제
        hideProgress();
        hideLoading();
        
        // 모든 전역 변수 초기화
        currentOrderFileId = null;
        currentSupplierFileId = null;
        currentMapping = {};
        generatedFileName = null;
        displayFileName = null;
        orderFileHeaders = [];
        supplierFileHeaders = [];
        
        // 토글 상태 변수 초기화
        backupMapping = null;
        aiMappingExecuted = false;
        mappingSaved = false;
        
        // 수동필드 관련 변수 초기화
        currentGeneratedFileName = '';
        availableSupplierFields = [];
        selectedManualFields.clear();
        manualFieldCounter = 0;
        if (window.manualFieldData) {
            delete window.manualFieldData;
        }
        
        // 토글 버튼 UI 초기화 및 활성화
        enableMappingButtons();
        
        const aiButton = document.getElementById('aiMappingBtn');
        const saveButton = document.getElementById('saveMappingBtn');
        
        if (aiButton) {
            aiButton.innerHTML = 'AI 자동매칭';
        }
        
        if (saveButton) {
            saveButton.innerHTML = '매칭저장';
        }
        
        // 템플릿 관련 변수 초기화
        selectedTemplate = null;
        
        // 세션 스토리지 초기화
        sessionStorage.setItem('mappingSaved', 'false');
        
        // 펜딩 데이터 정리
        delete window.pendingDirectInputData;
        delete window.pendingMappedData;
        delete window.pendingAIMappings;
        
        // 전역 모드 변수 초기화 (resetAllSteps는 changeWorkMode에서 자동 호출됨)
        window.currentWorkMode = 'fileUpload';
        window.isDirectInputMode = false;
        
        // 라디오 버튼 먼저 설정 (value로 접근)
        const fileUploadRadio = document.querySelector('input[name="workMode"][value="fileUpload"]');
        if (fileUploadRadio) {
            fileUploadRadio.checked = true;
        }
        
        // 다른 라디오 버튼들 해제
        ['directInput', 'defaultTemplate', 'savedTemplate'].forEach(value => {
            const radio = document.querySelector(`input[name="workMode"][value="${value}"]`);
            if (radio) radio.checked = false;
        });
        
        // 모드 변경으로 UI 완전 초기화
        changeWorkMode('fileUpload');
        
        // 파일 업로드 이벤트 재설정
        setupFileUploadEvents();
        
        // 첫 번째 스텝만 표시
        const step1 = document.getElementById('step1');
        if (step1) {
            step1.classList.remove('hidden');
        }
        
        // 업로드 결과 초기화 (기본 + 모든 모드별)
        const uploadResultElements = [
            'uploadResultOrder',
            'uploadResultSupplier',
            'uploadResultOrderDirect',
            'uploadResultSupplierDirect',
            'uploadResultOrderDefault',
            'uploadResultSupplierDefault',
            'uploadResultOrderSaved',
            'uploadResultSupplierSaved',
            'uploadResultTemplateMode'
        ];
        
        uploadResultElements.forEach(elementId => {
            const element = document.getElementById(elementId);
            if (element) {
                element.classList.add('hidden');
                // innerHTML = ''를 사용하면 자식 요소들이 삭제되므로, 
                // 대신 각 자식 요소의 내용만 지우기
                const alertChild = element.querySelector('[id*="Alert"]');
                if (alertChild) {
                    alertChild.innerHTML = '';
                }
            }
        });
        
        // 알림 영역 초기화 (기본 + 모든 모드별)
        const alertElements = [
            'uploadAlert',
            'uploadAlertOrder',
            'uploadAlertSupplier',
            'uploadAlertDirectMode',
            'uploadAlertDefaultMode',
            'uploadAlertSavedMode',
            'uploadAlertSupplierDirectMode',
            'uploadAlertTemplateMode'
        ];
        
        alertElements.forEach(elementId => {
            const element = document.getElementById(elementId);
            if (element) {
                element.innerHTML = '';
                // 알림 요소는 숨기지 않음 (상위 컨테이너가 관리)
            }
        });
        
        // 템플릿 카드 선택 상태 초기화
        const allTemplateCards = document.querySelectorAll('.template-card');
        allTemplateCards.forEach(card => {
            card.style.border = '1px solid #e1bee7';
            card.style.background = 'linear-gradient(145deg, #ffffff 0%, #f8f9fa 100%)';
            card.style.boxShadow = 'none';
        });
        
        // 템플릿 처리 버튼 비활성화
        const templateProcessBtn = document.getElementById('templateProcessBtn');
        if (templateProcessBtn) {
            templateProcessBtn.disabled = true;
            templateProcessBtn.style.opacity = '0.5';
            templateProcessBtn.style.cursor = 'not-allowed';
        }
        
        // 모든 입력 폼 필드 초기화
        ['상품명', '연락처', '주소', '수량', '단가', '고객명'].forEach(field => {
            // 기존 직접 입력 폼
            const input = document.getElementById(`direct_${field}`);
            if (input) {
                input.value = '';
                input.style.borderColor = '#dee2e6';
                input.style.backgroundColor = '';
            }
            
            // 새로운 모드별 입력 폼들
            const directInput = document.getElementById(`direct_input_${field}`);
            if (directInput) {
                directInput.value = '';
                directInput.style.borderColor = '#dee2e6';
                directInput.style.backgroundColor = '';
            }
            
            const templateInput = document.getElementById(`template_${field}`);
            if (templateInput) {
                templateInput.value = '';
                templateInput.style.borderColor = '#dee2e6';
                templateInput.style.backgroundColor = '';
            }
        });
        
        // 파일 입력 초기화 (기본 + 모든 모드별)
        const fileInputElements = [
            'fileInputOrder',
            'fileInputSupplier',
            'fileInputOrderDirect',
            'fileInputSupplierDirect',
            'fileInputSupplierDirectMode',
            'fileInputOrderDefault',
            'fileInputSupplierDefault',
            'fileInputOrderSaved',
            'fileInputSupplierSaved'
        ];
        
        fileInputElements.forEach(elementId => {
            const element = document.getElementById(elementId);
            if (element) {
                element.value = '';
            }
        });
        
        // 버튼 상태 초기화
        updateGenerateOrderButton();
        
        // 이벤트 리스너 재설정
        setTimeout(() => {
            initializeApp();
        }, 100);
        
        showAlert('info', '🔄 모든 데이터가 초기화되었습니다. 처음부터 시작하세요.');
        
    
    }
}

// 📋 개선된 직접 입력 필수 필드 검증
function validateDirectInputRequiredFields() {
    const requiredFields = [
        { id: 'direct_상품명', name: '상품명' },
        { id: 'direct_연락처', name: '연락처' },
        { id: 'direct_주소', name: '주소' }
    ];
    
    let isValid = true;
    const missingFields = [];
    
    requiredFields.forEach(field => {
        const input = document.getElementById(field.id);
        if (input) {
            const value = input.value.trim();
            if (!value) {
                isValid = false;
                missingFields.push(field.name);
                input.style.borderColor = '#dc3545';
                input.style.backgroundColor = '#fff5f5';
            } else {
                input.style.borderColor = '#28a745';
                input.style.backgroundColor = '#f8fff8';
            }
        }
    });
    
    if (!isValid) {
        showAlert('error', `다음 필수 항목을 입력해주세요: ${missingFields.join(', ')}`);
    }
    
    return isValid;
}

// 🎯 기본 발주서 템플릿 정의 (default_template.xlsx와 일치)
function getDefaultSupplierTemplate() {
    return [
        '상품명',
        '수량',
        '단가',
        '고객명',
        '연락처',
        '주소',
        '총금액',
        '주문일자'
    ];
}

// 📝 필수필드 수동입력 관련 전역 변수
let currentGeneratedFileName = '';
let availableSupplierFields = [];
let selectedManualFields = new Set();
let manualFieldCounter = 0;

// STEP 2용 수동 필드 데이터 (발주서 생성 시 적용용)
let manualFieldsDataStep2 = {};
let manualFieldCounterStep2 = 0;

// 📝 필수필드 수동입력 섹션 토글
async function toggleManualFields(fileName) {
    const manualSection = document.getElementById('manualFieldsSection');
    const previewSection = document.getElementById('filePreviewSection');
    const templateSection = document.getElementById('templateSaveSection');
    
    if (!manualSection) {
        console.warn('⚠️ 필수필드 수동입력 섹션을 찾을 수 없습니다.');
        return;
    }
    
    // 다른 섹션들 닫기
    if (previewSection && !previewSection.classList.contains('hidden')) {
        previewSection.classList.add('hidden');
        // 미리보기 버튼 원래대로
        const previewButtons = document.querySelectorAll('button[onclick*="toggleFilePreview"]');
        previewButtons.forEach(btn => {
            btn.innerHTML = '미리보기';
            btn.style.background = 'linear-gradient(135deg, #17a2b8 0%, #138496 100%)';
        });
    }
    
    if (templateSection && !templateSection.classList.contains('hidden')) {
        templateSection.classList.add('hidden');
        // 템플릿 저장 버튼 원래대로
        const templateButtons = document.querySelectorAll('button[onclick*="toggleTemplateSave"]');
        templateButtons.forEach(btn => {
            btn.innerHTML = '템플릿 저장';
            btn.style.background = 'linear-gradient(135deg, #28a745 0%, #20c997 100%)';
        });
    }
    
    // 현재 숨겨져 있으면 보여주기
    if (manualSection.classList.contains('hidden')) {
        currentGeneratedFileName = fileName;
        
        // 생성된 발주서에서 사용 가능한 필드 목록 가져오기
        await loadAvailableSupplierFields(fileName);
        
        manualSection.classList.remove('hidden');
        
        // 이미 매핑된 필드 수 확인 후 안내 메시지 업데이트
        const alreadyMappedFields = Object.keys(currentMapping || {});
        const totalFields = availableSupplierFields.length;
        const availableForManualCount = totalFields - alreadyMappedFields.length;
        
        // 안내 메시지 업데이트
        const guideText = document.querySelector('#manualFieldsSection p');
        if (guideText) {
            if (alreadyMappedFields.length > 0) {
                guideText.innerHTML = `
                    💡 발주서에서 누락된 필수 데이터를 수동으로 입력하여 보완할 수 있습니다.<br>
                    <small style="color: #6c757d;">
                        📊 전체 ${totalFields}개 필드 중 ${alreadyMappedFields.length}개는 이미 매핑되어 ${availableForManualCount}개 필드를 추가로 입력할 수 있습니다.
                    </small><br>
                    <small style="color: #495057;">🔘 <strong>"➕ 필드 추가"</strong> 버튼을 클릭하여 입력할 필드를 추가해주세요.</small>
                `;
            } else {
                guideText.innerHTML = `
                    💡 발주서에서 누락된 필수 데이터를 수동으로 입력하여 보완할 수 있습니다.<br>
                    <small style="color: #6c757d;">📊 총 ${totalFields}개 필드를 입력할 수 있습니다.</small><br>
                    <small style="color: #495057;">🔘 <strong>"➕ 필드 추가"</strong> 버튼을 클릭하여 입력할 필드를 추가해주세요.</small>
                `;
            }
        }
        
        // 필드 입력 영역 완전 초기화 (자동 추가하지 않음)
        clearManualFields(); // 이전 데이터 완전 삭제
        //console.log('📝 필드 입력 영역 초기화 완료 - 필드 추가 버튼을 클릭하여 시작하세요');
        
        //console.log('📝 필수필드 수동입력 창 열기');
        //console.log(`📊 전체 필드: ${totalFields}개, 이미 매핑됨: ${alreadyMappedFields.length}개, 수동입력 가능: ${availableForManualCount}개`);
    } else {
        // 현재 보여지고 있으면 숨기기
        closeManualFields();
    }
}

// 📝 필수필드 수동입력 섹션 닫기
function closeManualFields() {
    const manualSection = document.getElementById('manualFieldsSection');
    if (manualSection) {
        manualSection.classList.add('hidden');
        
        // 상태 초기화
        clearManualFields();
        
        //console.log('📝 필수필드 수동입력 창 닫기');
    }
}

// 📋 사용 가능한 발주서 필드 목록 로드
async function loadAvailableSupplierFields(fileName) {
    try {
        //console.log('📋 사용 가능한 발주서 필드 로드 시작:', fileName);
        
        const headerResponse = await fetch(`/api/orders/headers/${fileName}`);
        if (headerResponse.ok) {
            const headerResult = await headerResponse.json();
            if (headerResult.success && headerResult.headers) {
                availableSupplierFields = headerResult.headers;
                
                // 현재 매핑 상태 로그
                const alreadyMappedFields = Object.keys(currentMapping || {});
                //console.log('✅ 발주서 필드 로드 완료:', availableSupplierFields);
                //console.log('🔗 이미 매핑된 필드들 (수동입력에서 제외):', alreadyMappedFields);
                //console.log('📝 수동입력 가능한 필드들:', availableSupplierFields.filter(f => !alreadyMappedFields.includes(f)));
                return;
            }
        }
        
        // API 실패 시 fallback으로 supplierFileHeaders 사용
        if (supplierFileHeaders && supplierFileHeaders.length > 0) {
            availableSupplierFields = [...supplierFileHeaders];
            // console.log('📋 fallback: supplier 파일 헤더 사용:', availableSupplierFields); // Production: 로그 제거
        } else {
            // 최종 fallback으로 기본 필드 제공
            availableSupplierFields = [
                '받는 분', '우편번호', '주소', '상세주소', '연락처', 
                '상품명', '수량', '단가', '금액', '비고'
            ];
            // console.log('📋 fallback: 기본 필드 사용:', availableSupplierFields); // Production: 로그 제거
        }
        
    } catch (error) {
        console.error('❌ 발주서 필드 로드 실패:', error);
        availableSupplierFields = [
            '받는 분', '우편번호', '주소', '상세주소', '연락처', 
            '상품명', '수량', '단가', '금액', '비고'
        ];
    }
}

// ➕ 새로운 필드 입력 행 추가
function addManualFieldInput() {
    const inputsContainer = document.getElementById('manualFieldInputs');
    if (!inputsContainer) return;
    
    manualFieldCounter++;
    const inputId = `manualField_${manualFieldCounter}`;
    
    // 이미 매핑된 필드들 (currentMapping의 키들)
    const alreadyMappedFields = Object.keys(currentMapping || {});
    
    // 사용 가능한 필드 목록 생성 (이미 선택된 필드 + 이미 매핑된 필드 제외)
    const availableFields = availableSupplierFields.filter(field => 
        !selectedManualFields.has(field) && 
        !alreadyMappedFields.includes(field)
    );
    

    console.log('📋 사용 가능한 필드들:', availableFields);
    
    if (availableFields.length === 0) {
        const totalMappedCount = alreadyMappedFields.length;
        const totalSelectedCount = selectedManualFields.size;
        showAlert('warning', `더 이상 추가할 수 있는 필드가 없습니다. (이미 매핑됨: ${totalMappedCount}개, 수동 선택됨: ${totalSelectedCount}개)`);
        return;
    }
    
    const inputRow = document.createElement('div');
    inputRow.id = inputId;
    inputRow.className = 'manual-field-input';
    inputRow.style.cssText = `
        display: grid; 
        grid-template-columns: 200px 1fr 40px; 
        gap: 10px; 
        align-items: center; 
        margin-bottom: 10px; 
        padding: 10px; 
        background: white; 
        border-radius: 6px; 
        border: 1px solid #dee2e6;
    `;
    
    inputRow.innerHTML = `
        <select id="${inputId}_field" onchange="updateSelectedField('${inputId}')" style="padding: 8px; border: 1px solid #ced4da; border-radius: 4px; width: 100%;">
            <option value="">필드 선택</option>
            ${availableFields.map(field => `<option value="${field}">${field}</option>`).join('')}
        </select>
        <input type="text" id="${inputId}_value" placeholder="값을 입력하세요" style="padding: 8px; border: 1px solid #ced4da; border-radius: 4px; width: 100%;">
        <button onclick="removeManualFieldInput('${inputId}')" style="background: #dc3545; color: white; border: none; border-radius: 4px; padding: 8px; font-size: 0.8em; cursor: pointer;" title="삭제">
            🗑️
        </button>
    `;
    
    inputsContainer.appendChild(inputRow);
    
    console.log(`➕ 필드 입력 행 추가: ${inputId}`);
}

// 🗑️ 필드 입력 행 제거
function removeManualFieldInput(inputId) {
    const inputRow = document.getElementById(inputId);
    if (!inputRow) return;
    
    // 선택된 필드에서 제거
    const fieldSelect = document.getElementById(`${inputId}_field`);
    if (fieldSelect && fieldSelect.value) {
        selectedManualFields.delete(fieldSelect.value);
        console.log(`🗑️ 선택된 필드에서 제거: ${fieldSelect.value}`);
    }
    
    // DOM에서 제거
    inputRow.remove();
    
    // 다른 필드들의 select 옵션 업데이트
    updateAllFieldSelects();
    
    console.log(`🗑️ 필드 입력 행 제거: ${inputId}`);
}

// 🔄 선택된 필드 업데이트
function updateSelectedField(inputId) {
    const fieldSelect = document.getElementById(`${inputId}_field`);
    if (!fieldSelect) return;
    
    const oldValue = fieldSelect.dataset.previousValue || '';
    const newValue = fieldSelect.value;
    
    // 이전 선택 제거
    if (oldValue) {
        selectedManualFields.delete(oldValue);
    }
    
    // 새 선택 추가
    if (newValue) {
        selectedManualFields.add(newValue);
        fieldSelect.dataset.previousValue = newValue;
    }
    
    // 모든 select 박스 옵션 업데이트
    updateAllFieldSelects();
    
    console.log(`🔄 필드 선택 업데이트: ${oldValue} → ${newValue}`);
    console.log('📋 현재 선택된 필드들:', Array.from(selectedManualFields));
}

// 🔄 모든 필드 select 박스 옵션 업데이트
function updateAllFieldSelects() {
    const allSelects = document.querySelectorAll('[id$="_field"]');
    
    // 이미 매핑된 필드들 (currentMapping의 키들)
    const alreadyMappedFields = Object.keys(currentMapping || {});
    
    allSelects.forEach(select => {
        const currentValue = select.value;
        const availableFields = availableSupplierFields.filter(field => 
            (!selectedManualFields.has(field) || field === currentValue) &&
            (!alreadyMappedFields.includes(field) || field === currentValue)
        );
        
        // 옵션 재생성
        select.innerHTML = `
            <option value="">필드 선택</option>
            ${availableFields.map(field => 
                `<option value="${field}" ${field === currentValue ? 'selected' : ''}>${field}</option>`
            ).join('')}
        `;
    });
}

// 💾 수동 입력된 필드들 저장
async function saveManualFields() {
    const inputsContainer = document.getElementById('manualFieldInputs');
    const resultDiv = document.getElementById('manualFieldResult');
    
    if (!inputsContainer || !resultDiv) return;
    
    // 입력된 데이터 수집
    const manualData = {};
    const inputRows = inputsContainer.children;
    let validInputs = 0;
    
    for (let i = 0; i < inputRows.length; i++) {
        const row = inputRows[i];
        const fieldSelect = row.querySelector('select');
        const valueInput = row.querySelector('input');
        
        if (fieldSelect && valueInput && fieldSelect.value && valueInput.value.trim()) {
            manualData[fieldSelect.value] = valueInput.value.trim();
            validInputs++;
        }
    }
    
    if (validInputs === 0) {
        showAlert('warning', '입력된 필드가 없습니다. 필드를 선택하고 값을 입력해주세요.');
        return;
    }
    
    try {
        //console.log('💾 수동 필드 저장 시작:', manualData);
        
        // 임시로 클라이언트에서만 저장 (추후 서버 API 연동 가능)
        window.manualFieldData = manualData;
        
        resultDiv.innerHTML = `
            <div style="background: #d4edda; color: #155724; padding: 10px; border-radius: 6px; border: 1px solid #c3e6cb;">
                ✅ ${validInputs}개 필드가 성공적으로 저장되었습니다!
                <div style="margin-top: 10px; font-size: 0.9em;">
                    ${Object.entries(manualData).map(([field, value]) => 
                        `<div><strong>${field}:</strong> ${value}</div>`
                    ).join('')}
                </div>
            </div>
        `;
        
        showAlert('success', `✅ ${validInputs}개 필수필드가 성공적으로 저장되었습니다!`);
        
        //console.log('✅ 수동 필드 저장 완료:', manualData);
        
    } catch (error) {
        console.error('❌ 수동 필드 저장 실패:', error);
        
        resultDiv.innerHTML = `
            <div style="background: #f8d7da; color: #721c24; padding: 10px; border-radius: 6px; border: 1px solid #f5c6cb;">
                ❌ 필드 저장 중 오류가 발생했습니다: ${error.message}
            </div>
        `;
        
        showAlert('error', '필드 저장 중 오류가 발생했습니다.');
    }
}

// 🗑️ 전체 필드 삭제
function clearManualFields() {
    const inputsContainer = document.getElementById('manualFieldInputs');
    const resultDiv = document.getElementById('manualFieldResult');
    
    if (inputsContainer) {
        inputsContainer.innerHTML = '';
    }
    
    if (resultDiv) {
        resultDiv.innerHTML = '';
    }
    
    // 상태 초기화
    selectedManualFields.clear();
    manualFieldCounter = 0;
    
    console.log('🗑️ 모든 수동 필드 삭제 완료');
}

// 🔒 매핑 관련 버튼들 비활성화 (발주서 생성 완료 후)
function disableMappingButtons() {
    const aiButton = document.getElementById('aiMappingBtn');
    const saveButton = document.getElementById('saveMappingBtn');
    
    if (aiButton) {
        aiButton.disabled = true;
        aiButton.style.opacity = '0.5';
        aiButton.style.cursor = 'not-allowed';
        aiButton.style.background = '#6c757d';
        aiButton.title = '발주서 생성이 완료되어 더 이상 매핑을 변경할 수 없습니다';
        // console.log('🔒 AI 자동매칭 버튼 비활성화'); // Production: 로그 제거
    }
    
    if (saveButton) {
        saveButton.disabled = true;
        saveButton.style.opacity = '0.5';
        saveButton.style.cursor = 'not-allowed';
        saveButton.style.background = '#6c757d';
        saveButton.title = '발주서 생성이 완료되어 더 이상 매핑을 변경할 수 없습니다';
        // console.log('🔒 매칭저장 버튼 비활성화'); // Production: 로그 제거
    }
    
    // 필수필드 수동입력 창 닫기 및 버튼 비활성화
    const manualFieldsSection = document.getElementById('manualFieldsSectionStep2');
    const manualFieldsButton = document.getElementById('manualFieldsBtn');
    
    // 필수필드 수동입력창이 열려있다면 먼저 닫기
    if (manualFieldsSection && !manualFieldsSection.classList.contains('hidden')) {
        manualFieldsSection.classList.add('hidden');
        
        // 버튼 텍스트를 "필수필드 수동입력"으로 변경
        if (manualFieldsButton) {
            manualFieldsButton.innerHTML = '필수필드 수동입력';
        }
    }
    
    // 필수필드 수동입력 버튼 비활성화
    if (manualFieldsButton) {
        manualFieldsButton.disabled = true;
        manualFieldsButton.style.opacity = '0.5';
        manualFieldsButton.style.cursor = 'not-allowed';
        manualFieldsButton.style.background = '#6c757d';
        manualFieldsButton.title = '발주서 생성이 완료되어 더 이상 필드 수정을 할 수 없습니다';
        // console.log('🔒 필수필드 수동입력 버튼 비활성화'); // Production: 로그 제거
    }
    
    // 🔒 파일 업로드 영역들 비활성화
    disableFileUploadAreas();
    
    // console.log('🔒 발주서 생성 완료로 인한 매핑 버튼 비활성화 완료'); // Production: 로그 제거
}

// 🔒 파일 업로드 영역들 비활성화 (발주서 생성 완료 후)
function disableFileUploadAreas() {
    const uploadAreaOrder = document.getElementById('uploadAreaOrder');
    const uploadAreaSupplier = document.getElementById('uploadAreaSupplier');
    const fileInputOrder = document.getElementById('fileInputOrder');
    const fileInputSupplier = document.getElementById('fileInputSupplier');
    
    // 발주서 업로드 영역 비활성화
    if (uploadAreaSupplier) {
        uploadAreaSupplier.style.opacity = '0.5';
        uploadAreaSupplier.style.cursor = 'not-allowed';
        uploadAreaSupplier.style.pointerEvents = 'none';
        uploadAreaSupplier.onclick = null;
        uploadAreaSupplier.ondragover = null;
        uploadAreaSupplier.ondragleave = null;
        uploadAreaSupplier.ondrop = null;
        //console.log('🔒 발주서 업로드 영역 비활성화');
    }
    
    // 주문서 업로드 영역 비활성화
    if (uploadAreaOrder) {
        uploadAreaOrder.style.opacity = '0.5';
        uploadAreaOrder.style.cursor = 'not-allowed';
        uploadAreaOrder.style.pointerEvents = 'none';
        uploadAreaOrder.onclick = null;
        uploadAreaOrder.ondragover = null;
        uploadAreaOrder.ondragleave = null;
        uploadAreaOrder.ondrop = null;
        //console.log('🔒 주문서 업로드 영역 비활성화');
    }
    
    // 파일 입력들 비활성화
    if (fileInputSupplier) {
        fileInputSupplier.disabled = true;
        fileInputSupplier.onchange = null;
    }
    
    if (fileInputOrder) {
        fileInputOrder.disabled = true;
        fileInputOrder.onchange = null;
    }
    
    // 업로드 영역에 안내 메시지 추가
    addDisabledMessage(uploadAreaSupplier, '발주서 생성이 완료되었습니다.<br/>파일을 변경하려면 "다시 시작" 버튼을 클릭하세요.');
    addDisabledMessage(uploadAreaOrder, '발주서 생성이 완료되었습니다.<br/>파일을 변경하려면 "다시 시작" 버튼을 클릭하세요.');
}

// 비활성화 메시지 추가
function addDisabledMessage(element, message) {
    if (!element) return;
    
    // 기존 메시지가 있으면 제거
    const existingMessage = element.querySelector('.disabled-message');
    if (existingMessage) {
        existingMessage.remove();
    }
    
    // 새 메시지 추가
    const messageDiv = document.createElement('div');
    messageDiv.className = 'disabled-message';
    messageDiv.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 15px;
        border-radius: 8px;
        text-align: center;
        font-size: 14px;
        z-index: 1000;
        max-width: 250px;
        line-height: 1.4;
    `;
    messageDiv.innerHTML = message;
    
    // 부모 요소에 relative position 설정
    element.style.position = 'relative';
    element.appendChild(messageDiv);
}

// 📊 헤더 로딩 진행바 생성 (CSS는 header-loading.css 파일에서 로드)
function createHeaderLoadingProgress(fileType, currentAttempt, maxAttempts) {
    // 🔒 115% 방지: 퍼센티지를 100%로 제한
    const rawPercentage = (currentAttempt / maxAttempts) * 100;
    const percentage = Math.min(Math.round(rawPercentage), 100);
    const fileTypeKorean = fileType === 'order' ? '주문서' : '발주서';
    
    return `
        <div class="header-loading-container">
            <div class="header-loading-info">
                <div class="header-loading-title">
                    📄 ${fileTypeKorean} 헤더를 불러오는 중...
                </div>
                <div class="header-loading-attempt">
                    ${currentAttempt}/${maxAttempts} 시도
                </div>
            </div>
            
            <div class="progress-bar-container">
                <div class="progress-bar-fill" style="width: ${percentage}%;">
                    <div class="progress-bar-shine"></div>
                </div>
            </div>
            
            <div class="progress-percentage">${percentage}%</div>
            
            <div class="header-loading-action">
                <button onclick="setupMapping()" class="retry-button">
                    🔄 다시 시도
                </button>
            </div>
        </div>
    `;
}

// 🔓 매핑 관련 버튼들 활성화 (다시 시작 시)
function enableMappingButtons() {
    const aiButton = document.getElementById('aiMappingBtn');
    const saveButton = document.getElementById('saveMappingBtn');
    
    if (aiButton) {
        aiButton.disabled = false;
        aiButton.style.opacity = '1';
        aiButton.style.cursor = 'pointer';
        
        // API 키 상태에 따라 버튼 활성화/비활성화
        if (window.hasOpenAIKey) {
            aiButton.style.background = 'linear-gradient(135deg, #6f42c1 0%, #5a32a3 100%)';
            aiButton.title = 'AI가 자동으로 필드를 매핑합니다';
        } else {
            aiButton.disabled = true;
            aiButton.style.opacity = '0.5';
            aiButton.style.background = '#6c757d';
            aiButton.title = 'OpenAI API 키 설정이 필요합니다';
        }
        // console.log('🔓 AI 자동매칭 버튼 활성화'); // Production: 로그 제거
    }
    
    if (saveButton) {
        saveButton.disabled = false;
        saveButton.style.opacity = '1';
        saveButton.style.cursor = 'pointer';
        saveButton.style.background = 'linear-gradient(135deg, #28a745 0%, #20c997 100%)';
        saveButton.title = '현재 매칭 규칙을 저장합니다';
        // console.log('🔓 매칭저장 버튼 활성화'); // Production: 로그 제거
    }
    
    // 📝 필수필드 수동입력 버튼 활성화
    const manualFieldsButton = document.getElementById('manualFieldsBtn');
    if (manualFieldsButton) {
        manualFieldsButton.disabled = false;
        manualFieldsButton.style.opacity = '1';
        manualFieldsButton.style.cursor = 'pointer';
        manualFieldsButton.style.background = 'linear-gradient(135deg, #007bff 0%, #0056b3 100%)';
        manualFieldsButton.title = '필수필드를 수동으로 입력할 수 있습니다';
        manualFieldsButton.innerHTML = '필수필드 수동입력'; // 버튼 텍스트 명시적 설정
        // console.log('🔓 필수필드 수동입력 버튼 활성화'); // Production: 로그 제거
    }
    
    // 🔓 파일 업로드 영역들 다시 활성화
    enableFileUploadAreas();
}

// 🔓 파일 업로드 영역들 활성화 (다시 시작 시)
function enableFileUploadAreas() {
    const uploadAreaOrder = document.getElementById('uploadAreaOrder');
    const uploadAreaSupplier = document.getElementById('uploadAreaSupplier');
    const fileInputOrder = document.getElementById('fileInputOrder');
    const fileInputSupplier = document.getElementById('fileInputSupplier');
    
    // 발주서 업로드 영역 활성화
    if (uploadAreaSupplier) {
        uploadAreaSupplier.style.opacity = '1';
        uploadAreaSupplier.style.cursor = 'pointer';
        uploadAreaSupplier.style.pointerEvents = 'auto';
        
        // 비활성화 메시지 제거
        const message = uploadAreaSupplier.querySelector('.disabled-message');
        if (message) {
            message.remove();
        }
        debugLog('🔓 발주서 업로드 영역 활성화');
    }
    
    // 주문서 업로드 영역 활성화
    if (uploadAreaOrder) {
        uploadAreaOrder.style.opacity = '1';
        uploadAreaOrder.style.cursor = 'pointer';
        uploadAreaOrder.style.pointerEvents = 'auto';
        
        // 비활성화 메시지 제거
        const message = uploadAreaOrder.querySelector('.disabled-message');
        if (message) {
            message.remove();
        }
        debugLog('🔓 주문서 업로드 영역 활성화');
    }
    
    // 파일 입력들 활성화
    if (fileInputSupplier) {
        fileInputSupplier.disabled = false;
    }
    
    if (fileInputOrder) {
        fileInputOrder.disabled = false;
    }
    
    //console.log('🔓 모든 파일 업로드 영역 활성화 완료');
}

// 🐛 오류 보고 창 열기
function openErrorReport() {
    try {
        // 새 창으로 오류 보고 사이트 열기
        const errorReportUrl = null; // Error reporting disabled
        const newWindow = window.open(
            errorReportUrl, 
            'ErrorReport', 
            'width=800,height=600,scrollbars=yes,resizable=yes,toolbar=no,menubar=no,location=no,status=no'
        );
        
        // 새 창이 차단되었는지 확인
        if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
            // 팝업이 차단된 경우 대체 방법 제공
            showAlert('warning', '팝업이 차단되었습니다. 오류 신고 사이트로 직접 이동합니다.');
            window.location.href = errorReportUrl;
        } else {
            // 새 창에 포커스
            newWindow.focus();
        }
    } catch (error) {
        console.error('오류 보고 창 열기 실패:', error);
        showAlert('error', '오류 보고 사이트를 열 수 없습니다. 직접 이동합니다.');
        // Error reporting disabled
    }
}

// 📖 사용자 가이드 열기
function openUserGuide() {
    try {
        console.log('📖 사용자 가이드 열기');
        
        // 사용자 가이드 URL (상대 경로)
        const guideUrl = './guide.html';
        
        const newWindow = window.open(
            guideUrl,
            'UserGuide',
            'width=1200,height=800,scrollbars=yes,resizable=yes,toolbar=no,menubar=no,location=no,status=no'
        );
        
        // 새 창이 차단되었는지 확인
        if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
            // 팝업이 차단된 경우 새 탭으로 열기
            showAlert('info', '팝업이 차단되었습니다. 사용자 가이드를 새 탭에서 엽니다.');
            window.open(guideUrl, '_blank');
        } else {
            // 새 창에 포커스
            newWindow.focus();
            console.log('✅ 사용자 가이드 창이 성공적으로 열렸습니다.');
        }
    } catch (error) {
        console.error('사용자 가이드 창 열기 실패:', error);
        showAlert('warning', '사용자 가이드를 열 수 없습니다. 새 탭에서 엽니다.');
        // 대체 방법으로 새 탭에서 열기
        try {
            window.open('./guide.html', '_blank');
        } catch (fallbackError) {
            console.error('새 탭 열기도 실패:', fallbackError);
            showAlert('error', '브라우저 설정으로 인해 가이드를 열 수 없습니다. 주소창에 "./guide.html"을 직접 입력해주세요.');
        }
    }
}

// 📝 개선된 직접 입력 저장 함수
async function saveDirectInputImproved() {
    // 필수 필드 검증
    if (!validateDirectInputRequiredFields()) {
        return;
    }
    
    try {
        showProgress('직접 입력 데이터를 처리하고 있습니다...');
        
        // 입력 데이터 수집
        const inputData = {};
        ['상품명', '연락처', '주소', '수량', '단가', '고객명'].forEach(field => {
            const input = document.getElementById(`direct_${field}`);
            if (input && input.value.trim()) {
                inputData[field] = input.value.trim();
            }
        });
        
        // 총금액 계산 (수량과 단가가 있는 경우)
        if (inputData['수량'] && inputData['단가']) {
            const quantity = parseFloat(inputData['수량']) || 0;
            const price = parseFloat(inputData['단가']) || 0;
            inputData['총금액'] = (quantity * price).toLocaleString('ko-KR');
        }
        
        // 주문일자 추가
        inputData['주문일자'] = new Date().toLocaleDateString('ko-KR');
        
        hideProgress();
        
        // 발주서 파일이 업로드되었는지 확인
        if (currentSupplierFileId) {
            // 발주서 파일이 있는 경우 - AI 매핑 프로세스
            await processDirectInputWithAIMapping(inputData);
        } else {
            // 발주서 파일이 없는 경우 - 기본 템플릿 사용
            await processDirectInputWithDefaultTemplateImproved(inputData);
        }
        
    } catch (error) {
        hideProgress();
        console.error('직접 입력 저장 오류:', error);
        showAlert('error', '직접 입력 데이터 처리 중 오류가 발생했습니다.');
    }
}

// 🎯 개선된 기본 템플릿 처리 함수
async function processDirectInputWithDefaultTemplateImproved(inputData) {
    try {
        showLoading('기본 템플릿으로 발주서를 생성하고 있습니다...');
        
        // 기본 템플릿 필드 설정
        const defaultTemplate = getDefaultSupplierTemplate();
        
        // TARGET FIELDS 설정
        setupDefaultTargetFields(defaultTemplate);
        
        // 직접 입력 폼 숨기기
        document.getElementById('directInputStep').classList.add('hidden');
        
        // STEP 2 표시
        showStep(2);
        
        // 매핑 데이터 생성
        const mappedData = {};
        defaultTemplate.forEach(field => {
            if (inputData[field]) {
                mappedData[field] = inputData[field];
            }
        });
        
        // 전역 변수에 데이터 저장
        currentMapping = mappedData;
        orderFileHeaders = Object.keys(inputData);
        
        hideLoading();
        
        // 매핑이 완료되었지만 아직 저장되지 않음
        sessionStorage.setItem('mappingSaved', 'false');
        
        showAlert('success', '기본 템플릿으로 필드 매핑이 완료되었습니다. "매핑 저장" 버튼을 클릭한 후 발주서를 생성하세요.');
        
        // GENERATE ORDER 버튼 상태 업데이트 (비활성화됨)
        updateGenerateOrderButton();
        
    } catch (error) {
        hideLoading();
        console.error('기본 템플릿 처리 오류:', error);
        showAlert('error', '기본 템플릿 처리 중 오류가 발생했습니다.');
    }
}

// 🎯 기본 TARGET FIELDS 설정 함수
function setupDefaultTargetFields(defaultTemplate) {
    const targetFieldsContainer = document.getElementById('targetFields');
    if (!targetFieldsContainer) return;
    
    targetFieldsContainer.innerHTML = '';
    
    defaultTemplate.forEach(field => {
        const fieldElement = document.createElement('div');
        fieldElement.className = 'field-item';
        fieldElement.textContent = field;
        fieldElement.onclick = () => selectTargetField(fieldElement);
        targetFieldsContainer.appendChild(fieldElement);
    });
}

// 🔄 작업 모드 변경 함수
function changeWorkMode(mode) {
    // 모드 변경 시 모든 상태 초기화
    resetAllStatesOnModeChange();
    
    // 모든 모드 컨테이너 숨기기
    document.querySelectorAll('.mode-container').forEach(container => {
        container.classList.add('hidden');
    });
    
    // 선택된 모드에 따라 제목과 설명 변경
    const step1Title = document.getElementById('step1Title');
    const step1Description = document.getElementById('step1Description');
    
    switch(mode) {
        case 'fileUpload':
            document.getElementById('fileUploadMode').classList.remove('hidden');
            step1Title.textContent = 'STEP 1. 발주서, 주문서 파일 업로드';
            step1Description.textContent = '택배 송장용·위탁발주용 엑셀을 발주서 파일에, 쇼핑몰 주문서 엑셀 파일을 주문서 파일에 업로드하세요.';
            
            // 🔄 파일 업로드 영역 다시 표시 (모드 전환 시 숨겨진 경우)
            const uploadAreaOrder = document.getElementById('uploadAreaOrder');
            const uploadAreaSupplier = document.getElementById('uploadAreaSupplier');
            
            if (uploadAreaOrder) {
                uploadAreaOrder.style.display = 'block';
            }
            if (uploadAreaSupplier) {
                uploadAreaSupplier.style.display = 'block';
            }
            
            // console.log('✅ 파일 업로드 모드: 업로드 영역 표시 완료'); // Production: 로그 제거
            break;
            
        case 'directInput':
            document.getElementById('directInputMode').classList.remove('hidden');
            step1Title.textContent = 'STEP 1. 주문서 직접 입력';
            step1Description.textContent = '주문 정보를 직접 입력하고 발주서 파일을 업로드하여 매핑합니다.';
            setupDirectInputModeEvents();
            break;
            
        case 'defaultTemplate':
            document.getElementById('defaultTemplateMode').classList.remove('hidden');
            step1Title.textContent = 'STEP 1. 기본 템플릿 사용';
            step1Description.textContent = '주문 정보를 입력하면 기본 발주서 템플릿으로 자동 변환됩니다.';
            break;
            
        case 'savedTemplate':
            document.getElementById('savedTemplateMode').classList.remove('hidden');
            step1Title.textContent = 'STEP 1. 저장 템플릿 사용';
            step1Description.textContent = '저장된 템플릿을 선택하고 주문서를 업로드하면 자동으로 발주서가 생성됩니다.';
            setupSavedTemplateModeEvents();
            loadTemplateList();
            break;
    }
    
    // 현재 모드 저장
    window.currentWorkMode = mode;
    
    // 직접 입력 모드 플래그 설정
    window.isDirectInputMode = (mode === 'directInput' || mode === 'defaultTemplate');
}

// 💾 저장 템플릿 모드 이벤트 설정
function setupSavedTemplateModeEvents() {
    const uploadAreaTemplateMode = document.getElementById('uploadAreaTemplateMode');
    const fileInputTemplateMode = document.getElementById('fileInputTemplateMode');
    
    if (uploadAreaTemplateMode && fileInputTemplateMode) {
        // 기존 이벤트 리스너 정리 (중복 방지)
        uploadAreaTemplateMode.onclick = null;
        uploadAreaTemplateMode.ondragover = null;
        uploadAreaTemplateMode.ondragleave = null;
        uploadAreaTemplateMode.ondrop = null;
        fileInputTemplateMode.onchange = null;
        
        // 새로운 클릭 핸들러 생성 (한 번만 실행되도록)
        const clickHandler = function(e) {
            // 이미 처리 중이면 무시
            if (isProcessing) {
                return;
            }
            
            try {
                // 임시로 보이게 만들고 클릭 (브라우저 보안 정책 우회)
                const originalStyle = {
                    position: fileInputTemplateMode.style.position,
                    opacity: fileInputTemplateMode.style.opacity,
                    zIndex: fileInputTemplateMode.style.zIndex
                };
                
                // 임시로 보이게 설정
                fileInputTemplateMode.style.position = 'static';
                fileInputTemplateMode.style.opacity = '1';
                fileInputTemplateMode.style.zIndex = '9999';
                
                // 클릭 시도
                fileInputTemplateMode.click();
                
                // 즉시 다시 숨기기
                setTimeout(() => {
                    fileInputTemplateMode.style.position = originalStyle.position || '';
                    fileInputTemplateMode.style.opacity = originalStyle.opacity || '';
                    fileInputTemplateMode.style.zIndex = originalStyle.zIndex || '';
                }, 10);
                
            } catch (error) {
                console.error('fileInputTemplateMode.click() 오류:', error);
            }
        };
        
        // 파일 선택 핸들러 생성 (한 번만 실행되도록)
        const changeHandler = function(e) {
            handleFileSelect(e, 'template-mode');
        };
        
        // 이벤트 리스너 등록
        uploadAreaTemplateMode.onclick = clickHandler;
        uploadAreaTemplateMode.addEventListener('dragover', handleDragOver);
        uploadAreaTemplateMode.addEventListener('dragleave', handleDragLeave);
        uploadAreaTemplateMode.addEventListener('drop', (e) => handleDrop(e, 'template-mode'));
        fileInputTemplateMode.onchange = changeHandler;
        
    } else {
        console.error('템플릿 모드 업로드 요소를 찾을 수 없습니다');
    }
}

// 📝 직접 입력 모드 이벤트 설정
function setupDirectInputModeEvents() {
    const uploadAreaSupplierDirectMode = document.getElementById('uploadAreaSupplierDirectMode');
    const fileInputSupplierDirectMode = document.getElementById('fileInputSupplierDirectMode');
    
    if (uploadAreaSupplierDirectMode && fileInputSupplierDirectMode) {
    
        
        // 기존 이벤트 리스너 정리 (중복 방지)
        uploadAreaSupplierDirectMode.onclick = null;
        uploadAreaSupplierDirectMode.ondragover = null;
        uploadAreaSupplierDirectMode.ondragleave = null;
        uploadAreaSupplierDirectMode.ondrop = null;
        fileInputSupplierDirectMode.onchange = null;
        
        // 새로운 클릭 핸들러 생성 (한 번만 실행되도록)
        const clickHandler = function(e) {
            // 이미 처리 중이면 무시
            if (isProcessing) {
                console.warn('⚠️ 파일 처리 중입니다. 클릭 무시됨');
                return;
            }
            
            //console.log('📁 직접 입력 모드 업로드 영역 클릭됨');
            //console.log('📋 fileInputSupplierDirectMode 요소:', fileInputSupplierDirectMode);
            
            try {
            
                
                // 임시로 보이게 만들고 클릭 (브라우저 보안 정책 우회)
                const originalStyle = {
                    position: fileInputSupplierDirectMode.style.position,
                    opacity: fileInputSupplierDirectMode.style.opacity,
                    zIndex: fileInputSupplierDirectMode.style.zIndex
                };
                
                // 임시로 보이게 설정
                fileInputSupplierDirectMode.style.position = 'static';
                fileInputSupplierDirectMode.style.opacity = '1';
                fileInputSupplierDirectMode.style.zIndex = '9999';
                
                // 클릭 시도
                fileInputSupplierDirectMode.click();
                
                // 즉시 다시 숨기기
                setTimeout(() => {
                    fileInputSupplierDirectMode.style.position = originalStyle.position || '';
                    fileInputSupplierDirectMode.style.opacity = originalStyle.opacity || '';
                    fileInputSupplierDirectMode.style.zIndex = originalStyle.zIndex || '';
                }, 10);
                
            } catch (error) {
                console.error('fileInputSupplierDirectMode.click() 오류:', error);
            }
        };
        
        // 파일 선택 핸들러 생성 (한 번만 실행되도록)
        const changeHandler = function(e) {
            handleFileSelect(e, 'supplier-direct');
        };
        
        // 이벤트 리스너 등록
        uploadAreaSupplierDirectMode.onclick = clickHandler;
        uploadAreaSupplierDirectMode.addEventListener('dragover', handleDragOver);
        uploadAreaSupplierDirectMode.addEventListener('dragleave', handleDragLeave);
        uploadAreaSupplierDirectMode.addEventListener('drop', (e) => handleDrop(e, 'supplier-direct'));
        fileInputSupplierDirectMode.onchange = changeHandler;
        
    } else {
        console.error('직접 입력 모드 업로드 요소를 찾을 수 없습니다');
    }
}

// 📝 직접 입력 모드 처리
async function processDirectInputMode() {
    // 작업 모드 설정
    window.currentWorkMode = 'directInput';
    window.isDirectInputMode = true;
    
    // 필수 필드 검증
    const requiredFields = [
        { id: 'direct_input_상품명', name: '상품명' },
        { id: 'direct_input_연락처', name: '연락처' },
        { id: 'direct_input_주소', name: '주소' }
    ];
    
    let isValid = true;
    const missingFields = [];
    
    requiredFields.forEach(field => {
        const input = document.getElementById(field.id);
        if (input) {
            const value = input.value.trim();
            if (!value) {
                isValid = false;
                missingFields.push(field.name);
                input.style.borderColor = '#dc3545';
                input.style.backgroundColor = '#fff5f5';
            } else {
                input.style.borderColor = '#28a745';
                input.style.backgroundColor = '#f8fff8';
            }
        }
    });
    
    if (!isValid) {
        showAlert('error', `다음 필수 항목을 입력해주세요: ${missingFields.join(', ')}`);
        return;
    }
    
    try {
        showProgress('직접 입력 데이터를 처리하고 있습니다...');
        
        // 입력 데이터 수집 (값이 있는 것만)
        const inputData = {};
        ['상품명', '수량', '단가', '고객명', '연락처', '주소'].forEach(field => {
            const input = document.getElementById(`direct_input_${field}`);
            if (input && input.value.trim()) {
                inputData[field] = input.value.trim();
            }
        });
        
        // 총금액 계산
        if (inputData['수량'] && inputData['단가']) {
            const quantity = parseFloat(inputData['수량']) || 0;
            const price = parseFloat(inputData['단가']) || 0;
            inputData['총금액'] = (quantity * price).toLocaleString('ko-KR');
        }
        
        // 주문일자 추가
        inputData['주문일자'] = new Date().toLocaleDateString('ko-KR');
        
        // 전역 변수에 저장
        orderFileHeaders = Object.keys(inputData);
        window.directInputData = inputData;
        
    
        
        // 발주서 파일이 업로드되지 않은 경우 에러 처리
        if (!currentSupplierFileId || supplierFileHeaders.length === 0) {
            hideProgress();
            showAlert('error', '발주서 파일을 먼저 업로드해주세요. 업로드된 발주서의 양식에 맞춰 변환됩니다.');
            return;
        }
        
        hideProgress();
        
        // STEP 2로 이동
        showStep(2);
        setupMapping();
        
        // 발주서 파일 상태에 따른 안내 메시지
        if (currentSupplierFileId && supplierFileHeaders.length > 0) {
            showAlert('success', '직접 입력이 완료되었습니다. 필드 매핑을 설정하고 "매칭저장" 버튼을 클릭하세요.');
        } else {
            showAlert('success', '직접 입력이 완료되었습니다. 발주서 파일을 업로드한 후 필드 매핑을 설정하세요.');
        }
        
    } catch (error) {
        hideProgress();
        console.error('직접 입력 모드 처리 오류:', error);
        showAlert('error', '직접 입력 데이터 처리 중 오류가 발생했습니다.');
    }
}

// 🎯 기본 템플릿 모드 처리
async function processDefaultTemplateMode() {
    // 작업 모드 설정
    window.currentWorkMode = 'defaultTemplate';
    window.isDirectInputMode = true;
    
    // 필수 필드 검증
    const requiredFields = [
        { id: 'template_상품명', name: '상품명' },
        { id: 'template_연락처', name: '연락처' },
        { id: 'template_주소', name: '주소' }
    ];
    
    let isValid = true;
    const missingFields = [];
    
    requiredFields.forEach(field => {
        const input = document.getElementById(field.id);
        if (input) {
            const value = input.value.trim();
            if (!value) {
                isValid = false;
                missingFields.push(field.name);
                input.style.borderColor = '#dc3545';
                input.style.backgroundColor = '#fff5f5';
            } else {
                input.style.borderColor = '#28a745';
                input.style.backgroundColor = '#f8fff8';
            }
        }
    });
    
    if (!isValid) {
        showAlert('error', `다음 필수 항목을 입력해주세요: ${missingFields.join(', ')}`);
        return;
    }
    
    try {
        showProgress('기본 템플릿으로 데이터를 처리하고 있습니다...');
        
        // 입력 데이터 수집 (값이 있는 것만)
        const inputData = {};
        ['상품명', '수량', '단가', '고객명', '연락처', '주소'].forEach(field => {
            const input = document.getElementById(`template_${field}`);
            if (input && input.value.trim()) {
                inputData[field] = input.value.trim();
            }
        });
        
        // 총금액 계산
        if (inputData['수량'] && inputData['단가']) {
            const quantity = parseFloat(inputData['수량']) || 0;
            const price = parseFloat(inputData['단가']) || 0;
            inputData['총금액'] = (quantity * price).toLocaleString('ko-KR');
        }
        
        // 주문일자 추가
        inputData['주문일자'] = new Date().toLocaleDateString('ko-KR');
        
        // 기본 템플릿 필드 설정
        const defaultTemplate = getDefaultSupplierTemplate();
        
        // 전역 변수에 저장
        orderFileHeaders = Object.keys(inputData);
        supplierFileHeaders = defaultTemplate; // 기본 템플릿 사용
        window.directInputData = inputData; // 입력 데이터도 저장
        
        //console.log('📋 기본 템플릿 모드 - orderFileHeaders 설정:', orderFileHeaders);
        //console.log('📋 기본 템플릿 모드 - supplierFileHeaders 설정:', supplierFileHeaders);
        //console.log('📋 기본 템플릿 모드 - inputData 설정:', inputData);
        
        hideProgress();
        
        // STEP 2로 이동
        showStep(2);
        setupMapping();
        
        // 기본 템플릿 모드에서는 자동으로 1:1 매칭 설정
        performAutoMatching();
        
        // 매핑 필요 상태로 설정
        sessionStorage.setItem('mappingSaved', 'false');
        updateGenerateOrderButton();
        updateSaveMappingButton();
        
        showAlert('success', '기본 템플릿 모드 입력이 완료되었습니다! 자동 매칭된 필드를 확인하고 "매칭저장" 버튼을 클릭하세요.');
        
    } catch (error) {
        hideProgress();
        console.error('기본 템플릿 모드 처리 오류:', error);
        showAlert('error', '기본 템플릿 데이터 처리 중 오류가 발생했습니다.');
    }
}

// 📁 파일 처리 함수 수정 (모드별 처리)
async function processFileForMode(file, type) {
    const mode = window.currentWorkMode || 'fileUpload';
    
    // 파일 형식 검증 - 매우 구형 BIFF 포맷만 차단 (Excel 2016+ 호환)
    const isBiffBlocked = await checkIfBinaryXLS(file);
    if (isBiffBlocked) {
        const baseType = type.replace('-direct', '').replace('-mode', '');
        const typeText = baseType.includes('supplier') ? '발주서' : '주문서';
        
        showUploadResult(null, baseType, true, 
            `❌ 매우 구형 BIFF 포맷 Excel 파일은 지원되지 않습니다.<br><br>` +
            `📋 <strong>해결 방법:</strong><br>` +
            `1. Excel에서 해당 파일을 열어주세요<br>` +
            `2. "파일 → 다른 이름으로 저장" 메뉴를 선택하세요<br>` +
            `3. 파일 형식을 <strong>"Excel 통합 문서(*.xlsx)"</strong>로 변경하세요<br>` +
            `4. 변환된 .xlsx 파일을 다시 업로드해주세요<br><br>` +
            `💡 Excel 2016+ 에서 저장한 파일은 정상적으로 업로드됩니다.`
        );
        return;
    }
    
    // 허용되는 파일 형식 검증 (Excel, CSV 허용)
    const allowedExtensions = ['.xlsx', '.xls', '.csv'];
    const hasValidExtension = allowedExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
    
    if (!hasValidExtension) {
        const baseType = type.replace('-direct', '').replace('-mode', '');
        showUploadResult(null, baseType, true, 
            '❌ 지원하지 않는 파일 형식입니다.<br><br>' +
            '📋 <strong>지원 형식:</strong><br>' +
            '• Excel 파일(.xlsx, .xls) - Excel 2016+ 호환<br>' +
            '• CSV 파일(.csv)<br><br>' +
            '💡 매우 구형 BIFF 포맷 파일은 .xlsx로 변환 후 업로드해주세요.'
        );
        return;
    }
    
    // 파일 크기 검증 (10MB)
    if (file.size > 10 * 1024 * 1024) {
        const baseType = type.replace('-direct', '').replace('-mode', '');
        showUploadResult(null, baseType, true, 
            '❌ 파일 크기가 너무 큽니다.<br><br>' +
            '📋 <strong>파일 크기 제한:</strong><br>' +
            '• 최대 10MB까지 업로드 가능<br><br>' +
            '💡 파일 크기를 줄이거나 필요한 데이터만 포함하여 다시 업로드해주세요.'
        );
        return;
    }
    
    try {
        // 이미 처리 중인 경우 중단
        if (isProcessing) {
            const baseType = type.replace('-direct', '').replace('-mode', '');
            showUploadResult(null, baseType, true, 
                '⚠️ 이미 파일 처리가 진행 중입니다.<br><br>' +
                '💡 현재 다른 파일을 처리하고 있습니다. 잠시 후 다시 시도해주세요.'
            );
            return;
        }
        
        // 처리 상태 설정
        isProcessing = true;
        
        // 이전 요청 취소 (있는 경우)
        if (currentUploadController) {
            currentUploadController.abort();
        }
        
        // 새 AbortController 생성
        currentUploadController = new AbortController();
        
        // 📋 업로드 단계로 진행 (이미 handleFileSelect/handleDrop에서 진행바 시작됨)
        updateProgress(5, '서버 업로드를 준비하고 있습니다...');
        
        const formData = new FormData();
        formData.append('orderFile', file);
        
        // 파일 타입 설정 (템플릿 모드는 주문서 파일)
        let fileType;
        if (type === 'template-mode') {
            fileType = 'order'; // 템플릿 모드에서는 주문서 파일 업로드
        } else if (type.includes('supplier')) {
            fileType = 'supplier';
        } else {
            fileType = 'order';
        }
        
        formData.append('fileType', fileType);
        
        const response = await fetch('/api/orders/upload', {
            method: 'POST',
            body: formData,
            signal: currentUploadController.signal
        });
        
        // 30초 타임아웃 설정 (Vercel 환경 최적화)
        const timeoutId = setTimeout(() => {
            if (currentUploadController && !currentUploadController.signal.aborted) {
                currentUploadController.abort();
                showAlert('error', '업로드 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.');
            }
        }, 30000);
        
        const result = await response.json();
        
        // 타임아웃 정리
        clearTimeout(timeoutId);
        
        hideProgress();
        
        if (result.success) {
            // 모드별 처리
            if (type === 'supplier-direct') {
                currentSupplierFileId = result.fileId;
                supplierFileHeaders = result.headers;
                
                console.log('📊 직접 입력 모드 발주서 파일 정보:', {
                    파일ID: result.fileId,
                    헤더개수: result.headers ? result.headers.length : 0,
                    헤더목록: result.headers ? result.headers.slice(0, 3) : [],
                    한컴오피스: result.isHancomExcel || false,
                    구형파일변환: result.xlsConverted || false
                });
                
                const uploadResult = document.getElementById('uploadResultSupplierDirectMode');
                const uploadAlert = document.getElementById('uploadAlertSupplierDirectMode');
                
                if (uploadResult && uploadAlert) {
                    uploadResult.classList.remove('hidden');
                    
                    // .xls 파일 변환 안내 메시지
                    let xlsMessage = '';
                    if (result.xlsConverted) {
                        xlsMessage = `<br><strong>🔄 자동 변환:</strong> .xls 파일을 .xlsx 형식으로 처리했습니다.`;
                    }
                    
                    uploadAlert.innerHTML = `
                        <div class="alert alert-success">
                            ✅ 발주서 파일이 성공적으로 업로드되었습니다!<br>
                            <strong>파일명:</strong> ${result.fileName}${xlsMessage}<br>
                            <strong>컬럼 수:</strong> ${result.headers.length}개
                        </div>
                    `;
                }
                
                showAlert('success', '발주서 파일이 업로드되었습니다. 주문 정보를 입력 후 완료 버튼을 클릭하세요.');
                 
                // 이미 주문 정보가 입력되어 있으면 매핑 갱신
                if (orderFileHeaders.length > 0) {
                    setupMapping();
                
                    showAlert('success', '발주서 파일이 업로드되었습니다! 이제 필드 매핑을 설정하고 "매칭저장" 버튼을 클릭하세요.');
                }
                
            } else if (type === 'template-mode') {
                console.log('📋 템플릿 모드 파일 업로드 완료:', {
                    type: type,
                    fileType: fileType,
                    resultFileId: result.fileId,
                    fileName: result.fileName
                });
                
                currentOrderFileId = result.fileId;
                orderFileHeaders = result.headers;
                
                /*
                console.log('✅ 템플릿 모드 변수 설정 완료:', {
                    currentOrderFileId: currentOrderFileId,
                    orderFileHeaders: orderFileHeaders.length
                });
                */
                
                const uploadResult = document.getElementById('uploadResultTemplateMode');
                const uploadAlert = document.getElementById('uploadAlertTemplateMode');
                
                // 업로드 영역 숨기기 (파일 업로드 모드와 동일)
                const uploadArea = document.getElementById('uploadAreaTemplateMode');
                if (uploadArea) {
                    uploadArea.style.display = 'none';
                }
                
                if (uploadResult && uploadAlert) {
                    uploadResult.classList.remove('hidden');
                    
                    // .xls 파일 변환 안내 메시지
                    let xlsMessage = '';
                    if (result.xlsConverted) {
                        xlsMessage = `<br><strong>🔄 자동 변환:</strong> .xls 파일을 .xlsx 형식으로 처리했습니다.`;
                    }
                    
                    uploadAlert.innerHTML = `
                        <div style="background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 8px; padding: 16px; margin: 10px 0;">
                            <div style="display: flex; align-items: center; justify-content: space-between;">
                                <div style="display: flex; align-items: center; gap: 12px;">
                                    <div style="color: #28a745; font-size: 1.2em;">✓</div>
                                    <div>
                                        <div style="font-weight: 600; color: #495057; margin-bottom: 2px;">${result.fileName}</div>
                                        <div style="font-size: 0.85em; color: #6c757d;">
                                            ${result.validation ? result.validation.validRows : '확인 중'}행 · ${result.headers.length}개 필드 
                                            ${result.fromCache ? '· 캐시됨' : ''}
                                            ${result.xlsConverted ? '· .xls → .xlsx 변환됨' : ''}
                                        </div>
                                    </div>
                                </div>
                                <button onclick="changeTemplateFile()" style="background: #6c757d; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 0.85em;">
                                    변경
                                </button>
                            </div>
                        </div>
                    `;
                }
                
                // 템플릿 처리 버튼 상태 업데이트
                updateTemplateProcessButton();
                
                showAlert('success', '주문서 파일이 업로드되었습니다. 템플릿을 선택하고 자동 변환을 시작하세요.');
            }
            
        } else {
            let errorMessage = result.error || '파일 업로드에 실패했습니다.';
            
            // 매우 구형 BIFF 포맷 파일 오류인 경우 특별 안내
            if (result.fileType === 'binary-xls' || errorMessage.includes('구형 BIFF 포맷')) {
                errorMessage = '❌ 매우 구형 BIFF 포맷 Excel 파일은 지원되지 않습니다.<br><br>' +
                              '📋 <strong>해결 방법:</strong><br>' +
                              '1. Excel에서 해당 파일을 열어주세요<br>' +
                              '2. "파일 → 다른 이름으로 저장" 메뉴를 선택하세요<br>' +
                              '3. 파일 형식을 <strong>"Excel 통합 문서(*.xlsx)"</strong>로 변경하세요<br>' +
                              '4. 변환된 .xlsx 파일을 다시 업로드해주세요<br><br>' +
                              '💡 Excel 2016+ 에서 저장한 파일은 정상적으로 업로드됩니다.';
            }
            // 한컴오피스 파일 크기 초과 오류인 경우 특별 안내
            else if (result.fileType === 'hancom-excel-too-large') {
                errorMessage = '🏢 ❌ 한컴오피스 Excel 파일 크기 초과<br><br>' +
                              '📋 <strong>Vercel 환경 제한사항:</strong><br>' +
                              `• 현재 파일 크기: <strong>${result.fileSize}</strong><br>` +
                              '• 최대 허용 크기: <strong>4MB</strong><br><br>' +
                              '📋 <strong>해결 방법:</strong><br>' +
                              '1. 파일 내 불필요한 데이터나 시트를 삭제하세요<br>' +
                              '2. 이미지나 차트가 있다면 제거해주세요<br>' +
                              '3. <strong>Microsoft Excel</strong>로 다시 저장해보세요<br>' +
                              '4. 파일을 여러 개로 분할하여 업로드하세요<br><br>' +
                              '💡 로컬 환경에서는 더 큰 파일도 처리 가능합니다.';
            }
            // 일반 .xls 파일 오류인 경우 특별 안내
            else if (file.name.toLowerCase().endsWith('.xls') && errorMessage.includes('Excel 파일')) {
                errorMessage = `${errorMessage}\n\n💡 해결 방법:\n1. Excel에서 파일을 열고 "파일 > 다른 이름으로 저장" 선택\n2. 파일 형식을 "Excel 통합 문서 (*.xlsx)" 선택\n3. 새로 저장된 .xlsx 파일을 업로드해주세요`;
            }
            
            // 해당 업로드 영역에 오류 메시지 표시
            const baseType = type.replace('-direct', '').replace('-mode', '');
            showUploadResult(null, baseType, true, errorMessage);
        }
        
        // 처리 완료 후 상태 초기화
        isProcessing = false;
        currentUploadController = null;
        
    } catch (error) {
        hideProgress();
        console.error('업로드 오류:', error);
        
        // 타임아웃 정리 (존재하는 경우)
        if (typeof timeoutId !== 'undefined') {
            clearTimeout(timeoutId);
        }
        
        // 처리 상태 초기화
        isProcessing = false;
        currentUploadController = null;
        
        // 요청 취소 오류인 경우 특별 처리
        if (error.name === 'AbortError') {
            //console.log('업로드 요청이 취소되었습니다.');
            showAlert('info', '업로드가 취소되었습니다.');
            return;
        }
        
        // catch 블록의 오류도 해당 업로드 영역에 표시
        const baseType = type.replace('-direct', '').replace('-mode', '');
        showUploadResult(null, baseType, true, '파일 업로드 중 오류가 발생했습니다.');
    }
}

// 🔄 모드 변경 시 모든 상태 초기화 함수
function resetAllStatesOnModeChange() {
    // 전역 변수 초기화
    currentOrderFileId = null;
    currentSupplierFileId = null;
    currentMapping = {};
    generatedFileName = null;
    displayFileName = null;
    orderFileHeaders = [];
    supplierFileHeaders = [];
    
    // 재시도 카운터 초기화 (무한 루프 방지)
    window.orderHeaderRetryCount = 0;
    window.supplierHeaderRetryCount = 0;
    
    // 세션 스토리지 초기화
    sessionStorage.setItem('mappingSaved', 'false');
    
    // 펜딩 데이터 정리
    delete window.pendingDirectInputData;
    delete window.pendingMappedData;
    delete window.pendingAIMappings;
    delete window.directInputData;
    
    // 모드 관련 변수 초기화
    window.isDirectInputMode = false;
    
    // 모든 스텝 초기화 (2, 3, 4단계 숨기기)
    resetAllSteps();
    
    // 업로드 결과 초기화
    const uploadResults = [
        'uploadResultOrder',
        'uploadResultSupplier', 
        'uploadResultSupplierDirectMode'
    ];
    
    uploadResults.forEach(id => {
        const element = document.getElementById(id);
        if (element) element.classList.add('hidden');
    });
    
    // 업로드 영역 다시 표시 (파일 업로드 후 숨겨진 경우 복원)
    const uploadAreas = [
        'uploadAreaOrder',
        'uploadAreaSupplier',
        'uploadAreaSupplierDirectMode'
    ];
    
    uploadAreas.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.style.display = 'block';
        }
    });
    
    // 알림 영역 초기화
    const alerts = [
        'uploadAlert',
        'uploadAlertOrder',
        'uploadAlertSupplier',
        'uploadAlertSupplierDirectMode'
    ];
    
    alerts.forEach(id => {
        const element = document.getElementById(id);
        if (element) element.innerHTML = '';
    });
    
    // 모든 입력 폼 필드 초기화
    ['상품명', '연락처', '주소', '수량', '단가', '고객명'].forEach(field => {
        // 기존 직접 입력 폼
        const input = document.getElementById(`direct_${field}`);
        if (input) {
            input.value = '';
            input.style.borderColor = '#dee2e6';
            input.style.backgroundColor = '';
        }
        
        // 새로운 모드별 입력 폼들
        const directInput = document.getElementById(`direct_input_${field}`);
        if (directInput) {
            directInput.value = '';
            directInput.style.borderColor = '#dee2e6';
            directInput.style.backgroundColor = '';
        }
        
        const templateInput = document.getElementById(`template_${field}`);
        if (templateInput) {
            templateInput.value = '';
            templateInput.style.borderColor = '#dee2e6';
            templateInput.style.backgroundColor = '';
        }
    });
    
    // 파일 입력 초기화
    const fileInputs = [
        'fileInputOrder',
        'fileInputSupplier',
        'fileInputSupplierDirectMode'
    ];
    
    fileInputs.forEach(id => {
        const element = document.getElementById(id);
        if (element) element.value = '';
    });
    
    // 생성 결과 및 이메일 관련 초기화
    const generateResult = document.getElementById('generateResult');
    const emailResult = document.getElementById('emailResult');
    if (generateResult) generateResult.innerHTML = '';
    if (emailResult) emailResult.innerHTML = '';
    
    // 버튼 상태 초기화
    updateGenerateOrderButton();
    
    // 진행률 숨기기
    hideProgress();
    

}

// 🤖 자동 필드 매칭 함수
function performAutoMatching() {
    console.log('🤖 자동 매칭 시작');
    console.log('- 소스 필드:', orderFileHeaders);
    console.log('- 타겟 필드:', supplierFileHeaders);
    
    let matchedCount = 0;
    const matchedFields = [];
    
    // 소스 필드와 타겟 필드 중 이름이 동일한 것들을 찾아서 매핑
    orderFileHeaders.forEach(sourceField => {
        //console.log(`🔍 자동 매칭 시도: "${sourceField}"`);
        
        // 타겟 필드에서 동일한 이름을 찾기 (완전 일치 우선)
        const matchingTargetField = supplierFileHeaders.find(targetField => {
            //console.log(`  📋 타겟 필드와 비교: "${sourceField}" === "${targetField}"`);
            
            // 1. 완전 일치 (최우선)
            if (sourceField === targetField) {
                //console.log(`  ✅ 완전 일치 발견: "${sourceField}" === "${targetField}"`);
                return true;
            }
            
            // 2. "원본 - 타겟" 형태에서 타겟 부분이 일치하는 경우
            if (targetField.includes(' - ')) {
                const targetPart = targetField.split(' - ')[1]; // "상품명 - 상품명" → "상품명"
                //console.log(`  🔄 분할 매칭 시도: "${sourceField}" === "${targetPart}" (from "${targetField}")`);
                if (sourceField === targetPart) {
                    //console.log(`  ✅ 분할 매칭 발견: "${sourceField}" === "${targetPart}"`);
                    return true;
                }
            }
            
            return false;
        });
        
        if (matchingTargetField) {
            // 매핑 정보 저장
            currentMapping[matchingTargetField] = sourceField;
            matchedFields.push({ source: sourceField, target: matchingTargetField });
            matchedCount++;
            
            console.log(`✅ 자동 매칭 성공: ${sourceField} → ${matchingTargetField}`);
        } else {
            //console.log(`❌ 자동 매칭 실패: "${sourceField}" - 일치하는 타겟 필드를 찾을 수 없음`);
        }
    });
    
    // UI 업데이트: 매칭된 필드들을 시각적으로 표시
    updateMappingUI(matchedFields);
    
    //console.log(`🎯 자동 매칭 완료: ${matchedCount}개 필드 매칭됨`);
    
    if (matchedCount > 0) {
        // 자동 매핑은 완료되었지만 아직 저장되지 않음
        sessionStorage.setItem('mappingSaved', 'false');
        updateGenerateOrderButton();
        
        //console.log(`📋 ${matchedCount}개 필드가 자동으로 매칭되었습니다: ${matchedFields.map(m => m.source).join(', ')}`);
    }
}

// 🎨 매핑 UI 업데이트 함수
function updateMappingUI(matchedFields) {
    const sourceFieldsContainer = document.getElementById('sourceFields');
    const targetFieldsContainer = document.getElementById('targetFields');
    
    matchedFields.forEach(({ source, target }) => {
        // 타겟 필드 시각적 업데이트
        const targetElements = targetFieldsContainer.querySelectorAll('.field-item');
        targetElements.forEach(element => {
            if (element.dataset.target === target) {
                element.style.background = '#28a745';
                element.style.color = 'white';
                element.innerHTML = `${target} ← ${source}`;
            }
        });
        
        // 소스 필드에서 매칭된 필드 제거
        const sourceElements = sourceFieldsContainer.querySelectorAll('.field-item');
        sourceElements.forEach(element => {
            if (element.dataset.source === source) {
                element.remove();
            }
        });
    });
}

// 🤖 AI 기능 버튼 상태 업데이트
function updateAIFeatureButtons(hasApiKey) {
    // ID로 AI 매핑 버튼 찾기
    const aiMappingBtn = document.getElementById('aiMappingBtn');
    
    if (aiMappingBtn) {
        if (hasApiKey) {
            aiMappingBtn.style.opacity = '1';
            aiMappingBtn.style.cursor = 'pointer';
            aiMappingBtn.disabled = false;
            
            // 현재 토글 상태에 따라 버튼 텍스트와 색상 설정
            if (!aiMappingExecuted) {
                aiMappingBtn.innerHTML = 'AI 자동매칭';
                aiMappingBtn.style.background = 'linear-gradient(135deg, #6f42c1 0%, #5a32a3 100%)';
                aiMappingBtn.title = 'AI가 자동으로 필드를 매핑합니다';
            } else {
                aiMappingBtn.innerHTML = 'AI 자동매칭 취소';
                aiMappingBtn.style.background = 'linear-gradient(135deg, #dc3545 0%, #c82333 100%)';
                aiMappingBtn.title = 'AI 자동매칭을 취소하고 이전 상태로 돌아갑니다';
            }
            
            // console.log('✅ AI 자동매칭 버튼 활성화'); // Production: 로그 제거
        } else {
            aiMappingBtn.style.opacity = '0.5';
            aiMappingBtn.style.cursor = 'not-allowed';
            aiMappingBtn.disabled = true;
            aiMappingBtn.innerHTML = 'AI 자동매칭';
            aiMappingBtn.style.background = 'linear-gradient(135deg, #6c757d 0%, #495057 100%)';
            aiMappingBtn.title = 'OpenAI API 키가 필요합니다';
            // console.log('⚠️ AI 자동매칭 버튼 비활성화 (API 키 없음)'); // Production: 로그 제거
        }
    } else {
        console.warn('⚠️ AI 매핑 버튼을 찾을 수 없습니다.');
    }
    
}

// 💾 매칭저장 버튼 상태 업데이트 (중복 제거)

// 🔐 인증 상태 표시 (개선된 버전)
function addAuthenticationIndicator(authenticatedAt, isAdmin, username, hasApiKey) {
    // 기존 표시기 제거
    const existingIndicator = document.querySelector('.auth-indicator');
    if (existingIndicator) {
        existingIndicator.remove();
    }
    
    const indicator = document.createElement('div');
    indicator.className = 'auth-indicator';
    indicator.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        background: ${hasApiKey ? 'linear-gradient(135deg, #28a745 0%, #20c997 100%)' : 'linear-gradient(135deg, #6c757d 0%, #495057 100%)'};
        color: white;
        padding: 8px 15px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 500;
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        z-index: 1000;
        user-select: none;
        cursor: pointer;
        transition: all 0.3s ease;
        display: none;
    `;
    
    const statusIcon = hasApiKey ? '🤖' : '📋';
    const statusText = hasApiKey ? 'AI 기능 사용 가능' : '수동/템플릿 모드';
    const userInfo = isAdmin ? ` (관리자${username ? `: ${username}` : ''})` : '';
    
    indicator.innerHTML = `${statusIcon} ${statusText}${userInfo}`;
    
    // 클릭 시 API 키 설정 안내 또는 상태 정보 표시
    indicator.addEventListener('click', () => {
        if (hasApiKey) {
            showAlert('info', `✅ OpenAI API 키가 설정되어 있습니다.\n🤖 AI 자동 매핑 기능을 사용할 수 있습니다.\n📅 인증 시간: ${new Date(authenticatedAt).toLocaleString()}`);
        } else {
            showAlert('info', `📋 현재 수동/템플릿 모드로 사용 중입니다.\n\n🤖 AI 자동 매핑을 사용하려면:\n1. 우측 상단 "API 키 설정" 클릭\n2. OpenAI API 키 입력\n\n💡 API 키 없이도 모든 핵심 기능을 사용할 수 있습니다!`);
        }
    });
    
    document.body.appendChild(indicator);
    
    // API 키 설정 버튼은 addAdminLoginButton에서 처리됨
}



// 🔗 ===== WEBHOOK 관리 기능 ===== 🔗

// 📋 클립보드에 복사
function copyToClipboard(elementId) {
    const element = document.getElementById(elementId);
    const text = element.textContent || element.value;
    
    navigator.clipboard.writeText(text).then(() => {
        showAlert('success', '📋 클립보드에 복사되었습니다!');
        
        // 복사 버튼 시각적 피드백
        const copyBtn = element.nextElementSibling;
        if (copyBtn && copyBtn.classList.contains('copy-btn')) {
            const originalText = copyBtn.textContent;
            copyBtn.textContent = '✅';
            copyBtn.style.background = '#28a745';
            
            setTimeout(() => {
                copyBtn.textContent = originalText;
                copyBtn.style.background = '#6c757d';
            }, 2000);
        }
    }).catch(err => {
        console.error('클립보드 복사 실패:', err);
        showAlert('error', '클립보드 복사에 실패했습니다.');
    });
}

// 🔍 Webhook API 상태 확인
async function checkWebhookStatus() {
    const statusIndicator = document.getElementById('apiKeyIndicator');
    const statusText = document.getElementById('apiKeyText');
    const statusContainer = document.getElementById('apiKeyStatus');
    
    try {
        // 로딩 상태
        statusIndicator.textContent = '⏳';
        statusText.textContent = 'API 상태 확인 중...';
        statusContainer.style.borderLeftColor = '#ffc107';
        
    
        
        // 환경변수에서 API 키가 설정되어 있는지 서버에 확인
        const response = await fetch('/api/webhook/status', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer dummy-key-for-check` // 더미 키로 테스트
            }
        });
        
        if (response.status === 500) {
            // API 키가 서버에 설정되지 않음
            statusIndicator.textContent = '❌';
            statusText.textContent = 'WEBHOOK_API_KEY가 서버에 설정되지 않았습니다.';
            statusContainer.style.borderLeftColor = '#dc3545';
            showAlert('warning', '⚠️ WEBHOOK_API_KEY가 환경변수에 설정되지 않았습니다.\n\n서버 관리자가 다음을 설정해야 합니다:\nWEBHOOK_API_KEY=your-secure-api-key');
        } else if (response.status === 401) {
            // API 키는 설정되어 있지만 인증 실패 (정상)
            statusIndicator.textContent = '✅';
            statusText.textContent = 'Webhook API가 정상 작동 중입니다. (API 키 설정됨)';
            statusContainer.style.borderLeftColor = '#28a745';
            showAlert('success', '✅ Webhook API가 정상 작동 중입니다!\n\n런모아 담당자에게 API 정보를 전달할 수 있습니다.');
        } else {
            const result = await response.json();
            if (result.success) {
                statusIndicator.textContent = '✅';
                statusText.textContent = `Webhook API 정상 작동 중 (v${result.version})`;
                statusContainer.style.borderLeftColor = '#28a745';
                showAlert('success', '✅ Webhook API가 정상 작동 중입니다!');
            } else {
                throw new Error(result.error || '알 수 없는 오류');
            }
        }
        
    } catch (error) {
        console.error('❌ Webhook 상태 확인 실패:', error);
        statusIndicator.textContent = '❌';
        statusText.textContent = 'API 상태 확인 실패';
        statusContainer.style.borderLeftColor = '#dc3545';
        showAlert('error', '❌ Webhook API 상태 확인에 실패했습니다.\n\n' + error.message);
    }
}

// 🧪 Webhook API 기본 테스트
async function testWebhookAPI() {
    try {
        showLoading('Webhook API 연결 테스트 중...');
        
        // 기본 연결 테스트 (인증 없이)
        const response = await fetch('/api/webhook/status');
        
        hideLoading();
        
        if (response.status === 500) {
            showAlert('warning', '⚠️ WEBHOOK_API_KEY가 환경변수에 설정되지 않았습니다.\n\n서버 관리자에게 문의하세요.');
        } else if (response.status === 401) {
            showAlert('info', '🔐 Webhook API 엔드포인트가 정상적으로 응답합니다.\n\n실제 테스트를 위해서는 유효한 API 키가 필요합니다.');
        } else {
            const result = await response.json();
            showAlert('success', '✅ Webhook API 연결 테스트 성공!\n\n' + JSON.stringify(result, null, 2));
        }
        
    } catch (error) {
        hideLoading();
        console.error('❌ Webhook API 테스트 실패:', error);
        showAlert('error', '❌ Webhook API 테스트에 실패했습니다.\n\n' + error.message);
    }
}

// 📤 테스트 주문 전송
async function sendTestOrder() {
    const resultDiv = document.getElementById('webhookTestResult');
    const resultContent = document.getElementById('testResultContent');
    
    try {
        // 테스트 데이터 수집
        const testData = {
            order_id: document.getElementById('testOrderId').value,
            customer_name: document.getElementById('testCustomerName').value,
            customer_phone: '010-1234-5678',
            shipping_address: '서울시 테스트구 테스트로 123',
            products: [
                {
                    product_name: document.getElementById('testProductName').value,
                    quantity: parseInt(document.getElementById('testQuantity').value) || 1,
                    unit_price: parseInt(document.getElementById('testUnitPrice').value) || 10000,
                    total_price: (parseInt(document.getElementById('testQuantity').value) || 1) * (parseInt(document.getElementById('testUnitPrice').value) || 10000)
                }
            ],
            total_amount: (parseInt(document.getElementById('testQuantity').value) || 1) * (parseInt(document.getElementById('testUnitPrice').value) || 10000),
            order_date: new Date().toISOString()
        };
        
    
        
        showLoading('테스트 주문을 전송하고 있습니다...');
        
        // API 키 입력 요청
        const apiKey = prompt('🔐 Webhook API 키를 입력하세요:\n\n(실제 운영 환경에서는 런모아 플랫폼이 자동으로 전송합니다)');
        
        if (!apiKey) {
            hideLoading();
            showAlert('info', '⚠️ API 키가 입력되지 않아 테스트를 취소합니다.');
            return;
        }
        
        // Webhook API 호출
        const response = await fetch('/api/webhook/orders', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(testData)
        });
        
        const result = await response.json();
        
        hideLoading();
        
        // 결과 표시
        resultContent.textContent = JSON.stringify(result, null, 2);
        resultDiv.style.display = 'block';
        
        if (result.success) {
            showAlert('success', `✅ 테스트 주문 처리 성공!\n\n주문번호: ${result.order_id}\n생성된 파일: ${result.generated_file}\n이메일 전송: ${result.email_sent ? '성공' : '실패'}\n처리 시간: ${result.processing_time}`);
        } else {
            showAlert('error', `❌ 테스트 주문 처리 실패:\n\n${result.error}\n\n상세 정보: ${result.details || 'N/A'}`);
        }
        
        // 결과 영역으로 스크롤
        resultDiv.scrollIntoView({ behavior: 'smooth' });
        
    } catch (error) {
        hideLoading();
        console.error('❌ 테스트 주문 전송 실패:', error);
        showAlert('error', '❌ 테스트 주문 전송 중 오류가 발생했습니다.\n\n' + error.message);
        
        // 오류 결과도 표시
        resultContent.textContent = `오류: ${error.message}\n\n스택: ${error.stack}`;
        resultDiv.style.display = 'block';
    }
}

// 🌐 현재 환경에 맞는 Webhook URL 설정
function updateWebhookUrl() {
    const webhookUrlElement = document.getElementById('webhookUrl');
    if (webhookUrlElement) {
        const currentOrigin = window.location.origin;
        const webhookUrl = `${currentOrigin}/api/webhook/orders`;
        webhookUrlElement.textContent = webhookUrl;
        
        console.log('🔗 Webhook URL 설정 완료:', webhookUrl);
        
        // 환경 표시
        const isLocalhost = currentOrigin.includes('localhost') || currentOrigin.includes('127.0.0.1');
        if (isLocalhost) {
            webhookUrlElement.style.background = '#e3f2fd';
            webhookUrlElement.style.color = '#1976d2';
            webhookUrlElement.title = '로컬 개발 환경';
        } else {
            webhookUrlElement.style.background = '#e8f5e8';
            webhookUrlElement.style.color = '#2e7d32';
            webhookUrlElement.title = '프로덕션 환경';
        }
    }
}

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', function() {
    // 1. URL 설정 (즉시)
    updateWebhookUrl();
    
    // 2. 관리자 권한 확인 및 Webhook 섹션 표시 여부 결정
    checkAdminAccessForWebhook();
    
    // 3. Webhook 상태 확인 (2초 후, 관리자인 경우에만)
    setTimeout(() => {
        const webhookSection = document.getElementById('webhookManagement');
        if (webhookSection && webhookSection.style.display !== 'none') {
            checkWebhookStatus();
        }
    }, 2000);
});

// 🔐 관리자 권한 확인 및 Webhook 섹션 표시
async function checkAdminAccessForWebhook() {
    try {
    
        
        // 인증 상태 확인
        const response = await fetch('/api/auth/check');
        const authStatus = await response.json();
        
        const webhookSection = document.getElementById('webhookManagement');
        
        if (authStatus.showWebhookManagement) {
            // 관리자 + 개발환경 (또는 강제 표시) → Webhook 관리 표시
            console.log('✅ Webhook 관리 섹션 표시 허용:', {
                isAdmin: authStatus.isAdmin,
                isDevelopment: authStatus.isDevelopment,
                showWebhookManagement: authStatus.showWebhookManagement
            });
            webhookSection.style.display = 'block';
        } else {
            // 프로덕션 환경 또는 일반 사용자 → Webhook 관리 완전 숨김 (보안)
            console.log('🔒 Webhook 관리 섹션 숨김 (보안):', {
                isAdmin: authStatus.isAdmin,
                isDevelopment: authStatus.isDevelopment,
                reason: authStatus.isAdmin ? '프로덕션 환경' : '관리자 권한 없음'
            });
            webhookSection.style.display = 'none';
        }
        
    } catch (error) {
        console.error('❌ 관리자 권한 확인 실패:', error);
        // 오류 시 보안상 숨김
        const webhookSection = document.getElementById('webhookManagement');
        if (webhookSection) {
            webhookSection.style.display = 'none';
        }
    }
}

// ===============================================
// STEP 2용 필수필드 수동입력 함수들
// ===============================================

// STEP 2에서 필수필드 수동입력 섹션 토글
function toggleManualFieldsInStep2() {
    const manualSection = document.getElementById('manualFieldsSectionStep2');
    const button = document.getElementById('manualFieldsBtn');
    
    if (!manualSection) {
        console.warn('⚠️ STEP 2 필수필드 수동입력 섹션을 찾을 수 없습니다.');
        return;
    }
    
    if (manualSection.classList.contains('hidden')) {
        // 섹션 열기
        manualSection.classList.remove('hidden');
        button.innerHTML = '📝 필수필드 닫기';
        button.style.background = 'linear-gradient(135deg, #dc3545 0%, #c82333 100%)';
        
        // 필드 입력 영역 초기화
        clearManualFieldsStep2();
        
        // 템플릿에서 가져온 필수 필드가 있다면 미리 표시
        if (manualFieldsDataStep2 && Object.keys(manualFieldsDataStep2).length > 0) {
            console.log('📝 템플릿의 필수 필드를 UI에 미리 표시:', manualFieldsDataStep2);
            
            // 템플릿의 필수 필드들을 UI에 추가
            Object.entries(manualFieldsDataStep2).forEach(([fieldName, fieldValue]) => {
                addManualFieldRowStep2(fieldName, fieldValue);
            });
            
            console.log(`📝 템플릿의 필수 필드 ${Object.keys(manualFieldsDataStep2).length}개가 미리 표시되었습니다.`);
        } else {
            console.log('📝 STEP 2 필드 입력 영역 초기화 완료 - 필드 추가 버튼을 클릭하여 시작하세요');
        }
        
        console.log('📝 STEP 2 필수필드 수동입력 섹션 열기');
    } else {
        // 섹션 닫기
        closeManualFieldsStep2();
    }
}

// STEP 2 필수필드 수동입력 섹션 닫기
function closeManualFieldsStep2() {
    const manualSection = document.getElementById('manualFieldsSectionStep2');
    const button = document.getElementById('manualFieldsBtn');
    
    if (manualSection) {
        manualSection.classList.add('hidden');
        button.innerHTML = '📝 필수필드 수동입력';
        button.style.background = 'linear-gradient(135deg, #fd7e14 0%, #e55a00 100%)';
        console.log('📝 STEP 2 필수필드 수동입력 섹션 닫기');
    }
}

// STEP 2에서 수동 필드 입력 행 추가
function addManualFieldInputStep2() {
    const container = document.getElementById('manualFieldInputsStep2');
    if (!container) return;
    
    manualFieldCounterStep2++;
    const fieldId = `manualField_step2_${manualFieldCounterStep2}`;
    
    // 🔧 발주서 필드에서 이미 매핑된 필드 제외하고 가져오기
    let availableFields = [];
    
    if (supplierFileHeaders && supplierFileHeaders.length > 0) {
        // 발주서 파일 헤더 사용
        const mappedTargetFields = Object.keys(currentMapping || {});
        availableFields = supplierFileHeaders.filter(field => !mappedTargetFields.includes(field));
        console.log('📋 발주서 파일 헤더 기준 사용 가능한 필드:', availableFields);
        console.log('🔗 이미 매핑된 필드 (제외됨):', mappedTargetFields);
    } else {
        // 발주서 파일이 없는 경우 UI 타겟 필드에서 가져오기
        const targetFieldElements = document.querySelectorAll('#targetFields .field-item');
        const allTargetFields = Array.from(targetFieldElements).map(el => el.dataset.target).filter(Boolean);
        const mappedTargetFields = Object.keys(currentMapping || {});
        availableFields = allTargetFields.filter(field => !mappedTargetFields.includes(field));
        console.log('📋 UI 타겟 필드 기준 사용 가능한 필드:', availableFields);
        console.log('🔗 이미 매핑된 필드 (제외됨):', mappedTargetFields);
    }
    
    const fieldDiv = document.createElement('div');
    fieldDiv.className = 'manual-field-row';
    fieldDiv.id = fieldId;
    fieldDiv.style.cssText = `
        display: grid; 
        grid-template-columns: 1fr 1fr auto; 
        gap: 10px; 
        margin-bottom: 10px; 
        padding: 12px; 
        background: white; 
        border: 1px solid #dee2e6; 
        border-radius: 6px;
        align-items: center;
    `;
    
    fieldDiv.innerHTML = `
        <div>
            <!--
            <label style="display: block; margin-bottom: 5px; font-weight: 500; color: #495057;">필드명:</label>
            -->
            <select class="field-name-select" style="width: 100%; padding: 8px; border: 1px solid #ced4da; border-radius: 4px;">
                <!--<option value="">필드를 선택하거나 직접 입력</option> -->
                ${availableFields.map(field => `<option value="${field}">${field}</option>`).join('')}
                ${availableFields.length === 0 ? '<option value="" disabled>매핑되지 않은 필드가 없습니다</option>' : ''}
                <!--<option value="__custom__">직접 입력</option>-->
            </select>
            <input type="text" class="field-name-input" placeholder="필드명을 직접 선택택하세요" 
                   style="width: 100%; padding: 8px; border: 1px solid #ced4da; border-radius: 4px; margin-top: 5px; display: none;">
        </div>
        <div>
            <!--
            <label style="display: block; margin-bottom: 5px; font-weight: 500; color: #495057;">값:</label>
            --> 
        <input type="text" class="field-value-input" placeholder="값을 입력하세요" 
                   style="width: 100%; padding: 8px; border: 1px solid #ced4da; border-radius: 4px;">
        </div>
        <div style="display: flex; align-items: flex-end;">
            <button onclick="removeManualFieldInputStep2('${fieldId}')" 
                    style="background: #dc3545; color: white; border: none; border-radius: 4px; padding: 8px 12px; cursor: pointer;">
                🗑️
            </button>
        </div>
    `;
    
    container.appendChild(fieldDiv);
    
    // 선택박스 이벤트 리스너 추가
    const selectElement = fieldDiv.querySelector('.field-name-select');
    const inputElement = fieldDiv.querySelector('.field-name-input');
    
    selectElement.addEventListener('change', function() {
        if (this.value === '__custom__') {
            inputElement.style.display = 'block';
            inputElement.focus();
        } else {
            inputElement.style.display = 'none';
            inputElement.value = '';
        }
    });
    
    //console.log(`✅ STEP 2 수동 필드 입력 행 추가: ${fieldId}`);
}

// STEP 2에서 템플릿 필수 필드를 미리 채워서 추가 (템플릿 적용용)
function addManualFieldRowStep2(fieldName, fieldValue) {
    const container = document.getElementById('manualFieldInputsStep2');
    if (!container) return;
    
    manualFieldCounterStep2++;
    const fieldId = `manualField_step2_${manualFieldCounterStep2}`;
    
    // 🔧 발주서 필드에서 이미 매핑된 필드 제외하고 가져오기
    let availableFields = [];
    
    if (supplierFileHeaders && supplierFileHeaders.length > 0) {
        // 발주서 파일 헤더 사용
        const mappedTargetFields = Object.keys(currentMapping || {});
        availableFields = supplierFileHeaders.filter(field => !mappedTargetFields.includes(field));
    } else {
        // 발주서 파일이 없는 경우 UI 타겟 필드에서 가져오기
        const targetFieldElements = document.querySelectorAll('#targetFields .field-item');
        const allTargetFields = Array.from(targetFieldElements).map(el => el.dataset.target).filter(Boolean);
        const mappedTargetFields = Object.keys(currentMapping || {});
        availableFields = allTargetFields.filter(field => !mappedTargetFields.includes(field));
    }
    
    // 현재 필드명이 사용 가능한 필드 목록에 없으면 추가
    if (!availableFields.includes(fieldName)) {
        availableFields.unshift(fieldName);
    }
    
    const fieldDiv = document.createElement('div');
    fieldDiv.className = 'manual-field-row';
    fieldDiv.id = fieldId;
    fieldDiv.style.cssText = `
        display: grid; 
        grid-template-columns: 1fr 1fr auto; 
        gap: 10px; 
        margin-bottom: 10px; 
        padding: 12px; 
        background: #e8f5e8; 
        border: 2px solid #28a745; 
        border-radius: 6px;
        align-items: center;
    `;
    
    fieldDiv.innerHTML = `
        <div>
            <select class="field-name-select" style="width: 100%; padding: 8px; border: 1px solid #ced4da; border-radius: 4px;">
                ${availableFields.map(field => `<option value="${field}" ${field === fieldName ? 'selected' : ''}>${field}</option>`).join('')}
                ${availableFields.length === 0 ? '<option value="" disabled>매핑되지 않은 필드가 없습니다</option>' : ''}
            </select>
            <input type="text" class="field-name-input" placeholder="필드명을 직접 선택택하세요" 
                   style="width: 100%; padding: 8px; border: 1px solid #ced4da; border-radius: 4px; margin-top: 5px; display: none;">
        </div>
        <div>
            <input type="text" class="field-value-input" placeholder="값을 입력하세요" value="${fieldValue || ''}"
                   style="width: 100%; padding: 8px; border: 1px solid #ced4da; border-radius: 4px;">
        </div>
        <div style="display: flex; align-items: flex-end;">
            <button onclick="removeManualFieldInputStep2('${fieldId}')" 
                    style="background: #dc3545; color: white; border: none; border-radius: 4px; padding: 8px 12px; cursor: pointer;">
                🗑️
            </button>
        </div>
    `;
    
    container.appendChild(fieldDiv);
    
    // 선택박스 이벤트 리스너 추가
    const selectElement = fieldDiv.querySelector('.field-name-select');
    const inputElement = fieldDiv.querySelector('.field-name-input');
    
    selectElement.addEventListener('change', function() {
        if (this.value === '__custom__') {
            inputElement.style.display = 'block';
            inputElement.focus();
        } else {
            inputElement.style.display = 'none';
            inputElement.value = '';
        }
    });
    
    console.log(`✅ 템플릿 필수 필드 추가: ${fieldName} = "${fieldValue}"`);
}

// STEP 2에서 수동 필드 입력 행 제거
function removeManualFieldInputStep2(fieldId) {
    const fieldElement = document.getElementById(fieldId);
    if (fieldElement) {
        fieldElement.remove();
        console.log(`🗑️ STEP 2 수동 필드 입력 행 제거: ${fieldId}`);
    }
}

// STEP 2에서 수동 필드 데이터 저장
function saveManualFieldsStep2() {
    const container = document.getElementById('manualFieldInputsStep2');
    const resultDiv = document.getElementById('manualFieldResultStep2');
    
    if (!container || !resultDiv) return;
    
    const fieldRows = container.querySelectorAll('.manual-field-row');
    const newManualData = {};
    let validCount = 0;
    
    fieldRows.forEach(row => {
        const selectElement = row.querySelector('.field-name-select');
        const customInputElement = row.querySelector('.field-name-input');
        const valueElement = row.querySelector('.field-value-input');
        
        let fieldName = '';
        if (selectElement.value === '__custom__') {
            fieldName = customInputElement.value.trim();
        } else {
            fieldName = selectElement.value.trim();
        }
        
        const fieldValue = valueElement.value.trim();
        
        if (fieldName && fieldValue) {
            newManualData[fieldName] = fieldValue;
            validCount++;
        }
    });
    
    // 전역 변수에 저장
    manualFieldsDataStep2 = { ...manualFieldsDataStep2, ...newManualData };
    
    console.log('💾 STEP 2 수동 필드 데이터 저장:', manualFieldsDataStep2);
    
    if (validCount > 0) {
        resultDiv.innerHTML = `
            <div style="background: #d4f4dd; color: #155724; padding: 10px; border-radius: 4px; border: 1px solid #b8e6c1;">
                ✅ ${validCount}개 필드가 저장되었습니다. 발주서 생성 시 자동으로 적용됩니다.
                <br><small>저장된 필드: ${Object.keys(newManualData).join(', ')}</small>
            </div>
        `;
        
        // 3초 후 메시지 자동 제거
        setTimeout(() => {
            resultDiv.innerHTML = '';
        }, 5000);
        
    } else {
        resultDiv.innerHTML = `
            <div style="background: #f8d7da; color: #721c24; padding: 10px; border-radius: 4px; border: 1px solid #f1aeb5;">
                ⚠️ 저장할 유효한 필드가 없습니다. 필드명과 값을 모두 입력해주세요.
            </div>
        `;
        
        setTimeout(() => {
            resultDiv.innerHTML = '';
        }, 3000);
    }
}

// STEP 2에서 모든 수동 필드 삭제
function clearManualFieldsStep2() {
    const container = document.getElementById('manualFieldInputsStep2');
    const resultDiv = document.getElementById('manualFieldResultStep2');
    
    if (container) {
        container.innerHTML = '';
        manualFieldCounterStep2 = 0;
    }
    
    if (resultDiv) {
        resultDiv.innerHTML = '';
    }
    
    // 전역 데이터도 초기화
    manualFieldsDataStep2 = {};
    
    //console.log('🗑️ STEP 2 모든 수동 필드 삭제 완료');
}

// 초기 빈 상태 표시 함수 (안내 메시지만)
function displayInitialEmptyState() {
    try {
        // 예약된 이메일 초기 상태
        const scheduledContainer = document.getElementById('scheduledEmailsList');
        if (scheduledContainer) {
            scheduledContainer.innerHTML = `
                <div style="text-align: center; padding: 50px; color: #666; font-size: 0.95em;">
                    <div style="color: #999;">🔄 새로고침 버튼을 클릭하여 최신 목록을 확인하세요</div>
                </div>
            `;
        }
        
        // 전송 이력 초기 상태
        const historyContainer = document.getElementById('emailHistoryList');
        if (historyContainer) {
            historyContainer.innerHTML = `
                <div style="text-align: center; padding: 50px; color: #666; font-size: 0.95em;">
                    <div style="color: #999;">🔄 새로고침 버튼을 클릭하여 최신 이력을 확인하세요</div>
                </div>
            `;
        }
        

        
        //console.log('✅ 초기 상태 안내 메시지 표시 완료');
    } catch (error) {
        console.error('❌ 초기 상태 표시 중 오류:', error);
    }
}

// 💾 저장된 템플릿 모드 관련 함수들

// 저장된 템플릿 모드에서 자동 변환 시작
async function startTemplateEdit() {
    try {
    
        
        // 작업 모드 설정
        window.currentWorkMode = 'savedTemplate';
        window.isTemplateMode = true;
        
        // 기존의 완벽한 템플릿 모드 처리 함수 호출
        await processTemplateMode();
        
    } catch (error) {
        console.error('❌ 템플릿 모드 자동 변환 오류:', error);
        showAlert('error', '자동 변환을 시작하는데 실패했습니다: ' + error.message);
    }
}

// 📋 템플릿 미리보기 표시 (독립 모달)
function showTemplatePreview() {
    if (!selectedTemplate) {
        showAlert('error', '선택된 템플릿이 없습니다.');
        return;
    }

    try {
        // selectedTemplate에서 직접 접근 (template_data 래퍼 없음)
        //console.log('📋 selectedTemplate 구조:', selectedTemplate);
        
        // 기존 모달이 있으면 제거
        const existingModal = document.getElementById('templatePreviewModal');
        if (existingModal) {
            existingModal.remove();
        }
        
        // 새로운 모달 생성
        const modal = document.createElement('div');
        modal.id = 'templatePreviewModal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 9999;
        `;
        
        const modalContent = document.createElement('div');
        modalContent.style.cssText = `
            background: white;
            border-radius: 10px;
            padding: 30px;
            max-width: 90%;
            max-height: 90%;
            overflow-y: auto;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
        `;
        
        // console.log('✅ 독립 모달 생성 완료'); // Production: 로그 제거

                 // 템플릿 데이터를 테이블 형태로 구성
         const createMappingTable = () => {
             if (!selectedTemplate.orderFieldMapping || !selectedTemplate.supplierFieldMapping) {
                 return '<div style="text-align: center; color: #6c757d; padding: 20px;">매핑 데이터가 없습니다.</div>';
             }
             
             // 모든 매핑 필드 수집
             const allFields = new Set([
                 ...Object.keys(selectedTemplate.orderFieldMapping),
                 ...Object.keys(selectedTemplate.supplierFieldMapping)
             ]);
             
             const tableRows = Array.from(allFields).map(field => {
                 const orderField = selectedTemplate.orderFieldMapping[field] || '-';
                 const supplierField = selectedTemplate.supplierFieldMapping[field] || '-';
                 
                 return `
                     <tr style="border-bottom: 1px solid #dee2e6;">
                         <td style="padding: 8px 12px; font-weight: 500; background: #f8f9fa;">${field}</td>
                         <td style="padding: 8px 12px; border-left: 1px solid #dee2e6;">${orderField}</td>
                         <td style="padding: 8px 12px; border-left: 1px solid #dee2e6;">${supplierField}</td>
                     </tr>
                 `;
             }).join('');
             
             return `
                 <table style="width: 100%; border-collapse: collapse; border: 1px solid #dee2e6; background: white; margin-bottom: 20px;">
                     <thead>
                         <tr style="background: linear-gradient(135deg, #e91e63 0%, #c2185b 100%); color: white;">
                             <th style="padding: 12px; text-align: left; font-weight: 600;">필드명</th>
                             <th style="padding: 12px; text-align: left; font-weight: 600; border-left: 1px solid rgba(255,255,255,0.2);">📊 주문서에서</th>
                             <th style="padding: 12px; text-align: left; font-weight: 600; border-left: 1px solid rgba(255,255,255,0.2);">📋 발주서로</th>
                         </tr>
                     </thead>
                     <tbody>
                         ${tableRows}
                     </tbody>
                 </table>
             `;
         };
         
         const createFixedFieldsTable = () => {
             if (!selectedTemplate.fixedFields || Object.keys(selectedTemplate.fixedFields).length === 0) {
                 return '';
             }
             
             const fixedRows = Object.entries(selectedTemplate.fixedFields).map(([key, value]) => `
                 <tr style="border-bottom: 1px solid #ffeaa7;">
                     <td style="padding: 8px 12px; font-weight: 500; background: #fff8e1;">${key}</td>
                     <td style="padding: 8px 12px; border-left: 1px solid #ffeaa7;">${value}</td>
                 </tr>
             `).join('');
             
             return `
                 <div style="margin-bottom: 20px;">
                     <h6 style="color: #856404; margin-bottom: 10px; font-weight: 600;">📝 고정값 필드</h6>
                     <table style="width: 100%; border-collapse: collapse; border: 1px solid #ffeaa7; background: white;">
                         <thead>
                             <tr style="background: linear-gradient(135deg, #ffc107 0%, #e0a800 100%); color: #212529;">
                                 <th style="padding: 10px; text-align: left; font-weight: 600;">필드명</th>
                                 <th style="padding: 10px; text-align: left; font-weight: 600; border-left: 1px solid rgba(0,0,0,0.1);">고정값</th>
                             </tr>
                         </thead>
                         <tbody>
                             ${fixedRows}
                         </tbody>
                     </table>
                 </div>
             `;
         };

         // 모달 콘텐츠 설정 (테이블 형태)
         modalContent.innerHTML = `
             <div style="text-align: right; margin-bottom: 15px;">
                 <button onclick="hideTemplatePreview()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #666;">✕</button>
             </div>
             <h4 style="color: #e91e63; margin-bottom: 15px; text-align: center;">📋 ${selectedTemplate.name} 템플릿 매핑 규칙</h4>
             <p style="color: #666; text-align: center; margin-bottom: 20px;">이 템플릿의 필드 매핑 규칙을 테이블로 확인하세요.</p>
             
             <div style="max-height: 500px; overflow-y: auto; margin-bottom: 20px;">
                 <h6 style="color: #495057; margin-bottom: 15px; font-weight: 600;">🔄 필드 매핑 규칙</h6>
                 ${createMappingTable()}
                 ${createFixedFieldsTable()}
             </div>
             
             <div style="text-align: center;">
                 <button onclick="hideTemplatePreview()" class="btn" style="background: #6c757d; color: white; padding: 12px 24px; font-size: 0.9em; font-weight: 600;">닫기</button>
             </div>
         `;
         
         modal.appendChild(modalContent);
         document.body.appendChild(modal);
         
         // 모달 바깥쪽 클릭시 닫기
         modal.addEventListener('click', (e) => {
             if (e.target === modal) {
                 hideTemplatePreview();
             }
         });
         
         // ESC 키로 모달 닫기
         const handleKeyDown = (e) => {
             if (e.key === 'Escape') {
                 hideTemplatePreview();
                 document.removeEventListener('keydown', handleKeyDown);
             }
         };
         document.addEventListener('keydown', handleKeyDown);
         
         console.log('✅ 모달 콘텐츠 설정 완료');
         console.log('📋 orderFieldMapping 데이터:', selectedTemplate.orderFieldMapping);
         console.log('📋 supplierFieldMapping 데이터:', selectedTemplate.supplierFieldMapping);
         console.log('📋 fixedFields 데이터:', selectedTemplate.fixedFields);
         console.log('📋 템플릿 미리보기 모달 표시:', selectedTemplate.name);
        
    } catch (error) {
        console.error('❌ 템플릿 미리보기 오류:', error);
        showAlert('error', '템플릿 미리보기를 표시하는데 실패했습니다.');
    }
}

// 템플릿 미리보기 닫기 (모달 제거)
function hideTemplatePreview() {
    const modal = document.getElementById('templatePreviewModal');
    if (modal) {
        modal.remove();
        console.log('✅ 템플릿 미리보기 모달 닫기');
    }
}

// ============================================
// 📧 페이지 로드 시 초기화
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    //console.log('📧 로컬 이메일 이력 시스템 초기화 시작');
    
    // 전송 이력 UI 초기화
    setTimeout(() => {
        updateLocalEmailHistoryUI();
        loadLocalEmailHistoryContent(); // 로컬 이력 컨텐츠도 초기화
    }, 500); // 페이지 로드 후 0.5초 대기
    
    //console.log('✅ 로컬 이메일 이력 시스템 초기화 완료');
});