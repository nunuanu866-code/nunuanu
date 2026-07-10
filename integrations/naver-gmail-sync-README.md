# NUNUANU 네이버 예약 Gmail 자동 연동

이 연동은 `nunuanu866@gmail.com`으로 수신되는 네이버 플레이스 예약 메일을 읽어서 Supabase 예약 스케줄에 반영합니다.

## 처리 규칙

- 수신 Gmail: `nunuanu866@gmail.com`
- 발신자: `네이버 예약 <naverbooking_noreply@navercorp.com>`
- 예약 확정 메일:
  - 메일 본문에서 `예약자명`, `이용일시`, `예약상품`, `예약번호`를 파싱합니다.
  - `예약번호`가 반드시 있어야 하며, 예약번호가 없으면 이름으로 대체 매칭하지 않습니다.
  - 고객명은 `네이버 고객명` 형태로 저장합니다.
  - `bookings.status = confirmed`로 바로 스케줄에 등록합니다.
  - `customer_memo`에 `NAVER_BOOKING`, `NAVER_SOURCE_KEY`, `NAVER_MAIL_ID`를 남깁니다.
- 예약 취소 메일:
  - 예약번호로 만든 `source_key`로 기존 예약을 찾습니다.
  - 같은 이름의 고객이 여러 명 있어도 이름/시간/상품으로 대체 매칭하지 않습니다.
  - 찾은 예약은 `bookings.status = cancelled`로 변경해서 관리자 스케줄에서 사라지게 합니다.
  - 매칭 예약을 못 찾으면 처리 완료로 막지 않고 다음 실행에서 다시 시도합니다.
- 중복 방지:
  - Apps Script Properties에 Gmail message id를 저장합니다.
  - `naver_booking_mail_events.message_id`는 unique로 기록합니다.
  - `naver_booking_links.source_key`로 네이버 예약과 앱 예약을 1:1 매핑합니다.

## Supabase SQL

먼저 Supabase SQL Editor에서 아래 파일을 실행합니다.

```text
supabase/20260619_naver_booking_mail_events.sql
```

이 SQL은 두 테이블을 만듭니다.

- `naver_booking_mail_events`: 메일 처리 성공, 실패, 취소 매칭 실패 감사 로그
- `naver_booking_links`: 네이버 예약 source key와 앱 `bookings.id` 매핑

## Google Apps Script 설정

1. `https://script.google.com` 접속
2. `nunuanu866@gmail.com` 계정으로 새 프로젝트 생성
3. `integrations/naver-gmail-sync.gs` 전체 내용을 붙여넣기
4. Apps Script `프로젝트 설정 > 스크립트 속성`에 아래 값 추가

```text
SUPABASE_URL=https://lwllncasntzevgidsdro.supabase.co
SUPABASE_KEY=앱에서 사용하는 Supabase publishable/anon key
NAVER_LOOKBACK_DAYS=30
```

5. `syncNaverBookingEmails`를 한 번 수동 실행해서 Gmail/외부 요청 권한 승인
6. 오류 없이 실행되면 `installNaverBookingTrigger`를 한 번 실행
7. 이후 1분마다 네이버 예약 메일을 자동 확인합니다.

## 현재 수신된 메일 전체 업로드

이미 Gmail에 들어와 있는 네이버 예약 메일을 모두 앱 일정에 반영하려면 Apps Script에서 아래 함수를 수동 실행합니다.

```text
backfillAllCurrentNaverBookingEmails
```

이 함수는 `naverbooking_noreply@navercorp.com`에서 온 현재 메일 전체를 오래된 순서대로 다시 확인합니다.

- 같은 예약번호가 이미 있으면 새로 만들지 않고 기존 앱 예약을 업데이트합니다.
- 확정 메일 후 취소 메일이 있으면 최종적으로 `cancelled` 상태가 됩니다.
- 예약번호가 없는 메일은 동일 이름 고객 오매칭을 막기 위해 업로드하지 않습니다.
- 기본 최대 검색 thread 수는 `1000`개입니다. 더 많이 처리해야 하면 스크립트 속성에 `NAVER_BACKFILL_MAX_THREADS` 값을 늘립니다.

## 확인 위치

- 관리자 일정 화면: 네이버 확정 예약이 해당 날짜/시간에 표시됩니다.
- 네이버 예약건은 고객명 앞에 연두색 `N` 아이콘이 표시됩니다.
- Supabase `naver_booking_mail_events`에서 처리 이력을 확인합니다.
- Supabase `naver_booking_links`에서 네이버 예약과 앱 예약의 매핑을 확인합니다.

## 운영 주의

네이버 메일 양식이 바뀌면 `parseNaverBookingMessage_`, `pickField_`, `parseNaverDateTime_`를 조정해야 합니다. 실제 네이버 확정/취소 메일 각 1건으로 `syncNaverBookingEmails`를 수동 실행해 본 뒤 트리거를 켜는 것이 안전합니다.
