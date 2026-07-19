-- get_project_shareable_resources: слоты дерева документов теперь резолвят
-- ЭФФЕКТИВНУЮ статью = coalesce(folder_slots.knowledge_article_id, slot_templates.knowledge_article_id).
--
-- Причина: у слотов проекта статья часто живёт на шаблоне слота (справочник),
-- а не локально. До фикса RPC отдавал article_id = fs.knowledge_article_id (NULL)
-- → кнопка «молния» в композере не подставляла ссылку на такие слоты, хотя
-- сама статья (унаследованная) уже отображалась. Обратная ссылка
-- folder_slots.slot_template_id заведена миграцией 20260718190000.
--
-- Тело снято с прода (применено ранее через MCP) и зафиксировано в репо.
-- Резолв статьи ПАПКИ не менялся. Секретов в функции нет.

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
  v_doc_tree jsonb;
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
    select f.knowledge_article_id aid,
           coalesce(dk.sort_order, 0)::bigint * 1000000
             + coalesce(f.sort_order, 0)::bigint * 1000 as pos
    from folders f
    left join document_kits dk on dk.id = f.document_kit_id
    where f.project_id = p_project_id and f.knowledge_article_id is not null
    union all
    select coalesce(fs.knowledge_article_id, stpl0.knowledge_article_id),
           coalesce(dk.sort_order, 0)::bigint * 1000000
             + coalesce(f.sort_order, 0)::bigint * 1000
             + coalesce(fs.sort_order, 0)::bigint as pos
    from folder_slots fs
    join folders f on f.id = fs.folder_id
    left join document_kits dk on dk.id = f.document_kit_id
    left join slot_templates stpl0 on stpl0.id = fs.slot_template_id
    where fs.project_id = p_project_id
      and coalesce(fs.knowledge_article_id, stpl0.knowledge_article_id) is not null
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

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'kit_id', dk.id,
      'name', coalesce(nullif(dk.name, ''), 'Документы'),
      'folders', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'folder_id', f.id,
            'name', coalesce(nullif(f.name, ''), 'Папка'),
            'article_id', f.knowledge_article_id,
            'token', ft.token,
            'slots', coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'slot_id', fs.id,
                  'name', coalesce(nullif(fs.name, ''), 'Документ'),
                  'article_id', coalesce(fs.knowledge_article_id, stpl.knowledge_article_id),
                  'token', st.token,
                  'has_document', (fs.document_id is not null and exists (
                    select 1 from documents d
                    where d.id = fs.document_id and d.is_deleted = false
                  ))
                )
                order by fs.sort_order nulls last, fs.created_at
              )
              from folder_slots fs
              left join slot_templates stpl on stpl.id = fs.slot_template_id
              left join lateral (
                select sl2.token
                from article_share_links sl2
                where sl2.article_id = coalesce(fs.knowledge_article_id, stpl.knowledge_article_id)
                  and sl2.project_id = p_project_id
                  and sl2.revoked_at is null
                limit 1
              ) st on true
              where fs.folder_id = f.id
            ), '[]'::jsonb)
          )
          order by f.sort_order nulls last, f.created_at
        )
        from folders f
        left join lateral (
          select sl3.token
          from article_share_links sl3
          where sl3.article_id = f.knowledge_article_id
            and sl3.project_id = p_project_id
            and sl3.revoked_at is null
          limit 1
        ) ft on true
        where f.document_kit_id = dk.id and f.project_id = p_project_id
      ), '[]'::jsonb)
    )
    order by dk.sort_order, dk.name
  ), '[]'::jsonb)
  into v_doc_tree
  from document_kits dk
  where dk.project_id = p_project_id;

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

  return jsonb_build_object('articles', v_articles, 'external', v_external, 'doc_tree', v_doc_tree);
end;
$function$;
