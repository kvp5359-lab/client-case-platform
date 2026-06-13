-- Аудит 2026-06-13: 9 функций без фиксированного search_path (advisors 0011).
-- ALTER SET search_path — не меняет логику, закрывает варнинг. Применено через MCP.
ALTER FUNCTION public._board_compile_condition(jsonb, text) SET search_path TO 'public';
ALTER FUNCTION public._board_compile_group(jsonb, text) SET search_path TO 'public';
ALTER FUNCTION public._board_filter_text_list(jsonb) SET search_path TO 'public';
ALTER FUNCTION public._board_filter_uuid_list(jsonb) SET search_path TO 'public';
ALTER FUNCTION public._board_value_has_sentinel(jsonb, text) SET search_path TO 'public';
ALTER FUNCTION public.set_initial_send_status() SET search_path TO 'public';
ALTER FUNCTION public.tg_update_inbox_sort_at_from_audit() SET search_path TO 'public';
ALTER FUNCTION public.tg_update_inbox_sort_at_from_message() SET search_path TO 'public';
ALTER FUNCTION public.today_madrid_midnight() SET search_path TO 'public';
