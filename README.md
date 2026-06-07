# 누누아누 예약 관리 앱

청담 여성 전용 헤어·메이크업 살롱 예약 관리 웹앱

## 시작하기

### 1. 의존성 설치
```
npm install
```

### 2. Supabase 설정
1. supabase.com 에서 새 프로젝트 생성
2. SQL Editor -> supabase/schema.sql 전체 내용 실행
3. Project Settings -> API -> URL과 anon key 복사

### 3. 환경변수 설정
.env.example을 .env로 복사하고 Supabase 값 입력

### 4. 개발 서버 실행
```
npm run dev
```

### 5. 스텝 계정 연결
각 스텝 로그인 후 Supabase Dashboard -> staff 테이블의 auth_user_id 컬럼에 Auth UID 입력

## 배포 (Vercel)
GitHub 레포 연결 후 환경변수 설정하면 자동 배포

## 최신 기능

### 🔍 고객 검색 자동완성 (2026-06-07 추가)
- **위치**: 관리자 페이지 → 스케줄 → 미니 달력 검색창
- **기능**:
  - 실시간 고객 자동완성 (최대 5개)
  - 키보드 네비게이션 지원 (↑↓, Enter, ESC)
  - 고객 선택 시 자동 예약 생성
  - 기존 고객 정보로 빠른 예약 진행
- **사용법**: 검색창에 고객명/연락처 입력 → 자동완성 목록에서 선택 → 시술 정보 입력
- **상세 문서**: [AUTOCOMPLETE_FEATURE.md](./AUTOCOMPLETE_FEATURE.md)

### 📅 고객 검색 기능 (2026-06-06 추가)
- 미니 달력에서 고객명/연락처로 예약 검색
- 검색 결과 날짜 하이라이트 (노란색)
- 상세 문서: [SEARCH_FEATURE.md](./SEARCH_FEATURE.md)

# Updated Sat Jun  7 14:52:00     2026
