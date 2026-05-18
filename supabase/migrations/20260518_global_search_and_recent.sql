-- Global search (FTS + pg_trgm) and recently viewed list
-- 2026-05-18

-- ============================================================================
-- 1. Extensions
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- ============================================================================
-- 2. Search vectors (generated columns) + GIN indexes
--    Russian FTS config + trigram for fuzzy/prefix on display names.
-- ============================================================================

-- project_threads: name (A) + description (B)
ALTER TABLE public.project_threads
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('russian', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('russian', coalesce(description, '')), 'B')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_project_threads_search
  ON public.project_threads USING gin(search_vector);

CREATE INDEX IF NOT EXISTS idx_project_threads_name_trgm
  ON public.project_threads USING gin(name gin_trgm_ops)
  WHERE is_deleted = false;

-- projects: name (A) + description (B)
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('russian', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('russian', coalesce(description, '')), 'B')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_projects_search
  ON public.projects USING gin(search_vector);

CREATE INDEX IF NOT EXISTS idx_projects_name_trgm
  ON public.projects USING gin(name gin_trgm_ops)
  WHERE is_deleted = false;

-- knowledge_articles: title (A) + summary (B) + stripped HTML content (C)
ALTER TABLE public.knowledge_articles
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('russian', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('russian', coalesce(summary, '')), 'B') ||
    setweight(to_tsvector('russian', coalesce(regexp_replace(content, '<[^>]+>', ' ', 'g'), '')), 'C')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_knowledge_articles_search
  ON public.knowledge_articles USING gin(search_vector);

CREATE INDEX IF NOT EXISTS idx_knowledge_articles_title_trgm
  ON public.knowledge_articles USING gin(title gin_trgm_ops);

-- participants: name/last_name/email/phone — 'simple' config (имена/email лучше
-- без морфологии), notes — russian.
ALTER TABLE public.participants
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple',
      coalesce(name, '') || ' ' ||
      coalesce(last_name, '') || ' ' ||
      coalesce(email, '') || ' ' ||
      coalesce(phone, '')
    ), 'A') ||
    setweight(to_tsvector('russian', coalesce(notes, '')), 'C')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_participants_search
  ON public.participants USING gin(search_vector);

CREATE INDEX IF NOT EXISTS idx_participants_name_trgm
  ON public.participants USING gin (
    (coalesce(name, '') || ' ' || coalesce(last_name, '') || ' ' || coalesce(email, '')) gin_trgm_ops
  )
  WHERE is_deleted = false;

-- project_messages: только тело (для поиска по переписке).
ALTER TABLE public.project_messages
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('russian', coalesce(regexp_replace(content, '<[^>]+>', ' ', 'g'), ''))
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_project_messages_search
  ON public.project_messages USING gin(search_vector);

-- ============================================================================
-- 3. recently_viewed table
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE public.recent_entity_type AS ENUM ('thread', 'project', 'knowledge_article', 'participant');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.recently_viewed (
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  entity_type  public.recent_entity_type NOT NULL,
  entity_id    uuid NOT NULL,
  opened_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, workspace_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_recently_viewed_lookup
  ON public.recently_viewed (user_id, workspace_id, opened_at DESC);

ALTER TABLE public.recently_viewed ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS recently_viewed_select_own ON public.recently_viewed;
CREATE POLICY recently_viewed_select_own ON public.recently_viewed
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS recently_viewed_insert_own ON public.recently_viewed;
CREATE POLICY recently_viewed_insert_own ON public.recently_viewed
  FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS recently_viewed_update_own ON public.recently_viewed;
CREATE POLICY recently_viewed_update_own ON public.recently_viewed
  FOR UPDATE TO authenticated USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS recently_viewed_delete_own ON public.recently_viewed;
CREATE POLICY recently_viewed_delete_own ON public.recently_viewed
  FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));

-- ============================================================================
-- 4. RPC: track_recent_view  (UPSERT opened_at для конкретной сущности)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.track_recent_view(
  p_workspace_id uuid,
  p_entity_type  public.recent_entity_type,
  p_entity_id    uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user uuid := (SELECT auth.uid());
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  INSERT INTO public.recently_viewed (user_id, workspace_id, entity_type, entity_id, opened_at)
  VALUES (v_user, p_workspace_id, p_entity_type, p_entity_id, now())
  ON CONFLICT (user_id, workspace_id, entity_type, entity_id)
  DO UPDATE SET opened_at = EXCLUDED.opened_at;

  -- держим максимум 100 записей на (user, workspace) — обрезаем хвост
  DELETE FROM public.recently_viewed
  WHERE user_id = v_user
    AND workspace_id = p_workspace_id
    AND (entity_type, entity_id) NOT IN (
      SELECT entity_type, entity_id
      FROM public.recently_viewed
      WHERE user_id = v_user AND workspace_id = p_workspace_id
      ORDER BY opened_at DESC
      LIMIT 100
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.track_recent_view(uuid, public.recent_entity_type, uuid) TO authenticated;

-- ============================================================================
-- 5. RPC: get_recently_viewed (резолвит сущности с фильтром is_deleted)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_recently_viewed(
  p_workspace_id uuid,
  p_limit int DEFAULT 20
) RETURNS TABLE (
  entity_type   text,
  entity_id     uuid,
  title         text,
  subtitle      text,
  project_id    uuid,
  thread_type   text,
  opened_at     timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH base AS (
    SELECT rv.entity_type, rv.entity_id, rv.opened_at
    FROM public.recently_viewed rv
    WHERE rv.user_id = (SELECT auth.uid())
      AND rv.workspace_id = p_workspace_id
    ORDER BY rv.opened_at DESC
    LIMIT p_limit * 3  -- запас, чтобы после фильтра is_deleted осталось достаточно
  )
  SELECT
    'thread'::text,
    t.id,
    t.name,
    p.name,
    t.project_id,
    t.type,
    b.opened_at
  FROM base b
  JOIN public.project_threads t ON t.id = b.entity_id AND b.entity_type = 'thread'
  LEFT JOIN public.projects p ON p.id = t.project_id
  WHERE t.is_deleted = false
    AND t.workspace_id = p_workspace_id

  UNION ALL

  SELECT
    'project'::text,
    pr.id,
    pr.name,
    NULL,
    pr.id,
    NULL,
    b.opened_at
  FROM base b
  JOIN public.projects pr ON pr.id = b.entity_id AND b.entity_type = 'project'
  WHERE pr.is_deleted = false
    AND pr.workspace_id = p_workspace_id

  UNION ALL

  SELECT
    'knowledge_article'::text,
    ka.id,
    ka.title,
    ka.summary,
    NULL,
    NULL,
    b.opened_at
  FROM base b
  JOIN public.knowledge_articles ka ON ka.id = b.entity_id AND b.entity_type = 'knowledge_article'
  WHERE ka.workspace_id = p_workspace_id

  UNION ALL

  SELECT
    'participant'::text,
    pa.id,
    trim(coalesce(pa.name, '') || ' ' || coalesce(pa.last_name, '')),
    coalesce(pa.email, pa.phone),
    NULL,
    NULL,
    b.opened_at
  FROM base b
  JOIN public.participants pa ON pa.id = b.entity_id AND b.entity_type = 'participant'
  WHERE pa.is_deleted = false
    AND pa.workspace_id = p_workspace_id

  ORDER BY opened_at DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_recently_viewed(uuid, int) TO authenticated;

-- ============================================================================
-- 6. RPC: global_search
--    Возвращает результаты по 4 типам сущностей. Полагается на RLS
--    исходных таблиц (SECURITY INVOKER).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.global_search(
  p_workspace_id uuid,
  p_query        text,
  p_limit        int DEFAULT 8
) RETURNS TABLE (
  entity_type text,
  entity_id   uuid,
  title       text,
  subtitle    text,
  snippet     text,
  rank        real,
  project_id  uuid,
  thread_type text,
  thread_id   uuid
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_query text := trim(coalesce(p_query, ''));
  v_ts    tsquery;
  v_thr   real := 0.4;  -- порог word_similarity: опечатка одной буквы в коротком слове даёт ~0.43
BEGIN
  IF length(v_query) < 2 THEN
    RETURN;
  END IF;

  -- websearch_to_tsquery терпит любой пользовательский ввод (кавычки, спецсимволы)
  v_ts := websearch_to_tsquery('russian', v_query);

  RETURN QUERY
  SELECT
    'thread'::text, t.id, t.name, p.name, NULL::text,
    GREATEST(ts_rank(t.search_vector, v_ts), word_similarity(v_query, coalesce(t.name, '')))::real AS r,
    t.project_id, t.type, t.id
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
    pr.id, NULL::text, NULL::uuid
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
    NULL::uuid, NULL::text, NULL::uuid
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
    NULL::uuid, NULL::text, NULL::uuid
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
  -- Messages (показываются как «упоминание в треде» со сниппетом)
  SELECT
    'message'::text, m.id,
    t.name,   -- title = имя треда
    p.name,   -- subtitle = имя проекта
    ts_headline('russian',
      coalesce(regexp_replace(m.content, '<[^>]+>', ' ', 'g'), ''),
      v_ts,
      'MaxFragments=1,MinWords=3,MaxWords=15,ShortWord=2,HighlightAll=false,StartSel=<mark>,StopSel=</mark>'
    ),
    ts_rank(m.search_vector, v_ts)::real AS r,
    m.project_id, t.type, m.thread_id
  FROM public.project_messages m
  JOIN public.project_threads t ON t.id = m.thread_id AND t.is_deleted = false
  LEFT JOIN public.projects p ON p.id = m.project_id
  WHERE m.workspace_id = p_workspace_id
    AND m.search_vector @@ v_ts
  ORDER BY r DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.global_search(uuid, text, int) TO authenticated;
