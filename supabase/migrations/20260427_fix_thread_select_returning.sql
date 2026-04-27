-- Фикс: INSERT INTO project_threads ... RETURNING * падал с RLS-ошибкой
-- "new row violates row-level security policy" из-за того, что SELECT USING
-- политика project_threads_select зовёт can_user_access_thread(id, ...),
-- а та делает SELECT FROM project_threads WHERE id = NEW.id. Внутри одного
-- INSERT-statement только что вставленная строка ещё не видна для SELECT в
-- той же команде → функция возвращает false → SELECT USING не пропускает
-- новую строку → Postgres откатывает INSERT.
--
-- PostgREST формирует все .insert(...).select() как INSERT...RETURNING *,
-- и весь UI создания тредов (задачи/чаты/email) сломался для всех
-- пользователей после миграции 20260426_thread_access_rls.sql.
--
-- Фикс — добавить short-circuit `created_by = auth.uid()` в SELECT USING.
-- BEFORE INSERT триггер set_thread_created_by всегда выставляет created_by
-- в auth.uid(), поэтому для свежевставленной строки short-circuit срабатывает
-- и обходит проблемный вызов can_user_access_thread. Для обычного SELECT
-- existing-строк, когда created_by не совпадает с текущим юзером, политика
-- падает в проверку can_user_access_thread как раньше — поведение прав
-- доступа не меняется.

DROP POLICY IF EXISTS project_threads_select ON public.project_threads;
CREATE POLICY project_threads_select
  ON public.project_threads FOR SELECT TO public
  USING (
    -- Workspace-level тред — любой участник воркспейса.
    ((project_id IS NULL) AND (workspace_id IN (
      SELECT part.workspace_id FROM participants part
      WHERE part.user_id = (SELECT auth.uid()) AND part.is_deleted = false
    )))
    OR
    -- Создатель строки всегда может её прочитать. Нужно для INSERT...RETURNING:
    -- в этом контексте можно сослаться на created_by NEW-строки, не дёргая
    -- can_user_access_thread, которая не видит ещё-не-видимую строку.
    (created_by = (SELECT auth.uid()))
    OR
    -- Project-level тред — гейт по правилам Thread Access (для existing-строк).
    ((project_id IS NOT NULL) AND public.can_user_access_thread(id, (SELECT auth.uid())))
  );
