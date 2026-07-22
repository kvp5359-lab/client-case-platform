-- _selftest_recompute_unread — служебный self-test формулы непрочитанного
-- (SECURITY DEFINER, пишет fixture в project_messages с откатом через savepoint).
-- Должен быть доступен ТОЛЬКО service_role — как собрат
-- _selftest_thread_template_folding.
--
-- После пересоздания функции Supabase вернул дефолтные гранты
-- PUBLIC/anon/authenticated → SECURITY DEFINER-поверхность оказалась открыта
-- анониму. Поймал ночной гард инвариантов (scripts/check-db-invariants.mjs,
-- «SECURITY DEFINER функции с PUBLIC/anon execute вне whitelist»).
--
-- 🪤 Грабля: любой CREATE OR REPLACE / пересоздание public-функции в Supabase
-- возвращает грант PUBLIC (→ anon). После правки служебных SECURITY DEFINER
-- функций всегда явно отзывать PUBLIC/anon.
--
-- Гейт по to_regprocedure: миграция не должна падать, если функции ещё нет
-- (порядок применения на чистой БД или её будущее удаление).

DO $$
BEGIN
  IF to_regprocedure('public._selftest_recompute_unread()') IS NULL THEN
    RAISE NOTICE 'public._selftest_recompute_unread() отсутствует — пропускаем';
    RETURN;
  END IF;

  REVOKE ALL ON FUNCTION public._selftest_recompute_unread() FROM PUBLIC;
  REVOKE ALL ON FUNCTION public._selftest_recompute_unread() FROM anon;
  REVOKE ALL ON FUNCTION public._selftest_recompute_unread() FROM authenticated;
  GRANT EXECUTE ON FUNCTION public._selftest_recompute_unread() TO service_role;
END
$$;
