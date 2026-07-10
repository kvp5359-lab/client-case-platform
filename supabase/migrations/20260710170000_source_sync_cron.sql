-- Ежечасная авто-проверка источников Google Drive.
-- pg_cron раз в час зовёт run_source_sync(), которая через pg_net (net.http_post)
-- дёргает edge-функцию sync-source-documents с заголовком x-internal-secret.
-- Секрет и URL хранятся в служебной таблице source_sync_config и заполняются
-- ВНЕ репозитория (секрет не коммитим). Пока не заполнено/выключено — «спит».
create table if not exists public.source_sync_config (
  id              integer primary key default 1 check (id = 1),
  enabled         boolean not null default false,
  internal_secret text,
  function_url    text,
  last_run_at     timestamptz
);
insert into public.source_sync_config (id) values (1) on conflict (id) do nothing;
alter table public.source_sync_config enable row level security;
-- Содержит секрет — клиентам недоступна, только service_role.
revoke all on public.source_sync_config from anon, authenticated;
grant all on public.source_sync_config to service_role;

create or replace function public.run_source_sync()
returns void
language plpgsql security definer set search_path to 'public'
as $$
declare cfg public.source_sync_config;
begin
  select * into cfg from source_sync_config where id = 1;
  if not found or not cfg.enabled or cfg.internal_secret is null or cfg.function_url is null then
    return;  -- не настроено — молчим
  end if;
  perform net.http_post(
    url := cfg.function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', cfg.internal_secret
    ),
    body := '{}'::jsonb
  );
  update source_sync_config set last_run_at = now() where id = 1;
exception when others then
  null;  -- не роняем крон
end;
$$;
revoke all on function public.run_source_sync() from public, anon, authenticated;
grant execute on function public.run_source_sync() to service_role;

-- pg_cron: каждый час (в начале часа).
select cron.schedule('source-sync', '0 * * * *', 'SELECT public.run_source_sync();')
where not exists (select 1 from cron.job where jobname = 'source-sync');
