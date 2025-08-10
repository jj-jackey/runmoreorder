# 📧 Email History 예제

Supabase `email_history` 테이블에서 ID와 Status 데이터를 조회하여 목록으로 표시하는 간단한 예제입니다.

## 📁 파일 구조

```
/api/example-email-list.js    # Supabase 데이터 조회 API
/public/example.html          # 웹 페이지 UI
/vercel.json                  # Vercel 라우팅 설정
```

## 🚀 사용 방법

### 1. 웹 페이지 접속
```
https://your-domain.vercel.app/example.html
```

### 2. API 직접 호출
```
GET https://your-domain.vercel.app/api/example-email-list
```

## 📊 API 응답 형식

### 성공 응답
```json
{
  "success": true,
  "count": 10,
  "data": [
    {
      "id": 123,
      "status": "success",
      "message_id": "MSG_1234567890",
      "sent_at": "2024-01-15T10:30:00.000Z"
    }
  ],
  "message": "총 10개의 이메일 이력을 조회했습니다."
}
```

### 오류 응답
```json
{
  "success": false,
  "error": "Database connection failed",
  "message": "Supabase 연결 오류"
}
```

## 🎨 UI 기능

- **🔄 새로고침**: 최신 데이터 다시 로드
- **📊 상태 표시**: 현재 상태 및 데이터 개수 표시
- **✅ 상태별 색상**: success(녹색), failed(빨간색), pending(노란색)
- **📅 날짜 포맷**: 한국 시간으로 표시
- **📱 반응형**: 모바일/데스크톱 대응

## ⚙️ 환경 설정

Vercel 환경 변수 필요:
```
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
```

## 🔧 커스터마이징

### 1. API 수정 (`/api/example-email-list.js`)
```javascript
// 더 많은 필드 조회
.select('id, status, message_id, sent_at, recipient_email, subject')

// 필터링 추가
.eq('status', 'success')
.gte('sent_at', '2024-01-01')

// 정렬 변경
.order('id', { ascending: true })
```

### 2. UI 수정 (`/public/example.html`)
```javascript
// 테이블 컬럼 추가
grid-template-columns: 80px 1fr 120px 200px 200px;

// 새로운 필드 표시
<div class="email-subject">${email.subject || 'N/A'}</div>
```

## 🐛 디버깅

### 1. 브라우저 콘솔 확인
```javascript
// 개발자 도구 > Console 탭에서 확인
[EXAMPLE] Email List API 호출됨
[EXAMPLE] Supabase에서 email_history 조회 중...
[EXAMPLE] 10개 레코드 조회 완료
```

### 2. 네트워크 탭 확인
- API 호출 상태 코드: 200 (성공)
- 응답 시간: 1-3초 (Supabase 속도에 따라)
- 응답 크기: 데이터량에 따라

### 3. 일반적인 오류

#### Supabase 연결 오류
```
Database error: relation "email_history" does not exist
```
→ 테이블명 확인 또는 테이블 생성 필요

#### 환경 변수 오류
```
❌ Supabase 환경변수 누락
```
→ Vercel 대시보드에서 환경 변수 설정

#### CORS 오류
```
Access-Control-Allow-Origin error
```
→ API에서 CORS 헤더가 자동 설정됨 (해결됨)

## 🎯 확장 가능성

1. **필터링 기능**: 날짜별, 상태별 필터
2. **페이지네이션**: 대량 데이터 처리
3. **검색 기능**: 이메일 주소, 제목 검색
4. **실시간 업데이트**: WebSocket 또는 Server-Sent Events
5. **차트 표시**: 상태별 통계 그래프

## 📞 지원

문제가 발생하면:
1. 브라우저 개발자 도구 확인
2. Vercel Functions 로그 확인
3. Supabase 대시보드 확인 