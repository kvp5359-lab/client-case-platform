-- Аудит-гигиена безопасности (группа D). Все правки read-only-по-эффекту или дроп мёртвого.
-- НЕ трогаем: consume_platform_invite (корректный фикс = server-side register-with-invite
-- edge-функция, атомарно создающая юзера и гасящая инвайт — фиче-уровень, не миграция;
-- текущий риск низкий: неугадываемые admin-коды, gate до signup осознан).

-- 1) seed_workspace_trial — триггерная функция, публичный EXECUTE не нужен (лишняя поверхность).
REVOKE EXECUTE ON FUNCTION public.seed_workspace_trial() FROM anon, authenticated;

-- 2) Осиротевшая дорефакторная таблица tasks (все задачи давно в project_threads).
--    0 внешних FK, 0 зависимых функций/вью, последняя активность 2026-03-26.
DROP FUNCTION IF EXISTS public.create_task_with_assignees(p_workspace_id uuid, p_project_id uuid, p_title text, p_description text, p_deadline timestamp with time zone, p_document_id uuid, p_document_kit_id uuid, p_form_kit_id uuid, p_created_by uuid, p_assignee_ids uuid[]);
DROP TABLE IF EXISTS public.tasks CASCADE;

-- 3) participant-avatars — публичный бакет: чтение идёт по public-URL (RLS не задействован).
--    Публичная SELECT-политика лишь разрешала enumeration (.list) имён файлов (tg_id/participant_id)
--    по всем воркспейсам. В коде .list()/.download() на этом бакете нет — снимаем.
DROP POLICY IF EXISTS "Anyone can read participant avatars" ON storage.objects;
