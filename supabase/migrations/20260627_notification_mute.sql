-- Режим «тишина» (Do Not Disturb) по воркспейсам, пер-пользователь.
-- Нет строки или muted_until в прошлом = уведомления включены.
-- muted_until в будущем = заглушено до этого момента.
-- muted_until = 'infinity' = заглушено насовсем.
create table if not exists public.notification_mute (
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  muted_until timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, workspace_id)
);

alter table public.notification_mute enable row level security;

-- RLS: пользователь видит и меняет только свои строки.
create policy notification_mute_select on public.notification_mute
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy notification_mute_insert on public.notification_mute
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy notification_mute_update on public.notification_mute
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy notification_mute_delete on public.notification_mute
  for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.notification_mute to authenticated;
grant all on public.notification_mute to service_role;
