-- Перенумеровать sort_order у существующих списков досок.
-- Исторически многие board_lists создавались с sort_order = 0, из-за чего
-- swap_board_list_sort_order не менял видимый порядок (0 <-> 0).
-- Присваиваем уникальный sort_order в пределах (board_id, column_index) по created_at.

UPDATE board_lists bl
SET sort_order = sub.rn - 1
FROM (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY board_id, column_index ORDER BY created_at, id) AS rn
  FROM board_lists
) sub
WHERE bl.id = sub.id
  AND bl.sort_order <> sub.rn - 1;
