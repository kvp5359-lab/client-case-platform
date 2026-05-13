-- Регрессия: миграция 20260510_personal_dialogs_rls.sql переписала
-- project_threads_select без short-circuit'а на created_by, повторно открыв
-- баг 20260427: INSERT INTO project_threads ... RETURNING * падал с RLS 42501
-- "new row violates row-level security policy", потому что
-- can_user_access_thread(NEW.id, ...) внутри SELECT-полиции выполняется как
-- SECURITY DEFINER STABLE и в её snapshot'е свежевставленная строка ещё не
-- видна (IF NOT FOUND THEN RETURN false).
--
-- PostgREST формирует все .insert(...).select() как INSERT...RETURNING *,
-- поэтому UI создания тредов (задачи/чаты/email) и создание задач из
-- шаблона ломались для всех пользователей с 2026-05-10.
--
-- Восстанавливаем short-circuit `created_by = auth.uid()` (как было в
-- 20260427_fix_thread_select_returning.sql). BEFORE INSERT триггер
-- set_thread_created_by всегда выставляет created_by = auth.uid(),
-- поэтому для свежевставленной строки short-circuit срабатывает и обходит
-- проблемный вызов can_user_access_thread. Для обычного SELECT existing-строк
-- проверка прав не меняется.

DROP POLICY IF EXISTS project_threads_select ON public.project_threads;
CREATE POLICY project_threads_select
  ON public.project_threads FOR SELECT TO public
  USING (
    -- Short-circuit для INSERT...RETURNING: BEFORE INSERT trigger
    -- set_thread_created_by всегда выставляет created_by = auth.uid().
    (created_by = (SELECT auth.uid()))
    OR
    -- Полная проверка прав через функцию (existing-строки).
    can_user_access_thread(id, (SELECT auth.uid()))
  );
