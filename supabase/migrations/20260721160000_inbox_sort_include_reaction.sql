-- Реакция поднимает чат вверх в инбоксе (раньше в сортировку не входила).
--
-- Симптом: чат с непрочитанной реакцией показывал ВРЕМЯ реакции (напр. 20:37),
-- но стоял на позиции последнего СООБЩЕНИЯ (старее) → «время не совпадает с
-- позицией». Причина: сортировка везде = GREATEST(last_message_at, last_event_at),
-- реакция игнорировалась.
--
-- Делать ПОСЛЕ фикса идемпотентного синка реакций (_shared/syncTelegramReactions.ts),
-- иначе перепрыгивающее вперёд created_at реакции дёргало бы чаты вверх без причины.
--
-- 1) Глобальный sort_at (вкладка «Все», keyset get_inbox_threads_page) —
--    добавляем время последней реакции (v_lr.created_at) в GREATEST.
-- 2) Вкладка «Непрочитанные» (get_inbox_unread_threads_impl) — добавляем время
--    реакции, но ТОЛЬКО если она непрочитана мне (has_unread_reaction), чтобы
--    уже прочитанная реакция не держала чат наверху.
--
-- Применено в прод через MCP; тело compute снято с прода (drift). Точечный
-- replace + маркер-проверка: если на fresh-apply подстрока не найдётся (дрейф),
-- RAISE вместо тихого промаха.

DO $$
DECLARE def text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO def FROM pg_proc WHERE proname = 'compute_thread_inbox_meta';
  def := replace(
    def,
    'GREATEST(v_lm.created_at, v_le.created_at), v_thread.created_at), now()',
    'GREATEST(v_lm.created_at, v_le.created_at, v_lr.created_at), v_thread.created_at), now()'
  );
  EXECUTE def;
  IF position('GREATEST(v_lm.created_at, v_le.created_at, v_lr.created_at)' IN
       (SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'compute_thread_inbox_meta')) = 0 THEN
    RAISE EXCEPTION 'compute_thread_inbox_meta: sort_at reaction marker not applied (drift?)';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_inbox_unread_threads_impl(p_workspace_id uuid, p_user_id uuid)
 RETURNS TABLE(thread_id uuid, thread_name text, thread_icon text, thread_accent_color text, thread_type text, project_id uuid, project_name text, channel_type text, legacy_channel text, last_message_at timestamp with time zone, last_message_text text, last_message_attachment_name text, last_message_attachment_count integer, last_message_attachment_mime text, last_sender_name text, last_sender_avatar_url text, unread_count bigint, manually_unread boolean, has_unread_reaction boolean, unread_reaction_count bigint, last_reaction_emoji text, last_reaction_at timestamp with time zone, last_reaction_sender_name text, last_reaction_sender_avatar_url text, last_reaction_message_preview text, email_contact text, email_subject text, last_event_at timestamp with time zone, last_event_text text, last_event_status_color text, unread_event_count bigint, counterpart_name text, counterpart_avatar_url text, last_read_at timestamp with time zone, last_event_sender_avatar_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT v.* FROM get_inbox_threads_v3_for(p_workspace_id, p_user_id, ARRAY(
    SELECT us.thread_id FROM thread_unread_state us
    WHERE us.participant_id = (SELECT id FROM participants WHERE workspace_id = p_workspace_id AND user_id = p_user_id AND is_deleted = false LIMIT 1)
      AND (us.unread_count > 0 OR us.unread_event_count > 0 OR us.unread_reaction_count > 0 OR us.has_unread_reaction = true OR us.manually_unread = true)
  )) v
  ORDER BY GREATEST(
             COALESCE(v.last_message_at, 'epoch'::timestamptz),
             COALESCE(v.last_event_at, 'epoch'::timestamptz),
             CASE WHEN COALESCE(v.manually_unread, false)
                  THEN COALESCE(v.last_read_at, 'epoch'::timestamptz)
                  ELSE 'epoch'::timestamptz END,
             CASE WHEN COALESCE(v.has_unread_reaction, false)
                  THEN COALESCE(v.last_reaction_at, 'epoch'::timestamptz)
                  ELSE 'epoch'::timestamptz END
           ) DESC,
           v.thread_id DESC;
$function$;

-- Разовый пересчёт уже отреагированных тредов, чтобы они встали по времени
-- реакции сразу (иначе sort_at обновится только при следующей активности).
SELECT compute_thread_inbox_meta(thread_id)
FROM thread_inbox_meta
WHERE last_reaction_at IS NOT NULL
  AND last_reaction_at > GREATEST(COALESCE(last_message_at, 'epoch'::timestamptz), COALESCE(last_event_at, 'epoch'::timestamptz));
