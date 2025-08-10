# 🚀 Auto Order Converter

> **주문서를 발주서로 자동 변환하는 웹 애플리케이션**

주문서 파일을 업로드하거나 직접 입력하여 발주서로 자동 변환하는 시스템입니다. AI 자동 매칭, 템플릿 저장/재사용, 이메일 발송 등의 기능을 제공합니다.

## ✨ 주요 기능

### 📋 **다양한 입력 방식**
- **파일 업로드**: Excel, CSV 파일을 통한 주문서 업로드
- **직접 입력**: 웹 폼을 통한 주문 정보 직접 입력
- **기본 템플릿**: 표준화된 템플릿을 사용한 빠른 입력
- **저장된 템플릿**: 이전에 저장한 매칭 규칙을 재사용

### 🤖 **AI 자동 매칭**
- OpenAI API를 활용한 지능형 필드 매칭
- 주문서 필드와 발주서 필드 자동 연결
- 수동 매칭으로 정확도 향상 가능

### 📊 **유연한 매칭 시스템**
- 드래그앤드롭 방식의 직관적인 필드 매칭
- 매칭 규칙 저장 및 재사용
- 필수 필드 수동 입력 지원
- 다양한 템플릿 형식 지원

### 📧 **이메일 발송**
- 생성된 발주서 자동 이메일 발송
- Gmail, Resend, 일반 SMTP 지원
- 발송 이력 관리 및 추적

### 🎯 **사용자 친화적 인터페이스**
- 반응형 웹 디자인
- 실시간 미리보기
- 진행률 표시
- 직관적인 단계별 프로세스

## 🛠️ 기술 스택

- **Frontend**: HTML5, CSS3, JavaScript (Vanilla)
- **Backend**: Node.js, Express.js
- **Database**: Supabase Storage
- **AI**: OpenAI API
- **File Processing**: ExcelJS, node-xlsx
- **Email**: Nodemailer
- **Deployment**: Vercel

## 📦 설치 및 실행

### 1. 저장소 클론
```bash
git clone https://github.com/USERNAME/autorder.git
cd autorder
```

### 2. 의존성 설치
```bash
npm install
```

### 3. 환경 변수 설정
`.env` 파일을 생성하고 다음 변수들을 설정하세요:

```env
# Supabase 설정
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key

# OpenAI API (선택사항 - AI 매칭용)
OPENAI_API_KEY=your_openai_api_key

# 이메일 설정 (선택사항)
GMAIL_USER=your_gmail@gmail.com
GMAIL_PASS=your_app_password
RESEND_API_KEY=your_resend_api_key

# 관리자 계정
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your_secure_password
```

### 4. 개발 서버 실행
```bash
npm start
```

애플리케이션이 `http://localhost:3000`에서 실행됩니다.

## 🚀 배포하기

### Vercel 배포

1. **GitHub에 푸시**:
```bash
git add .
git commit -m "Initial commit"
git push origin main
```

2. **Vercel 계정 연결**:
   - [Vercel](https://vercel.com) 접속
   - GitHub 저장소 연결
   - 프로젝트 임포트

3. **환경 변수 설정**:
   - Vercel 대시보드에서 Environment Variables 설정
   - `.env` 파일의 모든 변수를 추가

4. **배포**:
   - 자동 배포 시작
   - 도메인 확인 및 테스트

## 📖 사용법

### 1. 기본 사용 흐름
1. **작업 모드 선택** (파일 업로드 / 직접 입력 / 기본 템플릿 / 저장된 템플릿)
2. **데이터 입력** (파일 업로드 또는 폼 입력)
3. **필드 매칭** (수동 또는 AI 자동 매칭)
4. **매칭 저장** (재사용을 위한 규칙 저장)
5. **발주서 생성** (Excel 파일 생성)
6. **이메일 발송** (선택사항)

### 2. AI 자동 매칭 사용
- OpenAI API 키 설정 필요
- "AI 자동매칭" 버튼 클릭
- 자동으로 유사한 필드들이 매칭됨
- 필요시 수동으로 수정 가능

### 3. 템플릿 저장 및 재사용
- 매칭 완료 후 "템플릿 저장" 선택
- 템플릿명과 설명 입력
- 다음번에 "저장된 템플릿 사용" 모드에서 재사용

## 📁 프로젝트 구조

```
autorder/
├── public/                 # 프론트엔드 파일
│   ├── index.html         # 메인 페이지
│   ├── auth.html          # 인증 페이지
│   ├── intro.html         # 소개 페이지
│   └── app.js             # 메인 애플리케이션 로직
├── routes/                # API 라우트
│   ├── auth.js            # 인증 관련
│   ├── orders.js          # 주문서 변환
│   ├── email.js           # 이메일 발송
│   ├── templates.js       # 템플릿 관리
│   └── webhook.js         # 웹훅 처리
├── utils/                 # 유틸리티 함수
│   ├── converter.js       # 파일 변환 로직
│   ├── supabase.js        # Supabase 연동
│   └── validation.js      # 데이터 검증
├── sql/                   # 데이터베이스 스키마
├── file/                  # 템플릿 파일
│   ├── default_template.xlsx
│   └── porder_template.xlsx
├── server.js              # 메인 서버 파일
├── package.json
├── vercel.json            # Vercel 배포 설정
└── README.md
```

## 🔧 설정 가이드

### Supabase 설정
1. [Supabase](https://supabase.com) 계정 생성
2. 새 프로젝트 생성
3. Storage 버킷 생성 (`uploads`, `generated`, `mappings`)
4. API 키 및 URL 확인

### Gmail 설정 (이메일 발송용)
1. Gmail 계정에서 2단계 인증 활성화
2. 앱 비밀번호 생성
3. `.env`에 Gmail 계정 및 앱 비밀번호 설정

### OpenAI API 설정 (AI 매칭용)
1. [OpenAI](https://openai.com) API 키 발급
2. `.env`에 API 키 설정
3. 애플리케이션에서 인증 페이지로 API 키 입력

## 🤝 기여하기

1. Fork 프로젝트
2. Feature 브랜치 생성 (`git checkout -b feature/AmazingFeature`)
3. 변경사항 커밋 (`git commit -m 'Add some AmazingFeature'`)
4. 브랜치에 Push (`git push origin feature/AmazingFeature`)
5. Pull Request 생성

## 📄 라이선스

이 프로젝트는 MIT 라이선스 하에 배포됩니다. 자세한 내용은 `LICENSE` 파일을 참조하세요.

## 🐛 문제 신고

버그나 기능 요청은 [GitHub Issues](https://github.com/USERNAME/autorder/issues)에 등록해주세요.

## 📞 지원

- 📧 Email: your-email@example.com
- 📱 GitHub: [@USERNAME](https://github.com/USERNAME)

---

⭐ 이 프로젝트가 도움이 되었다면 Star를 눌러주세요! 