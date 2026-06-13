-- FIX (регрессия 2026-06-12): вернуть anon EXECUTE на два middleware-резолвера
-- коротких ссылок. REVOKE-волна аудита безопасности 2026-06-12 (этап 1) сняла
-- anon-EXECUTE заодно с этих двух функций, которые Next-middleware (src/proxy.ts
-- → src/lib/middleware/resolvers.ts) вызывает под ANON-ключом (не пользовательским).
--
-- Симптом: короткие ссылки `/boards/<n>` и `/projects/<n>` на поддоменах
-- (<slug>.clientcase.app) отдавали `boards not found` / `projects not found`
-- (text/plain 404 из proxy.ts), потому что callRpc получал 403 → null. Сломано
-- с 12 июня. resolve_workspace_by_host / get_workspace_slug_by_id (тоже зовутся
-- из middleware под anon) грант сохранили — поэтому корень домена работал.
--
-- Безопасность: обе функции — резолв URL (short_id ↔ UUID), возвращают только
-- идентификатор; доступ к самим данным по-прежнему гейтится RLS при загрузке
-- страницы. Класс безопасности тот же, что у оставшегося anon-доступного
-- resolve_workspace_by_host. Возврат гранта корректен.

GRANT EXECUTE ON FUNCTION public.resolve_short_id(p_workspace_id uuid, p_entity_type text, p_short_id integer) TO anon;
GRANT EXECUTE ON FUNCTION public.get_short_id_by_uuid(p_entity_type text, p_uuid uuid) TO anon;
