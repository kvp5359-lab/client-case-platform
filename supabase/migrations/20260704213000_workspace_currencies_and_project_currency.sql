-- Валюты финансового модуля (уровень 1-2):
--  * workspaces.base_currency      — базовая валюта воркспейса (ISO-код);
--  * workspaces.enabled_currencies — список валют, с которыми работаем;
--  * projects.currency             — валюта проекта (NULL = базовая воркспейса).
-- Только отображение/разметка: суммы хранятся числами, конвертации нет.
-- Применена в прод через MCP 2026-07-04.
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS base_currency text NOT NULL DEFAULT 'EUR',
  ADD COLUMN IF NOT EXISTS enabled_currencies text[] NOT NULL DEFAULT ARRAY['EUR'];

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS currency text;
