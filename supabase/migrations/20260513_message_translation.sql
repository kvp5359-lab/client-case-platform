-- 1. preferred_language на участнике (целевой язык для перевода входящих)
ALTER TABLE public.participants
  ADD COLUMN IF NOT EXISTS preferred_language text NOT NULL DEFAULT 'ru';

-- 2. Оригинал у исходящих сообщений (когда отправляем переведённый текст клиенту)
ALTER TABLE public.project_messages
  ADD COLUMN IF NOT EXISTS original_content text,
  ADD COLUMN IF NOT EXISTS original_language text;

-- 3. Кэш переводов входящих/любых сообщений, по языку (не по юзеру)
CREATE TABLE IF NOT EXISTS public.message_translations (
  message_id uuid NOT NULL REFERENCES public.project_messages(id) ON DELETE CASCADE,
  target_language text NOT NULL,
  translated_content text NOT NULL,
  source_language text,
  model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (message_id, target_language)
);

CREATE INDEX IF NOT EXISTS idx_message_translations_message ON public.message_translations(message_id);

ALTER TABLE public.message_translations ENABLE ROW LEVEL SECURITY;

-- SELECT: видит каждый, у кого есть доступ к сообщению (через can_user_access_thread).
DROP POLICY IF EXISTS message_translations_select ON public.message_translations;
CREATE POLICY message_translations_select ON public.message_translations FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.project_messages pm
    WHERE pm.id = message_translations.message_id
      AND (
        pm.thread_id IS NULL
        OR can_user_access_thread(pm.thread_id, (SELECT auth.uid()))
      )
  )
);

-- INSERT/UPDATE/DELETE — только service_role (через edge function).
-- (по умолчанию authenticated без полиций — не сможет, что и требуется)

COMMENT ON TABLE public.message_translations IS 'Кэш переводов сообщений по целевому языку. Заполняется edge function translate-message.';
COMMENT ON COLUMN public.participants.preferred_language IS 'ISO 639-1 код языка, на который участник хочет видеть переводы входящих сообщений.';
COMMENT ON COLUMN public.project_messages.original_content IS 'Оригинальный текст сообщения, если отправили перевод (виден только автору в UI).';
COMMENT ON COLUMN public.project_messages.original_language IS 'ISO 639-1 код языка оригинала, если отправили перевод.';
