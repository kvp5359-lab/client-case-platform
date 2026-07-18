-- Единый WhatsApp-тред по телефону (Wazzup + WAHA): канонический ключ на треде.
-- Правило: WhatsApp-тред = (owner_user_id, whatsapp_phone). Оба вебхука пишут
-- whatsapp_phone и переключают привязку канала, снимая привязку другого канала.
-- Применено в прод через MCP; файл — для repo (идемпотентно, повтор = no-op).
alter table public.project_threads add column if not exists whatsapp_phone text;

create index if not exists idx_project_threads_whatsapp_phone
  on public.project_threads (owner_user_id, whatsapp_phone)
  where whatsapp_phone is not null and is_deleted = false;

-- backfill: Wazzup телефонные чаты
update public.project_threads
set whatsapp_phone = regexp_replace(wazzup_chat_id, '\D', '', 'g')
where wazzup_chat_id ~ '^\+?[0-9]{6,}$'
  and whatsapp_phone is null and is_deleted = false;

-- backfill: WAHA личка с видимым номером (@c.us). Скрытые @lid — без сессии не
-- резолвятся, проставятся при следующем входящем.
update public.project_threads
set whatsapp_phone = regexp_replace(split_part(waha_chat_id, '@', 1), '\D', '', 'g')
where waha_chat_id like '%@c.us'
  and whatsapp_phone is null and is_deleted = false;
