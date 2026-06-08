-- ====================================
-- staff_sequence 컬럼 추가 마이그레이션
-- Supabase SQL Editor에서 실행하세요
-- ====================================

-- bookings 테이블에 staff_sequence 컬럼 추가
ALTER TABLE bookings
ADD COLUMN IF NOT EXISTS staff_sequence JSONB;

-- 완료 메시지
SELECT '✅ staff_sequence 컬럼 추가 완료!' AS result;

-- 사용 예시:
-- staff_sequence 형식: [{"staffId": "uuid-1", "dur": 40}, {"staffId": "uuid-2", "dur": 60}]
-- 예: 헤어(40분) → 메이크업(60분) 순서
