-- task_panel_tabs — набор открытых вкладок боковой панели треда per-user-per-project.
--
-- Каждая строка = состояние правой панели для конкретного пользователя в конкретном проекте.
-- tabs: массив объектов { id, type, refId?, title }
--   type: 'thread' | 'tasks' | 'documents' | 'history' | 'forms' | 'materials' | 'assistant' | 'extra'
--   refId: для 'thread' — id треда, для остальных может отсутствовать
-- active_tab_id: id активной вкладки (опционально — может быть null если все закрыты)

create table if not exists public.task_panel_tabs (
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  tabs jsonb not null default '[]'::jsonb,
  active_tab_id text,
  updated_at timestamptz not null default now(),
  primary key (user_id, project_id)
);

alter table public.task_panel_tabs enable row level security;

-- Каждый видит и пишет только свои строки.
create policy "task_panel_tabs_select_own"
  on public.task_panel_tabs for select
  using (user_id = (select auth.uid()));

create policy "task_panel_tabs_insert_own"
  on public.task_panel_tabs for insert
  with check (user_id = (select auth.uid()));

create policy "task_panel_tabs_update_own"
  on public.task_panel_tabs for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "task_panel_tabs_delete_own"
  on public.task_panel_tabs for delete
  using (user_id = (select auth.uid()));
