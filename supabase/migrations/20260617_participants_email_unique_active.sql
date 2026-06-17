-- Уникальность email среди ЖИВЫХ контактов воркспейса.
-- Причина: ручное создание контакта не дедуплило по email → два participants
-- с одним адресом. get_inbox_threads_v2 джойнит контакт по email → каждая строка
-- email-треда размножалась (одна копия с настоящим именем, вторая с именем=адрес).
-- См. messenger-ledger 2026-06-17 «Дубли email-тредов во Входящих».
CREATE UNIQUE INDEX IF NOT EXISTS uq_participants_workspace_email_active
ON participants (workspace_id, lower(email))
WHERE is_deleted = false AND email IS NOT NULL AND email <> '';
