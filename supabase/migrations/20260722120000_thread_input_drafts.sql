-- Черновики поля ввода (набранный, но не отправленный текст + прикреплённые файлы).
--
-- Зачем отдельная таблица, а не project_messages.is_draft: на project_messages
-- висит 15 триггеров, часть — на ЛЮБОЕ изменение (пересчёт непрочитанного у всех
-- участников, пересчёт inbox-меты, realtime-рассылка всему воркспейсу, подъём
-- треда наверх). Автосохранение по ходу набора дёргало бы всё это на каждую
-- паузу в печати: тред прыгал бы в начало «Входящих» у коллег, всем летели бы
-- события. Поэтому — своя лёгкая полка без триггеров.
--
-- Черновик персональный: в общем треде каждый видит только свой (RLS own-rows).
-- Файлы храним ссылкой на уже загруженный files.id — при отправке
-- message_attachments создаётся на тот же файл, повторной загрузки нет
-- (тот же механизм, что у пересылки сообщений).
--
-- Черновики без треда (новое письмо до создания треда) сюда НЕ попадают —
-- их некуда ключевать, остаются в localStorage.

CREATE TABLE IF NOT EXISTS public.thread_input_drafts (
  thread_id  uuid NOT NULL REFERENCES public.project_threads(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content    text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (thread_id, user_id)
);

-- «Все мои черновики» — для подмешивания во вкладку «Непрочитанные».
CREATE INDEX IF NOT EXISTS idx_thread_input_drafts_user
  ON public.thread_input_drafts (user_id);

CREATE TABLE IF NOT EXISTS public.thread_input_draft_files (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id  uuid NOT NULL REFERENCES public.project_threads(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_id    uuid NOT NULL REFERENCES public.files(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (thread_id, user_id, file_id)
);

CREATE INDEX IF NOT EXISTS idx_thread_input_draft_files_user
  ON public.thread_input_draft_files (user_id);

ALTER TABLE public.thread_input_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.thread_input_draft_files ENABLE ROW LEVEL SECURITY;

-- Только свои строки: черновик — личная вещь, даже в общем треде.
DROP POLICY IF EXISTS thread_input_drafts_own ON public.thread_input_drafts;
CREATE POLICY thread_input_drafts_own ON public.thread_input_drafts
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS thread_input_draft_files_own ON public.thread_input_draft_files;
CREATE POLICY thread_input_draft_files_own ON public.thread_input_draft_files
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

REVOKE ALL ON public.thread_input_drafts FROM PUBLIC, anon;
REVOKE ALL ON public.thread_input_draft_files FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.thread_input_drafts TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.thread_input_draft_files TO authenticated, service_role;
