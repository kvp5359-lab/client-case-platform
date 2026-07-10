-- Поиск по сообщениям внутри треда с фильтрами по вложениям и ссылкам.
--
-- Возвращает id сообщений треда, подходящих под текстовый запрос И/ИЛИ фильтры:
--   p_want_images — есть вложение-картинка (mime image/*)
--   p_want_files  — есть вложение-НЕ-картинка (документ/аудио/голосовое)
--   p_want_links  — в тексте есть http(s)-ссылка
-- Фильтры комбинируются по ИЛИ (как чипы мультивыбора в UI). Если ни один
-- фильтр не выбран — работает чистый текстовый поиск. Пустой запрос + фильтр —
-- отдаёт все сообщения нужного типа (медиа-вкладка).
--
-- SECURITY INVOKER: чтение под RLS вызывающего (доступ к треду охраняет
-- can_user_access_thread на project_messages, вложения — RLS message_attachments).
-- Это чистое чтение, канальной логики отправки не касается.
create or replace function public.search_thread_messages(
  p_thread_id uuid,
  p_query text default '',
  p_want_files boolean default false,
  p_want_images boolean default false,
  p_want_links boolean default false,
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

revoke all on function public.search_thread_messages(uuid, text, boolean, boolean, boolean, integer) from public;
grant execute on function public.search_thread_messages(uuid, text, boolean, boolean, boolean, integer) to authenticated, service_role;
