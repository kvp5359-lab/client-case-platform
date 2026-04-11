-- 2026-04-11: Drop duplicate HNSW index on knowledge_embeddings.embedding.
--
-- Two identical HNSW indexes existed on public.knowledge_embeddings(embedding)
-- with the same m=16, ef_construction=64 parameters:
--   - idx_knowledge_embeddings_vector (manually named, kept)
--   - knowledge_embeddings_embedding_idx (auto-generated, dropped)
--
-- Duplicates waste disk space and slow down INSERT/UPDATE on the base knowledge
-- table, which matters during indexing runs.

DROP INDEX IF EXISTS public.knowledge_embeddings_embedding_idx;
