-- Аудит безопасности 2026-06-12, этап 1.2.
-- Бакеты message-attachments / document-files / document-templates пускали ЛЮБОГО
-- залогиненного юзера к файлам ЛЮБОГО воркспейса (политики без workspace-фильтра).
-- Переводим на эталонный паттерн бакета files: первый сегмент пути = workspace_id,
-- доступ только участникам этого воркспейса.
-- Проверено по živым данным: 100% объектов c папками во всех трёх бакетах имеют
-- workspace_id первым сегментом (единственное исключение — тестовый файл в корне
-- message-attachments, останется доступен только service_role).
-- service_role не задет: BYPASSRLS, политики на него не влияют.

-- ── message-attachments ──────────────────────────────────────

DROP POLICY IF EXISTS message_attachments_storage_select ON storage.objects;
CREATE POLICY message_attachments_storage_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'message-attachments'
    AND ((storage.foldername(name))[1])::uuid IN (
      SELECT p.workspace_id FROM public.participants p
      WHERE p.user_id = auth.uid() AND p.is_deleted = false
    )
  );

DROP POLICY IF EXISTS message_attachments_storage_insert ON storage.objects;
CREATE POLICY message_attachments_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'message-attachments'
    AND ((storage.foldername(name))[1])::uuid IN (
      SELECT p.workspace_id FROM public.participants p
      WHERE p.user_id = auth.uid() AND p.is_deleted = false
    )
  );

-- ── document-files ───────────────────────────────────────────

DROP POLICY IF EXISTS "Service role can read document-files" ON storage.objects;
CREATE POLICY "Workspace members can read document-files" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'document-files'
    AND ((storage.foldername(name))[1])::uuid IN (
      SELECT p.workspace_id FROM public.participants p
      WHERE p.user_id = auth.uid() AND p.is_deleted = false
    )
  );

DROP POLICY IF EXISTS "Service role can upload to document-files" ON storage.objects;
CREATE POLICY "Workspace members can upload document-files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'document-files'
    AND ((storage.foldername(name))[1])::uuid IN (
      SELECT p.workspace_id FROM public.participants p
      WHERE p.user_id = auth.uid() AND p.is_deleted = false
    )
  );

DROP POLICY IF EXISTS "Authenticated users can update document-files" ON storage.objects;
CREATE POLICY "Workspace members can update document-files" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'document-files'
    AND ((storage.foldername(name))[1])::uuid IN (
      SELECT p.workspace_id FROM public.participants p
      WHERE p.user_id = auth.uid() AND p.is_deleted = false
    )
  );

DROP POLICY IF EXISTS "Authenticated users can delete document-files" ON storage.objects;
CREATE POLICY "Workspace members can delete document-files" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'document-files'
    AND ((storage.foldername(name))[1])::uuid IN (
      SELECT p.workspace_id FROM public.participants p
      WHERE p.user_id = auth.uid() AND p.is_deleted = false
    )
  );

-- ── document-templates ───────────────────────────────────────

DROP POLICY IF EXISTS document_templates_select ON storage.objects;
CREATE POLICY document_templates_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'document-templates'
    AND ((storage.foldername(name))[1])::uuid IN (
      SELECT p.workspace_id FROM public.participants p
      WHERE p.user_id = auth.uid() AND p.is_deleted = false
    )
  );

DROP POLICY IF EXISTS document_templates_upload ON storage.objects;
CREATE POLICY document_templates_upload ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'document-templates'
    AND ((storage.foldername(name))[1])::uuid IN (
      SELECT p.workspace_id FROM public.participants p
      WHERE p.user_id = auth.uid() AND p.is_deleted = false
    )
  );

DROP POLICY IF EXISTS document_templates_delete ON storage.objects;
CREATE POLICY document_templates_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'document-templates'
    AND ((storage.foldername(name))[1])::uuid IN (
      SELECT p.workspace_id FROM public.participants p
      WHERE p.user_id = auth.uid() AND p.is_deleted = false
    )
  );
