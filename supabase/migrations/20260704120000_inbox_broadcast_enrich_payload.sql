-- Аудит 2026-07-04, корзина C — миграция realtime мессенджера на Broadcast (шаг A).
--
-- Обогащаем payload триггера trg_inbox_broadcast полями thread_id / message_id /
-- op / has_attachments, чтобы живая лента открытого чата (useProjectMessages) и
-- тост нового сообщения (useNewMessageToast) могли перейти с Postgres Changes на
-- Broadcast. Цель — снять таблицу project_messages с прямого слежения realtime
-- (главный источник WAL-нагрузки, ~63% времени БД).
--
-- ⚠️ ДОБАВОЧНАЯ правка: старые поля payload (project_id, tbl) сохранены, поэтому
-- существующий потребитель useWorkspaceMessagesRealtime («Входящие») не затронут —
-- он читает только project_id, лишние поля игнорирует. Тело функции обёрнуто в
-- EXCEPTION WHEN OTHERS THEN NULL → на доставку сообщений влиять не может.
--
-- Само переключение фронта (useProjectMessages/useNewMessageToast) и снятие
-- project_messages с publication делаются ОТДЕЛЬНО, со смок-тестом всех каналов
-- на живой БД (см. docs/audit/2026-07-04-realtime-broadcast-migration.md).

CREATE OR REPLACE FUNCTION public.trg_inbox_broadcast()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_ws uuid; v_project uuid; v_thread uuid; v_msg uuid; v_has_attach boolean := false;
BEGIN
  BEGIN
    IF TG_TABLE_NAME = 'project_messages' THEN
      v_ws := COALESCE(NEW.workspace_id, OLD.workspace_id);
      v_project := COALESCE(NEW.project_id, OLD.project_id);
      v_thread := COALESCE(NEW.thread_id, OLD.thread_id);
      v_msg := COALESCE(NEW.id, OLD.id);
      v_has_attach := COALESCE(NEW.has_attachments, false);
    ELSIF TG_TABLE_NAME = 'project_threads' THEN
      v_ws := COALESCE(NEW.workspace_id, OLD.workspace_id);
      v_project := COALESCE(NEW.project_id, OLD.project_id);
      v_thread := COALESCE(NEW.id, OLD.id);
    ELSIF TG_TABLE_NAME = 'message_reactions' THEN
      SELECT pt.workspace_id, pt.project_id, pt.id INTO v_ws, v_project, v_thread
      FROM project_messages pm JOIN project_threads pt ON pt.id = pm.thread_id
      WHERE pm.id = COALESCE(NEW.message_id, OLD.message_id);
    END IF;
    IF v_ws IS NOT NULL THEN
      PERFORM realtime.send(
        jsonb_build_object(
          'project_id', v_project,
          'tbl', TG_TABLE_NAME,
          'thread_id', v_thread,
          'message_id', v_msg,
          'op', TG_OP,
          'has_attachments', v_has_attach
        ),
        'inbox_changed',
        'inbox:' || v_ws::text,
        true
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN NULL;
END;
$function$;
