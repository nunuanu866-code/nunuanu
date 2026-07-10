alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (
    type in (
      'booking_request',
      'booking_confirmed',
      'booking_rejected',
      'booking_cancelled',
      'booking_cancel_requested',
      'staff_approval_requested',
      'staff_approval_confirmed'
    )
  );

drop policy if exists "notifications_insert_app" on public.notifications;

create policy "notifications_insert_app" on public.notifications
  for insert
  to anon, authenticated
  with check (true);
