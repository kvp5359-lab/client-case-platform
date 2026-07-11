-- Мост в маркетинг-платформу: события CRM автоматически двигают рекламную заявку
-- по воронке (сквозная аналитика — реальный ROAS по ключам/каналам).
--   activated — проект получил рабочий тип услуги (не «Лид»)  → «в работе»
--   won/lost  — проект перешёл в финальный статус (won/lost/abandoned)
--   income    — пришёл доход (в любом типе, включая «Лид»)     → «оплачено» + сумма
-- Триггеры обёрнуты так, что НИКОГДА не ломают запись в CRM (EXCEPTION → выход).
-- Клиент проекта берётся из projects.contact_participant_id → participant_channels.
--
-- Активация (endpoint+token задаются ОТДЕЛЬНО, вне git — см. конец файла).

-- Конфиг моста: singleton со секретным token. Закрыт RLS без политик (через REST
-- недоступен; читают только security-definer функции ниже под владельцем).
create table if not exists public.marketing_bridge_config (
  id boolean primary key default true check (id),
  endpoint text not null,
  token text not null,
  enabled boolean not null default true
);
alter table public.marketing_bridge_config enable row level security;

-- Отправка одного события в маркетинг. Тянет контакты клиента (email/phone/telegram)
-- из participant_channels (фолбэк — устаревшие поля participants). Если моста нет,
-- контактов нет или что-то упало — тихо выходит, не мешая работе CRM.
create or replace function public.notify_marketing_event(
  p_event text, p_project_id uuid, p_project_type text, p_stage text,
  p_participant uuid, p_amount numeric, p_external_id text, p_occurred timestamptz
) returns void language plpgsql security definer set search_path = public as $$
declare
  cfg public.marketing_bridge_config%rowtype;
  v_email text; v_phone text; v_tg text;
begin
  select * into cfg from public.marketing_bridge_config where id = true and enabled limit 1;
  if not found then return; end if;
  if p_participant is null then return; end if;

  select external_id into v_email from public.participant_channels
    where participant_id = p_participant and channel_type = 'email'
    order by is_primary desc nulls last limit 1;
  select external_id into v_phone from public.participant_channels
    where participant_id = p_participant and channel_type = 'phone'
    order by is_primary desc nulls last limit 1;
  select external_id into v_tg from public.participant_channels
    where participant_id = p_participant and channel_type = 'telegram'
    order by is_primary desc nulls last limit 1;

  if v_email is null and v_phone is null and v_tg is null then
    select email, phone, telegram_username into v_email, v_phone, v_tg
      from public.participants where id = p_participant;
  end if;
  if v_email is null and v_phone is null and v_tg is null then return; end if;

  perform net.http_post(
    url := cfg.endpoint,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object(
      'token', cfg.token, 'event', p_event,
      'email', v_email, 'phone', v_phone, 'telegram', v_tg,
      'project_id', p_project_id::text, 'project_type', p_project_type,
      'stage', p_stage, 'amount', p_amount,
      'external_id', p_external_id, 'occurred_at', p_occurred
    )
  );
exception when others then
  return;   -- интеграция никогда не должна ломать основную операцию
end;
$$;

-- Триггер на проекты: рабочий тип (activated) и финальный исход (won/lost).
create or replace function public.trg_marketing_project()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_is_lead boolean; v_tmpl text;
  v_prev_is_lead boolean;
  v_stage text; v_is_final boolean; v_final text;
begin
  if coalesce(NEW.is_deleted, false) then return NEW; end if;

  select is_lead_template, name into v_is_lead, v_tmpl
    from public.project_templates where id = NEW.template_id;
  select name, is_final, final_kind::text into v_stage, v_is_final, v_final
    from public.statuses where id = NEW.status_id;

  -- «в работе»: проект создан сразу в рабочем типе ИЛИ переделан из «Лида» в рабочий
  if coalesce(v_is_lead, true) = false then
    if TG_OP = 'INSERT' then
      perform notify_marketing_event('activated', NEW.id, v_tmpl, v_stage,
        NEW.contact_participant_id, null, null, now());
    elsif TG_OP = 'UPDATE' and NEW.template_id is distinct from OLD.template_id then
      select is_lead_template into v_prev_is_lead from public.project_templates where id = OLD.template_id;
      if coalesce(v_prev_is_lead, true) = true then
        perform notify_marketing_event('activated', NEW.id, v_tmpl, v_stage,
          NEW.contact_participant_id, null, null, now());
      end if;
    end if;
  end if;

  -- исход: статус сменился на финальный
  if TG_OP = 'UPDATE' and NEW.status_id is distinct from OLD.status_id
     and NEW.status_id is not null and coalesce(v_is_final, false) then
    perform notify_marketing_event(
      case when v_final = 'won' then 'won' else 'lost' end,
      NEW.id, v_tmpl, v_stage, NEW.contact_participant_id, null, null, now());
  end if;

  return NEW;
exception when others then
  return NEW;
end;
$$;

drop trigger if exists trg_marketing_project on public.projects;
create trigger trg_marketing_project
  after insert or update on public.projects
  for each row execute function public.trg_marketing_project();

-- Триггер на доход: income → «оплачено» + сумма. Клиент из транзакции либо из
-- контакта проекта. external_id = id транзакции (защита от двойного применения).
create or replace function public.trg_marketing_income()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_part uuid; v_tmpl text; v_pid uuid;
begin
  if NEW.type <> 'income' or coalesce(NEW.is_deleted, false) then return NEW; end if;

  v_pid := NEW.project_id;
  v_part := NEW.participant_id;
  if v_part is null then
    select contact_participant_id into v_part from public.projects where id = v_pid;
  end if;
  select pt.name into v_tmpl
    from public.projects p left join public.project_templates pt on pt.id = p.template_id
    where p.id = v_pid;

  perform notify_marketing_event('income', v_pid, v_tmpl, null,
    v_part, NEW.amount, NEW.id::text, NEW.date::timestamptz);
  return NEW;
exception when others then
  return NEW;
end;
$$;

drop trigger if exists trg_marketing_income on public.project_transactions;
create trigger trg_marketing_income
  after insert on public.project_transactions
  for each row execute function public.trg_marketing_income();

-- ── АКТИВАЦИЯ (выполнить вручную в SQL-редакторе CRM, НЕ коммитить с токеном) ──
-- insert into public.marketing_bridge_config (id, endpoint, token, enabled)
-- values (true,
--   'https://ypgskcldlfeyhwguspre.supabase.co/functions/v1/ingest-crm-event',
--   '<INGEST_TOKEN>', true)
-- on conflict (id) do update
--   set endpoint = excluded.endpoint, token = excluded.token, enabled = excluded.enabled;
