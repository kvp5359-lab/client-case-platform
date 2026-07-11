-- Q&A tree: atomic move of a Q&A item between groups (mirror of move_article_to_group).

create or replace function public.move_qa_to_group(
  p_qa_id uuid,
  p_from_group_id uuid default null,
  p_to_group_id uuid default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if p_from_group_id is not null then
    delete from knowledge_qa_groups
    where qa_id = p_qa_id and group_id = p_from_group_id;
  end if;

  if p_to_group_id is not null then
    insert into knowledge_qa_groups (qa_id, group_id, sort_order)
    values (p_qa_id, p_to_group_id, 9999)
    on conflict (qa_id, group_id) do nothing;
  end if;
end;
$function$;

grant execute on function public.move_qa_to_group(uuid, uuid, uuid) to authenticated, service_role;
