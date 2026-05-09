-- Импersonация: владелец воркспейса может «зайти под пользователем»
-- в режиме строго read-only. JWT с custom-claim app_metadata.impersonated_by,
-- триггер на всех публичных таблицах блокирует любые DML под этим claim.

-- ---------------------------------------------------------------------------
-- 1. Таблица сессий импersonации (аудит + источник правды)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.impersonation_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id   uuid NOT NULL,
  target_user_id  uuid NOT NULL,
  workspace_id    uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  jti             text NOT NULL UNIQUE,
  started_at      timestamptz NOT NULL DEFAULT now(),
  ended_at        timestamptz,
  expires_at      timestamptz NOT NULL,
  user_agent      text,
  ip              text,
  CONSTRAINT impersonation_no_self CHECK (owner_user_id <> target_user_id)
);

CREATE INDEX IF NOT EXISTS impersonation_sessions_owner_idx
  ON public.impersonation_sessions (owner_user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS impersonation_sessions_active_target_idx
  ON public.impersonation_sessions (target_user_id)
  WHERE ended_at IS NULL;

ALTER TABLE public.impersonation_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner reads own sessions" ON public.impersonation_sessions;
CREATE POLICY "owner reads own sessions"
  ON public.impersonation_sessions
  FOR SELECT
  USING (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "target reads own active session" ON public.impersonation_sessions;
CREATE POLICY "target reads own active session"
  ON public.impersonation_sessions
  FOR SELECT
  USING (target_user_id = auth.uid() AND ended_at IS NULL);

-- INSERT/UPDATE — только service role (нет публичных полиси).

-- ---------------------------------------------------------------------------
-- 2. Helper-функции
-- ---------------------------------------------------------------------------

-- Возвращает true, если в текущем JWT есть claim app_metadata.impersonated_by.
CREATE OR REPLACE FUNCTION public.is_impersonating()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT COALESCE(
    (auth.jwt() #>> '{app_metadata,impersonated_by}') IS NOT NULL,
    false
  );
$$;

-- Возвращает uuid владельца, если идёт импersonация (иначе null).
CREATE OR REPLACE FUNCTION public.impersonating_owner_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT NULLIF(auth.jwt() #>> '{app_metadata,impersonated_by}', '')::uuid;
$$;

-- Является ли user_id владельцем воркспейса (через participants.workspace_roles).
CREATE OR REPLACE FUNCTION public.is_workspace_owner(p_user_id uuid, p_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.participants
    WHERE user_id = p_user_id
      AND workspace_id = p_workspace_id
      AND 'Владелец' = ANY(workspace_roles)
      AND is_deleted = false
      AND can_login = true
  );
$$;

-- ---------------------------------------------------------------------------
-- 3. RPC для управления сессией
-- ---------------------------------------------------------------------------

-- Стартует сессию: проверяет права, инсёртит запись.
-- Edge Function вызывает её ПЕРЕД подписью JWT и кладёт jti+expires из JWT.
CREATE OR REPLACE FUNCTION public.start_impersonation_session(
  p_workspace_id   uuid,
  p_target_user_id uuid,
  p_jti            text,
  p_expires_at     timestamptz,
  p_user_agent     text DEFAULT NULL,
  p_ip             text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_owner_id    uuid := auth.uid();
  v_session_id  uuid;
  v_target_is_owner boolean;
  v_target_is_member boolean;
BEGIN
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Запрещаем заново стартовать импersonацию из импersonированной сессии.
  IF public.is_impersonating() THEN
    RAISE EXCEPTION 'cannot start impersonation while already impersonating'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_workspace_owner(v_owner_id, p_workspace_id) THEN
    RAISE EXCEPTION 'only workspace owner can impersonate'
      USING ERRCODE = '42501';
  END IF;

  IF p_target_user_id = v_owner_id THEN
    RAISE EXCEPTION 'cannot impersonate self'
      USING ERRCODE = '22023';
  END IF;

  -- Target должен быть активным участником воркспейса.
  SELECT EXISTS (
    SELECT 1 FROM public.participants
    WHERE user_id = p_target_user_id
      AND workspace_id = p_workspace_id
      AND is_deleted = false
      AND can_login = true
  ) INTO v_target_is_member;

  IF NOT v_target_is_member THEN
    RAISE EXCEPTION 'target is not an active workspace member'
      USING ERRCODE = '22023';
  END IF;

  -- Запрещаем импersonировать другого владельца.
  SELECT EXISTS (
    SELECT 1 FROM public.participants
    WHERE user_id = p_target_user_id
      AND workspace_id = p_workspace_id
      AND is_deleted = false
      AND 'Владелец' = ANY(workspace_roles)
  ) INTO v_target_is_owner;

  IF v_target_is_owner THEN
    RAISE EXCEPTION 'cannot impersonate another workspace owner'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.impersonation_sessions (
    owner_user_id, target_user_id, workspace_id, jti, expires_at, user_agent, ip
  ) VALUES (
    v_owner_id, p_target_user_id, p_workspace_id, p_jti, p_expires_at, p_user_agent, p_ip
  ) RETURNING id INTO v_session_id;

  RETURN v_session_id;
END;
$$;

REVOKE ALL ON FUNCTION public.start_impersonation_session(uuid, uuid, text, timestamptz, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_impersonation_session(uuid, uuid, text, timestamptz, text, text)
  TO service_role;

-- Завершает сессию: ставит ended_at. Может вызвать как owner, так и target.
CREATE OR REPLACE FUNCTION public.end_impersonation_session(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_owner_from_claim uuid := public.impersonating_owner_id();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  UPDATE public.impersonation_sessions
  SET ended_at = now()
  WHERE id = p_session_id
    AND ended_at IS NULL
    AND (
      owner_user_id  = v_user_id  -- сам владелец гасит
      OR target_user_id = v_user_id -- импersonированный (target) гасит из своего же JWT
      OR owner_user_id = v_owner_from_claim -- импersonационный JWT гасит свою же сессию
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.end_impersonation_session(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Триггер-страж: блокирует любые DML, если идёт импersonация
-- ---------------------------------------------------------------------------

-- ВАЖНО: триггер навешивается на user-таблицы public-схемы. service_role JWT
-- не содержит app_metadata.impersonated_by → is_impersonating() возвращает
-- false → service_role-операции НЕ блокируются. То же про pg_cron / SQL editor.
CREATE OR REPLACE FUNCTION public.prevent_writes_during_impersonation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF public.is_impersonating() THEN
    RAISE EXCEPTION 'Impersonation mode is read-only. Writes are blocked.'
      USING ERRCODE = '42501',
            HINT = 'Exit impersonation mode to make changes.';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Навешиваем триггер на все public-таблицы кроме impersonation_sessions.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename <> 'impersonation_sessions'
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS prevent_impersonation_writes ON public.%I;',
      t.tablename
    );
    EXECUTE format(
      'CREATE TRIGGER prevent_impersonation_writes ' ||
      'BEFORE INSERT OR UPDATE OR DELETE ON public.%I ' ||
      'FOR EACH ROW EXECUTE FUNCTION public.prevent_writes_during_impersonation();',
      t.tablename
    );
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.is_impersonating() IS
  'True если текущий JWT — импersonационный (есть app_metadata.impersonated_by).';
COMMENT ON FUNCTION public.prevent_writes_during_impersonation() IS
  'BEFORE-trigger на всех public-таблицах: блокирует DML из импersonационного JWT.';
COMMENT ON TABLE public.impersonation_sessions IS
  'Журнал сессий «войти под пользователем» — для аудита. Записи создаёт edge function impersonate-start через RPC start_impersonation_session.';
