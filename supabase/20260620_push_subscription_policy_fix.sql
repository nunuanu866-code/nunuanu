-- Fix push_subscriptions write policy for Supabase publishable keys.
-- Allows the app to save/update FCM device tokens from the admin settings screen.

grant insert, update on table public.push_subscriptions to anon, authenticated;

drop policy if exists "push_subscriptions_insert_app" on public.push_subscriptions;
drop policy if exists "push_subscriptions_update_app" on public.push_subscriptions;
drop policy if exists "push_subscriptions_insert_public_app" on public.push_subscriptions;
drop policy if exists "push_subscriptions_update_public_app" on public.push_subscriptions;

create policy "push_subscriptions_insert_public_app"
  on public.push_subscriptions
  as permissive
  for insert
  to public
  with check (
    token is not null
    and user_role in ('admin', 'staff')
  );

create policy "push_subscriptions_update_public_app"
  on public.push_subscriptions
  as permissive
  for update
  to public
  using (true)
  with check (
    token is not null
    and user_role in ('admin', 'staff')
  );
