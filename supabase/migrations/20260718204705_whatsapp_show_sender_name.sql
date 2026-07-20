-- «Показывать имя отправителя» — отдельно по каналам (Telegram-группа/Wazzup/WAHA)
-- + поле сотрудника «Имя для мессенджеров» (префикс, если настройка включена).
-- Применено через MCP. Telegram по умолчанию true (секретарь уже ставил имя —
-- сохраняем поведение, тумблер даёт «выключить»); Wazzup/WAHA — false.
alter table public.participants
  add column if not exists messenger_name text;

alter table public.workspaces
  add column if not exists telegram_show_sender_name boolean not null default true,
  add column if not exists wazzup_show_sender_name boolean not null default false,
  add column if not exists waha_show_sender_name boolean not null default false;
