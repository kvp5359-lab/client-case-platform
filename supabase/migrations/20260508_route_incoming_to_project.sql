-- Этап 9 CRM-фрейма: маршрутизация входящих сообщений в проект через
-- participant_channels. Универсальный helper для всех webhook'ов
-- (gmail, telegram, telegram-business, wazzup и т.п.).
--
-- Логика:
-- 1. Находим participant по (workspace_id, channel_type, external_id) в
--    participant_channels. Если нет — создаём participant без user_id +
--    первый канал.
-- 2. Ищем активные проекты этого participant'а через
--    projects.contact_participant_id (активный = is_deleted=false и
--    status_id либо null, либо ссылается на статус с is_final=false).
-- 3. Поведение по числу активных:
--    - 1 → возвращаем его + создаём/находим тред
--    - >1 → берём с самым свежим updated_at (MVP — потом доделаем «выбор»)
--    - 0 → создаём новый лид по дефолтному шаблону для этого source.
--      Если шаблона нет — возвращаем status='no_template' и пусть webhook
--      падает в legacy-fallback.

-- ============================================================================
-- 1. workspaces.default_lead_template_per_source — настройки воронки на источник
-- ============================================================================

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS default_lead_template_per_source jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.workspaces.default_lead_template_per_source IS
  'Маппинг source → project_template_id для автосоздания лидов при входящих сообщениях. '
  'Ключи source: ''email'', ''telegram'', ''telegram_business'', ''wazzup'', ''telegram_mtproto''. '
  'Если ключа нет или значение null — RPC route_incoming_to_project отдаст ''no_template'', '
  'webhook не будет автосоздавать лид и упадёт в legacy-логику.';

-- ============================================================================
-- 2. RPC route_incoming_to_project
-- ============================================================================

DROP FUNCTION IF EXISTS public.route_incoming_to_project(uuid, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.route_incoming_to_project(
  p_workspace_id uuid,
  p_source text,
  p_channel_type text,
  p_external_id text,
  p_sender_name text DEFAULT NULL,
  p_thread_name text DEFAULT NULL
)
RETURNS TABLE(
  participant_id uuid,
  project_id uuid,
  thread_id uuid,
  status text  -- 'matched' | 'new_lead' | 'no_template'
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_participant_id uuid;
  v_project_id uuid;
  v_thread_id uuid;
  v_template_id uuid;
  v_status_id uuid;
  v_active_count int;
  v_status text;
  v_normalized_external_id text;
BEGIN
  -- Нормализуем external_id под канал. Email → lowercase + trim.
  -- Telegram/phone — просто trim. Это согласовано с фронтовой
  -- normalizeExternalId() в src/hooks/useParticipantChannels.ts.
  v_normalized_external_id := trim(p_external_id);
  IF p_channel_type = 'email' THEN
    v_normalized_external_id := lower(v_normalized_external_id);
  END IF;

  IF v_normalized_external_id = '' THEN
    RETURN; -- защита от пустого ID — пусть webhook падёт в fallback
  END IF;

  -- ── Шаг 1: найти или создать participant ──────────────────────────
  SELECT pc.participant_id INTO v_participant_id
  FROM participant_channels pc
  WHERE pc.workspace_id = p_workspace_id
    AND pc.channel_type = p_channel_type
    AND pc.external_id = v_normalized_external_id
  LIMIT 1;

  IF v_participant_id IS NULL THEN
    -- Создаём participant без аккаунта (user_id NULL — это «лид без ЛК»).
    -- email — placeholder вида '<source>_<random>@<source>.placeholder',
    -- т.к. participants.email NOT NULL, а реальный email кладётся в канал.
    INSERT INTO participants (
      workspace_id, name, email,
      workspace_roles, can_login, user_id
    ) VALUES (
      p_workspace_id,
      COALESCE(NULLIF(trim(p_sender_name), ''), 'Без имени'),
      CASE
        WHEN p_channel_type = 'email' THEN v_normalized_external_id
        ELSE p_channel_type || '_' || substr(md5(v_normalized_external_id || clock_timestamp()::text), 1, 12) || '@' || p_channel_type || '.placeholder'
      END,
      '{}'::text[],
      false,
      NULL
    )
    RETURNING id INTO v_participant_id;

    -- Сразу пишем канал.
    INSERT INTO participant_channels (
      participant_id, workspace_id, channel_type, external_id, is_primary
    ) VALUES (
      v_participant_id, p_workspace_id, p_channel_type, v_normalized_external_id, true
    )
    ON CONFLICT (workspace_id, channel_type, external_id) DO NOTHING;
  END IF;

  -- ── Шаг 2: ищем активные проекты этого participant'а ─────────────
  -- Активный = is_deleted=false И статус (если есть) не финальный.
  SELECT pr.id INTO v_project_id
  FROM projects pr
  LEFT JOIN statuses st ON st.id = pr.status_id
  WHERE pr.workspace_id = p_workspace_id
    AND pr.contact_participant_id = v_participant_id
    AND pr.is_deleted = false
    AND (st.id IS NULL OR st.is_final = false)
  ORDER BY pr.last_activity_at DESC NULLS LAST, pr.created_at DESC
  LIMIT 1;

  -- Считаем активные для будущего «multi_choice» — пока только для логирования.
  SELECT COUNT(*) INTO v_active_count
  FROM projects pr
  LEFT JOIN statuses st ON st.id = pr.status_id
  WHERE pr.workspace_id = p_workspace_id
    AND pr.contact_participant_id = v_participant_id
    AND pr.is_deleted = false
    AND (st.id IS NULL OR st.is_final = false);

  IF v_project_id IS NOT NULL THEN
    v_status := 'matched';
  ELSE
    -- ── Шаг 3: создаём новый лид ────────────────────────────────
    -- Берём дефолтный шаблон для этого source. Если в маппинге нет —
    -- возвращаем 'no_template' и пусть webhook решает что делать.
    SELECT (default_lead_template_per_source->>p_source)::uuid INTO v_template_id
    FROM workspaces WHERE id = p_workspace_id;

    IF v_template_id IS NULL THEN
      -- Возвращаем participant но без проекта/треда.
      participant_id := v_participant_id;
      project_id := NULL;
      thread_id := NULL;
      status := 'no_template';
      RETURN NEXT;
      RETURN;
    END IF;

    -- Берём первый дефолтный статус шаблона. Если is_default нет — берём
    -- первый по order_index. Если нет ни одного — null (это валидно).
    SELECT s.id INTO v_status_id
    FROM project_template_statuses pts
    JOIN statuses s ON s.id = pts.status_id
    WHERE pts.template_id = v_template_id
    ORDER BY pts.is_default DESC, pts.order_index ASC
    LIMIT 1;

    -- Создаём проект.
    INSERT INTO projects (
      workspace_id, name, template_id, status_id,
      contact_participant_id, created_by
    ) VALUES (
      p_workspace_id,
      COALESCE(NULLIF(trim(p_sender_name), ''), 'Без имени') ||
        ' (' ||
        CASE p_source
          WHEN 'email' THEN 'Email'
          WHEN 'telegram' THEN 'Telegram'
          WHEN 'telegram_business' THEN 'Telegram'
          WHEN 'telegram_mtproto' THEN 'Telegram'
          WHEN 'wazzup' THEN 'WhatsApp'
          ELSE p_source
        END ||
        ')',
      v_template_id,
      v_status_id,
      v_participant_id,
      NULL
    ) RETURNING id INTO v_project_id;

    v_status := 'new_lead';
  END IF;

  -- ── Создаём/находим тред в проекте для этого канала ────────────
  -- Для гибкости: если есть тред с таким же channel_type + external_id —
  -- переиспользуем. Иначе создаём.
  SELECT pt.id INTO v_thread_id
  FROM project_threads pt
  JOIN participant_channels pc
    ON pc.workspace_id = p_workspace_id
   AND pc.channel_type = p_channel_type
   AND pc.external_id = v_normalized_external_id
  WHERE pt.project_id = v_project_id
    AND pt.is_deleted = false
  LIMIT 1;

  IF v_thread_id IS NULL THEN
    INSERT INTO project_threads (
      project_id, workspace_id, name, type, access_type,
      icon, accent_color, created_by
    ) VALUES (
      v_project_id,
      p_workspace_id,
      COALESCE(NULLIF(trim(p_thread_name), ''), 'Новое сообщение'),
      'chat',
      'all',
      CASE p_source
        WHEN 'email' THEN 'mail'
        WHEN 'wazzup' THEN 'whatsapp'
        ELSE 'message-circle'
      END,
      CASE p_source
        WHEN 'email' THEN 'red'
        WHEN 'wazzup' THEN 'emerald'
        ELSE 'blue'
      END,
      NULL
    ) RETURNING id INTO v_thread_id;
  END IF;

  -- ── Возвращаем результат ──────────────────────────────────────
  participant_id := v_participant_id;
  project_id := v_project_id;
  thread_id := v_thread_id;
  status := v_status;
  RETURN NEXT;
  RETURN;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.route_incoming_to_project(uuid, text, text, text, text, text) TO service_role;

COMMENT ON FUNCTION public.route_incoming_to_project IS
  'Этап 9 CRM-фрейма: универсальная маршрутизация входящего сообщения в проект. '
  'Используется webhook''ами (gmail, telegram, telegram-business, wazzup). '
  'Возвращает participant_id, project_id, thread_id и статус matched/new_lead/no_template.';
