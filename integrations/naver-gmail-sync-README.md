# NUNUANU 네이버 예약 Gmail 자동 연동

이 연동은 `nunuanu866@gmail.com`으로 수신되는 네이버 예약 메일을 Google Apps Script가 읽고, 앱의 Vercel API(`/api/naver-gmail-sync`)로 전달해서 Supabase 일정에 반영합니다.

## 반영 규칙

- 발신자: `네이버 예약 <naverbooking_noreply@navercorp.com>`
- 확정 메일:
  - 예약번호, 예약자명, 이용일시, 예약상품을 파싱합니다.
  - 예약번호로 `naver_booking_links.source_key`를 만들고 앱 예약과 1:1로 연결합니다.
  - 고객명은 `네이버 고객명` 형태로 저장합니다.
  - `bookings.status = confirmed`로 일정에 등록합니다.
  - 앱 예약의 메모(`customer_memo`)는 공란으로 둡니다.
- 취소 메일:
  - 예약번호로 기존 네이버 예약을 찾아 `bookings.status = cancelled`로 변경합니다.
  - 같은 이름 고객이 여러 명이어도 이름으로 매칭하지 않고 예약번호로만 처리합니다.
- 실패 방지:
  - Apps Script는 성공한 메일만 처리 완료로 저장합니다.
  - API 실패, 파싱 실패 메일은 1분 동기화 안에서 오류 라벨 기준으로 다시 시도됩니다.
  - `nununanu_naver_booking_synced` / `nununanu_naver_booking_error` 라벨은 사람이 확인하기 위한 표시용입니다. 검색에서 synced 라벨을 제외하지 않으므로 같은 Gmail 스레드 안에 확정 후 취소 메일이 들어와도 새 messageId 기준으로 다시 처리합니다. 오류 라벨은 일반 1분 트리거에서 소량 자동 재시도됩니다.
  - 처리 이력은 `naver_booking_mail_events`, 예약번호 연결은 `naver_booking_links`에 남습니다.

## Supabase SQL

아래 SQL이 이미 실행되어 있어야 합니다.

```text
supabase/20260619_naver_booking_mail_events.sql
```

## Vercel 환경변수

필수:

```text
SUPABASE_SERVICE_ROLE_KEY=Supabase service role 또는 secret key
```

선택:

```text
NAVER_GMAIL_SYNC_SECRET=원하는 긴 임의 문자열
```

`NAVER_GMAIL_SYNC_SECRET`을 Vercel에 설정했다면 Apps Script 스크립트 속성에도 같은 값을 넣어야 합니다. 설정하지 않으면 API는 기존 운영 호환을 위해 secret 없이도 동작합니다.

## Google Apps Script 설정

1. `https://script.google.com` 접속
2. `nunuanu866@gmail.com` 계정의 기존 네이버 예약 연동 프로젝트 열기
3. `integrations/naver-gmail-sync.gs` 전체 내용을 Apps Script 코드에 붙여넣기
4. Apps Script `프로젝트 설정 > 스크립트 속성` 확인

필수:

```text
NAVER_GMAIL_SYNC_URL=https://nununanu-app.vercel.app/api/naver-gmail-sync
```

선택:

```text
NAVER_GMAIL_SYNC_SECRET=Vercel에 설정한 값과 동일한 값
NAVER_LOOKBACK_DAYS=30
NAVER_SYNC_MAX_THREADS=100
NAVER_SYNC_MAX_MESSAGES=20
NAVER_ERROR_RETRY_MAX_THREADS=50
NAVER_ERROR_RETRY_MAX_MESSAGES=10
NAVER_BACKFILL_MAX_THREADS=50
NAVER_BACKFILL_MAX_MESSAGES=20
```

Google Calendar 자동 등록도 같은 프로젝트에서 유지하려면 기존 값도 유지합니다.

```text
SUPABASE_URL=https://lwllncasntzevgidsdro.supabase.co
SUPABASE_KEY=Supabase publishable/anon key 또는 secret key
```

## 실행 순서

1. `syncNaverBookingEmails`를 수동 실행해서 Gmail 권한과 API 연결을 승인합니다.
2. 에러가 없으면 `installNaverBookingTrigger`를 1회 실행합니다.
3. 기존 수신 메일 전체를 다시 반영하려면 `backfillAllCurrentNaverBookingEmails`를 수동 실행합니다. 이 수동 재처리는 과거 알림이 한꺼번에 울리지 않도록 알림 큐를 억제합니다.
4. Google Calendar 트리거가 필요하면 `installGoogleCalendarTrigger`를 1회 실행합니다.

## 확인 위치

- 관리자 일정: 네이버 확정 예약이 해당 날짜/시간에 표시됩니다.
- 네이버 예약건: 고객명 앞에 N 아이콘이 표시됩니다.
- Supabase `naver_booking_mail_events`: 메일 처리 성공/실패 로그를 확인합니다.
- Supabase `naver_booking_links`: 예약번호와 앱 예약 ID 연결을 확인합니다.
