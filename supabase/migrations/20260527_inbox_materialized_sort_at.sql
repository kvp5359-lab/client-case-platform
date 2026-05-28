-- inbox_sort_at: денормализованная колонка для O(1) пагинации инбокса.
--
-- Хранит MAX(created_at) среди сообщений + audit-событий треда, с fallback на created_at треда.
-- Поддерживается двумя триггерами: AFTER INSERT на project_messages и audit_logs.
-- Триггеры защищены EXCEPTION WHEN OTHERS — даже если функция упадёт, основная
-- вставка сообщения/события НЕ откатится (карантинная зона мессенджера).
--
-- Сам RPC `get_inbox_threads_page` обновлён с приоритетом на inbox_sort_at:
--   COALESCE(pt.inbox_sort_at, GREATEST(t.last_message_at, t.last_event_at), pt.created_at)
-- Так что если триггер не сработал для какого-то треда — fallback на старый расчёт.

-- 1. Колонка (NULLABLE — fallback логика выше).
ALTER TABLE public.project_threads
  ADD COLUMN IF NOT EXISTS inbox_sort_at timestamptz;

COMMENT ON COLUMN public.project_threads.inbox_sort_at IS
  'Денормализованное MAX(created_at сообщений и audit-событий) + fallback на created_at. Триггеры обновляют автоматически.';

-- 2. Триггер на project_messages: при INSERT обновляет inbox_sort_at треда,
-- если новое время больше текущего. EXCEPTION WHEN OTHERS гарантирует,
-- что ошибка не откатит вставку сообщения.
CREATE OR REPLACE FUNCTION public.tg_update_inbox_sort_at_from_message()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.thread_id IS NOT NULL AND NEW.source IS DISTINCT FROM 'telegram_service'::message_source THEN
    UPDATE public.project_threads
    SET inbox_sort_at = GREATEST(COALESCE(inbox_sort_at, NEW.created_at), NEW.created_at)
    WHERE id = NEW.thread_id;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'tg_update_inbox_sort_at_from_message failed for thread %: % (SQLSTATE %)',
    NEW.thread_id, SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_inbox_sort_at_from_message ON public.project_messages;
CREATE TRIGGER trg_update_inbox_sort_at_from_message
AFTER INSERT ON public.project_messages
FOR EACH ROW
EXECUTE FUNCTION public.tg_update_inbox_sort_at_from_message();

-- 3. Триггер на audit_logs: для resource_type IN ('task','thread') обновляет inbox_sort_at.
CREATE OR REPLACE FUNCTION public.tg_update_inbox_sort_at_from_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.resource_type IN ('task', 'thread') AND NEW.resource_id IS NOT NULL THEN
    UPDATE public.project_threads
    SET inbox_sort_at = GREATEST(COALESCE(inbox_sort_at, NEW.created_at), NEW.created_at)
    WHERE id = NEW.resource_id;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'tg_update_inbox_sort_at_from_audit failed for resource %: % (SQLSTATE %)',
    NEW.resource_id, SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_inbox_sort_at_from_audit ON public.audit_logs;
CREATE TRIGGER trg_update_inbox_sort_at_from_audit
AFTER INSERT ON public.audit_logs
FOR EACH ROW
EXECUTE FUNCTION public.tg_update_inbox_sort_at_from_audit();

-- 4. Backfill: посчитать inbox_sort_at для всех существующих тредов.
UPDATE public.project_threads pt
SET inbox_sort_at = COALESCE(
  GREATEST(
    (SELECT MAX(pm.created_at) FROM public.project_messages pm
     WHERE pm.thread_id = pt.id AND pm.source IS DISTINCT FROM 'telegram_service'::message_source),
    (SELECT MAX(al.created_at) FROM public.audit_logs al
     WHERE al.resource_id = pt.id AND al.resource_type IN ('task', 'thread'))
  ),
  pt.created_at
)
WHERE pt.is_deleted = false AND pt.inbox_sort_at IS NULL;

-- 5. Partial index под точный keyset-порядок пагинации.
CREATE INDEX IF NOT EXISTS idx_project_threads_inbox_sort_at
  ON public.project_threads (workspace_id, inbox_sort_at DESC, id DESC)
  WHERE is_deleted = false;

-- 6. Обновляем get_inbox_threads_page — приоритет на inbox_sort_at, fallback оставляем.
-- Это даёт корректность данных сразу (через триггеры), и Index Scan станет доступен
-- когда RPC будет переписан с прямой пагинацией по project_threads (отдельная задача).
CREATE OR REPLACE FUNCTION public.get_inbox_threads_page(
  p_workspace_id uuid,
  p_user_id uuid,
  p_cursor_sort_at timestamptz DEFAULT NULL,
  p_cursor_thread_id uuid DEFAULT NULL,
  p_limit int DEFAULT 50
)
RETURNS TABLE(
  thread_id uuid,
  thread_name text,
  thread_icon text,
  thread_accent_color text,
  thread_type text,
  project_id uuid,
  project_name text,
  channel_type text,
  legacy_channel text,
  last_message_at timestamptz,
  last_message_text text,
  last_message_attachment_name text,
  last_message_attachment_count integer,
  last_message_attachment_mime text,
  last_sender_name text,
  last_sender_avatar_url text,
  unread_count bigint,
  manually_unread boolean,
  has_unread_reaction boolean,
  unread_reaction_count bigint,
  last_reaction_emoji text,
  last_reaction_at timestamptz,
  last_reaction_sender_name text,
  last_reaction_sender_avatar_url text,
  last_reaction_message_preview text,
  email_contact text,
  email_subject text,
  last_event_at timestamptz,
  last_event_text text,
  last_event_status_color text,
  unread_event_count bigint,
  counterpart_name text,
  counterpart_avatar_url text,
  last_read_at timestamptz,
  sort_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH full_result AS (
    SELECT
      t.*,
      -- Приоритет: materialized inbox_sort_at (обновляется триггерами),
      -- fallback на старый расчёт через GREATEST + created_at если колонка ещё NULL.
      COALESCE(
        pt_meta.inbox_sort_at,
        GREATEST(t.last_message_at, t.last_event_at),
        pt_meta.created_at
      ) AS sort_at
    FROM get_inbox_threads_v2(p_workspace_id, p_user_id) t
    LEFT JOIN project_threads pt_meta ON pt_meta.id = t.thread_id
  ),
  main_page AS (
    SELECT *
    FROM full_result
    WHERE p_cursor_sort_at IS NULL
       OR (sort_at, thread_id) < (p_cursor_sort_at, p_cursor_thread_id)
    ORDER BY sort_at DESC, thread_id DESC
    LIMIT GREATEST(p_limit, 1)
  ),
  manual_unread_extras AS (
    SELECT *
    FROM full_result
    WHERE p_cursor_sort_at IS NULL
      AND manually_unread = true
  )
  SELECT *
  FROM (
    SELECT * FROM main_page
    UNION
    SELECT * FROM manual_unread_extras
  ) AS combined
  ORDER BY sort_at DESC, thread_id DESC;
$function$;
