-- Системная роль «Внешний контакт» — для авто-созданных контактов
-- (входящие email, wazzup, telegram). При создании участника без явной роли
-- триггер ставит её. Пользователь потом может переключить на «Клиент» и т.п.

-- 1. Добавляем роль во все существующие воркспейсы (если ещё нет).
INSERT INTO workspace_roles (workspace_id, name, is_system, is_owner, order_index, permissions, color)
SELECT
  w.id,
  'Внешний контакт',
  true,
  false,
  COALESCE((SELECT MAX(order_index) FROM workspace_roles wr WHERE wr.workspace_id = w.id), 0) + 1,
  '{
    "manage_roles": false,
    "create_projects": false,
    "manage_features": false,
    "manage_statuses": false,
    "delete_workspace": false,
    "manage_templates": false,
    "edit_all_projects": false,
    "view_all_projects": false,
    "delete_all_projects": false,
    "manage_participants": false,
    "view_knowledge_base": false,
    "manage_knowledge_base": false,
    "view_workspace_digest": false,
    "manage_workspace_settings": false
  }'::jsonb,
  '#94a3b8'
FROM workspaces w
WHERE NOT EXISTS (
  SELECT 1 FROM workspace_roles wr
  WHERE wr.workspace_id = w.id AND wr.name = 'Внешний контакт'
);

-- 2. Триггер: при создании нового воркспейса автоматически добавлять роль.
CREATE OR REPLACE FUNCTION public.add_external_contact_role_to_new_workspace()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO workspace_roles (workspace_id, name, is_system, is_owner, order_index, permissions, color)
  VALUES (
    NEW.id, 'Внешний контакт', true, false, 100,
    '{
      "manage_roles": false, "create_projects": false, "manage_features": false,
      "manage_statuses": false, "delete_workspace": false, "manage_templates": false,
      "edit_all_projects": false, "view_all_projects": false, "delete_all_projects": false,
      "manage_participants": false, "view_knowledge_base": false, "manage_knowledge_base": false,
      "view_workspace_digest": false, "manage_workspace_settings": false
    }'::jsonb,
    '#94a3b8'
  ) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS add_external_contact_role_on_workspace_insert ON workspaces;
CREATE TRIGGER add_external_contact_role_on_workspace_insert
AFTER INSERT ON workspaces
FOR EACH ROW
EXECUTE FUNCTION public.add_external_contact_role_to_new_workspace();

-- 3. Триггер на participants: если новый participant создан без workspace_roles
--    и без can_login (не сотрудник) — ставим «Внешний контакт».
--    Покрывает все источники авто-создания: webhook'и email/wazzup/telegram.
CREATE OR REPLACE FUNCTION public.set_default_external_contact_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.can_login = true THEN RETURN NEW; END IF;
  IF NEW.workspace_roles IS NOT NULL AND array_length(NEW.workspace_roles, 1) > 0 THEN
    RETURN NEW;
  END IF;
  NEW.workspace_roles := ARRAY['Внешний контакт'];
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_default_external_contact_role_trigger ON participants;
CREATE TRIGGER set_default_external_contact_role_trigger
BEFORE INSERT ON participants
FOR EACH ROW
EXECUTE FUNCTION public.set_default_external_contact_role();

-- 4. Бэкфилл: existing participants без ролей и без логина → «Внешний контакт».
UPDATE participants
SET workspace_roles = ARRAY['Внешний контакт']
WHERE can_login = false
  AND is_deleted = false
  AND (workspace_roles IS NULL OR array_length(workspace_roles, 1) IS NULL);
