-- Separate group hierarchies for articles vs Q&A while reusing one table.
-- kind='article' — группы дерева статей; kind='qa' — группы дерева Q&A.
-- Существующие группы становятся статейными; Q&A-дерево создаёт свои (kind='qa').

alter table public.knowledge_groups
  add column if not exists kind text not null default 'article';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'knowledge_groups_kind_check') then
    alter table public.knowledge_groups
      add constraint knowledge_groups_kind_check check (kind in ('article', 'qa'));
  end if;
end $$;

update public.knowledge_groups set kind = 'article' where kind is null or kind not in ('article', 'qa');

create index if not exists idx_knowledge_groups_workspace_kind
  on public.knowledge_groups(workspace_id, kind);
