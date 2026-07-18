-- Дедуп WhatsApp-сообщений по ЯДРУ (id самого сообщения без префикса
-- направления/чата), чтобы одно физическое сообщение, увиденное несколькими
-- нашими сессиями (разный полный id), давало одну запись. Применено через MCP;
-- файл для repo (идемпотентно).
alter table public.project_messages add column if not exists waha_msg_core text;

update public.project_messages m
set waha_msg_core = (
  select seg from unnest(string_to_array(m.waha_message_id,'_')) seg
  where seg not in ('true','false') and position('@' in seg)=0
  order by length(seg) desc limit 1)
where m.waha_message_id is not null and m.waha_msg_core is null;

create unique index if not exists uq_project_messages_waha_msg_core
  on public.project_messages (waha_msg_core)
  where waha_msg_core is not null;
