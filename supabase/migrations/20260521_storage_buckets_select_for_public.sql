-- Разрешаем читать строки-бакетов с public=true в storage.buckets.
--
-- Зачем: storage-api при upload в public-бакет делает дополнительный
-- SELECT на storage.buckets. На таблице buckets включён RLS, но политик
-- не было → DENY ALL → upload падал с ошибкой «new row violates
-- row-level security policy» (маскировочной, казалось будто RLS на
-- objects, а реально — на buckets).
--
-- Симптом: загрузка аватарок (bucket participant-avatars, public=true)
-- падала с 400. На message-attachments (public=false) — работала, потому
-- что storage-api не делал этой доп. проверки.
--
-- Полица минимально безопасна: разрешает читать ТОЛЬКО публичные
-- бакеты, частные остаются закрытыми (storage-api про них знает сам).
-- Применяем к роли public (включает authenticated и anon), потому что
-- storage proxy может выполнять этот SELECT под разными ролями в
-- зависимости от состояния JWT.

CREATE POLICY "Anyone can read public buckets"
ON storage.buckets FOR SELECT
USING (public = true);
