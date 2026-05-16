-- Этап «быстрого варианта А»: deadline и end_at — одна сущность для задач.
--
-- Семантика: end_at — это и есть «срок» задачи. Поле deadline остаётся для
-- обратной совместимости (его читают десятки RPC/компонентов), но
-- синхронизируется с end_at автоматически.
--
-- Правила триггера (BEFORE INSERT OR UPDATE на project_threads):
--   1) Если в апдейте меняется end_at → deadline := new end_at (NULL допустим)
--   2) Если меняется deadline у задачи, которая уже в календаре (есть оба
--      start_at и end_at) → двигаем интервал, сохраняя длительность:
--        new end_at := new deadline
--        new start_at := new deadline - (old end_at - old start_at)
--   3) Если меняется только deadline у задачи БЕЗ календаря (start_at=NULL)
--      → ничего не делаем сверх (старая семантика «срок без слота»).

CREATE OR REPLACE FUNCTION public.sync_thread_deadline_end_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_duration interval;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.end_at IS NOT NULL THEN
      NEW.deadline := NEW.end_at;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.end_at IS DISTINCT FROM OLD.end_at THEN
    NEW.deadline := NEW.end_at;
    RETURN NEW;
  END IF;

  IF NEW.deadline IS DISTINCT FROM OLD.deadline
     AND OLD.start_at IS NOT NULL
     AND OLD.end_at IS NOT NULL THEN
    IF NEW.deadline IS NULL THEN
      NEW.start_at := NULL;
      NEW.end_at := NULL;
    ELSE
      v_duration := OLD.end_at - OLD.start_at;
      NEW.end_at := NEW.deadline;
      NEW.start_at := NEW.deadline - v_duration;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_thread_deadline_end_at ON public.project_threads;
CREATE TRIGGER trg_sync_thread_deadline_end_at
  BEFORE INSERT OR UPDATE ON public.project_threads
  FOR EACH ROW EXECUTE FUNCTION public.sync_thread_deadline_end_at();

UPDATE public.project_threads
SET deadline = end_at
WHERE end_at IS NOT NULL
  AND deadline IS DISTINCT FROM end_at;
