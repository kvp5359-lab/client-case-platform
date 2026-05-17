-- Расширяем CHECK у board_lists.display_mode: добавляем 'calendar'.
-- Миграция 20260407 ограничивала ('list','cards'); календарный режим
-- уже используется в коде, но БД его отбивает.

ALTER TABLE public.board_lists
  DROP CONSTRAINT IF EXISTS board_lists_display_mode_check;

ALTER TABLE public.board_lists
  ADD CONSTRAINT board_lists_display_mode_check
  CHECK (display_mode IN ('list', 'cards', 'calendar'));
