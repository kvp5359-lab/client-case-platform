-- Аудит 2026-07-03, Фаза 1 #1 / Фаза 7 Б2 — закрыть анонимный доступ (IDOR).
--
-- get_inbox_needs_reply_threads / _awaiting_reply / _muted — SECURITY DEFINER,
-- принимают (workspace_id, user_id) и НЕ сверяют user_id с auth.uid().
-- До этой миграции имели прямой GRANT anon → анонимный запрос с публичным
-- ключом мог прочитать превью тредов любого пользователя любого воркспейса.
-- get_inbox_threads_v2 / _unread anon НЕ имели (эталон).
--
-- get_my/set_my_thread_notify_level — user-scoped (резолвят participant по
-- auth.uid()), anon для них бесполезен и лишний.
--
-- Гранты anon здесь прямые (grantee=anon, не PUBLIC) → REVOKE FROM anon
-- срабатывает без снятия PUBLIC. authenticated/service_role не затронуты.

REVOKE EXECUTE ON FUNCTION public.get_inbox_needs_reply_threads(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_inbox_awaiting_reply_threads(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_inbox_muted_threads(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_my_thread_notify_level(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_my_thread_notify_level(uuid, text) FROM anon;

-- ОСТАЛОСЬ (не сделано здесь, требует смок-теста): ещё ~77 SECURITY DEFINER
-- функций-предикатов (is_workspace_owner, has_*_permission, can_user_access_*
-- и т.п.) исполняемы anon ЧЕРЕЗ PUBLIC. Они вызываются внутри RLS (в контексте
-- владельца, grant не важен) и возвращают только boolean, поэтому риск низкий.
-- Полное закрытие требует REVOKE EXECUTE ... FROM PUBLIC + повторный явный
-- GRANT authenticated, service_role по каждой — делать отдельной сессией со
-- смоком (сохранив anon у 4 резолверов коротких ссылок: resolve_short_id,
-- resolve_workspace_by_host, get_short_id_by_uuid, get_workspace_slug_by_id).
