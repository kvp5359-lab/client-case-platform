-- Фича: публичные ссылки на статьи БЗ для клиентов + сборщик ссылок проекта.
-- План: docs/feature-backlog/2026-07-07-client-share-links.md
--
-- Модель: одна активная ссылка на пару (статья, проект). Публичная страница
-- статьи работает, пока проект НЕ в финальном статусе и ссылка не отозвана.
-- Внешние ссылки (Drive/Sheets) собираются, но НЕ гейтятся статусом — они чужие.

-- ─────────────────────────────────────────────────────────────
-- Таблица токенов
-- ─────────────────────────────────────────────────────────────
create table if not exists public.article_share_links (
  id           uuid primary key default gen_random_uuid(),
  token        text not null unique,
  article_id   uuid not null references public.knowledge_articles(id) on delete cascade,
  project_id   uuid not null references public.projects(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  revoked_at   timestamptz
);

-- Одна АКТИВНАЯ ссылка на пару (статья, проект). Отозванные не мешают.
create unique index if not exists uq_article_share_active
  on public.article_share_links(article_id, project_id) where revoked_at is null;
create index if not exists idx_article_share_project on public.article_share_links(project_id);

alter table public.article_share_links enable row level security;

-- Читать список ссылок могут сотрудники воркспейса (для будущих нужд/отладки).
-- Запись — только через SECURITY DEFINER RPC ниже (прямых insert/update политик нет).
drop policy if exists article_share_links_select on public.article_share_links;
create policy article_share_links_select on public.article_share_links
  for select to authenticated
  using (public.is_workspace_team_member(workspace_id, (select auth.uid())));

-- ─────────────────────────────────────────────────────────────
-- Хелпер: статья реально доступна в проекте?
-- (через шаблон проекта, группу шаблона, папку или слот документов)
-- ─────────────────────────────────────────────────────────────
create or replace function public.article_available_in_project(
  p_article_id uuid,
  p_project_id uuid
) returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    -- через статьи шаблона проекта
    select 1
    from projects p
    join knowledge_article_templates kat on kat.project_template_id = p.template_id
    where p.id = p_project_id and kat.article_id = p_article_id
    union all
    -- через группы шаблона проекта
    select 1
    from projects p
    join knowledge_group_templates kgt on kgt.project_template_id = p.template_id
    join knowledge_article_groups kag on kag.group_id = kgt.group_id
    where p.id = p_project_id and kag.article_id = p_article_id
    union all
    -- через папку документов проекта
    select 1 from folders f
    where f.project_id = p_project_id and f.knowledge_article_id = p_article_id
    union all
    -- через слот документов проекта
    select 1 from folder_slots fs
    where fs.project_id = p_project_id and fs.knowledge_article_id = p_article_id
  );
$$;

-- ─────────────────────────────────────────────────────────────
-- Получить-или-создать ссылку на пару (статья, проект). Для сотрудников.
-- ─────────────────────────────────────────────────────────────
create or replace function public.ensure_article_share_link(
  p_article_id uuid,
  p_project_id uuid
) returns text
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_ws    uuid;
  v_token text;
begin
  select workspace_id into v_ws from projects where id = p_project_id;
  if v_ws is null then
    raise exception 'project not found';
  end if;
  if not public.is_workspace_team_member(v_ws, auth.uid()) then
    raise exception 'access denied';
  end if;
  if not public.article_available_in_project(p_article_id, p_project_id) then
    raise exception 'article is not available in this project';
  end if;

  select token into v_token
  from article_share_links
  where article_id = p_article_id and project_id = p_project_id and revoked_at is null
  limit 1;

  if v_token is not null then
    return v_token;
  end if;

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into article_share_links (token, article_id, project_id, workspace_id, created_by)
  values (v_token, p_article_id, p_project_id, v_ws, auth.uid());
  return v_token;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Пересоздать ссылку: отозвать старую активную + выдать новую.
-- ─────────────────────────────────────────────────────────────
create or replace function public.regenerate_article_share_link(
  p_article_id uuid,
  p_project_id uuid
) returns text
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_ws    uuid;
  v_token text;
begin
  select workspace_id into v_ws from projects where id = p_project_id;
  if v_ws is null then
    raise exception 'project not found';
  end if;
  if not public.is_workspace_team_member(v_ws, auth.uid()) then
    raise exception 'access denied';
  end if;
  if not public.article_available_in_project(p_article_id, p_project_id) then
    raise exception 'article is not available in this project';
  end if;

  update article_share_links
  set revoked_at = now()
  where article_id = p_article_id and project_id = p_project_id and revoked_at is null;

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into article_share_links (token, article_id, project_id, workspace_id, created_by)
  values (v_token, p_article_id, p_project_id, v_ws, auth.uid());
  return v_token;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Публичный резолвер ссылки (anon). Отдаёт статью, только если:
--  • ссылка не отозвана;
--  • проект не в корзине;
--  • проект НЕ в финальном статусе.
-- Всегда read-only (страница сама блокирует копирование).
-- ─────────────────────────────────────────────────────────────
create or replace function public.get_shared_article(p_token text)
returns table (title text, content text)
language sql stable security definer set search_path = public
as $$
  select a.title, a.content
  from article_share_links sl
  join projects p on p.id = sl.project_id
  join knowledge_articles a on a.id = sl.article_id
  left join statuses s on s.id = p.status_id
  left join project_template_statuses pts
    on pts.template_id = p.template_id and pts.status_id = p.status_id
  where sl.token = p_token
    and sl.revoked_at is null
    and coalesce(p.is_deleted, false) = false
    and coalesce(pts.is_final, s.is_final, false) = false
  limit 1;
$$;

-- ─────────────────────────────────────────────────────────────
-- Сборщик всех шеринг-ресурсов проекта (для диалога в треде). Для сотрудников.
-- Возвращает jsonb: { articles:[{article_id,title,token}], external:[{kind,label,url}] }
-- token — активный, если уже создавался (иначе null → создаётся по кнопке).
-- ─────────────────────────────────────────────────────────────
create or replace function public.get_project_shareable_resources(p_project_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_ws       uuid;
  v_articles jsonb;
  v_external jsonb;
begin
  select workspace_id into v_ws from projects where id = p_project_id;
  if v_ws is null then
    raise exception 'project not found';
  end if;
  if not public.is_workspace_team_member(v_ws, auth.uid()) then
    raise exception 'access denied';
  end if;

  -- Статьи, доступные в проекте (union distinct), + активный токен если есть.
  with tmpl as (
    select kat.article_id
    from projects p
    join knowledge_article_templates kat on kat.project_template_id = p.template_id
    where p.id = p_project_id
    union
    select kag.article_id
    from projects p
    join knowledge_group_templates kgt on kgt.project_template_id = p.template_id
    join knowledge_article_groups kag on kag.group_id = kgt.group_id
    where p.id = p_project_id
  ),
  fold as (
    select f.knowledge_article_id aid
    from folders f
    where f.project_id = p_project_id and f.knowledge_article_id is not null
    union
    select fs.knowledge_article_id
    from folder_slots fs
    where fs.project_id = p_project_id and fs.knowledge_article_id is not null
  ),
  -- Статья из шаблона → своя группа БЗ. Статья ТОЛЬКО из папки/слота →
  -- группа «Описания разделов документов».
  avail as (
    select article_id, true as is_template from tmpl
    union
    select aid, false from fold where aid not in (select article_id from tmpl)
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'article_id', a.id,
      'title', a.title,
      'token', sl.token,
      'group_name', case when av.is_template then g.name else 'Описания разделов документов' end
    )
    order by (case when av.is_template then 0 else 1 end), g.name nulls last, a.title
  ), '[]'::jsonb)
  into v_articles
  from avail av
  join knowledge_articles a on a.id = av.article_id
  left join article_share_links sl
    on sl.article_id = av.article_id and sl.project_id = p_project_id and sl.revoked_at is null
  left join lateral (
    select kg.name
    from knowledge_article_groups kag2
    join knowledge_groups kg on kg.id = kag2.group_id
    where kag2.article_id = a.id
    order by kg.sort_order nulls last, kg.name
    limit 1
  ) g on true;

  -- Внешние ссылки: папка проекта, анкета/бриф (Sheets), папки наборов
  -- документов и их подпапки на Google Drive. Загруженные файлы НЕ включаем.
  -- (Ветки kit_folder/doc_folder добавлены в 20260707150000_document_drive_folder_links.)
  select coalesce(jsonb_agg(x.item order by x.ord, x.item->>'label'), '[]'::jsonb) into v_external
  from (
    select 0 ord, jsonb_build_object(
      'kind','drive_folder','label','Папка проекта на Google Диске',
      'url', p.google_drive_folder_link) item
    from projects p
    where p.id = p_project_id and coalesce(p.google_drive_folder_link,'') <> ''
    union all
    select 1, jsonb_build_object(
      'kind','form','label', coalesce(nullif(fk.name,''),'Анкета'),
      'url', 'https://docs.google.com/spreadsheets/d/' || fk.google_sheet_id || '/edit')
    from form_kits fk
    where fk.project_id = p_project_id and fk.google_sheet_id is not null
    union all
    select 2, jsonb_build_object(
      'kind','brief','label', coalesce(nullif(fk.name,''),'Бриф') || ' (бриф)',
      'url', 'https://docs.google.com/spreadsheets/d/' || fk.brief_sheet_id || '/edit')
    from form_kits fk
    where fk.project_id = p_project_id and fk.brief_sheet_id is not null
    union all
    select 3, jsonb_build_object(
      'kind','kit_folder','kit_id', dk.id,
      'label', coalesce(nullif(dk.name,''),'Папка набора'),
      'url', 'https://drive.google.com/drive/folders/' || dk.drive_folder_id)
    from document_kits dk
    where dk.project_id = p_project_id and coalesce(dk.drive_folder_id,'') <> ''
    union all
    select 4, jsonb_build_object(
      'kind','doc_folder','kit_id', f.document_kit_id,
      'label', coalesce(nullif(f.name,''),'папка'),
      'url', 'https://drive.google.com/drive/folders/' || f.drive_folder_id)
    from folders f
    where f.project_id = p_project_id and coalesce(f.drive_folder_id,'') <> ''
  ) x;

  return jsonb_build_object('articles', v_articles, 'external', v_external);
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Гранты
-- ─────────────────────────────────────────────────────────────
revoke all on function public.article_available_in_project(uuid, uuid) from public, anon;
revoke all on function public.ensure_article_share_link(uuid, uuid) from public, anon;
revoke all on function public.regenerate_article_share_link(uuid, uuid) from public, anon;
revoke all on function public.get_project_shareable_resources(uuid) from public, anon;
revoke all on function public.get_shared_article(text) from public;

grant execute on function public.ensure_article_share_link(uuid, uuid) to authenticated, service_role;
grant execute on function public.regenerate_article_share_link(uuid, uuid) to authenticated, service_role;
grant execute on function public.get_project_shareable_resources(uuid) to authenticated, service_role;
-- Публичный резолвер — anon (как существующие short_id-резолверы).
grant execute on function public.get_shared_article(text) to anon, authenticated, service_role;
