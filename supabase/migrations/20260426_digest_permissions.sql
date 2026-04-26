-- Дневник проекта: настройка прав доступа.
--
-- 1. Workspace-уровень: новое право `view_workspace_digest` — гейт для страницы
--    "/workspaces/[id]/digests" и пункта сайдбара «Дневник».
--    Дефолт: вкл для Владельца/Администратора/Сотрудника, выкл для Клиента.
--
-- 2. Проектный уровень: новый модуль `digest` в `project_roles.module_access` —
--    гейт для вкладки «Дневник» в карточке проекта.
--    Дефолт: вкл для Администратора/Исполнителя, выкл для Клиента/Участника.

-- ── 1. Обновляем существующие workspace_roles ────────────────────────────────

update public.workspace_roles
set permissions = permissions || jsonb_build_object('view_workspace_digest', true)
where (is_owner = true or name in ('Администратор', 'Сотрудник', 'Внешний сотрудник'))
  and not (permissions ? 'view_workspace_digest');

update public.workspace_roles
set permissions = permissions || jsonb_build_object('view_workspace_digest', false)
where not (permissions ? 'view_workspace_digest');

-- ── 2. Обновляем существующие project_roles ─────────────────────────────────

update public.project_roles
set module_access = module_access || jsonb_build_object('digest', true)
where name in ('Администратор', 'Исполнитель')
  and not (module_access ? 'digest');

update public.project_roles
set module_access = module_access || jsonb_build_object('digest', false)
where not (module_access ? 'digest');

-- ── 3. Обновляем функции-дефолты для новых воркспейсов ──────────────────────

create or replace function public.get_owner_permissions()
returns jsonb language plpgsql immutable set search_path to 'public' as $$
begin
  return '{
    "manage_workspace_settings": true,
    "delete_workspace": true,
    "manage_participants": true,
    "manage_roles": true,
    "manage_templates": true,
    "manage_statuses": true,
    "manage_features": true,
    "create_projects": true,
    "view_all_projects": true,
    "edit_all_projects": true,
    "delete_all_projects": true,
    "view_workspace_digest": true
  }'::jsonb;
end;
$$;

create or replace function public.get_admin_permissions()
returns jsonb language plpgsql immutable set search_path to 'public' as $$
begin
  return '{
    "manage_workspace_settings": true,
    "delete_workspace": false,
    "manage_participants": true,
    "manage_roles": true,
    "manage_templates": true,
    "manage_statuses": true,
    "manage_features": true,
    "create_projects": true,
    "view_all_projects": true,
    "edit_all_projects": true,
    "delete_all_projects": false,
    "view_workspace_digest": true
  }'::jsonb;
end;
$$;

create or replace function public.get_employee_permissions()
returns jsonb language plpgsql immutable set search_path to 'public' as $$
begin
  return '{
    "manage_workspace_settings": false,
    "delete_workspace": false,
    "manage_participants": false,
    "manage_roles": false,
    "manage_templates": false,
    "manage_statuses": false,
    "manage_features": false,
    "create_projects": true,
    "view_all_projects": false,
    "edit_all_projects": false,
    "delete_all_projects": false,
    "view_workspace_digest": true
  }'::jsonb;
end;
$$;

create or replace function public.get_client_ws_permissions()
returns jsonb language plpgsql immutable set search_path to 'public' as $$
begin
  return '{
    "manage_workspace_settings": false,
    "delete_workspace": false,
    "manage_participants": false,
    "manage_roles": false,
    "manage_templates": false,
    "manage_statuses": false,
    "manage_features": false,
    "create_projects": false,
    "view_all_projects": false,
    "edit_all_projects": false,
    "delete_all_projects": false,
    "view_workspace_digest": false
  }'::jsonb;
end;
$$;

-- Project module access defaults

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
    "digest": true
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
    "digest": true
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
    "digest": false
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
    "digest": false
  }'::jsonb;
$$;
