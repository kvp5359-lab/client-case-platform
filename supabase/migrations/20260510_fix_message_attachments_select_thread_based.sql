-- Fix: message_attachments_select RLS падает на личных диалогах (MTProto и т.п.)
-- без project_id. Старая политика делала JOIN project_participants ON pm.project_id,
-- что для project_id=NULL возвращало пусто. Из-за этого `.select('*').single()`
-- после INSERT'а вложения в `uploadAttachments` отдавал RLS-ошибку и фронт
-- показывал «Не удалось отправить — текст возвращён в поле ввода».
--
-- Новая логика: доступ к вложению = доступ к его сообщению. У сообщений всегда
-- есть thread_id (для тредных потоков), а can_user_access_thread корректно
-- обрабатывает как проектные треды, так и бесхозные личные диалоги.

DROP POLICY IF EXISTS message_attachments_select ON public.message_attachments;

CREATE POLICY message_attachments_select
  ON public.message_attachments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM project_messages pm
      WHERE pm.id = message_attachments.message_id
        AND pm.thread_id IS NOT NULL
        AND public.can_user_access_thread(pm.thread_id, (SELECT auth.uid()))
    )
  );

COMMENT ON POLICY message_attachments_select ON public.message_attachments IS
  'Доступ к вложению = доступ к треду сообщения через can_user_access_thread. Работает и для тредов без проекта (личные диалоги MTProto/Business).';
