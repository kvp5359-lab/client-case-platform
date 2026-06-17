-- Исход сессии открытия: painted (быстро отрисовалось), stuck (зависло >4с),
-- recovered (зависло, но потом доехало). NULL для старых записей.
ALTER TABLE public.perf_traces ADD COLUMN IF NOT EXISTS outcome text;
