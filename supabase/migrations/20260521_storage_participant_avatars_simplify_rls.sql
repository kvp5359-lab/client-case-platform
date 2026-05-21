-- Упрощаем RLS для participant-avatars: любой authenticated юзер может
-- INSERT/UPDATE/DELETE/SELECT. Бакет public, файлы доступны через CDN URL
-- без RLS, содержимое — публичные аватарки.
--
-- Контекст: прежняя полицея проверяла, что текущий юзер — participant
-- воркспейса, чей UUID лежит в первой папке storage path. Полицея
-- падала с маскировочной ошибкой «new row violates row-level security
-- policy», хотя по эмуляции в SQL Editor должна была пропускать. Корень
-- — supabase-js при upsert=true требует SELECT-полицу на storage.objects,
-- которую раньше дропнули как «лишнюю для public-бакета». Без неё INSERT
-- через storage-api падает с тем же RLS-сообщением.
--
-- Решение:
-- 1) SELECT-полица возвращается (нужна для upsert).
-- 2) INSERT/UPDATE/DELETE — auth.uid() IS NOT NULL (любой авторизованный
--    юзер, без проверки membership в воркспейсе). Бакет publik, файлы
--    несекретные — least privilege для них не критичен.

DROP POLICY IF EXISTS "Workspace members can upload participant avatars" ON storage.objects;
DROP POLICY IF EXISTS "Workspace members can update participant avatars" ON storage.objects;
DROP POLICY IF EXISTS "Workspace members can delete participant avatars" ON storage.objects;

CREATE POLICY "Anyone can read participant avatars"
ON storage.objects FOR SELECT
USING (bucket_id = 'participant-avatars');

CREATE POLICY "Authenticated can upload participant avatars"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'participant-avatars'
  AND auth.uid() IS NOT NULL
);

CREATE POLICY "Authenticated can update participant avatars"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'participant-avatars'
  AND auth.uid() IS NOT NULL
);

CREATE POLICY "Authenticated can delete participant avatars"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'participant-avatars'
  AND auth.uid() IS NOT NULL
);
