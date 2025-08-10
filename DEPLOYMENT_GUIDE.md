# 🚀 배포 가이드

## 📋 배포 전 체크리스트

### ✅ **1. GitHub에 업로드**

```bash
# 1. 로컬 변경사항 커밋
git add .
git commit -m "feat: 완성된 Auto Order Converter v1.0"

# 2. GitHub 리포지토리 생성 (GitHub 웹사이트에서)
# - 리포지토리명: autorder
# - 설명: 주문서를 발주서로 자동 변환하는 웹 애플리케이션

# 3. 원격 리포지토리 연결
git remote add origin https://github.com/YOUR_USERNAME/autorder.git

# 4. 업로드
git branch -M main
git push -u origin main
```

### ✅ **2. Vercel에 배포**

1. **Vercel 계정 준비**
   - [Vercel](https://vercel.com) 접속
   - GitHub 계정으로 로그인

2. **프로젝트 임포트**
   - "New Project" 클릭
   - GitHub에서 `autorder` 리포지토리 선택
   - "Import" 클릭

3. **환경 변수 설정**
   ```
   SUPABASE_URL=https://your-project-id.supabase.co
   SUPABASE_ANON_KEY=your_supabase_anon_key
   OPENAI_API_KEY=sk-proj-your_openai_api_key
   GMAIL_USER=your_gmail@gmail.com
   GMAIL_PASS=your_gmail_app_password
   RESEND_API_KEY=your_resend_api_key
   ADMIN_USERNAME=admin
   ADMIN_PASSWORD=your_secure_password
   NODE_ENV=production
   ```

4. **배포 실행**
   - "Deploy" 클릭
   - 자동 빌드 및 배포 완료

### ✅ **3. Supabase 설정**

1. **Supabase 프로젝트 생성**
   - [Supabase](https://supabase.com) 접속
   - 새 프로젝트 생성

2. **Storage 버킷 생성**
   ```sql
   -- Storage > Buckets에서 생성
   - uploads (파일 업로드용)
   - generated (생성된 파일용)
   - mappings (매핑 규칙용)
   ```

3. **데이터베이스 테이블 생성**
   ```sql
   -- SQL Editor에서 실행
   -- sql/create_email_tables_fixed.sql 파일 내용 실행
   ```

## 🎯 **배포 후 테스트**

### 1. **기본 기능 테스트**
- ✅ 파일 업로드 기능
- ✅ AI 자동 매칭
- ✅ 발주서 생성
- ✅ 이메일 발송 (선택사항)

### 2. **모든 모드 테스트**
- ✅ 파일 업로드 모드
- ✅ 직접 입력 모드  
- ✅ 기본 템플릿 모드
- ✅ 저장된 템플릿 모드

### 3. **반응형 UI 테스트**
- ✅ 데스크톱 (1920x1080)
- ✅ 태블릿 (768x1024)
- ✅ 모바일 (375x667)

## 🔧 **문제 해결**

### 환경 변수 오류
```bash
# Vercel 환경 변수 확인
vercel env ls
```

### 빌드 실패 시
```bash
# 로컬에서 빌드 테스트
npm run vercel-build
```

### CORS 오류 시
- Supabase > Settings > API에서 도메인 추가
- Vercel 배포 URL을 Supabase 허용 도메인에 추가

## 📱 **모니터링**

### 1. **Vercel Analytics**
- Functions > Overview에서 성능 모니터링
- 에러 로그 확인

### 2. **Supabase Dashboard** 
- Storage 사용량 모니터링
- API 호출 통계 확인

### 3. **Google Analytics** (선택사항)
- 사용자 행동 분석
- 페이지 성능 추적

## 🔄 **업데이트 배포**

```bash
# 변경사항 커밋 후 푸시하면 자동 배포
git add .
git commit -m "fix: 버그 수정"
git push origin main
```

## 📞 **지원**

문제 발생 시:
1. GitHub Issues에 버그 리포트
2. Vercel 로그 확인
3. Supabase 에러 로그 확인 