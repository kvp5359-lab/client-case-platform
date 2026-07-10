-- Поиск по треду: отдельный фильтр «Аудио». «Файлы» теперь = документы
-- (не картинка И не аудио). Добавление аргумента → DROP+CREATE.
drop function if exists public.search_thread_messages(uuid, text, boolean, boolean, boolean, uuid, integer);

create function public.search_thread_messages(
  p_thread_id uuid,
  p_query text default '',
  p_want_files boolean default false,
  p_want_images boolean default false,
  p_want_links boolean default false,
  p_want_audio boolean default false,
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
      (not p_want_files and not p_want_images and not p_want_links and not p_want_audio)
      or (p_want_images and exists (
            select 1 from public.message_attachments a
            where a.message_id = m.id and a.mime_type ilike 'image/%'))
      or (p_want_audio and exists (
            select 1 from public.message_attachments a
            where a.message_id = m.id
              and (a.mime_type ilike 'audio/%' or a.mime_type ilike 'video/ogg%'
                   or a.file_name ilike 'voice_%')))
      or (p_want_files and exists (
            select 1 from public.message_attachments a
            where a.message_id = m.id
              and (a.mime_type is null or (
                   a.mime_type not ilike 'image/%'
                   and a.mime_type not ilike 'audio/%'
                   and a.mime_type not ilike 'video/ogg%'
                   and coalesce(a.file_name, '') not ilike 'voice_%'))))
      or (p_want_links and m.content ~* 'https?://')
    )
  order by m.created_at desc, m.id desc
  limit greatest(1, least(coalesce(p_limit, 200), 500));
$$;

revoke all on function public.search_thread_messages(uuid, text, boolean, boolean, boolean, boolean, uuid, integer) from public;
grant execute on function public.search_thread_messages(uuid, text, boolean, boolean, boolean, boolean, uuid, integer) to authenticated, service_role;
