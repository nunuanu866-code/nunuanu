# 누누아누 예약 관리 앱 (NUNUNANU)

## 프로젝트 개요
청담 여성 전용 헤어·메이크업 살롱의 예약 관리 웹앱.
**고객 예약 요청 → 관리자 확정 → 전 스텝 공유** 3단계 플로우.

## 기술 스택
- Frontend: React 18 + Vite + Tailwind CSS v3 (PWA)
- Backend: Supabase (PostgreSQL + Auth + Realtime)
- 알림: 카카오 알림톡 API (Phase 5)
- 배포: Vercel

## 스텝 구성
| 파트 | 이름 | 직급 | 권한 |
|------|------|------|------|
| 헤어 | 보니 | 부원장 | admin |
| 헤어 | 정희 | 디자이너 | staff |
| 메이크업 | 지현 | 원장 | admin (최고) |
| 메이크업 | 하은 | 디자이너 | staff |
| 메이크업 | 윤서 | 디자이너 | staff |

## 예약 규칙
- 운영 시간: 04:00 ~ 20:00
- 예약 최소 단위: 10분
- 시술 평균 시간: 헤어 40분 / 메이크업 60분
- 동시 최대 고객: 2명
- 취소·변경: 예약 24시간 전까지만 고객 직접 가능

## 폴더 구조
```
src/
  lib/supabase.js       - Supabase 클라이언트 + 상수
  contexts/AuthContext  - 인증 상태 관리 (role: customer/staff/admin)
  pages/
    LoginPage.jsx       - 전화번호 OTP 로그인
    customer/           - 고객 화면 (홈, 예약요청, 내예약)
    admin/              - 관리자 화면 (수신함, 타임라인, 고객관리)
    staff/              - 스텝 화면 (스케줄, 메모)
  components/
    ui/index.jsx        - Button, Input, Badge, Card, BottomSheet 등
    layout/AppLayout    - 하단 내비게이션 포함 레이아웃
supabase/schema.sql     - DB 스키마 (Supabase SQL Editor에서 실행)
```

## 코드 규칙
- 한국어 UI 텍스트 사용
- 모바일 퍼스트 (max-w-md, min 375px)
- Tailwind CSS 우선, 인라인 스타일 최소화
- 색상: bg-nunu (#1A1A2E), text-gold (#C9A84C)
- 컴포넌트 재사용: src/components/ui/index.jsx 의 공통 컴포넌트 사용

## 개발 진행 단계
- [x] Phase 1: 기반 구축 (Supabase + 인증 + 라우팅)
- [x] Phase 2: 고객 화면 (3단계 예약 요청, 내 예약 조회, 취소)
- [x] Phase 3: 관리자 화면 (수신함, 타임라인 스케줄)
- [x] Phase 4: 스텝 화면 (스케줄 조회, 메모 입력)
- [ ] Phase 5: 알림(카카오 알림톡) + Vercel 배포

## 환경변수 (.env)
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...

## 다음 작업 시 참고
- Supabase schema.sql을 먼저 Supabase SQL Editor에서 실행해야 함
- staff 테이블의 auth_user_id를 각 스텝의 Supabase Auth UID로 업데이트해야 관리자/스텝 권한 작동
- Phase 5: 카카오 알림톡은 Supabase Edge Function으로 구현 예정
