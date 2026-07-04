-- Расширенный отпечаток схемы public для детектора дрейфа: функции + триггеры +
-- политики RLS (хеши, не тела — тела функций содержат секреты). Только service_role.
-- Заменяет _schema_function_manifest. Применено в прод через MCP.

CREATE OR REPLACE FUNCTION public._schema_manifest()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'functions', (
      SELECT COALESCE(jsonb_agg(row_to_json(f) ORDER BY f.name, f.args), '[]'::jsonb)
      FROM (
        SELECT p.proname AS name,
               pg_get_function_identity_arguments(p.oid) AS args,
               md5(pg_get_functiondef(p.oid)) AS body_md5
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname='public' AND p.prokind='f'
          AND p.proname NOT IN ('_schema_manifest','_schema_function_manifest')
      ) f
    ),
    'triggers', (
      SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.table_name, t.name), '[]'::jsonb)
      FROM (
        SELECT tg.tgname AS name, c.relname AS table_name,
               md5(pg_get_triggerdef(tg.oid)) AS def_md5
        FROM pg_trigger tg
        JOIN pg_class c ON c.oid = tg.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname='public' AND NOT tg.tgisinternal
      ) t
    ),
    'policies', (
      SELECT COALESCE(jsonb_agg(row_to_json(pol) ORDER BY pol.table_name, pol.name), '[]'::jsonb)
      FROM (
        SELECT pp.polname AS name, c.relname AS table_name,
               md5(
                 coalesce(pg_get_expr(pp.polqual, pp.polrelid),'') || '|' ||
                 coalesce(pg_get_expr(pp.polwithcheck, pp.polrelid),'') || '|' ||
                 pp.polcmd::text || '|' ||
                 coalesce((SELECT string_agg(rolname,',' ORDER BY rolname) FROM pg_roles WHERE oid = ANY(pp.polroles)),'')
               ) AS def_md5
        FROM pg_policy pp
        JOIN pg_class c ON c.oid = pp.polrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname='public'
      ) pol
    )
  );
$$;
REVOKE ALL ON FUNCTION public._schema_manifest() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._schema_manifest() TO service_role;

DROP FUNCTION IF EXISTS public._schema_function_manifest();
