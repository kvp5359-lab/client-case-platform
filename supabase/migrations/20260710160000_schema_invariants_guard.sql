-- Read-only guard RPC for CI (scripts/check-db-invariants.mjs). Returns booleans
-- + column counts so the pipeline can assert two known-fragile couplings WITHOUT
-- a direct Postgres connection (CI only has the service key + supabase-js):
--   1. recompute_thread_unread_for keeps every accumulated unread-formula rule
--      (a CREATE OR REPLACE from one session historically dropped another's line).
--   2. get_board_filtered_threads out-column count == get_workspace_threads
--      (mismatch already caused a prod outage — 2026-06-24, boards/calendar 400).
-- service_role only (like _schema_manifest).
create or replace function public._schema_invariants()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object(
    'recompute_markers', (
      with d as (select pg_get_functiondef('public.recompute_thread_unread_for(uuid,uuid)'::regprocedure) as def)
      select jsonb_build_object(
        'change_deadline_excluded', def like '%change_deadline%',
        'assignee_event_gate',      def like '%task_assignees%',
        'visibility_gate',          def like '%visibility%',
        'own_message_watermark',    def like '%GREATEST%',
        'subscription_gate',        (def ilike '%subscrib%' or def like '%muted%')
      ) from d
    ),
    'board_out_cols',     (select count(*) from unnest((select proargmodes from pg_proc where proname='get_board_filtered_threads' and pronamespace='public'::regnamespace limit 1)) m where m='t'),
    'workspace_out_cols', (select count(*) from unnest((select proargmodes from pg_proc where proname='get_workspace_threads' and pronamespace='public'::regnamespace limit 1)) m where m='t')
  );
$$;
revoke all on function public._schema_invariants() from public;
revoke all on function public._schema_invariants() from anon;
revoke all on function public._schema_invariants() from authenticated;
grant execute on function public._schema_invariants() to service_role;
