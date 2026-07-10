-- Fix Korean text mojibake in mobile push notifications.
-- This replaces the push event trigger text and repairs still-pending push events.

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

update public.push_notification_events e
set
  title = case e.type
    when 'booking_request' then '예약 요청 접수'
    when 'booking_confirmed' then '예약 확정'
    when 'booking_rejected' then '예약 거절'
    when 'booking_cancel_requested' then '취소 요청 접수'
    when 'booking_cancelled' then '예약 취소 확정'
    when 'staff_approval_requested' then '스텝 승인 요청'
    when 'staff_approval_confirmed' then '스텝 권한 승인'
    else e.title
  end,
  body = coalesce(c.name, '고객') || ' · ' || b.booking_date::text || ' ' || left(b.start_time::text, 5)
from public.bookings b
left join public.customers c on c.id = b.customer_id
where e.booking_id = b.id
  and e.status = 'pending'
  and (
    e.title ~ '[怨덉붿뺤嫄痍꾨늻뚮┝뀦쨌묒뱀뚰븳젙냼껌]'
    or e.body ~ '[怨덉붿뺤嫄痍꾨늻뚮┝뀦쨌묒뱀뚰븳젙냼껌]'
  );
