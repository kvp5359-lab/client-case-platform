-- Фаза 1.2 аудита безопасности: авторизация knowledge-RPC.
--
-- Проблема: три SECURITY DEFINER функции от 2026-07-11 не имели внутренней
-- проверки доступа, а две из них были исполнимы anon (широкий REVOKE
-- FROM PUBLIC был разовым DO-блоком по дате и их не покрыл):
--   * move_qa_to_group / move_article_to_group — пишут в группировку БЗ по
--     UUID без проверки, что вызывающий имеет доступ к воркспейсу;
--   * resolve_template_article_ids — читает статьи БЗ по template_id (обход
--     RLS, кросс-воркспейс перечисление), исполнима anon.
--
-- Фикс: REVOKE anon/PUBLIC + гейт по членству в воркспейсе сущности
-- (service_role пропускается — edge RAG зовёт под service-key). move-функции
-- дополнительно проверяют, что обе группы принадлежат тому же воркспейсу
-- (защита от кросс-workspace связей). resolve_* — паттерн обёртка+_impl.
-- Вызывающих в БД нет (проверено), фронт-вызовы идут от участников воркспейса.

-- 1) move_qa_to_group
CREATE OR REPLACE FUNCTION public.move_qa_to_group(
  p_qa_id uuid, p_from_group_id uuid DEFAULT NULL::uuid, p_to_group_id uuid DEFAULT NULL::uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_ws uuid;
BEGIN
  SELECT workspace_id INTO v_ws FROM knowledge_qa WHERE id = p_qa_id;
  IF v_ws IS NULL
     OR NOT (coalesce(auth.role(),'') = 'service_role'
             OR public.is_workspace_participant(v_ws, (SELECT auth.uid()))) THEN
    RAISE EXCEPTION 'access denied' USING ERRCODE = '42501';
  END IF;
  IF p_from_group_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM knowledge_groups WHERE id = p_from_group_id AND workspace_id = v_ws) THEN
    RAISE EXCEPTION 'group workspace mismatch' USING ERRCODE = '42501';
  END IF;
  IF p_to_group_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM knowledge_groups WHERE id = p_to_group_id AND workspace_id = v_ws) THEN
    RAISE EXCEPTION 'group workspace mismatch' USING ERRCODE = '42501';
  END IF;

  IF p_from_group_id IS NOT NULL THEN
    DELETE FROM knowledge_qa_groups WHERE qa_id = p_qa_id AND group_id = p_from_group_id;
  END IF;
  IF p_to_group_id IS NOT NULL THEN
    INSERT INTO knowledge_qa_groups (qa_id, group_id, sort_order)
    VALUES (p_qa_id, p_to_group_id, 9999)
    ON CONFLICT (qa_id, group_id) DO NOTHING;
  END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public.move_qa_to_group(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.move_qa_to_group(uuid, uuid, uuid) TO authenticated, service_role;

-- 2) move_article_to_group
CREATE OR REPLACE FUNCTION public.move_article_to_group(
  p_article_id uuid, p_from_group_id uuid DEFAULT NULL::uuid, p_to_group_id uuid DEFAULT NULL::uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_ws uuid;
BEGIN
  SELECT workspace_id INTO v_ws FROM knowledge_articles WHERE id = p_article_id;
  IF v_ws IS NULL
     OR NOT (coalesce(auth.role(),'') = 'service_role'
             OR public.is_workspace_participant(v_ws, (SELECT auth.uid()))) THEN
    RAISE EXCEPTION 'access denied' USING ERRCODE = '42501';
  END IF;
  IF p_from_group_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM knowledge_groups WHERE id = p_from_group_id AND workspace_id = v_ws) THEN
    RAISE EXCEPTION 'group workspace mismatch' USING ERRCODE = '42501';
  END IF;
  IF p_to_group_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM knowledge_groups WHERE id = p_to_group_id AND workspace_id = v_ws) THEN
    RAISE EXCEPTION 'group workspace mismatch' USING ERRCODE = '42501';
  END IF;

  IF p_from_group_id IS NOT NULL THEN
    DELETE FROM knowledge_article_groups WHERE article_id = p_article_id AND group_id = p_from_group_id;
  END IF;
  IF p_to_group_id IS NOT NULL THEN
    INSERT INTO knowledge_article_groups (article_id, group_id, sort_order)
    VALUES (p_article_id, p_to_group_id, 9999)
    ON CONFLICT (article_id, group_id) DO NOTHING;
  END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public.move_article_to_group(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.move_article_to_group(uuid, uuid, uuid) TO authenticated, service_role;

-- 3) resolve_template_article_ids — обёртка+_impl (тело логики не трогаем)
ALTER FUNCTION public.resolve_template_article_ids(uuid) RENAME TO resolve_template_article_ids_impl;
REVOKE ALL ON FUNCTION public.resolve_template_article_ids_impl(uuid) FROM PUBLIC, anon, authenticated, service_role;
CREATE FUNCTION public.resolve_template_article_ids(p_template_id uuid)
RETURNS TABLE(article_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_ws uuid;
BEGIN
  SELECT workspace_id INTO v_ws FROM project_templates WHERE id = p_template_id;
  IF v_ws IS NULL
     OR NOT (coalesce(auth.role(),'') = 'service_role'
             OR public.is_workspace_participant(v_ws, (SELECT auth.uid()))) THEN
    RAISE EXCEPTION 'access denied' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM public.resolve_template_article_ids_impl(p_template_id);
END;
$function$;
GRANT EXECUTE ON FUNCTION public.resolve_template_article_ids(uuid) TO authenticated, service_role;
