-- Журнал ошибок отправки сообщений.
-- Источник правды на сервере: переживает закрытие вкладки/устройства,
-- доступен с любого устройства, виден владельцу WS даже если автор уволился.
-- Заполняется через edge-функцию log-send-failure (не из триггера, потому что
-- ошибка отправки — это явление на стороне фронта/edge, не INSERT в таблицу).

CREATE TABLE IF NOT EXISTS public.message_send_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  thread_id uuid REFERENCES public.project_threads(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  participant_id uuid REFERENCES public.participants(id) ON DELETE SET NULL,
  -- Содержимое неотправленного сообщения (HTML или текст). Может быть длинным.
  content text,
  -- Если был файл — для UI-удобства сохраняем имя; сам файл нигде не оседает.
  attachment_names text[],
  -- Текстовое описание ошибки (короткий human-readable).
  error_text text NOT NULL,
  -- Опциональный код (например 'http_500', 'edge_timeout', 'rls_denied').
  error_code text,
  -- Канал/источник, куда пытались отправить.
  source text, -- 'web' | 'telegram' | 'telegram_business' | 'telegram_mtproto' | 'wazzup' | 'email'
  -- Какой бот/интеграция использовалась (если применимо).
  integration_id uuid REFERENCES public.workspace_integrations(id) ON DELETE SET NULL,
  -- Произвольная контекстная инфа от клиента (toast уже показан, попытки и т.п.).
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Зарезолвлено: либо автор отметил «увидел/проигнорировал», либо успешно переотправил.
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Индексы под основные запросы:
-- 1) «Покажи мои незакрытые fails» — самый частый, для бейджа в сайдбаре.
CREATE INDEX IF NOT EXISTS idx_msf_user_unresolved
  ON public.message_send_failures (user_id, created_at DESC)
  WHERE resolved_at IS NULL;
-- 2) «Покажи все незакрытые fails воркспейса» — для страницы менеджера.
CREATE INDEX IF NOT EXISTS idx_msf_workspace_unresolved
  ON public.message_send_failures (workspace_id, created_at DESC)
  WHERE resolved_at IS NULL;
-- 3) «Все fails по треду» — для контекста в чате.
CREATE INDEX IF NOT EXISTS idx_msf_thread
  ON public.message_send_failures (thread_id, created_at DESC)
  WHERE thread_id IS NOT NULL;

-- RLS
ALTER TABLE public.message_send_failures ENABLE ROW LEVEL SECURITY;

-- SELECT: автор видит свои + менеджеры воркспейса видят все.
CREATE POLICY message_send_failures_select ON public.message_send_failures
  FOR SELECT TO public
  USING (
    user_id = (SELECT auth.uid())
    OR public.is_workspace_owner((SELECT auth.uid()), workspace_id)
    OR public.has_workspace_permission((SELECT auth.uid()), workspace_id, 'manage_workspace_settings')
  );

-- UPDATE: автор может зарезолвить свою; менеджеры — любую в своём воркспейсе.
-- (resolve = выставить resolved_at + resolved_by; DML на content/error и т.п. не нужно)
CREATE POLICY message_send_failures_update ON public.message_send_failures
  FOR UPDATE TO public
  USING (
    user_id = (SELECT auth.uid())
    OR public.is_workspace_owner((SELECT auth.uid()), workspace_id)
    OR public.has_workspace_permission((SELECT auth.uid()), workspace_id, 'manage_workspace_settings')
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    OR public.is_workspace_owner((SELECT auth.uid()), workspace_id)
    OR public.has_workspace_permission((SELECT auth.uid()), workspace_id, 'manage_workspace_settings')
  );

-- INSERT/DELETE: только service role (через edge-функцию или менеджмент).
-- Никаких политик для public — по умолчанию запрещено.

-- Realtime publication: чтобы фронт мог подписаться и показывать toast мгновенно.
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_send_failures;

COMMENT ON TABLE public.message_send_failures IS
  'Журнал неудачных попыток отправки сообщений. Заполняется edge-функцией log-send-failure из onError useSendMessage и других мест. Realtime-подписка показывает sticky-toast пользователю даже если он ушёл из чата.';
