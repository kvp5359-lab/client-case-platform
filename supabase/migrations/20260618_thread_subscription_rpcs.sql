-- Фаза 1 (фронт-доступ): RPC чтения/переключения подписки текущим пользователем.
-- is_thread_subscribed_me — эффективная подписка (оверрайд → дефолт) для моего participant.
-- set_my_thread_subscription — явно подписаться/отписаться (пишет оверрайд).
-- Триггер thread_unread_on_subscription пересчитает непрочитанное автоматически.

CREATE OR REPLACE FUNCTION public.is_thread_subscribed_me(p_thread_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_pid uuid; v_ws uuid;
BEGIN
  SELECT workspace_id INTO v_ws FROM project_threads WHERE id = p_thread_id AND is_deleted = false;
  IF v_ws IS NULL THEN RETURN NULL; END IF;
  SELECT id INTO v_pid FROM participants
    WHERE workspace_id = v_ws AND user_id = (SELECT auth.uid()) AND is_deleted = false LIMIT 1;
  IF v_pid IS NULL THEN RETURN NULL; END IF;
  RETURN is_thread_subscribed(v_pid, p_thread_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_my_thread_subscription(p_thread_id uuid, p_subscribed boolean)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_pid uuid; v_ws uuid;
BEGIN
  SELECT workspace_id INTO v_ws FROM project_threads WHERE id = p_thread_id AND is_deleted = false;
  IF v_ws IS NULL THEN RAISE EXCEPTION 'thread not found'; END IF;
  SELECT id INTO v_pid FROM participants
    WHERE workspace_id = v_ws AND user_id = (SELECT auth.uid()) AND is_deleted = false LIMIT 1;
  IF v_pid IS NULL THEN RAISE EXCEPTION 'participant not found'; END IF;

  INSERT INTO project_thread_subscriptions (thread_id, participant_id, state, source)
  VALUES (p_thread_id, v_pid, CASE WHEN p_subscribed THEN 'subscribed' ELSE 'muted' END, 'manual')
  ON CONFLICT (thread_id, participant_id)
  DO UPDATE SET state = EXCLUDED.state, source = 'manual', updated_at = now();

  RETURN p_subscribed;
END;
$function$;

REVOKE ALL ON FUNCTION public.is_thread_subscribed_me(uuid) FROM public;
REVOKE ALL ON FUNCTION public.set_my_thread_subscription(uuid, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.is_thread_subscribed_me(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_my_thread_subscription(uuid, boolean) TO authenticated, service_role;
