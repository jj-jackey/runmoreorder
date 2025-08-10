# Render 무료 배포 가이드

## 1. Render 계정 준비
1. [Render.com](https://render.com)에서 계정 생성
2. GitHub 계정 연결

## 2. 레포지토리 준비
1. 현재 프로젝트를 GitHub 레포지토리에 업로드
2. `render.yaml` 파일이 포함되어 있는지 확인

## 3. Render에서 웹 서비스 생성

### 방법 1: render.yaml 사용 (권장)
1. Render 대시보드에서 "New +"를 클릭
2. "Blueprint"를 선택
3. GitHub 레포지토리 선택
4. `render.yaml` 파일이 자동으로 감지됨

### 방법 2: 수동 설정
1. Render 대시보드에서 "New +"를 클릭
2. "Web Service"를 선택
3. GitHub 레포지토리 선택
4. 다음 설정 사용:
   - **Name**: `runmoreorder`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: `Free`

## 4. 환경 변수 설정
Render 대시보드에서 다음 환경 변수들을 설정하세요:

### 필수 환경 변수
```
NODE_ENV=production
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 선택적 환경 변수
```
OPENAI_API_KEY=sk-proj-your_openai_api_key
GMAIL_USER=your_gmail@gmail.com
GMAIL_PASS=your_gmail_app_password
RESEND_API_KEY=your_resend_api_key
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your_secure_password
SMTP_HOST=smtp.company.com
SMTP_PORT=587
SMTP_SECURE=false
EMAIL_USER=your_email@company.com
EMAIL_PASS=your_password
EMAIL_FROM_ADDRESS=noreply@yourcompany.com
EMAIL_FROM_NAME=Your Company Name
```

## 5. 배포 확인
1. 배포가 완료되면 Render에서 제공하는 URL로 접속
2. `/health` 엔드포인트에서 상태 확인
3. 메인 페이지가 정상적으로 로드되는지 확인

## 6. Render 무료 플랜 제한사항
- **메모리**: 512MB
- **CPU**: 0.1 CPU
- **대역폭**: 100GB/월
- **빌드 시간**: 월 500분
- **자동 슬립**: 15분 비활성 후 슬립 모드
- **콜드 스타트**: 첫 요청 시 지연 발생 가능

## 7. 성능 최적화 팁
1. **파일 크기 제한**: 업로드 파일을 5MB 이하로 제한
2. **메모리 관리**: 대용량 Excel 파일 처리 시 주의
3. **캐싱**: localStorage를 활용한 클라이언트 캐싱 사용

## 8. 모니터링
- Render 대시보드에서 로그 확인
- `/health` 엔드포인트로 서버 상태 모니터링
- 메모리 사용량 모니터링 (코드에 내장됨)

## 9. 문제 해결
- **슬립 모드**: 첫 요청 시 20-30초 대기 시간 발생
- **메모리 부족**: 파일 크기 줄이기 또는 ExcelJS 사용
- **타임아웃**: 처리 시간이 긴 파일은 분할 처리

## 10. 업데이트 방법
1. GitHub 레포지토리에 코드 푸시
2. Render에서 자동 배포 실행
3. 수동 배포: Render 대시보드에서 "Manual Deploy" 클릭