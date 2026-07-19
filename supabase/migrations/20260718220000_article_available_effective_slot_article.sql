-- article_available_in_project: ветка слотов учитывает ЭФФЕКТИВНУЮ статью
-- coalesce(folder_slots.knowledge_article_id, slot_templates.knowledge_article_id).
--
-- Причина: гейт ensure_article_share_link зовёт эту функцию перед созданием
-- токена. Для слота с УНАСЛЕДОВАННОЙ (из справочника) статьёй она возвращала
-- false → «article is not available in this project» → на фронте тост
-- «Не удалось получить ссылки» при вставке через молнию. Пара к фиксу RPC
-- get_project_shareable_resources (20260718210000).
--
-- Тело снято с прода (применено через MCP). Секретов в функции нет.

CREATE OR REPLACE FUNCTION public.article_available_in_project(p_article_id uuid, p_project_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from projects p
    join knowledge_article_templates kat on kat.project_template_id = p.template_id
    where p.id = p_project_id and kat.article_id = p_article_id
    union all
    select 1
    from projects p
    join knowledge_group_templates kgt on kgt.project_template_id = p.template_id
    join knowledge_article_groups kag on kag.group_id = kgt.group_id
    where p.id = p_project_id and kag.article_id = p_article_id
    union all
    select 1 from folders f
    where f.project_id = p_project_id and f.knowledge_article_id = p_article_id
    union all
    -- Слот: эффективная статья = локальная ?? унаследованная из справочника slot_templates.
    select 1 from folder_slots fs
    left join slot_templates st on st.id = fs.slot_template_id
    where fs.project_id = p_project_id
      and coalesce(fs.knowledge_article_id, st.knowledge_article_id) = p_article_id
  );
$function$;
