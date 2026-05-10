-- =====================================================================
-- Performance: replace bare auth.uid() in RLS policies with a wrapped
-- (SELECT auth.uid()) so Postgres evaluates it once via initplan
-- instead of recomputing on every row. Supabase advisor flag:
-- `auth_rls_initplan`. Effect on hot SELECT paths: 2-10x speedup on
-- large tables.
--
-- Approach: introspect each policy, regex-replace in the text of its
-- USING/WITH CHECK expressions, then ALTER POLICY ... USING (...)
-- WITH CHECK (...). ALTER POLICY preserves the policy's action, role
-- list and permissive flag — only the expressions are rewritten.
--
-- Idempotent: an already-wrapped (SELECT auth.uid()) won't be touched
-- (the regex_replace's collapse step undoes any accidental double-wrap).
--
-- Per-policy try/catch — a single broken legacy policy (e.g. an INSERT
-- policy with a never-evaluated USING clause that references a
-- non-existent column) doesn't abort the entire pass. Skipped policies
-- are NOTICEd with the underlying SQLERRM for follow-up.
-- =====================================================================

DO $migration$
DECLARE
  r RECORD;
  v_qual TEXT;
  v_check TEXT;
  v_new_qual TEXT;
  v_new_check TEXT;
  v_sql TEXT;
  v_changed BOOLEAN;
  v_ok INT := 0;
  v_skip INT := 0;
BEGIN
  FOR r IN
    SELECT
      pol.polname,
      c.relname AS table_name,
      pol.polcmd,
      pg_get_expr(pol.polqual, pol.polrelid) AS qual_text,
      pg_get_expr(pol.polwithcheck, pol.polrelid) AS check_text
    FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
  LOOP
    v_qual := r.qual_text;
    v_check := r.check_text;
    v_changed := false;
    v_new_qual := NULL;
    v_new_check := NULL;

    IF v_qual IS NOT NULL THEN
      v_new_qual := regexp_replace(v_qual, 'auth\.uid\(\)', '(SELECT auth.uid())', 'g');
      v_new_qual := regexp_replace(v_new_qual, '\(\s*SELECT\s+\(SELECT\s+auth\.uid\(\)\)\s*\)', '(SELECT auth.uid())', 'g');
      IF v_new_qual IS DISTINCT FROM v_qual THEN
        v_changed := true;
      END IF;
    END IF;

    IF v_check IS NOT NULL THEN
      v_new_check := regexp_replace(v_check, 'auth\.uid\(\)', '(SELECT auth.uid())', 'g');
      v_new_check := regexp_replace(v_new_check, '\(\s*SELECT\s+\(SELECT\s+auth\.uid\(\)\)\s*\)', '(SELECT auth.uid())', 'g');
      IF v_new_check IS DISTINCT FROM v_check THEN
        v_changed := true;
      END IF;
    END IF;

    IF NOT v_changed THEN
      CONTINUE;
    END IF;

    v_sql := format('ALTER POLICY %I ON public.%I', r.polname, r.table_name);
    IF v_new_qual IS NOT NULL THEN
      v_sql := v_sql || format(' USING (%s)', v_new_qual);
    END IF;
    IF v_new_check IS NOT NULL THEN
      v_sql := v_sql || format(' WITH CHECK (%s)', v_new_check);
    END IF;

    BEGIN
      EXECUTE v_sql;
      v_ok := v_ok + 1;
    EXCEPTION WHEN OTHERS THEN
      v_skip := v_skip + 1;
      RAISE NOTICE 'skip %.%: %', r.table_name, r.polname, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE 'rewrote % policies, skipped %', v_ok, v_skip;
END
$migration$;
