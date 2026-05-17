-- Версия 2 триггера sync_thread_deadline_end_at.
--
-- Старая логика «end_at изменился → deadline := end_at» ломала кейс
-- «пользователь снимает чекбокс длительности, хочет оставить только
-- дату»: фронт шлёт {deadline=date, start_at=null, end_at=null},
-- триггер видел end_at→NULL и затирал deadline в NULL.
--
-- Новая семантика: правила автосинхронизации срабатывают ТОЛЬКО когда
-- одно из полей (deadline ИЛИ end_at) изменено в одиночку. Если
-- caller меняет оба в одном UPDATE — он сам управляет, триггер не
-- лезет.
--
--   1) end_at изменился, deadline не трогали → deadline := end_at
--   2) deadline изменился у задачи-в-календаре, end_at не трогали
--      → двигаем интервал (или обнуляем start_at/end_at при NULL)
--   3) Оба изменены caller'ом → принимаем NEW как есть.

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

  -- Правило 1: меняется ТОЛЬКО end_at (deadline без изменений).
  IF NEW.end_at IS DISTINCT FROM OLD.end_at
     AND NEW.deadline IS NOT DISTINCT FROM OLD.deadline THEN
    NEW.deadline := NEW.end_at;
    RETURN NEW;
  END IF;

  -- Правило 2: меняется ТОЛЬКО deadline у задачи-в-календаре.
  IF NEW.deadline IS DISTINCT FROM OLD.deadline
     AND NEW.end_at IS NOT DISTINCT FROM OLD.end_at
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
