-- Откат колонки is_public_for_clients: оказалась избыточной.
--
-- Изначально добавлена как «защита от утечки» статей клиенту через бота.
-- На практике видимость и так определяется тем, какие статьи включены
-- в шаблон проекта (knowledge_article_templates / knowledge_group_templates).
-- Двойная галка только создавала работу юристу.

ALTER TABLE public.knowledge_articles DROP COLUMN IF EXISTS is_public_for_clients;
ALTER TABLE public.knowledge_qa DROP COLUMN IF EXISTS is_public_for_clients;
