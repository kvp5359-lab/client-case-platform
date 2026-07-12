-- Q&A в пикере «молнии» мессенджера.
--
-- Даёт «потребление» Q&A по модели доступа (control/storage завёл
-- 20260711160000_knowledge_qa_template_access.sql, но резолвер не подключал):
--   1. resolve_template_qa_ids(template) — зеркало resolve_template_article_ids,
--      но по Q&A-дереву (knowledge_groups.kind='qa') и Q&A-junction'ам.
--   2. get_shareable_qa(workspace, project?) — отдаёт опубликованные Q&A,
--      доступные проекту; без проекта — только режим 'everywhere'.
--      Вставляется ТЕКСТ ответа (не ссылка) → возвращаем question + answer.

-- ── 1. Рекурсивный резолвер видимых Q&A по шаблону проекта ───────────────────
create or replace function public.resolve_template_qa_ids(p_template_id uuid)
returns table(qa_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  with recursive
  tmpl as (
    select id, workspace_id from project_templates where id = p_template_id
  ),
  grp as (
    select
      g.id,
      g.parent_id,
      case g.template_access_mode
        when 'everywhere' then true
        when 'nowhere'    then false
        when 'selected'   then exists (
          select 1 from knowledge_group_templates gt
          where gt.group_id = g.id and gt.project_template_id = p_template_id
        )
        else false
      end as visible
    from knowledge_groups g
    where g.parent_id is null
      and g.kind = 'qa'
      and g.workspace_id = (select workspace_id from tmpl)
    union all
    select
      c.id,
      c.parent_id,
      case c.template_access_mode
        when 'everywhere' then true
        when 'nowhere'    then false
        when 'selected'   then exists (
          select 1 from knowledge_group_templates gt
          where gt.group_id = c.id and gt.project_template_id = p_template_id
        )
        else p.visible
      end
    from knowledge_groups c
    join grp p on c.parent_id = p.id
    where c.kind = 'qa'
  )
  select q.id
  from knowledge_qa q
  where q.workspace_id = (select workspace_id from tmpl)
    and (
      q.template_access_mode = 'everywhere'
      or (
        q.template_access_mode = 'selected'
        and exists (
          select 1 from knowledge_qa_templates qt
          where qt.qa_id = q.id and qt.project_template_id = p_template_id
        )
      )
      or (
        q.template_access_mode = 'inherit'
        and exists (
          select 1
          from knowledge_qa_groups qg
          join grp on grp.id = qg.group_id
          where qg.qa_id = q.id and grp.visible
        )
      )
    );
$$;

-- ── 2. Ресурс для пикера: опубликованные Q&A, доступные в контексте треда ────
create or replace function public.get_shareable_qa(
  p_workspace_id uuid,
  p_project_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_template uuid;
  v_ids      uuid[];
  v_result   jsonb;
begin
  if not public.is_workspace_team_member(p_workspace_id, auth.uid()) then
    raise exception 'access denied';
  end if;

  if p_project_id is not null then
    select template_id into v_template
    from projects
    where id = p_project_id and workspace_id = p_workspace_id;
  end if;

  if v_template is not null then
    -- Тред с проектом: полная модель доступа (everywhere + selected + inherit).
    select array_agg(qa_id) into v_ids
    from public.resolve_template_qa_ids(v_template);
  else
    -- Личный тред без проекта (или проект без шаблона): только «везде».
    select array_agg(id) into v_ids
    from knowledge_qa
    where workspace_id = p_workspace_id
      and template_access_mode = 'everywhere';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'qa_id', q.id,
      'question', q.question,
      'answer', q.answer,
      'group_name', g.name
    )
    order by g.name nulls last, q.question
  ), '[]'::jsonb)
  into v_result
  from knowledge_qa q
  left join lateral (
    select kg.name
    from knowledge_qa_groups qg
    join knowledge_groups kg on kg.id = qg.group_id
    where qg.qa_id = q.id
    order by kg.sort_order nulls last, kg.name
    limit 1
  ) g on true
  where q.workspace_id = p_workspace_id
    and q.is_published = true
    and q.id = any(v_ids);

  return v_result;
end;
$function$;

-- ── 3. Гранты (service_role + authenticated; anon отозвать) ──────────────────
revoke all on function public.resolve_template_qa_ids(uuid) from public;
revoke all on function public.get_shareable_qa(uuid, uuid) from public;
grant execute on function public.resolve_template_qa_ids(uuid) to authenticated, service_role;
grant execute on function public.get_shareable_qa(uuid, uuid) to authenticated, service_role;
