-- Тип `vector` живёт в схеме `extensions` (Supabase ставит pgvector туда).
-- Функции с search_path=public его не видят и падают:
-- "Failed to upsert embeddings: type 'vector' does not exist"
-- Добавляем extensions в search_path обеим функциям, которые работают с vector.

ALTER FUNCTION public.upsert_knowledge_embeddings(uuid, uuid, uuid, jsonb)
  SET search_path = public, extensions;

ALTER FUNCTION public.match_knowledge_chunks(text, uuid, double precision, integer)
  SET search_path = public, extensions;
