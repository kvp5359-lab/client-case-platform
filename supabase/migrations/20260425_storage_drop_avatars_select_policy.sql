-- Убираем broad SELECT-политику на storage.objects для bucket
-- 'participant-avatars'. Bucket public — файлы доступны через CDN URL без RLS,
-- эта политика лишь разрешала клиентам ЛИСТАТЬ все аватары через
-- supabase.storage.from('participant-avatars').list() (что в коде нигде не
-- используется: только upload + getPublicUrl).
--
-- Отдельные INSERT/UPDATE/DELETE-политики (только для членов воркспейса)
-- остаются — загрузка/обновление/удаление продолжат работать.
--
-- Buckets 'docbuilder' и 'docbuilder-covers' принадлежат другому приложению
-- (DocBuilder), делящему БД с ClientCase — не трогаем, чтобы не сломать его.

DROP POLICY IF EXISTS "Anyone can read participant avatars" ON storage.objects;
