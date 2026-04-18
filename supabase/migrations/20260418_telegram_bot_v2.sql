-- Telegram Bot v2: добавление колонок и таблиц для нового бота (@rs2_support_bot)
-- Старый бот (v1) продолжает работать без изменений — он не знает про bot_version,
-- а все существующие строки project_telegram_chats получают default 'v1'.
-- Новый бот в своей edge-функции фильтрует строго по bot_version = 'v2'.

-- ── 1. project_telegram_chats.bot_version ──────────────────────────────────
ALTER TABLE public.project_telegram_chats
  ADD COLUMN IF NOT EXISTS bot_version text NOT NULL DEFAULT 'v1'
    CHECK (bot_version IN ('v1', 'v2'));

CREATE INDEX IF NOT EXISTS idx_project_telegram_chats_bot_version
  ON public.project_telegram_chats (telegram_chat_id, bot_version)
  WHERE is_active = true;

-- ── 2. knowledge_articles / knowledge_qa: флаг публичности для клиентов ───
ALTER TABLE public.knowledge_articles
  ADD COLUMN IF NOT EXISTS is_public_for_clients boolean NOT NULL DEFAULT false;

ALTER TABLE public.knowledge_qa
  ADD COLUMN IF NOT EXISTS is_public_for_clients boolean NOT NULL DEFAULT false;

-- ── 3. telegram_link_tokens: deep-link привязка participant ↔ Telegram ──
CREATE TABLE IF NOT EXISTS public.telegram_link_tokens (
  token uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id uuid NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
  consumed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_telegram_link_tokens_participant
  ON public.telegram_link_tokens (participant_id)
  WHERE consumed_at IS NULL;

ALTER TABLE public.telegram_link_tokens ENABLE ROW LEVEL SECURITY;

-- RLS: пользователь может создавать/видеть токены только для participants
-- в своём workspace. Сам процесс consume токена идёт через service-role
-- из edge-функции, поэтому политики не нужны для бота — только для веб-UI.
DROP POLICY IF EXISTS telegram_link_tokens_insert ON public.telegram_link_tokens;
CREATE POLICY telegram_link_tokens_insert ON public.telegram_link_tokens
  FOR INSERT TO authenticated
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.participants
      WHERE user_id = auth.uid() AND is_deleted = false
    )
  );

DROP POLICY IF EXISTS telegram_link_tokens_select ON public.telegram_link_tokens;
CREATE POLICY telegram_link_tokens_select ON public.telegram_link_tokens
  FOR SELECT TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.participants
      WHERE user_id = auth.uid() AND is_deleted = false
    )
  );

-- ── 4. telegram_bot_sessions: многошаговые сценарии (выбор слота → файл) ──
CREATE TABLE IF NOT EXISTS public.telegram_bot_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_chat_id bigint NOT NULL,
  telegram_user_id bigint NOT NULL,
  state text NOT NULL,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
  UNIQUE (telegram_chat_id, telegram_user_id)
);

CREATE INDEX IF NOT EXISTS idx_telegram_bot_sessions_expires
  ON public.telegram_bot_sessions (expires_at);

ALTER TABLE public.telegram_bot_sessions ENABLE ROW LEVEL SECURITY;
-- Таблица используется только service-role из edge-функции. Из веб-UI доступа нет.
-- Без политик RLS блокирует всех обычных пользователей — это и нужно.
