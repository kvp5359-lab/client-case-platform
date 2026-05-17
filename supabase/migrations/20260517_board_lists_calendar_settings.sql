-- Настройки календарного режима board_lists: вид по умолчанию + рабочие часы.
ALTER TABLE public.board_lists
  ADD COLUMN IF NOT EXISTS calendar_settings jsonb;

COMMENT ON COLUMN public.board_lists.calendar_settings IS
  'Настройки display_mode=calendar: { default_view: day|work_week|week|next_n, min_hour: 0-23, max_hour: 1-24, next_n_days?: number }';
