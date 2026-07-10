-- NUNUANU Naver Place Gmail sync audit table
-- Run this in Supabase SQL Editor for project lwllncasntzevgidsdro.

create extension if not exists "uuid-ossp";

create table if not exists public.naver_booking_mail_events (
  id uuid primary key default uuid_generate_v4(),
  message_id text not null unique,
  thread_id text,
  gmail_account text not null default 'nunuanu866@gmail.com',
  mail_from text not null default 'naverbooking_noreply@navercorp.com',
  subject text,
  event_type text not null check (event_type in ('confirmed', 'cancelled', 'unknown')),
  source_key text,
  booking_id uuid references public.bookings(id) on delete set null,
  customer_name text,
  booking_date date,
  start_time time,
  product_name text,
  raw_body text,
  processed_status text not null default 'pending'
    check (processed_status in ('pending', 'processed', 'failed', 'cancel_missing_booking')),
  error_message text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.naver_booking_mail_events
  alter column gmail_account set default 'nunuanu866@gmail.com';

create table if not exists public.naver_booking_links (
  id uuid primary key default uuid_generate_v4(),
  source_key text not null unique,
  reservation_no text,
  booking_id uuid references public.bookings(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text,
  customer_phone text,
  booking_date date,
  start_time time,
  end_time time,
  product_name text,
  service_type text,
  status text not null default 'confirmed'
    check (status in ('confirmed', 'cancelled', 'pending_cancel_match')),
  first_message_id text,
  last_message_id text,
  last_event_type text,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_naver_mail_events_source_key
  on public.naver_booking_mail_events(source_key);

create index if not exists idx_naver_mail_events_booking_id
  on public.naver_booking_mail_events(booking_id);

create index if not exists idx_naver_mail_events_processed
  on public.naver_booking_mail_events(processed_status, processed_at desc);

create index if not exists idx_naver_booking_links_booking_id
  on public.naver_booking_links(booking_id);

create index if not exists idx_naver_booking_links_date_time
  on public.naver_booking_links(booking_date, start_time);

create index if not exists idx_naver_booking_links_status
  on public.naver_booking_links(status, last_synced_at desc);

create or replace function public.handle_naver_mail_events_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists on_naver_mail_events_updated on public.naver_booking_mail_events;
create trigger on_naver_mail_events_updated
  before update on public.naver_booking_mail_events
  for each row execute procedure public.handle_naver_mail_events_updated_at();

drop trigger if exists on_naver_booking_links_updated on public.naver_booking_links;
create trigger on_naver_booking_links_updated
  before update on public.naver_booking_links
  for each row execute procedure public.handle_naver_mail_events_updated_at();

alter table public.naver_booking_mail_events enable row level security;
alter table public.naver_booking_links enable row level security;

drop policy if exists "naver_mail_events_insert_app" on public.naver_booking_mail_events;
create policy "naver_mail_events_insert_app" on public.naver_booking_mail_events
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "naver_mail_events_read_app" on public.naver_booking_mail_events;
create policy "naver_mail_events_read_app" on public.naver_booking_mail_events
  for select
  to anon, authenticated
  using (true);

drop policy if exists "naver_mail_events_update_app" on public.naver_booking_mail_events;
create policy "naver_mail_events_update_app" on public.naver_booking_mail_events
  for update
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "naver_booking_links_insert_app" on public.naver_booking_links;
create policy "naver_booking_links_insert_app" on public.naver_booking_links
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "naver_booking_links_read_app" on public.naver_booking_links;
create policy "naver_booking_links_read_app" on public.naver_booking_links
  for select
  to anon, authenticated
  using (true);

drop policy if exists "naver_booking_links_update_app" on public.naver_booking_links;
create policy "naver_booking_links_update_app" on public.naver_booking_links
  for update
  to anon, authenticated
  using (true)
  with check (true);
