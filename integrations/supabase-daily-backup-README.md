# 누누아누 Supabase 자동 백업 설정

이 스크립트는 Supabase의 `customers`, `bookings`, `staff` 데이터를 매일 Google Drive에 JSON 파일로 저장합니다.

## 설정 순서

1. `https://script.google.com` 접속
2. `nunuanu866@gmail.com` 계정으로 새 Apps Script 프로젝트 생성
3. `integrations/supabase-daily-backup.gs` 내용을 붙여넣기
4. Apps Script `프로젝트 설정 > 스크립트 속성`에 아래 값 추가

```text
SUPABASE_URL=https://lwllncasntzevgidsdro.supabase.co
SUPABASE_KEY=admin.html의 SB_KEY 값과 동일한 Supabase publishable/anon key
```

5. `testNununanuSupabaseBackup` 함수를 한 번 실행해서 Google Drive 권한 승인
6. Drive에 `nununanu-supabase-backups` 폴더와 백업 JSON 파일이 생기는지 확인
7. `installDailyNununanuBackupTrigger` 함수를 한 번 실행

## 운영 원칙

- 매일 오전 3시(Asia/Seoul)에 자동 백업됩니다.
- 백업 파일은 삭제하지 말고 최소 90일 이상 보관하세요.
- 월 1회는 백업 JSON을 열어 고객/예약 건수가 정상인지 확인하세요.
- Supabase 유료 백업/PITR을 대체하지 않습니다. 외부 보조 백업입니다.
