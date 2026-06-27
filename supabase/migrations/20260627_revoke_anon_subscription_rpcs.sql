-- Finish the REVOKE-wave (ledger 2026-06-12/13 leftover): drop redundant anon EXECUTE
-- on subscription/thread RPCs that require an authenticated participant.
-- Applied to prod via MCP 2026-06-27.
--
-- NOTE: only the 4 subscription RPCs below had a DIRECT anon grant and are revoked here.
-- can_view_thread / has_project_permission are granted via PUBLIC (not anon directly) and
-- return false for anon (permission-check helpers, no data leak) — left as-is to avoid the
-- PUBLIC-revoke regressions previously seen ("boards not found"). has_workspace_permission
-- is referenced by an anon-facing RLS policy and MUST keep anon access.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure::text as sig
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in (
        'get_thread_subscribers','is_thread_subscribed_me',
        'set_my_thread_subscription','set_thread_subscription_for'
      )
      and has_function_privilege('anon', p.oid, 'EXECUTE')
  loop
    execute format('revoke execute on function %s from anon', r.sig);
  end loop;
end $$;
