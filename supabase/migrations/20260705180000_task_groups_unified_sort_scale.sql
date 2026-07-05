-- Единая шкала порядка верхнего уровня плана: группы и одиночные задачи/блоки
-- (task_group_id/group_id IS NULL) сортируются по ОДНОЙ sort_order-шкале, чтобы
-- группу можно было перетащить МЕЖДУ одиночными задачами.
--
-- Нормализация: существующие группы сдвигаются ЗА одиночные элементы проекта
-- (base = max loose sort + 10, порядок групп между собой сохраняется). Текущий
-- вид (одиночные сверху, затем группы) не меняется, но теперь они на общей шкале
-- и перетаскивание группы вверх кладёт её между задачами.
--
-- Гард `HAVING min(group.sort) <= max_loose` делает миграцию идемпотентной:
-- после сдвига группы уже выше диапазона одиночных, повторный прогон их не тронет.
-- Дети групп (task_group_id/group_id NOT NULL) НЕ затрагиваются — у них своя
-- внутригрупповая шкала.

WITH loose AS (
  SELECT g.project_id,
    COALESCE((SELECT max(s) FROM (
      SELECT sort_order s FROM public.project_threads t
        WHERE t.project_id = g.project_id AND t.is_deleted = false AND t.task_group_id IS NULL
      UNION ALL
      SELECT sort_order FROM public.project_plan_blocks b
        WHERE b.project_id = g.project_id AND b.group_id IS NULL
    ) q), -10) AS max_loose
  FROM public.project_task_groups g
  GROUP BY g.project_id
),
proj AS (
  SELECT l.project_id, l.max_loose FROM loose l
  WHERE (SELECT min(sort_order) FROM public.project_task_groups g WHERE g.project_id = l.project_id) <= l.max_loose
),
ranked AS (
  SELECT g.id,
    p.max_loose + 10 + (row_number() OVER (PARTITION BY g.project_id ORDER BY g.sort_order, g.created_at) - 1) * 10 AS new_sort
  FROM public.project_task_groups g
  JOIN proj p ON p.project_id = g.project_id
)
UPDATE public.project_task_groups g
SET sort_order = r.new_sort, updated_at = now()
FROM ranked r
WHERE g.id = r.id;
