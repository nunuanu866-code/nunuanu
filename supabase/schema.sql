-- ============================================
-- 누누아누 예약 앱 DB 스키마
-- Supabase SQL Editor에서 실행하세요
-- ============================================

-- 확장 기능
create extension if not exists "uuid-ossp";

-- ============================================
-- 1. 고객 테이블
-- ============================================
create table if not exists public.customers (
  id uuid default uuid_generate_v4() primary key,
  phone text unique not null,
  name text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================
-- 2. 스텝 테이블
-- ============================================
create table if not exists public.staff (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  role text not null check (role in ('hair', 'makeup')),
  title text not null,
  is_admin boolean default false,
  auth_user_id uuid references auth.users(id),
  email text,
  color text not null default '#888888',
  is_active boolean default true,
  permission_level text not null default 'full' check (permission_level in ('full', 'view_only')),
  created_at timestamptz default now()
);

-- 초기 스텝 데이터
insert into public.staff (name, role, title, is_admin, color, permission_level) values
  ('보니', 'hair', '부원장', true, '#7F77DD', 'full'),
  ('정희', 'hair', '디자이너', false, '#5DCAA5', 'full'),
  ('지현', 'makeup', '원장', true, '#D4537E', 'full'),
  ('하은', 'makeup', '디자이너', false, '#EF9F27', 'full'),
  ('윤서', 'makeup', '디자이너', false, '#378ADD', 'full');

-- ============================================
-- 3. 예약 테이블
-- ============================================
create table if not exists public.bookings (
  id uuid default uuid_generate_v4() primary key,
  customer_id uuid references public.customers(id) on delete cascade,
  
  -- 예약 시간
  booking_date date not null,
  start_time time not null,
  end_time time not null,
  
  -- 시술 정보
  service_type text not null check (service_type in ('hair', 'makeup', 'both')),
  service_detail text,
  
  -- 스텝 배정
  requested_staff_id uuid references public.staff(id),
  assigned_staff jsonb default '[]',
  -- 예: [{"staff_id": "uuid", "start_time": "10:00", "end_time": "11:00"}]
  
  -- 상태
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'rejected', 'cancelled')),
  
  -- 메모 & 특이사항
  customer_memo text,
  staff_notes jsonb default '{}',
  -- 예: {"staff_id": "메모 내용"}
  admin_memo text,
  
  -- 거절/취소 사유
  reject_reason text,
  
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  confirmed_at timestamptz,
  cancelled_at timestamptz
);

-- ============================================
-- 4. 운영 시간 차단 테이블 (휴무, 조기마감 등)
-- ============================================
create table if not exists public.time_blocks (
  id uuid default uuid_generate_v4() primary key,
  block_date date not null,
  start_time time not null,
  end_time time not null,
  reason text,
  created_by uuid references public.staff(id),
  created_at timestamptz default now()
);

-- ============================================
-- 5. 알림 이력 테이블
-- ============================================
create table if not exists public.notifications (
  id uuid default uuid_generate_v4() primary key,
  booking_id uuid references public.bookings(id),
  recipient_phone text not null,
  type text not null check (type in ('booking_request', 'booking_confirmed', 'booking_rejected', 'booking_cancelled')),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  sent_at timestamptz,
  created_at timestamptz default now()
);

-- ============================================
-- 6. updated_at 자동 갱신 트리거
-- ============================================
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger on_customers_updated
  before update on public.customers
  for each row execute procedure public.handle_updated_at();

create trigger on_bookings_updated
  before update on public.bookings
  for each row execute procedure public.handle_updated_at();

-- ============================================
-- 7. Row Level Security (RLS)
-- ============================================
alter table public.customers enable row level security;
alter table public.bookings enable row level security;
alter table public.staff enable row level security;
alter table public.time_blocks enable row level security;
alter table public.notifications enable row level security;

-- 고객: 자신의 데이터만 조회/수정
create policy "customers_own" on public.customers
  for all using (auth.uid()::text = id::text);

-- 예약: 고객은 자신 예약만, 스텝/관리자는 전체
create policy "bookings_customer_own" on public.bookings
  for select using (
    customer_id in (
      select id from public.customers where auth.uid()::text = id::text
    )
    or exists (
      select 1 from public.staff where auth_user_id = auth.uid()
    )
  );

create policy "bookings_insert_customer" on public.bookings
  for insert with check (
    customer_id in (
      select id from public.customers where auth.uid()::text = id::text
    )
  );

create policy "bookings_update_admin" on public.bookings
  for update using (
    exists (
      select 1 from public.staff where auth_user_id = auth.uid() and is_admin = true
    )
    or customer_id in (
      select id from public.customers where auth.uid()::text = id::text
    )
  );

-- 스텝: 전체 조회 가능 (공개 정보)
create policy "staff_read_all" on public.staff
  for select using (true);

-- time_blocks: 전체 조회 가능
create policy "time_blocks_read" on public.time_blocks
  for select using (true);

create policy "time_blocks_admin_write" on public.time_blocks
  for all using (
    exists (select 1 from public.staff where auth_user_id = auth.uid() and is_admin = true)
  );

-- ============================================
-- 8. 관리자 앱 데이터 테이블 (admin.html 전용)
-- ============================================
create table if not exists public.admin_data (
  id integer primary key default 1,
  staff jsonb default '[]'::jsonb,
  customers jsonb default '[]'::jsonb,
  blocks jsonb default '[]'::jsonb,
  updated_at timestamptz default now()
);

alter table public.admin_data enable row level security;

create policy "admin_data_auth_only" on public.admin_data
  for all using (auth.role() = 'authenticated');

-- 초기 행 삽입
insert into public.admin_data (id, staff, customers, blocks)
values (1, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb)
on conflict (id) do nothing;

-- ============================================
-- 9. 유용한 인덱스
-- ============================================
create index if not exists idx_bookings_date on public.bookings(booking_date);
create index if not exists idx_bookings_status on public.bookings(status);
create index if not exists idx_bookings_customer on public.bookings(customer_id);
create index if not exists idx_customers_phone on public.customers(phone);
