-- Фаза 1+: управление подписчиками треда (владелец/менеджеры).
-- get_thread_subscribers — эффективная подписка по всем доступным участникам треда.
-- set_thread_subscription_for — поставить подписку за участника. Право: сам участник
-- ЛИБО владелец/менеджер (manage_workspace_settings) воркспейса треда.
-- Конфликт «менеджер vs сам» решается upsert'ом одной строки — последнее действие
-- побеждает. Триггер thread_unread_on_subscription пересчитывает непрочитанное.

CREATE OR REPLACE FUNCTION public.get_thread_subscribers(p_thread_id uuid)
RETURNS TABLE(participant_id uuid, subscribed boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT a.participant_id, is_thread_subscribed(a.participant_id, p_thread_id)
  FROM inbox_accessible_participant_ids(p_thread_id) a
  WHERE can_user_access_thread(p_thread_id, (SELECT auth.uid()));
$function$;

CREATE OR REPLACE FUNCTION public.set_thread_subscription_for(
  p_thread_id uuid, p_participant_id uuid, p_subscribed boolean
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_ws uuid; v_authorized boolean;
BEGIN
  SELECT workspace_id INTO v_ws FROM project_threads WHERE id = p_thread_id AND is_deleted = false;
  IF v_ws IS NULL THEN RAISE EXCEPTION 'thread not found'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM participants WHERE id = p_participant_id AND workspace_id = v_ws AND is_deleted = false
  ) THEN
    RAISE EXCEPTION 'participant not in workspace';
  END IF;

  -- Право: сам участник ИЛИ владелец/менеджер (manage_workspace_settings).
  v_authorized :=
    EXISTS (SELECT 1 FROM participants WHERE id = p_participant_id AND user_id = (SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM participants p
      JOIN workspace_roles wr ON wr.name = ANY(p.workspace_roles) AND wr.workspace_id = p.workspace_id
      WHERE p.workspace_id = v_ws AND p.user_id = (SELECT auth.uid()) AND p.is_deleted = false
        AND (wr.is_owner OR (wr.permissions->>'manage_workspace_settings')::boolean)
    );
  IF NOT v_authorized THEN RAISE EXCEPTION 'not authorized'; END IF;

  INSERT INTO project_thread_subscriptions (thread_id, participant_id, state, source)
  VALUES (p_thread_id, p_participant_id, CASE WHEN p_subscribed THEN 'subscribed' ELSE 'muted' END, 'manual')
  ON CONFLICT (thread_id, participant_id)
  DO UPDATE SET state = EXCLUDED.state, source = 'manual', updated_at = now();

  RETURN p_subscribed;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_thread_subscribers(uuid) FROM public;
REVOKE ALL ON FUNCTION public.set_thread_subscription_for(uuid, uuid, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.get_thread_subscribers(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_thread_subscription_for(uuid, uuid, boolean) TO authenticated, service_role;
