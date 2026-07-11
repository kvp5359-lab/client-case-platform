-- Q&A: unify access model with articles.
-- Adds template_access_mode (same 4 states) to knowledge_qa and a
-- knowledge_qa_templates junction mirroring knowledge_article_templates, so the
-- shared access popup works on Q&A exactly like on articles/groups.
--
-- NB: consumption (project view / bot RAG) is intentionally NOT wired here —
-- this only unifies the CONTROL and storage of access.

-- ── 1. Access-mode column ───────────────────────────────────────────────────

alter table public.knowledge_qa
  add column if not exists template_access_mode text not null default 'inherit';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'knowledge_qa_template_access_mode_check'
  ) then
    alter table public.knowledge_qa
      add constraint knowledge_qa_template_access_mode_check
      check (template_access_mode in ('inherit', 'everywhere', 'selected', 'nowhere'));
  end if;
end $$;

-- ── 2. Junction knowledge_qa_templates (mirror of knowledge_article_templates) ─

create table if not exists public.knowledge_qa_templates (
  id uuid primary key default gen_random_uuid(),
  qa_id uuid not null references public.knowledge_qa(id) on delete cascade,
  project_template_id uuid not null references public.project_templates(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (qa_id, project_template_id)
);

create index if not exists idx_knowledge_qa_templates_qa on public.knowledge_qa_templates(qa_id);
create index if not exists idx_knowledge_qa_templates_tmpl on public.knowledge_qa_templates(project_template_id);

alter table public.knowledge_qa_templates enable row level security;

-- RLS: доступ у участника воркспейса, которому принадлежит тип проекта
-- (дословное зеркало политик kat_* на knowledge_article_templates).
drop policy if exists kqt_select on public.knowledge_qa_templates;
create policy kqt_select on public.knowledge_qa_templates
  for select to public
  using (
    exists (
      select 1 from public.project_templates pt
      join public.participants p
        on p.workspace_id = pt.workspace_id and p.user_id = (select auth.uid())
      where pt.id = knowledge_qa_templates.project_template_id
    )
  );

drop policy if exists kqt_insert on public.knowledge_qa_templates;
create policy kqt_insert on public.knowledge_qa_templates
  for insert to public
  with check (
    exists (
      select 1 from public.project_templates pt
      join public.participants p
        on p.workspace_id = pt.workspace_id and p.user_id = (select auth.uid())
      where pt.id = knowledge_qa_templates.project_template_id
    )
  );

drop policy if exists kqt_delete on public.knowledge_qa_templates;
create policy kqt_delete on public.knowledge_qa_templates
  for delete to public
  using (
    exists (
      select 1 from public.project_templates pt
      join public.participants p
        on p.workspace_id = pt.workspace_id and p.user_id = (select auth.uid())
      where pt.id = knowledge_qa_templates.project_template_id
    )
  );

grant select, insert, delete on public.knowledge_qa_templates to authenticated;
grant all on public.knowledge_qa_templates to service_role;
