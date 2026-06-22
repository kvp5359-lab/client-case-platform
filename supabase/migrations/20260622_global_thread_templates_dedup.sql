-- ============================================================================
-- Дедуп шаблонов тредов + заполнение junction project_template_thread_templates
--
-- До этой миграции каждый шаблон проекта имел СВОЙ набор thread_templates
-- (owner_project_template_id заполнен) → одинаковые этапы дублировались по
-- числу шаблонов проектов. Здесь:
--   1. группируем owner-scoped шаблоны по «телу» (имя+тип+цвет+иконка+доступы+
--      дедлайн+текст+тема+описание+контакт + сигнатура ассайнов);
--   2. в каждой группе выбираем КАНОНИЧЕСКУЮ запись (min id) и делаем её
--      ГЛОБАЛЬНОЙ (owner_project_template_id := NULL);
--   3. для КАЖДОЙ исходной owner-scoped записи пишем строку в junction
--      (её шаблон проекта → каноническая запись) с пер-проектными
--      sort_order / default_status_id / on_complete_set_project_status_id.
--
-- НЕ удаляет ни одной записи. Неканонические копии остаются (owner не трогаем),
-- т.к. на них ссылаются project_threads.source_template_id живых проектов.
-- В глобальную библиотеку (owner IS NULL) они не попадают. Их физическую
-- чистку (только те, на которые нет ссылок) делаем ОТДЕЛЬНОЙ миграцией позже.
--
-- Идемпотентность: INSERT ... ON CONFLICT DO NOTHING; повторный прогон
-- не создаёт дублей junction. Повторное «промоут в глобальный» — no-op.
-- ============================================================================

BEGIN;

WITH bodies AS (
  SELECT
    tt.id,
    tt.workspace_id,
    tt.owner_project_template_id AS template_id,
    tt.sort_order,
    tt.default_status_id,
    tt.on_complete_set_project_status_id,
    md5(
      coalesce(tt.name,'')                                  ||'|'||
      coalesce(tt.thread_type,'')                           ||'|'||
      coalesce(tt.is_email::text,'')                        ||'|'||
      coalesce(tt.thread_name_template,'')                  ||'|'||
      coalesce(tt.accent_color,'')                          ||'|'||
      coalesce(tt.icon,'')                                  ||'|'||
      coalesce(tt.access_type,'')                           ||'|'||
      coalesce(array_to_string(tt.access_roles,','),'')     ||'|'||
      coalesce(tt.deadline_days::text,'')                   ||'|'||
      coalesce(tt.email_subject_template,'')                ||'|'||
      coalesce(tt.initial_message_html,'')                  ||'|'||
      coalesce(tt.description,'')                            ||'|'||
      coalesce(tt.default_contact_email,'')                 ||'|'||
      coalesce((
        SELECT string_agg(a.participant_id::text, ',' ORDER BY a.participant_id)
        FROM public.thread_template_assignees a WHERE a.template_id = tt.id
      ),'')
    ) AS body_key
  FROM public.thread_templates tt
  WHERE tt.owner_project_template_id IS NOT NULL
),
canon AS (
  SELECT DISTINCT ON (workspace_id, body_key)
    id AS canonical_id, workspace_id, body_key
  FROM bodies
  ORDER BY workspace_id, body_key, id
),
mapped AS (
  SELECT
    b.template_id,
    c.canonical_id,
    b.sort_order,
    b.default_status_id,
    b.on_complete_set_project_status_id
  FROM bodies b
  JOIN canon c ON c.workspace_id = b.workspace_id AND c.body_key = b.body_key
)
-- 3. Заполняем junction: каждая исходная запись → (её шаблон проекта, каноническая).
INSERT INTO public.project_template_thread_templates
  (template_id, thread_template_id, sort_order, default_status_id, on_complete_set_project_status_id)
SELECT template_id, canonical_id, sort_order, default_status_id, on_complete_set_project_status_id
FROM mapped
ON CONFLICT (template_id, thread_template_id) DO NOTHING;

-- 2. Канонические записи → глобальные.
UPDATE public.thread_templates tt
SET owner_project_template_id = NULL
WHERE tt.owner_project_template_id IS NOT NULL
  AND tt.id IN (
    SELECT DISTINCT ON (workspace_id, body_key) id
    FROM (
      SELECT
        x.id, x.workspace_id,
        md5(
          coalesce(x.name,'')||'|'||coalesce(x.thread_type,'')||'|'||coalesce(x.is_email::text,'')||'|'||
          coalesce(x.thread_name_template,'')||'|'||coalesce(x.accent_color,'')||'|'||coalesce(x.icon,'')||'|'||
          coalesce(x.access_type,'')||'|'||coalesce(array_to_string(x.access_roles,','),'')||'|'||
          coalesce(x.deadline_days::text,'')||'|'||coalesce(x.email_subject_template,'')||'|'||
          coalesce(x.initial_message_html,'')||'|'||coalesce(x.description,'')||'|'||
          coalesce(x.default_contact_email,'')||'|'||
          coalesce((SELECT string_agg(a.participant_id::text, ',' ORDER BY a.participant_id)
                    FROM public.thread_template_assignees a WHERE a.template_id = x.id),'')
        ) AS body_key
      FROM public.thread_templates x
      WHERE x.owner_project_template_id IS NOT NULL
    ) k
    ORDER BY workspace_id, body_key, id
  );

COMMIT;
