/**
 * 사용량 제한 미들웨어 (Rate Limiter)
 * 세션 기반으로 카테고리별 서비스 이용 제한
 */

// 카테고리별 일일 제한
const DAILY_LIMITS = {
    orderGeneration: 10,    // 발주서 생성
    aiMapping: 10,          // AI 자동 매핑
    emailSending: 5         // 이메일 발송 (예약+즉시)
};

/**
 * 카테고리별 사용량 제한 미들웨어 생성 함수
 * @param {string} category - 제한할 카테고리 (orderGeneration, aiMapping, emailSending)
 * @returns {Function} - Express 미들웨어 함수
 */
function createRateLimitMiddleware(category) {
    return (req, res, next) => {
        try {
            // 유효한 카테고리인지 확인
            if (!DAILY_LIMITS[category]) {
                console.error('❌ 잘못된 카테고리:', category);
                return next(); // 알 수 없는 카테고리는 제한 없이 통과
            }

            // 세션이 없는 경우 초기화
            if (!req.session) {
                req.session = {};
            }

            const today = new Date().toDateString(); // "Mon Jan 01 2025"
            const now = new Date();
            const limit = DAILY_LIMITS[category];

            // 일일 사용량 데이터 초기화 또는 로드
            if (!req.session.dailyUsage || req.session.dailyUsage.date !== today) {
                // 새로운 날이거나 첫 방문인 경우 초기화
                req.session.dailyUsage = {
                    date: today,
                    categories: {
                        orderGeneration: { current: 0, limit: DAILY_LIMITS.orderGeneration },
                        aiMapping: { current: 0, limit: DAILY_LIMITS.aiMapping },
                        emailSending: { current: 0, limit: DAILY_LIMITS.emailSending }
                    },
                    lastReset: now.toISOString(),
                    startTime: now.toISOString()
                };
                console.log('🔄 새로운 날 - 카테고리별 사용량 카운터 초기화:', req.session.id || 'anonymous');
            }

            // 현재 카테고리 사용량 확인
            const categoryUsage = req.session.dailyUsage.categories[category];
            
            // 사용 한도 확인
            if (categoryUsage.current >= limit) {
                const categoryNames = {
                    orderGeneration: '발주서 생성',
                    aiMapping: 'AI 자동 매핑',
                    emailSending: '이메일 전송'
                };
                
                console.log(`🚫 ${categoryNames[category]} 한도 초과: ${categoryUsage.current}/${limit} (세션: ${req.session.id || 'anonymous'})`);
                
                return res.status(429).json({
                    success: false,
                    error: `하루 ${categoryNames[category]} 한도(${limit}회)를 초과했습니다.`,
                    category: category,
                    usage: {
                        current: categoryUsage.current,
                        limit: limit,
                        resetTime: getNextResetTime(),
                        remaining: 0
                    },
                    type: 'RATE_LIMIT_EXCEEDED'
                });
            }

            // 사용량 증가
            categoryUsage.current += 1;
            req.session.dailyUsage.lastUsed = now.toISOString();

            // 요청 객체에 사용량 정보 추가 (응답에서 활용 가능)
            req.usageInfo = {
                category: category,
                current: categoryUsage.current,
                limit: limit,
                remaining: limit - categoryUsage.current,
                resetTime: getNextResetTime(),
                allCategories: req.session.dailyUsage.categories
            };

            const categoryNames = {
                orderGeneration: '발주서 생성',
                aiMapping: 'AI 자동 매핑', 
                emailSending: '이메일 전송'
            };

            console.log(`📊 ${categoryNames[category]} 이용: ${categoryUsage.current}/${limit} (세션: ${req.session.id || 'anonymous'})`);

            next();
        } catch (error) {
            console.error('❌ 사용량 제한 미들웨어 오류:', error);
            // 오류가 발생해도 서비스는 계속 제공 (안전장치)
            next();
        }
    };
}

/**
 * 다음 리셋 시간 계산 (다음날 자정)
 */
function getNextResetTime() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return tomorrow.toISOString();
}

/**
 * 현재 사용량 조회 (API용) - 모든 카테고리
 */
function getCurrentUsage(req) {
    if (!req.session || !req.session.dailyUsage) {
        return {
            orderGeneration: { current: 0, limit: DAILY_LIMITS.orderGeneration, remaining: DAILY_LIMITS.orderGeneration },
            aiMapping: { current: 0, limit: DAILY_LIMITS.aiMapping, remaining: DAILY_LIMITS.aiMapping },
            emailSending: { current: 0, limit: DAILY_LIMITS.emailSending, remaining: DAILY_LIMITS.emailSending },
            resetTime: getNextResetTime()
        };
    }

    const today = new Date().toDateString();
    const usage = req.session.dailyUsage;

    // 날짜가 바뀐 경우 리셋된 상태로 반환
    if (usage.date !== today) {
        return {
            orderGeneration: { current: 0, limit: DAILY_LIMITS.orderGeneration, remaining: DAILY_LIMITS.orderGeneration },
            aiMapping: { current: 0, limit: DAILY_LIMITS.aiMapping, remaining: DAILY_LIMITS.aiMapping },
            emailSending: { current: 0, limit: DAILY_LIMITS.emailSending, remaining: DAILY_LIMITS.emailSending },
            resetTime: getNextResetTime()
        };
    }

    // 카테고리별 사용량 계산
    const result = {};
    Object.keys(DAILY_LIMITS).forEach(category => {
        const categoryData = usage.categories[category] || { current: 0, limit: DAILY_LIMITS[category] };
        result[category] = {
            current: categoryData.current,
            limit: categoryData.limit,
            remaining: Math.max(0, categoryData.limit - categoryData.current)
        };
    });
    
    result.resetTime = getNextResetTime();
    return result;
}

/**
 * 관리자용 사용량 통계 (개발/디버깅용)
 */
function getUsageStats() {
    return {
        dailyLimits: DAILY_LIMITS,
        resetTime: getNextResetTime(),
        serverTime: new Date().toISOString()
    };
}

module.exports = {
    createRateLimitMiddleware,
    getCurrentUsage,
    getUsageStats,
    DAILY_LIMITS
};