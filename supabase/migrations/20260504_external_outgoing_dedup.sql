-- Зона 5: общая таблица дедупа для исходящих echo по всем каналам.
-- Заменяет канал-специфичную `wazzup_outgoing_dedup`.

CREATE TABLE public.external_outgoing_dedup (
  channel text NOT NULL,
  message_id text NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (channel, message_id)
);

ALTER TABLE public.external_outgoing_dedup ENABLE ROW LEVEL SECURITY;

INSERT INTO public.external_outgoing_dedup (channel, message_id, reason, created_at)
SELECT 'wazzup', wazzup_message_id, reason, created_at
FROM public.wazzup_outgoing_dedup
ON CONFLICT (channel, message_id) DO NOTHING;

DROP TABLE IF EXISTS public.wazzup_outgoing_dedup;

COMMENT ON TABLE public.external_outgoing_dedup IS
  'Дедуп для echo-сообщений из любого внешнего канала.';
