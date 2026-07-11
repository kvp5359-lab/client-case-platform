-- Описания разделов документов в пикере «молнии» сортируются по ПОРЯДКУ ПАПОК
-- в наборе документов (document_kits.sort_order → folders.sort_order →
-- folder_slots.sort_order), а не по алфавиту заголовка статьи.
-- Статья, привязанная к нескольким папкам/слотам → берётся минимальная позиция.
-- Template-статьи (не описания папок) сохраняют прежнюю сортировку по группе БЗ.
CREATE OR REPLACE FUNCTION public.get_project_shareable_resources(p_project_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    -- Описание раздела = папка. Позиция = набор, папка (слот-часть 0).
    select f.knowledge_article_id aid,
           coalesce(dk.sort_order, 0)::bigint * 1000000
             + coalesce(f.sort_order, 0)::bigint * 1000 as pos
    from folders f
    left join document_kits dk on dk.id = f.document_kit_id
    where f.project_id = p_project_id and f.knowledge_article_id is not null
    union all
    -- Описание слота. Позиция = набор, папка, слот внутри папки.
    select fs.knowledge_article_id,
           coalesce(dk.sort_order, 0)::bigint * 1000000
             + coalesce(f.sort_order, 0)::bigint * 1000
             + coalesce(fs.sort_order, 0)::bigint as pos
    from folder_slots fs
    join folders f on f.id = fs.folder_id
    left join document_kits dk on dk.id = f.document_kit_id
    where fs.project_id = p_project_id and fs.knowledge_article_id is not null
  ),
  avail as (
    select article_id, true as is_template, null::bigint as ord_pos from tmpl
    union
    select aid, false, min(pos)
    from fold
    where aid not in (select article_id from tmpl)
    group by aid
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'article_id', a.id,
      'title', a.title,
      'token', sl.token,
      'group_name', case when av.is_template then g.name else 'Описания разделов документов' end
    )
    order by (case when av.is_template then 0 else 1 end), av.ord_pos, g.name nulls last, a.title
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
$function$;
