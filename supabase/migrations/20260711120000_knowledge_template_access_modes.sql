-- Knowledge base: explicit per-entity access mode + recursive template resolver.
--
-- Adds template_access_mode to knowledge_articles and knowledge_groups:
--   inherit    — article follows its groups' visibility; group follows its parent
--                (a root group with `inherit` resolves to "nowhere").
--   everywhere — visible in every project type of the workspace.
--   selected   — visible ONLY in explicitly linked project types (REPLACES group inheritance).
--   nowhere    — hidden in every project type, even if a parent group is linked.
--
-- Also introduces resolve_template_article_ids(template) which walks the group
-- tree (nested subgroups now cascade) and returns visible article ids.

-- ── 1. Columns ──────────────────────────────────────────────────────────────

alter table public.knowledge_articles
  add column if not exists template_access_mode text not null default 'inherit';

alter table public.knowledge_groups
  add column if not exists template_access_mode text not null default 'inherit';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'knowledge_articles_template_access_mode_check'
  ) then
    alter table public.knowledge_articles
      add constraint knowledge_articles_template_access_mode_check
      check (template_access_mode in ('inherit', 'everywhere', 'selected', 'nowhere'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'knowledge_groups_template_access_mode_check'
  ) then
    alter table public.knowledge_groups
      add constraint knowledge_groups_template_access_mode_check
      check (template_access_mode in ('inherit', 'everywhere', 'selected', 'nowhere'));
  end if;
end $$;

-- ── 2. Backfill (preserve current behaviour) ────────────────────────────────
-- Entities that already have explicit template links become `selected`
-- (from now on selected REPLACES group inheritance). Everything else stays
-- `inherit`.

update public.knowledge_articles a
set template_access_mode = 'selected'
where a.template_access_mode = 'inherit'
  and exists (
    select 1 from public.knowledge_article_templates t where t.article_id = a.id
  );

update public.knowledge_groups g
set template_access_mode = 'selected'
where g.template_access_mode = 'inherit'
  and exists (
    select 1 from public.knowledge_group_templates t where t.group_id = g.id
  );

-- ── 3. Recursive resolver ───────────────────────────────────────────────────
-- Returns ids of articles visible for the given project template.
-- Visibility only (does NOT filter is_published — callers keep doing that).

create or replace function public.resolve_template_article_ids(p_template_id uuid)
returns table(article_id uuid)
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
  )
  select a.id
  from knowledge_articles a
  where a.workspace_id = (select workspace_id from tmpl)
    and (
      a.template_access_mode = 'everywhere'
      or (
        a.template_access_mode = 'selected'
        and exists (
          select 1 from knowledge_article_templates at
          where at.article_id = a.id and at.project_template_id = p_template_id
        )
      )
      or (
        a.template_access_mode = 'inherit'
        and exists (
          select 1
          from knowledge_article_groups ag
          join grp on grp.id = ag.group_id
          where ag.article_id = a.id and grp.visible
        )
      )
    );
$$;

grant execute on function public.resolve_template_article_ids(uuid) to authenticated, service_role;
