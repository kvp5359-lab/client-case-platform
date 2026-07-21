-- Глобальный поиск и «Недавнее» отдают thread_icon (project_threads.icon),
-- чтобы дропдаун рисовал иконку КАНАЛА треда (Telegram → самолётик, WhatsApp,
-- Email), а не generic-облачко. Смена RETURNS TABLE → DROP+CREATE. Гранты
-- (public → anon/authenticated/service_role) восстанавливаются default-ом при
-- CREATE (совпадает с прежним состоянием). SECURITY INVOKER (RLS вызывающего).
--
-- Тела применены в прод через MCP, зафиксированы в репо. Секретов нет.

DROP FUNCTION IF EXISTS public.get_recently_viewed(uuid, integer);
CREATE FUNCTION public.get_recently_viewed(p_workspace_id uuid, p_limit integer DEFAULT 20)
 RETURNS TABLE(entity_type text, entity_id uuid, title text, subtitle text, project_id uuid, thread_type text, accent_color text, project_template_id uuid, project_status_id uuid, thread_icon text, opened_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT rv.entity_type, rv.entity_id, rv.opened_at
    FROM public.recently_viewed rv
    WHERE rv.user_id = (SELECT auth.uid())
      AND rv.workspace_id = p_workspace_id
    ORDER BY rv.opened_at DESC
    LIMIT p_limit * 3
  )
  SELECT
    'thread'::text, t.id, t.name, p.name,
    t.project_id, t.type, t.accent_color, p.template_id, p.status_id, t.icon, b.opened_at
  FROM base b
  JOIN public.project_threads t ON t.id = b.entity_id AND b.entity_type = 'thread'
  LEFT JOIN public.projects p ON p.id = t.project_id
  WHERE t.is_deleted = false
    AND t.workspace_id = p_workspace_id

  UNION ALL

  SELECT
    'project'::text, pr.id, pr.name, NULL,
    pr.id, NULL, NULL::text, pr.template_id, pr.status_id, NULL::text, b.opened_at
  FROM base b
  JOIN public.projects pr ON pr.id = b.entity_id AND b.entity_type = 'project'
  WHERE pr.is_deleted = false
    AND pr.workspace_id = p_workspace_id

  UNION ALL

  SELECT
    'knowledge_article'::text, ka.id, ka.title, ka.summary,
    NULL, NULL, NULL::text, NULL::uuid, NULL::uuid, NULL::text, b.opened_at
  FROM base b
  JOIN public.knowledge_articles ka ON ka.id = b.entity_id AND b.entity_type = 'knowledge_article'
  WHERE ka.workspace_id = p_workspace_id

  UNION ALL

  SELECT
    'participant'::text, pa.id,
    trim(coalesce(pa.name, '') || ' ' || coalesce(pa.last_name, '')),
    coalesce(pa.email, pa.phone),
    NULL, NULL, NULL::text, NULL::uuid, NULL::uuid, NULL::text, b.opened_at
  FROM base b
  JOIN public.participants pa ON pa.id = b.entity_id AND b.entity_type = 'participant'
  WHERE pa.is_deleted = false
    AND pa.workspace_id = p_workspace_id

  ORDER BY opened_at DESC
  LIMIT p_limit;
$function$;

DROP FUNCTION IF EXISTS public.global_search(uuid, text, integer);
CREATE FUNCTION public.global_search(p_workspace_id uuid, p_query text, p_limit integer DEFAULT 8)
 RETURNS TABLE(entity_type text, entity_id uuid, title text, subtitle text, snippet text, rank real, project_id uuid, thread_type text, thread_id uuid, accent_color text, project_template_id uuid, project_status_id uuid, thread_icon text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_query text := trim(coalesce(p_query, ''));
  v_ts    tsquery;
  v_thr   real := 0.4;
BEGIN
  IF length(v_query) < 2 THEN
    RETURN;
  END IF;

  v_ts := websearch_to_tsquery('russian', v_query);

  RETURN QUERY
  SELECT
    'thread'::text, t.id, t.name, p.name, NULL::text,
    GREATEST(ts_rank(t.search_vector, v_ts), word_similarity(v_query, coalesce(t.name, '')))::real AS r,
    t.project_id, t.type, t.id, t.accent_color, p.template_id, p.status_id, t.icon
  FROM public.project_threads t
  LEFT JOIN public.projects p ON p.id = t.project_id
  WHERE t.workspace_id = p_workspace_id
    AND t.is_deleted = false
    AND (t.search_vector @@ v_ts OR word_similarity(v_query, coalesce(t.name, '')) > v_thr)
  ORDER BY r DESC
  LIMIT p_limit;

  RETURN QUERY
  SELECT
    'project'::text, pr.id, pr.name, NULL::text, NULL::text,
    GREATEST(ts_rank(pr.search_vector, v_ts), word_similarity(v_query, coalesce(pr.name, '')))::real AS r,
    pr.id, NULL::text, NULL::uuid, NULL::text, pr.template_id, pr.status_id, NULL::text
  FROM public.projects pr
  WHERE pr.workspace_id = p_workspace_id
    AND pr.is_deleted = false
    AND (pr.search_vector @@ v_ts OR word_similarity(v_query, coalesce(pr.name, '')) > v_thr)
  ORDER BY r DESC
  LIMIT p_limit;

  RETURN QUERY
  SELECT
    'knowledge_article'::text, ka.id, ka.title, ka.summary,
    ts_headline('russian',
      coalesce(regexp_replace(ka.content, '<[^>]+>', ' ', 'g'), ''),
      v_ts,
      'MaxFragments=1,MinWords=3,MaxWords=15,ShortWord=2,HighlightAll=false,StartSel=<mark>,StopSel=</mark>'
    ),
    GREATEST(ts_rank(ka.search_vector, v_ts), word_similarity(v_query, coalesce(ka.title, '')))::real AS r,
    NULL::uuid, NULL::text, NULL::uuid, NULL::text, NULL::uuid, NULL::uuid, NULL::text
  FROM public.knowledge_articles ka
  WHERE ka.workspace_id = p_workspace_id
    AND (ka.search_vector @@ v_ts OR word_similarity(v_query, coalesce(ka.title, '')) > v_thr)
  ORDER BY r DESC
  LIMIT p_limit;

  RETURN QUERY
  SELECT
    'participant'::text, pa.id,
    trim(coalesce(pa.name, '') || ' ' || coalesce(pa.last_name, '')),
    coalesce(pa.email, pa.phone),
    NULL::text,
    GREATEST(
      ts_rank(pa.search_vector, v_ts),
      word_similarity(v_query, coalesce(pa.name, '') || ' ' || coalesce(pa.last_name, ''))
    )::real AS r,
    NULL::uuid, NULL::text, NULL::uuid, NULL::text, NULL::uuid, NULL::uuid, NULL::text
  FROM public.participants pa
  WHERE pa.workspace_id = p_workspace_id
    AND pa.is_deleted = false
    AND (
      pa.search_vector @@ v_ts
      OR word_similarity(v_query, coalesce(pa.name, '') || ' ' || coalesce(pa.last_name, '')) > v_thr
      OR (pa.email IS NOT NULL AND pa.email ILIKE '%' || v_query || '%')
      OR (pa.phone IS NOT NULL AND pa.phone ILIKE '%' || v_query || '%')
    )
  ORDER BY r DESC
  LIMIT p_limit;

  RETURN QUERY
  SELECT
    'message'::text, m.id, t.name, p.name,
    ts_headline('russian',
      coalesce(regexp_replace(m.content, '<[^>]+>', ' ', 'g'), ''),
      v_ts,
      'MaxFragments=1,MinWords=3,MaxWords=15,ShortWord=2,HighlightAll=false,StartSel=<mark>,StopSel=</mark>'
    ),
    ts_rank(m.search_vector, v_ts)::real AS r,
    m.project_id, t.type, m.thread_id, t.accent_color, p.template_id, p.status_id, t.icon
  FROM public.project_messages m
  JOIN public.project_threads t ON t.id = m.thread_id AND t.is_deleted = false
  LEFT JOIN public.projects p ON p.id = m.project_id
  WHERE m.workspace_id = p_workspace_id
    AND m.search_vector @@ v_ts
  ORDER BY r DESC
  LIMIT p_limit;
END;
$function$;
