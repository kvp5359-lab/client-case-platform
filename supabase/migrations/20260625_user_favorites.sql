-- Персональное «Избранное» (на пользователя, не на воркспейс).
-- Любой тред/проект/доска/список можно добавить в избранное; видит только владелец.

create table if not exists public.user_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  entity_type text not null check (entity_type in ('thread', 'project', 'board', 'list')),
  entity_id uuid not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, workspace_id, entity_type, entity_id)
);

alter table public.user_favorites enable row level security;

-- Только свои строки.
drop policy if exists user_favorites_select on public.user_favorites;
create policy user_favorites_select on public.user_favorites
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists user_favorites_insert on public.user_favorites;
create policy user_favorites_insert on public.user_favorites
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists user_favorites_delete on public.user_favorites;
create policy user_favorites_delete on public.user_favorites
  for delete to authenticated using (user_id = (select auth.uid()));

-- UPDATE нужен для ручного порядка (sort_order). Без него reorder молча не пишет.
drop policy if exists user_favorites_update on public.user_favorites;
create policy user_favorites_update on public.user_favorites
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create index if not exists idx_user_favorites_user_ws
  on public.user_favorites (user_id, workspace_id);

grant select, insert, update, delete on public.user_favorites to authenticated;
