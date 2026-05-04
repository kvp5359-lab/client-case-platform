-- Дедуп echo для исходящих служебных сообщений (реакции и т.п.).
-- Webhook при `isEcho=true` проверяет, нет ли messageId в этой таблице,
-- и если есть — пропускает INSERT в project_messages.

CREATE TABLE public.wazzup_outgoing_dedup (
  wazzup_message_id text PRIMARY KEY,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.wazzup_outgoing_dedup ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.wazzup_outgoing_dedup IS
  'Дедуп для echo-сообщений: записываем wazzup_message_id сообщений, которые мы отправили служебно (реакции и т.п.), чтобы webhook не создавал их повторно при isEcho=true.';
