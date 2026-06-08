-- ====================================
-- 누누아누 예약 앱 DB 스키마 초기화
-- Supabase SQL Editor에서 실행하세요
-- ====================================

-- ── 1. 테이블 생성 ──────────────────────────────────────

-- 고객 테이블
CREATE TABLE IF NOT EXISTS customers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  phone       TEXT UNIQUE NOT NULL,
  memo        TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 스텝 / 관리자 테이블
CREATE TABLE IF NOT EXISTS staff (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email            TEXT UNIQUE,
  name             TEXT NOT NULL,
  role             TEXT NOT NULL CHECK (role IN ('hair', 'makeup')),
  title            TEXT,
  is_admin         BOOLEAN DEFAULT false,
  permission_level TEXT DEFAULT 'full' CHECK (permission_level IN ('full', 'view_only')),
  color            TEXT DEFAULT '#888888',
  is_active        BOOLEAN DEFAULT true,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- 예약 테이블
CREATE TABLE IF NOT EXISTS bookings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id         UUID REFERENCES customers(id),
  booking_date        DATE NOT NULL,
  start_time          TIME NOT NULL,
  end_time            TIME NOT NULL,
  service_type        TEXT NOT NULL CHECK (service_type IN ('hair', 'makeup', 'both')),
  service_detail      TEXT,
  requested_staff_id  UUID REFERENCES staff(id),
  assigned_staff      JSONB,
  staff_sequence      JSONB, -- 여러 스텝 순서 정보 [{"staffId": "uuid", "dur": 40}, ...]
  customer_memo       TEXT,
  admin_memo          TEXT,
  status              TEXT DEFAULT 'pending' CHECK (status IN ('pending','confirmed','rejected','cancelled')),
  rejection_reason    TEXT,
  alternative_date    DATE,
  alternative_time    TIME,
  confirmed_at        TIMESTAMPTZ,
  rejected_at         TIMESTAMPTZ,
  cancelled_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ── 2. RLS 활성화 ────────────────────────────────────────

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff     ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings  ENABLE ROW LEVEL SECURITY;

-- ── 3. RLS 정책 ──────────────────────────────────────────

-- [customers]
-- 비로그인(anon) 고객: 조회 + 삽입 가능 (예약 시 고객 생성)
CREATE POLICY "anon_read_customers"   ON customers FOR SELECT TO anon      USING (true);
CREATE POLICY "anon_insert_customers" ON customers FOR INSERT TO anon      WITH CHECK (true);
CREATE POLICY "anon_update_customers" ON customers FOR UPDATE TO anon      USING (true);
-- 관리자/스텝(authenticated): 전체 권한
CREATE POLICY "auth_all_customers"    ON customers FOR ALL    TO authenticated USING (true);

-- [staff]
-- 비로그인: 활성 스텝 조회만 (예약 폼에서 스텝 목록 표시용)
CREATE POLICY "anon_read_staff"       ON staff FOR SELECT TO anon      USING (is_active = true);
-- 관리자/스텝: 전체 권한
CREATE POLICY "auth_all_staff"        ON staff FOR ALL    TO authenticated USING (true);

-- [bookings]
-- 비로그인: 조회 + 삽입 + 취소 가능
CREATE POLICY "anon_read_bookings"    ON bookings FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_bookings"  ON bookings FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_bookings"  ON bookings FOR UPDATE TO anon USING (status IN ('pending','confirmed'));
-- 관리자/스텝: 전체 권한
CREATE POLICY "auth_all_bookings"     ON bookings FOR ALL TO authenticated USING (true);

-- ── 4. 초기 스텝 데이터 ──────────────────────────────────

-- ※ auth_user_id는 처음 로그인 후 자동 연결됩니다
INSERT INTO staff (name, role, title, is_admin, permission_level, color, is_active, email)
VALUES
  ('지현', 'makeup', '원장',   true,  'full',      '#D4537E', true, 'admin@nununanu.com'),
  ('보니', 'hair',   '부원장',  false, 'full',      '#7F77DD', true, NULL)
ON CONFLICT (email) DO NOTHING;

-- ── 완료 메시지 ──────────────────────────────────────────
SELECT '✅ 누누아누 DB 스키마 설정 완료!' AS result;
