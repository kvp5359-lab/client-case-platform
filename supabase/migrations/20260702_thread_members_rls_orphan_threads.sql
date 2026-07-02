-- project_thread_members: RLS не работал для тредов БЕЗ проекта.
--
-- Все три политики (INSERT/SELECT/DELETE) резолвили доступ через
-- `JOIN projects p ON p.id = pt.project_id` — ВНУТРЕННИЙ join. У задачи/чата без
-- проекта `project_id IS NULL` → тред выпадал из разрешённого набора → добавление
-- участника отклонялось, а чтение членов возвращало пусто (участник «пропадал»
-- после перезагрузки).
--
-- Фикс: резолвим доступ через `project_threads.workspace_id` напрямую (колонка
-- заполнена у ВСЕХ тредов; у проектных всегда совпадает с workspace проекта —
-- проверено, 0 расхождений).
--
-- ВАЖНО (безопасность): для беспроектных тредов членство в project_thread_members
-- ДАЁТ доступ к сообщениям (can_user_access_thread). Личные диалоги по модели
-- видят только владелец + менеджеры. Поэтому:
--   • проектный тред (project_id NOT NULL) → прежняя ширина: любой активный
--     участник воркспейса (поведение НЕ меняется);
--   • беспроектный тред → только владелец треда (owner_user_id) ИЛИ менеджер
--     воркспейса (is_owner / view_all_projects). Чужие личные диалоги закрыты.

DROP POLICY IF EXISTS project_thread_members_select ON public.project_thread_members;
DROP POLICY IF EXISTS project_thread_members_insert ON public.project_thread_members;
DROP POLICY IF EXISTS project_thread_members_delete ON public.project_thread_members;

-- Общий предикат «пользователь может управлять членством этого треда».
-- Вынесен в тело каждой политики (без функции — чтобы миграция была самодостаточной).
CREATE POLICY project_thread_members_select ON public.project_thread_members
  FOR SELECT TO public
  USING (
    thread_id IN (
      SELECT pt.id
      FROM public.project_threads pt
      JOIN public.participants part
        ON part.workspace_id = pt.workspace_id
       AND part.user_id = (SELECT auth.uid())
       AND part.is_deleted = false
      WHERE pt.project_id IS NOT NULL
         OR pt.owner_user_id = (SELECT auth.uid())
         OR EXISTS (
              SELECT 1 FROM public.workspace_roles wr
              WHERE wr.workspace_id = pt.workspace_id
                AND wr.name = ANY(part.workspace_roles)
                AND (wr.is_owner = true OR (wr.permissions->>'view_all_projects')::boolean = true)
            )
    )
  );

CREATE POLICY project_thread_members_insert ON public.project_thread_members
  FOR INSERT TO public
  WITH CHECK (
    thread_id IN (
      SELECT pt.id
      FROM public.project_threads pt
      JOIN public.participants part
        ON part.workspace_id = pt.workspace_id
       AND part.user_id = (SELECT auth.uid())
       AND part.is_deleted = false
      WHERE pt.project_id IS NOT NULL
         OR pt.owner_user_id = (SELECT auth.uid())
         OR EXISTS (
              SELECT 1 FROM public.workspace_roles wr
              WHERE wr.workspace_id = pt.workspace_id
                AND wr.name = ANY(part.workspace_roles)
                AND (wr.is_owner = true OR (wr.permissions->>'view_all_projects')::boolean = true)
            )
    )
  );

CREATE POLICY project_thread_members_delete ON public.project_thread_members
  FOR DELETE TO public
  USING (
    thread_id IN (
      SELECT pt.id
      FROM public.project_threads pt
      JOIN public.participants part
        ON part.workspace_id = pt.workspace_id
       AND part.user_id = (SELECT auth.uid())
       AND part.is_deleted = false
      WHERE pt.project_id IS NOT NULL
         OR pt.owner_user_id = (SELECT auth.uid())
         OR EXISTS (
              SELECT 1 FROM public.workspace_roles wr
              WHERE wr.workspace_id = pt.workspace_id
                AND wr.name = ANY(part.workspace_roles)
                AND (wr.is_owner = true OR (wr.permissions->>'view_all_projects')::boolean = true)
            )
    )
  );
