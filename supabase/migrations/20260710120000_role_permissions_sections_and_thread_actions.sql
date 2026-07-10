-- Права роли Workspace: доступ к разделам + действия с задачами/чатами.
--
-- 1. Новые ключи в workspace_roles.permissions:
--    Разделы:  view_inbox, view_tasks_page, view_calendar, view_boards,
--              view_reports, view_source_updates, view_finance
--    Задачи:   create_tasks, edit_any_task, change_task_status,
--              manage_task_assignees, delete_own_task, delete_any_task
--    Чаты:     edit_own_message, forward_messages, react_messages,
--              delete_own_message, delete_any_message
--
-- 2. Бэкфилл существующих системных ролей (новые ключи добавляются с
--    дефолтами, существующие значения сохраняются: NEW || permissions).
-- 3. Обновление функций-дефолтов get_*_permissions (для новых воркспейсов).
-- 4. Починка битой роли «Внешний сотрудник» (permissions был массивом).

-- ── 0. Починка битой роли «Внешний сотрудник» (был jsonb array) ──────────────
update public.workspace_roles
set permissions = '{
  "manage_workspace_settings": false, "delete_workspace": false, "manage_participants": false,
  "manage_roles": false, "manage_templates": false, "manage_statuses": false, "manage_features": false,
  "create_projects": false, "view_all_projects": false, "edit_all_projects": false, "delete_all_projects": false,
  "view_knowledge_base": true, "manage_knowledge_base": false, "view_workspace_digest": true,
  "view_inbox": true, "view_tasks_page": true, "view_calendar": true, "view_boards": true,
  "view_reports": false, "view_source_updates": false, "view_finance": false,
  "create_tasks": true, "edit_any_task": false, "change_task_status": true, "manage_task_assignees": false,
  "delete_own_task": true, "delete_any_task": false,
  "edit_own_message": true, "forward_messages": true, "react_messages": true,
  "delete_own_message": true, "delete_any_message": false
}'::jsonb
where name = 'Внешний сотрудник'
  and jsonb_typeof(permissions) is distinct from 'object';

-- На всякий случай: любой другой не-объект → пустой объект (бэкфилл ниже добьёт).
update public.workspace_roles
set permissions = '{}'::jsonb
where jsonb_typeof(permissions) is distinct from 'object';

-- ── 1. Бэкфилл новых ключей в существующие роли (NEW || existing) ─────────────

-- Владелец: всё включено
update public.workspace_roles
set permissions = '{
  "view_inbox": true, "view_tasks_page": true, "view_calendar": true, "view_boards": true,
  "view_reports": true, "view_source_updates": true, "view_finance": true,
  "create_tasks": true, "edit_any_task": true, "change_task_status": true, "manage_task_assignees": true,
  "delete_own_task": true, "delete_any_task": true,
  "edit_own_message": true, "forward_messages": true, "react_messages": true,
  "delete_own_message": true, "delete_any_message": true
}'::jsonb || permissions
where is_owner = true;

-- Администратор: всё включено
update public.workspace_roles
set permissions = '{
  "view_inbox": true, "view_tasks_page": true, "view_calendar": true, "view_boards": true,
  "view_reports": true, "view_source_updates": true, "view_finance": true,
  "create_tasks": true, "edit_any_task": true, "change_task_status": true, "manage_task_assignees": true,
  "delete_own_task": true, "delete_any_task": true,
  "edit_own_message": true, "forward_messages": true, "react_messages": true,
  "delete_own_message": true, "delete_any_message": true
}'::jsonb || permissions
where name = 'Администратор' and is_owner = false;

-- Сотрудник: разделы да (кроме финансов), свои действия да, чужие нет
update public.workspace_roles
set permissions = '{
  "view_inbox": true, "view_tasks_page": true, "view_calendar": true, "view_boards": true,
  "view_reports": true, "view_source_updates": true, "view_finance": false,
  "create_tasks": true, "edit_any_task": false, "change_task_status": true, "manage_task_assignees": true,
  "delete_own_task": true, "delete_any_task": false,
  "edit_own_message": true, "forward_messages": true, "react_messages": true,
  "delete_own_message": true, "delete_any_message": false
}'::jsonb || permissions
where name = 'Сотрудник';

-- Клиент: разделы/задачи нет; управляет только своими сообщениями
update public.workspace_roles
set permissions = '{
  "view_inbox": false, "view_tasks_page": false, "view_calendar": false, "view_boards": false,
  "view_reports": false, "view_source_updates": false, "view_finance": false,
  "create_tasks": false, "edit_any_task": false, "change_task_status": false, "manage_task_assignees": false,
  "delete_own_task": false, "delete_any_task": false,
  "edit_own_message": true, "forward_messages": false, "react_messages": true,
  "delete_own_message": true, "delete_any_message": false
}'::jsonb || permissions
where name = 'Клиент';

-- Внешний контакт: всё новое выключено
update public.workspace_roles
set permissions = '{
  "view_inbox": false, "view_tasks_page": false, "view_calendar": false, "view_boards": false,
  "view_reports": false, "view_source_updates": false, "view_finance": false,
  "create_tasks": false, "edit_any_task": false, "change_task_status": false, "manage_task_assignees": false,
  "delete_own_task": false, "delete_any_task": false,
  "edit_own_message": false, "forward_messages": false, "react_messages": false,
  "delete_own_message": false, "delete_any_message": false
}'::jsonb || permissions
where name = 'Внешний контакт';

-- Прочие кастомные роли (если появятся) — новые ключи false по умолчанию.
update public.workspace_roles
set permissions = '{
  "view_inbox": false, "view_tasks_page": false, "view_calendar": false, "view_boards": false,
  "view_reports": false, "view_source_updates": false, "view_finance": false,
  "create_tasks": false, "edit_any_task": false, "change_task_status": false, "manage_task_assignees": false,
  "delete_own_task": false, "delete_any_task": false,
  "edit_own_message": false, "forward_messages": false, "react_messages": false,
  "delete_own_message": false, "delete_any_message": false
}'::jsonb || permissions
where not (permissions ? 'view_inbox');

-- ── 2. Функции-дефолты для новых воркспейсов ─────────────────────────────────

create or replace function public.get_owner_permissions()
returns jsonb language plpgsql immutable set search_path to 'public' as $$
begin
  return '{
    "manage_workspace_settings": true, "delete_workspace": true, "manage_participants": true,
    "manage_roles": true, "manage_templates": true, "manage_statuses": true, "manage_features": true,
    "create_projects": true, "view_all_projects": true, "edit_all_projects": true, "delete_all_projects": true,
    "view_knowledge_base": true, "manage_knowledge_base": true, "view_workspace_digest": true,
    "view_inbox": true, "view_tasks_page": true, "view_calendar": true, "view_boards": true,
    "view_reports": true, "view_source_updates": true, "view_finance": true,
    "create_tasks": true, "edit_any_task": true, "change_task_status": true, "manage_task_assignees": true,
    "delete_own_task": true, "delete_any_task": true,
    "edit_own_message": true, "forward_messages": true, "react_messages": true,
    "delete_own_message": true, "delete_any_message": true
  }'::jsonb;
end;
$$;

create or replace function public.get_admin_permissions()
returns jsonb language plpgsql immutable set search_path to 'public' as $$
begin
  return '{
    "manage_workspace_settings": true, "delete_workspace": false, "manage_participants": true,
    "manage_roles": true, "manage_templates": true, "manage_statuses": true, "manage_features": true,
    "create_projects": true, "view_all_projects": true, "edit_all_projects": true, "delete_all_projects": false,
    "view_knowledge_base": false, "manage_knowledge_base": false, "view_workspace_digest": true,
    "view_inbox": true, "view_tasks_page": true, "view_calendar": true, "view_boards": true,
    "view_reports": true, "view_source_updates": true, "view_finance": true,
    "create_tasks": true, "edit_any_task": true, "change_task_status": true, "manage_task_assignees": true,
    "delete_own_task": true, "delete_any_task": true,
    "edit_own_message": true, "forward_messages": true, "react_messages": true,
    "delete_own_message": true, "delete_any_message": true
  }'::jsonb;
end;
$$;

create or replace function public.get_employee_permissions()
returns jsonb language plpgsql immutable set search_path to 'public' as $$
begin
  return '{
    "manage_workspace_settings": false, "delete_workspace": false, "manage_participants": false,
    "manage_roles": false, "manage_templates": false, "manage_statuses": false, "manage_features": false,
    "create_projects": true, "view_all_projects": false, "edit_all_projects": false, "delete_all_projects": false,
    "view_knowledge_base": true, "manage_knowledge_base": true, "view_workspace_digest": true,
    "view_inbox": true, "view_tasks_page": true, "view_calendar": true, "view_boards": true,
    "view_reports": true, "view_source_updates": true, "view_finance": false,
    "create_tasks": true, "edit_any_task": false, "change_task_status": true, "manage_task_assignees": true,
    "delete_own_task": true, "delete_any_task": false,
    "edit_own_message": true, "forward_messages": true, "react_messages": true,
    "delete_own_message": true, "delete_any_message": false
  }'::jsonb;
end;
$$;

create or replace function public.get_client_ws_permissions()
returns jsonb language plpgsql immutable set search_path to 'public' as $$
begin
  return '{
    "manage_workspace_settings": false, "delete_workspace": false, "manage_participants": false,
    "manage_roles": false, "manage_templates": false, "manage_statuses": false, "manage_features": false,
    "create_projects": false, "view_all_projects": false, "edit_all_projects": false, "delete_all_projects": false,
    "view_knowledge_base": false, "manage_knowledge_base": false, "view_workspace_digest": false,
    "view_inbox": false, "view_tasks_page": false, "view_calendar": false, "view_boards": false,
    "view_reports": false, "view_source_updates": false, "view_finance": false,
    "create_tasks": false, "edit_any_task": false, "change_task_status": false, "manage_task_assignees": false,
    "delete_own_task": false, "delete_any_task": false,
    "edit_own_message": true, "forward_messages": false, "react_messages": true,
    "delete_own_message": true, "delete_any_message": false
  }'::jsonb;
end;
$$;
