create extension if not exists "uuid-ossp";

create table if not exists public.push_subscriptions (
  id uuid primary key default uuid_generate_v4(),
  token text not null unique,
  user_role text not null default 'admin' check (user_role in ('admin', 'staff')),
  staff_id uuid null,
  staff_name text,
  device_label text,
  platform text,
  enabled boolean not null default true,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists public.push_notification_events (
  id uuid primary key default uuid_generate_v4(),
  event_key text unique,
  type text not null,
  title text not null,
  body text,
  audience text not null default 'admin' check (audience in ('admin', 'staff', 'all')),
  booking_id uuid null references public.bookings(id) on delete set null,
  staff_id uuid null,
  data jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists idx_push_subscriptions_enabled_role on public.push_subscriptions(enabled, user_role);
create index if not exists idx_push_subscriptions_staff on public.push_subscriptions(staff_id) where staff_id is not null;
create index if not exists idx_push_events_pending on public.push_notification_events(status, created_at);
create index if not exists idx_push_events_booking on public.push_notification_events(booking_id);

create or replace function public.push_touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists on_push_subscriptions_updated on public.push_subscriptions;
create trigger on_push_subscriptions_updated
  before update on public.push_subscriptions
  for each row execute procedure public.push_touch_updated_at();

alter table public.push_subscriptions enable row level security;
alter table public.push_notification_events enable row level security;

drop policy if exists "push_subscriptions_insert_app" on public.push_subscriptions;
drop policy if exists "push_subscriptions_update_app" on public.push_subscriptions;

create policy "push_subscriptions_insert_app" on public.push_subscriptions
  for insert
  to anon, authenticated
  with check (true);

create policy "push_subscriptions_update_app" on public.push_subscriptions
  for update
  to anon, authenticated
  using (true)
  with check (true);

create or replace function public.enqueue_push_event(
  p_event_key text,
  p_type text,
  p_title text,
  p_body text,
  p_audience text default 'admin',
  p_booking_id uuid default null,
  p_staff_id uuid default null,
  p_data jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.push_notification_events (
    event_key, type, title, body, audience, booking_id, staff_id, data
  )
  values (
    p_event_key, p_type, p_title, p_body, coalesce(p_audience, 'admin'), p_booking_id, p_staff_id, coalesce(p_data, '{}'::jsonb)
  )
  on conflict (event_key) do nothing
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.booking_push_event_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_name text := '고객';
  v_body text;
  v_type text;
  v_title text;
  v_staff jsonb;
  v_staff_id uuid;
  v_is_system boolean := false;
  v_cancel_requested boolean := false;
begin
  if new.service_detail in ('STAFF_ATTENDANCE', 'STAFF_VISIBILITY', 'STAFF_PROFILE', 'CUSTOMER_META', 'AUDIT_LOG') then
    v_is_system := true;
  end if;

  select coalesce(name, '고객') into v_customer_name
  from public.customers
  where id = new.customer_id;

  v_body := v_customer_name || ' · ' || new.booking_date::text || ' ' || left(new.start_time::text, 5);

  if tg_op = 'INSERT' then
    if new.service_detail = 'STAFF_AUTH' then
      perform public.enqueue_push_event(
        'booking:' || new.id || ':staff_approval_requested',
        'staff_approval_requested',
        '스텝 승인 요청',
        v_customer_name || ' 권한 승인을 확인해주세요',
        'admin',
        new.id,
        null,
        jsonb_build_object('url', '/admin.html', 'booking_id', new.id)
      );
    elsif not v_is_system and new.status = 'pending' then
      perform public.enqueue_push_event(
        'booking:' || new.id || ':booking_request',
        'booking_request',
        '예약 요청 접수',
        v_body,
        'admin',
        new.id,
        null,
        jsonb_build_object('url', '/admin.html', 'booking_date', new.booking_date, 'start_time', left(new.start_time::text, 5))
      );
    elsif not v_is_system and new.status = 'confirmed' then
      perform public.enqueue_push_event(
        'booking:' || new.id || ':booking_confirmed',
        'booking_confirmed',
        '예약 확정',
        v_body,
        'admin',
        new.id,
        null,
        jsonb_build_object('url', '/admin.html', 'booking_date', new.booking_date, 'start_time', left(new.start_time::text, 5))
      );
    end if;
    return new;
  end if;

  if v_is_system then
    return new;
  end if;

  if old.customer_memo is distinct from new.customer_memo
    and coalesce(new.customer_memo, '') like '%"cancel_request"%'
    and coalesce(old.customer_memo, '') not like '%"cancel_request"%' then
    v_cancel_requested := true;
  end if;

  if v_cancel_requested then
    perform public.enqueue_push_event(
      'booking:' || new.id || ':booking_cancel_requested',
      'booking_cancel_requested',
      '취소 요청 접수',
      v_body,
      'admin',
      new.id,
      null,
      jsonb_build_object('url', '/admin.html', 'booking_date', new.booking_date, 'start_time', left(new.start_time::text, 5))
    );
  end if;

  if old.status is distinct from new.status then
    if new.status = 'confirmed' then
      v_type := 'booking_confirmed';
      v_title := '예약 확정';
    elsif new.status = 'rejected' then
      v_type := 'booking_rejected';
      v_title := '예약 거절';
    elsif new.status = 'cancelled' then
      v_type := 'booking_cancelled';
      v_title := '예약 취소 확정';
    else
      return new;
    end if;

    perform public.enqueue_push_event(
      'booking:' || new.id || ':' || v_type,
      v_type,
      v_title,
      v_body,
      'admin',
      new.id,
      null,
      jsonb_build_object('url', '/admin.html', 'booking_date', new.booking_date, 'start_time', left(new.start_time::text, 5))
    );

    if new.status in ('confirmed', 'cancelled') and jsonb_typeof(new.assigned_staff) = 'array' then
      for v_staff in select * from jsonb_array_elements(new.assigned_staff)
      loop
        begin
          v_staff_id := nullif(v_staff->>'staff_id', '')::uuid;
        exception when others then
          v_staff_id := null;
        end;

        if v_staff_id is not null then
          perform public.enqueue_push_event(
            'booking:' || new.id || ':' || v_type || ':staff:' || v_staff_id,
            v_type,
            v_title,
            v_body,
            'staff',
            new.id,
            v_staff_id,
            jsonb_build_object('url', '/admin.html', 'booking_date', new.booking_date, 'start_time', left(new.start_time::text, 5))
          );
        end if;
      end loop;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists on_bookings_push_events on public.bookings;
create trigger on_bookings_push_events
  after insert or update on public.bookings
  for each row execute procedure public.booking_push_event_trigger();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'push_notification_events'
    ) then
      alter publication supabase_realtime add table public.push_notification_events;
    end if;
  end if;
end $$;
