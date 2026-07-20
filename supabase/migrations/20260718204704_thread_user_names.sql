-- Личное имя треда: каждый пользователь может назвать тред по-своему (видит только он).
-- Показ везде: личное имя ?? общее имя. Для прямых 1:1 двух сотрудников личные имена
-- автозасеваются именем собеседника (edge ensurePairThread). Применено через MCP.
create table if not exists public.thread_user_names (
  thread_id uuid not null references public.project_threads(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  name      text not null,
  updated_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);
alter table public.thread_user_names enable row level security;
create policy thread_user_names_select on public.thread_user_names
  for select to authenticated using (user_id = (select auth.uid()));
create policy thread_user_names_insert on public.thread_user_names
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy thread_user_names_update on public.thread_user_names
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy thread_user_names_delete on public.thread_user_names
  for delete to authenticated using (user_id = (select auth.uid()));
grant select, insert, update, delete on public.thread_user_names to authenticated;
grant all on public.thread_user_names to service_role;
