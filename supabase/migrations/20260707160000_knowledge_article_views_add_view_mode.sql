-- Представление базы знаний помнит свой вид отображения (дерево/таблица):
-- при клике по вкладке-представлению список открывается сразу в нужном виде.

ALTER TABLE public.knowledge_article_views
  ADD COLUMN IF NOT EXISTS view_mode text NOT NULL DEFAULT 'tree'
  CHECK (view_mode IN ('tree', 'table'));

COMMENT ON COLUMN public.knowledge_article_views.view_mode IS 'Вид отображения представления: tree (дерево) или table (таблица).';
