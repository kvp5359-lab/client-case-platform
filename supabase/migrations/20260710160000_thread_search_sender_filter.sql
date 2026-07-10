-- Доработка поиска по треду: фильтр по отправителю + список отправителей треда.

-- 1. Пересоздаём search_thread_messages с параметром p_sender_participant_id
--    (добавление аргумента = смена сигнатуры → DROP+CREATE).
drop function if exists public.search_thread_messages(uuid, text, boolean, boolean, boolean, integer);

create function public.search_thread_messages(
  p_thread_id uuid,
  p_query text default '',
  p_want_files boolean default false,
  p_want_images boolean default false,
  p_want_links boolean default false,
  p_sender_participant_id uuid default null,
  p_limit integer default 200
)
returns table(id uuid)
language sql
stable
security invoker
set search_path = public
as $$
  select m.id
  from public.project_messages m
  where m.thread_id = p_thread_id
    and coalesce(m.is_deleted, false) = false
    and coalesce(m.is_draft, false) = false
    and (p_sender_participant_id is null or m.sender_participant_id = p_sender_participant_id)
    and (
      coalesce(p_query, '') = ''
      or m.content ilike '%' ||
         replace(replace(replace(p_query, '\', '\\'), '%', '\%'), '_', '\_')
         || '%'
    )
    and (
      (not p_want_files and not p_want_images and not p_want_links)
      or (p_want_images and exists (
            select 1 from public.message_attachments a
            where a.message_id = m.id and a.mime_type ilike 'image/%'))
      or (p_want_files and exists (
            select 1 from public.message_attachments a
            where a.message_id = m.id
              and (a.mime_type is null or a.mime_type not ilike 'image/%')))
      or (p_want_links and m.content ~* 'https?://')
    )
  order by m.created_at desc, m.id desc
  limit greatest(1, least(coalesce(p_limit, 200), 500));
$$;

revoke all on function public.search_thread_messages(uuid, text, boolean, boolean, boolean, uuid, integer) from public;
grant execute on function public.search_thread_messages(uuid, text, boolean, boolean, boolean, uuid, integer) to authenticated, service_role;

-- 2. Список отправителей треда (для селектора фильтра). Актуальное имя/аватар
--    из participants, фолбэк на snapshot sender_name.
create or replace function public.get_thread_senders(p_thread_id uuid)
returns table(participant_id uuid, name text, avatar_url text)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct on (m.sender_participant_id)
    m.sender_participant_id as participant_id,
    coalesce(nullif(trim(coalesce(p.name, '') || ' ' || coalesce(p.last_name, '')), ''), m.sender_name) as name,
    p.avatar_url
  from public.project_messages m
  left join public.participants p on p.id = m.sender_participant_id
  where m.thread_id = p_thread_id
    and coalesce(m.is_deleted, false) = false
    and coalesce(m.is_draft, false) = false
    and m.sender_participant_id is not null
  order by m.sender_participant_id, m.created_at desc
$$;

revoke all on function public.get_thread_senders(uuid) from public;
grant execute on function public.get_thread_senders(uuid) to authenticated, service_role;
