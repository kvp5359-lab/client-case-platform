-- Расширенная статистика ресурсов воркспейса для раздела «Использование»
-- в настройках. Дополняет get_workspace_usage_and_limits (тариф/лимиты/хранилище).
-- SECURITY DEFINER + гейт по участию (как usage-RPC). Только authenticated/service_role.

CREATE OR REPLACE FUNCTION public.get_workspace_stats(p_workspace_id uuid)
RETURNS TABLE(
  team_members integer,
  contacts integer,
  projects integer,
  threads_total integer,
  tasks_count integer,
  chats_count integer,
  emails_count integer,
  messages_total bigint,
  messages_month bigint,
  documents_count integer,
  telegram_integrations integer,
  wazzup_channels integer,
  email_accounts integer,
  mtproto_sessions integer
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    (SELECT count(*)::int  FROM participants p     WHERE p.workspace_id=p_workspace_id AND p.is_deleted=false AND p.user_id IS NOT NULL),
    (SELECT count(*)::int  FROM participants p     WHERE p.workspace_id=p_workspace_id AND p.is_deleted=false AND p.user_id IS NULL),
    (SELECT count(*)::int  FROM projects pr        WHERE pr.workspace_id=p_workspace_id AND pr.is_deleted=false),
    (SELECT count(*)::int  FROM project_threads t  WHERE t.workspace_id=p_workspace_id AND t.is_deleted=false),
    (SELECT count(*)::int  FROM project_threads t  WHERE t.workspace_id=p_workspace_id AND t.is_deleted=false AND t.type='task'),
    (SELECT count(*)::int  FROM project_threads t  WHERE t.workspace_id=p_workspace_id AND t.is_deleted=false AND t.type='chat'),
    (SELECT count(*)::int  FROM project_threads t  WHERE t.workspace_id=p_workspace_id AND t.is_deleted=false AND t.type='email'),
    (SELECT count(*)::bigint FROM project_messages m WHERE m.workspace_id=p_workspace_id AND COALESCE(m.is_deleted,false)=false),
    (SELECT count(*)::bigint FROM project_messages m WHERE m.workspace_id=p_workspace_id AND COALESCE(m.is_deleted,false)=false AND m.created_at >= date_trunc('month', now())),
    (SELECT count(*)::int  FROM documents d         WHERE d.workspace_id=p_workspace_id AND COALESCE(d.is_deleted,false)=false),
    (SELECT count(*)::int  FROM workspace_integrations wi WHERE wi.workspace_id=p_workspace_id AND wi.is_active=true AND wi.type LIKE 'telegram%'),
    (SELECT count(*)::int  FROM wazzup_channels wc  WHERE wc.workspace_id=p_workspace_id AND wc.is_active=true),
    (SELECT count(*)::int  FROM email_accounts ea   WHERE ea.workspace_id=p_workspace_id AND ea.is_active=true),
    (SELECT count(*)::int  FROM telegram_mtproto_sessions ms WHERE ms.workspace_id=p_workspace_id AND ms.is_active=true)
  WHERE is_workspace_participant(p_workspace_id, (SELECT auth.uid()));
$function$;

REVOKE ALL ON FUNCTION public.get_workspace_stats(uuid) FROM public;
REVOKE ALL ON FUNCTION public.get_workspace_stats(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_workspace_stats(uuid) TO authenticated, service_role;
