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
