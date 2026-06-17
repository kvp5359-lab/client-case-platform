-- Фаза 1 масштабирования Входящих: материализованные ОБЩИЕ (не пер-юзер) поля треда.
-- Заполняется триггерами + бэкафиллом через compute_thread_inbox_meta().
-- Пока НИЧЕМ не читается (additive) — read-cutover только после построчной сверки с v2.
CREATE TABLE IF NOT EXISTS public.thread_inbox_meta (
  thread_id                    uuid PRIMARY KEY REFERENCES public.project_threads(id) ON DELETE CASCADE,
  last_message_id              uuid,
  last_message_at              timestamptz,
  last_message_text            text,
  last_sender_participant_id   uuid,
  last_sender_name             text,
  last_sender_role             text,
  last_message_attachment_name text,
  last_message_attachment_mime text,
  last_message_attachment_count integer NOT NULL DEFAULT 0,
  last_event_id                uuid,
  last_event_at                timestamptz,
  last_event_action            text,
  last_event_details           jsonb,
  last_event_actor_user_id     uuid,
  last_reaction_id             uuid,
  last_reaction_emoji          text,
  last_reaction_at             timestamptz,
  last_reaction_message_id     uuid,
  last_reaction_message_text   text,
  last_reactor_participant_id  uuid,
  last_reactor_telegram_user_id bigint,
  channel_type                 text,
  has_external                 boolean NOT NULL DEFAULT false,
  last_from_staff              boolean,
  email_contact                text,
  email_subject                text,
  sort_at                      timestamptz,
  updated_at                   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_thread_inbox_meta_sort ON public.thread_inbox_meta (sort_at DESC, thread_id DESC);
ALTER TABLE public.thread_inbox_meta ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.thread_inbox_meta FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.thread_inbox_meta TO service_role;
