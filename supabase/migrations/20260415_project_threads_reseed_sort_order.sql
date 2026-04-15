-- Перенумеровать sort_order у задач (project_threads WHERE type = 'task').
-- Многие задачи имели sort_order = 0, что ломает ручную сортировку на досках.
-- Присваиваем уникальные значения в пределах project_id с шагом 10 (для вставок между).

UPDATE project_threads pt
SET sort_order = sub.rn * 10
FROM (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY sort_order, created_at, id) AS rn
  FROM project_threads
  WHERE type = 'task'
) sub
WHERE pt.id = sub.id AND pt.type = 'task';
