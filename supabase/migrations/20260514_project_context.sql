-- Контекст проекта — внутренние материалы команды, недоступные клиентам.
--
-- project_context_items — записи трёх типов:
--   text       — заметка в tiptap (HTML в `content_html`)
--   file       — загруженный файл (ссылка в `file_id` → public.files)
--   screenshot — изображение из буфера (ссылка в `file_id`, item_type для UI/иконки)
--
-- Для file/screenshot есть `extracted_text` — результат запуска transcribe-audio
-- (для аудио/видео) или extract-text (для pdf/docx). Запускается по кнопке,
-- автоматически НЕ генерируется. Используется как контекст для AI-ассистента.
--
-- Доступ: только участники проекта, у которых в project_roles.module_access
-- стоит project_context=true. Клиенты блокируются на уровне RLS.

-- ── 1. Helper-функция проверки доступа к модулю проекта ─────────────────────
-- Универсальная — будет переиспользована для других модулей при необходимости.

create or replace function public.has_project_module_access(
  p_user_id uuid,
  p_project_id uuid,
  p_module text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from project_participants pp
    join participants p on p.id = pp.participant_id
    join project_roles pr
      on pr.workspace_id = p.workspace_id
     and pr.name = any (pp.project_roles)
    where pp.project_id = p_project_id
      and p.user_id = p_user_id
      and p.is_deleted = false
      and coalesce((pr.module_access ->> p_module)::boolean, false) = true
  );
$$;

revoke all on function public.has_project_module_access(uuid, uuid, text) from public;
grant execute on function public.has_project_module_access(uuid, uuid, text) to authenticated, service_role;

comment on function public.has_project_module_access(uuid, uuid, text) is
  'Возвращает true, если у пользователя есть проектная роль в указанном проекте, чья module_access содержит передаваемый модуль = true. Используется в RLS-политиках модулей.';

-- ── 2. Таблица project_context_items ────────────────────────────────────────

create table if not exists public.project_context_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,

  name text not null,
  item_type text not null check (item_type in ('text', 'file', 'screenshot')),

  -- для item_type='text'
  content_html text,

  -- для item_type='file' | 'screenshot'
  file_id uuid references public.files(id) on delete set null,

  -- результат запуска extract-text / transcribe-audio (по кнопке)
  extracted_text text,
  extraction_kind text check (extraction_kind in ('transcribe', 'extract')),
  extraction_status text not null default 'idle'
    check (extraction_status in ('idle', 'running', 'done', 'error')),
  extraction_error text,
  extraction_updated_at timestamptz,

  sort_order int not null default 0,

  -- мягкое удаление (общая корзина воркспейса)
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- инвариант: текстовая запись хранит HTML, файловая/скриншот — file_id
  constraint project_context_items_payload_check check (
    (item_type = 'text' and file_id is null)
    or (item_type in ('file', 'screenshot'))
  )
);

create index if not exists project_context_items_project_idx
  on public.project_context_items (project_id, is_deleted, created_at desc);

create index if not exists project_context_items_workspace_trash_idx
  on public.project_context_items (workspace_id, is_deleted)
  where is_deleted = true;

create index if not exists project_context_items_file_idx
  on public.project_context_items (file_id)
  where file_id is not null;

-- автообновление updated_at
create or replace function public.touch_project_context_items_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists project_context_items_touch_updated_at on public.project_context_items;
create trigger project_context_items_touch_updated_at
  before update on public.project_context_items
  for each row execute function public.touch_project_context_items_updated_at();

-- ── 3. RLS ──────────────────────────────────────────────────────────────────

alter table public.project_context_items enable row level security;

create policy "project_context_items_select"
  on public.project_context_items for select
  using (
    has_project_module_access((select auth.uid()), project_id, 'project_context')
    or has_workspace_permission((select auth.uid()), workspace_id, 'view_all_projects')
  );

create policy "project_context_items_insert"
  on public.project_context_items for insert
  with check (
    has_project_module_access((select auth.uid()), project_id, 'project_context')
    or has_workspace_permission((select auth.uid()), workspace_id, 'edit_all_projects')
  );

create policy "project_context_items_update"
  on public.project_context_items for update
  using (
    has_project_module_access((select auth.uid()), project_id, 'project_context')
    or has_workspace_permission((select auth.uid()), workspace_id, 'edit_all_projects')
  );

create policy "project_context_items_delete"
  on public.project_context_items for delete
  using (
    has_project_module_access((select auth.uid()), project_id, 'project_context')
    or has_workspace_permission((select auth.uid()), workspace_id, 'edit_all_projects')
  );

comment on table public.project_context_items is
  'Внутренние материалы проекта (заметки, файлы, скриншоты). Не видны клиентам — гейт через project_roles.module_access.project_context. Используется как контекст для AI-ассистента.';
