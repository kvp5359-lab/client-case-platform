-- Общий тред для 1:1 переписки двух наших сотрудников (оба номера подключены).
-- Ключ — неупорядоченная пара телефонов; один тред на пару, оба в участниках.
-- Применено через MCP; файл для repo (идемпотентно).
alter table public.project_threads add column if not exists whatsapp_pair_key text;

create unique index if not exists uq_project_threads_whatsapp_pair
  on public.project_threads (workspace_id, whatsapp_pair_key)
  where whatsapp_pair_key is not null and is_deleted = false;
