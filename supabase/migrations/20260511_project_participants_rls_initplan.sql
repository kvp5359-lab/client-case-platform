-- auth_rls_initplan fix для project_participants DML-политик.
-- Supabase advisor: вызов `auth.role()` без обёртки `(SELECT auth.role())`
-- заставляет планировщик пересчитывать функцию на каждую строку, что
-- бьёт по перфомансу при больших операциях.
--
-- Логика доступа не меняется — только форма выражения. Все 3 политики
-- (delete/insert/update) остаются разрешающими для authenticated, как и
-- было до миграции.

DROP POLICY IF EXISTS project_participants_delete ON public.project_participants;
CREATE POLICY project_participants_delete
  ON public.project_participants FOR DELETE TO public
  USING ((SELECT auth.role()) = 'authenticated'::text);

DROP POLICY IF EXISTS project_participants_insert ON public.project_participants;
CREATE POLICY project_participants_insert
  ON public.project_participants FOR INSERT TO public
  WITH CHECK ((SELECT auth.role()) = 'authenticated'::text);

DROP POLICY IF EXISTS project_participants_update ON public.project_participants;
CREATE POLICY project_participants_update
  ON public.project_participants FOR UPDATE TO public
  USING ((SELECT auth.role()) = 'authenticated'::text);
