create table if not exists customers (id uuid primary key default gen_random_uuid(), name text not null, phone text unique not null, memo text, created_at timestamptz default now());
create table if not exists staff (id uuid primary key default gen_random_uuid(), auth_user_id uuid references auth.users(id) on delete set null, email text unique, name text not null, role text not null check (role in ('hair','makeup')), title text, is_admin boolean default false, permission_level text default 'full' check (permission_level in ('full','view_only')), color text default '#888888', is_active boolean default true, created_at timestamptz default now());
create table if not exists bookings (id uuid primary key default gen_random_uuid(), customer_id uuid references customers(id), booking_date date not null, start_time time not null, end_time time not null, service_type text not null check (service_type in ('hair','makeup','both')), service_detail text, requested_staff_id uuid references staff(id), assigned_staff jsonb, customer_memo text, admin_memo text, status text default 'pending' check (status in ('pending','confirmed','rejected','cancelled')), rejection_reason text, alternative_date date, alternative_time time, confirmed_at timestamptz, rejected_at timestamptz, cancelled_at timestamptz, created_at timestamptz default now());
alter table customers enable row level security;
alter table staff enable row level security;
alter table bookings enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='staff' and policyname='anon_read_staff') then create policy anon_read_staff on staff for select to anon using (is_active=true); end if;
  if not exists (select 1 from pg_policies where tablename='staff' and policyname='auth_all_staff') then create policy auth_all_staff on staff for all to authenticated using (true); end if;
  if not exists (select 1 from pg_policies where tablename='customers' and policyname='anon_read_customers') then create policy anon_read_customers on customers for select to anon using (true); end if;
  if not exists (select 1 from pg_policies where tablename='customers' and policyname='anon_insert_customers') then create policy anon_insert_customers on customers for insert to anon with check (true); end if;
  if not exists (select 1 from pg_policies where tablename='customers' and policyname='auth_all_customers') then create policy auth_all_customers on customers for all to authenticated using (true); end if;
  if not exists (select 1 from pg_policies where tablename='bookings' and policyname='anon_read_bookings') then create policy anon_read_bookings on bookings for select to anon using (true); end if;
  if not exists (select 1 from pg_policies where tablename='bookings' and policyname='anon_insert_bookings') then create policy anon_insert_bookings on bookings for insert to anon with check (true); end if;
  if not exists (select 1 from pg_policies where tablename='bookings' and policyname='auth_all_bookings') then create policy auth_all_bookings on bookings for all to authenticated using (true); end if;
end $$;
insert into staff (name,role,title,is_admin,permission_level,color,is_active,email) values ('원장','makeup','원장',true,'full','#D4537E',true,'nunuanu866@gmail.com') on conflict (email) do update set is_admin=true;
select 'DB 설정 완료!' as result;
