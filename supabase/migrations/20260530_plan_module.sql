-- Модуль «План» — наглядный план проекта из блоков (текст / задача / слот).
--
-- Концепция: план — отдельный модуль проекта (наравне с tasks/documents),
-- рендерится сворачиваемым блоком под списком задач. Состоит из упорядоченных
-- блоков трёх типов:
--   text — произвольный HTML-текст (Tiptap), пояснения/разделы;
--   task — ССЫЛКА на существующую задачу проекта (project_threads), живой статус;
--   slot — ССЫЛКА на существующий слот документа (folder_slots), живой статус.
-- Задачи и слоты не копируются — подтягиваются по ссылке (одна точка правды).
--
-- Две таблицы:
--   project_plan_blocks          — живой план в проекте (инстанс).
--   project_template_plan_blocks — «рыба» плана в шаблоне проекта.
-- Разворачивание шаблона → план — отдельной фазой (резолв через
-- project_threads.source_template_id и folder_slots.folder_template_slot_id).
--
-- План см. docs/feature-backlog/2026-05-30-plan-module.md
-- RLS-паттерн скопирован с project_context_items (20260514_project_context.sql):
-- гейт через has_project_module_access(uid, project_id, 'plan').

-- ── 1. Дефолты module_access для модуля plan ────────────────────────────────
-- Командные роли (Администратор/Исполнитель) — план виден; клиентские
-- (Клиент/Участник) — по умолчанию выкл (включается позже под клиентский экран).

update public.project_roles
set module_access = module_access || jsonb_build_object('plan', true)
where name in ('Администратор', 'Исполнитель')
  and not (module_access ? 'plan');

update public.project_roles
set module_access = module_access || jsonb_build_object('plan', false)
where not (module_access ? 'plan');

-- Дефолты для новых workspace — добавляем "plan" в seed-функции.

create or replace function public.get_project_admin_module_access()
returns jsonb language sql immutable set search_path to 'public' as $$
  select '{
    "settings": true,
    "forms": true,
    "documents": true,
    "threads": true,
    "history": true,
    "card_view": true,
    "knowledge_base": true,
    "ai_document_check": true,
    "ai_form_autofill": true,
    "ai_knowledge_all": true,
    "ai_knowledge_project": true,
    "ai_project_assistant": true,
    "comments": true,
    "digest": true,
    "project_context": true,
    "plan": true
  }'::jsonb;
$$;

create or replace function public.get_project_executor_module_access()
returns jsonb language sql immutable set search_path to 'public' as $$
  select '{
    "settings": false,
    "forms": true,
    "documents": true,
    "threads": true,
    "history": true,
    "card_view": true,
    "knowledge_base": true,
    "ai_document_check": true,
    "ai_form_autofill": true,
    "ai_knowledge_all": true,
    "ai_knowledge_project": true,
    "ai_project_assistant": true,
    "comments": true,
    "digest": true,
    "project_context": true,
    "plan": true
  }'::jsonb;
$$;

create or replace function public.get_project_client_module_access()
returns jsonb language sql immutable set search_path to 'public' as $$
  select '{
    "settings": false,
    "forms": true,
    "documents": true,
    "threads": true,
    "history": false,
    "card_view": true,
    "knowledge_base": false,
    "ai_document_check": false,
    "ai_form_autofill": true,
    "ai_knowledge_all": false,
    "ai_knowledge_project": false,
    "ai_project_assistant": false,
    "comments": true,
    "digest": false,
    "project_context": false,
    "plan": false
  }'::jsonb;
$$;

create or replace function public.get_project_participant_module_access()
returns jsonb language sql immutable set search_path to 'public' as $$
  select '{
    "settings": false,
    "forms": true,
    "documents": true,
    "threads": false,
    "history": false,
    "card_view": false,
    "knowledge_base": false,
    "ai_document_check": false,
    "ai_form_autofill": false,
    "ai_knowledge_all": false,
    "ai_knowledge_project": false,
    "ai_project_assistant": false,
    "comments": false,
    "digest": false,
    "project_context": false,
    "plan": false
  }'::jsonb;
$$;

-- ── 2. Таблица project_plan_blocks (живой план в проекте) ───────────────────

create table if not exists public.project_plan_blocks (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces(id) on delete cascade,
  project_id        uuid not null references public.projects(id) on delete cascade,

  block_type        text not null check (block_type in ('text', 'task', 'slot')),
  sort_order        integer not null default 0,
  visible_to_client boolean not null default false,

  -- block_type='text' → HTML-контент (Tiptap), иначе null
  content           text,
  -- block_type='task' → ссылка на задачу проекта, иначе null
  thread_id         uuid references public.project_threads(id) on delete cascade,
  -- block_type='slot' → ссылка на слот документа, иначе null
  folder_slot_id    uuid references public.folder_slots(id) on delete cascade,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- ровно одна ссылка соответствует типу блока
  constraint project_plan_blocks_shape check (
    (block_type = 'text' and thread_id is null and folder_slot_id is null)
    or (block_type = 'task' and thread_id is not null and folder_slot_id is null)
    or (block_type = 'slot' and folder_slot_id is not null and thread_id is null)
  )
);

comment on table public.project_plan_blocks is
  'Блоки плана проекта (модуль plan): text/task/slot. Задачи и слоты — по ссылке, не копии. Гейт RLS через module_access.plan.';

create index if not exists idx_project_plan_blocks_project
  on public.project_plan_blocks(project_id, sort_order);
create index if not exists idx_project_plan_blocks_thread
  on public.project_plan_blocks(thread_id) where thread_id is not null;
create index if not exists idx_project_plan_blocks_slot
  on public.project_plan_blocks(folder_slot_id) where folder_slot_id is not null;

-- ── 3. Таблица project_template_plan_blocks («рыба» плана в шаблоне) ─────────

create table if not exists public.project_template_plan_blocks (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces(id) on delete cascade,
  project_template_id uuid not null references public.project_templates(id) on delete cascade,

  block_type          text not null check (block_type in ('text', 'task', 'slot')),
  sort_order          integer not null default 0,
  visible_to_client   boolean not null default false,

  content             text,
  -- task → ссылка на шаблон задачи; slot → ссылка на шаблонный слот
  thread_template_id  uuid references public.thread_templates(id) on delete cascade,
  slot_template_id    uuid references public.document_kit_template_folder_slots(id) on delete cascade,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint project_template_plan_blocks_shape check (
    (block_type = 'text' and thread_template_id is null and slot_template_id is null)
    or (block_type = 'task' and thread_template_id is not null and slot_template_id is null)
    or (block_type = 'slot' and slot_template_id is not null and thread_template_id is null)
  )
);

comment on table public.project_template_plan_blocks is
  'Шаблон плана проекта — разворачивается в project_plan_blocks при создании проекта.';

create index if not exists idx_template_plan_blocks_template
  on public.project_template_plan_blocks(project_template_id, sort_order);

-- ── 4. Триггеры updated_at ──────────────────────────────────────────────────

create or replace function public.touch_plan_block_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_project_plan_blocks_touch on public.project_plan_blocks;
create trigger trg_project_plan_blocks_touch
  before update on public.project_plan_blocks
  for each row execute function public.touch_plan_block_updated_at();

drop trigger if exists trg_template_plan_blocks_touch on public.project_template_plan_blocks;
create trigger trg_template_plan_blocks_touch
  before update on public.project_template_plan_blocks
  for each row execute function public.touch_plan_block_updated_at();

-- ── 5. RLS — project_plan_blocks (по образцу project_context_items) ─────────

alter table public.project_plan_blocks enable row level security;

create policy "project_plan_blocks_select"
  on public.project_plan_blocks for select
  using (
    has_project_module_access((select auth.uid()), project_id, 'plan')
    or has_workspace_permission((select auth.uid()), workspace_id, 'view_all_projects')
  );

create policy "project_plan_blocks_insert"
  on public.project_plan_blocks for insert
  with check (
    has_project_module_access((select auth.uid()), project_id, 'plan')
    or has_workspace_permission((select auth.uid()), workspace_id, 'edit_all_projects')
  );

create policy "project_plan_blocks_update"
  on public.project_plan_blocks for update
  using (
    has_project_module_access((select auth.uid()), project_id, 'plan')
    or has_workspace_permission((select auth.uid()), workspace_id, 'edit_all_projects')
  );

create policy "project_plan_blocks_delete"
  on public.project_plan_blocks for delete
  using (
    has_project_module_access((select auth.uid()), project_id, 'plan')
    or has_workspace_permission((select auth.uid()), workspace_id, 'edit_all_projects')
  );

-- ── 6. RLS — project_template_plan_blocks (workspace-уровень) ───────────────

alter table public.project_template_plan_blocks enable row level security;

-- SELECT: любой участник воркспейса.
create policy "template_plan_blocks_select"
  on public.project_template_plan_blocks for select
  using (
    exists (
      select 1 from public.participants p
      where p.workspace_id = project_template_plan_blocks.workspace_id
        and p.user_id = (select auth.uid())
        and p.is_deleted = false
    )
  );

-- INSERT/UPDATE/DELETE: владелец воркспейса или менеджер настроек.
create policy "template_plan_blocks_insert"
  on public.project_template_plan_blocks for insert
  with check (
    is_workspace_owner((select auth.uid()), workspace_id)
    or has_workspace_permission((select auth.uid()), workspace_id, 'manage_workspace_settings')
  );

create policy "template_plan_blocks_update"
  on public.project_template_plan_blocks for update
  using (
    is_workspace_owner((select auth.uid()), workspace_id)
    or has_workspace_permission((select auth.uid()), workspace_id, 'manage_workspace_settings')
  );

create policy "template_plan_blocks_delete"
  on public.project_template_plan_blocks for delete
  using (
    is_workspace_owner((select auth.uid()), workspace_id)
    or has_workspace_permission((select auth.uid()), workspace_id, 'manage_workspace_settings')
  );
