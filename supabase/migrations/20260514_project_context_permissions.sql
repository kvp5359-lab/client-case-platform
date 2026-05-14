-- Контекст проекта: настройка прав доступа на проектном уровне.
--
-- Добавляем модуль `project_context` в project_roles.module_access:
--   Администратор / Исполнитель — вкл (командные роли)
--   Клиент / Участник — выкл (клиентские роли видеть не должны)
--
-- Также обновляем функции-дефолты для новых workspace.

-- ── 1. Обновляем существующие project_roles ─────────────────────────────────

update public.project_roles
set module_access = module_access || jsonb_build_object('project_context', true)
where name in ('Администратор', 'Исполнитель')
  and not (module_access ? 'project_context');

update public.project_roles
set module_access = module_access || jsonb_build_object('project_context', false)
where not (module_access ? 'project_context');

-- ── 2. Дефолты для новых workspace ──────────────────────────────────────────

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
    "project_context": true
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
    "project_context": true
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
    "project_context": false
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
    "project_context": false
  }'::jsonb;
$$;
