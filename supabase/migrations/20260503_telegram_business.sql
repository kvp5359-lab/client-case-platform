-- Telegram Business — этап 1: схема БД.
--
-- Идея: один общий бот @clientcase_bot (как @planfix_bot у Planfix) подключается
-- сотрудником к его Telegram Premium → бот «подсматривает» личные диалоги
-- сотрудника с клиентами и тянет их в сервис. Каждый Business-диалог становится
-- тредом внутри системного проекта «Личные диалоги Telegram» этого сотрудника.
--
-- Изоляция: business_connection_id приходит от Telegram при подключении →
-- мы привязываем его к user_id (workspace_id берём из participants).

-- ===========================================================================
-- 1. Таблица telegram_business_connections
-- ===========================================================================
-- Хранит соединения сотрудника ↔ Business-аккаунт. Один user_id может иметь
-- несколько записей по истории (подключал → отключал → подключал снова), но
-- активная (is_enabled=true) обычно одна. UNIQUE на business_connection_id —
-- этот id у каждого подключения уникальный, выдаёт Telegram.

CREATE TABLE public.telegram_business_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Telegram-данные
  business_connection_id text NOT NULL UNIQUE, -- id соединения от Telegram
  tg_user_id bigint NOT NULL,                  -- id пользователя в Telegram
  tg_username text,
  tg_first_name text,
  tg_last_name text,

  -- Состояние подключения
  is_enabled boolean NOT NULL DEFAULT true,    -- бот включён в настройках Business
  can_reply boolean NOT NULL DEFAULT false,    -- может ли отвечать (rights.can_reply)

  connected_at timestamptz NOT NULL DEFAULT now(),
  disconnected_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tbc_workspace_user ON public.telegram_business_connections(workspace_id, user_id);
CREATE INDEX idx_tbc_tg_user ON public.telegram_business_connections(tg_user_id);

ALTER TABLE public.telegram_business_connections ENABLE ROW LEVEL SECURITY;

-- Сотрудник видит свои подключения.
CREATE POLICY "Users see own business connections"
  ON public.telegram_business_connections
  FOR SELECT
  USING (user_id = auth.uid());

-- Менеджеры воркспейса видят все подключения сотрудников своего воркспейса —
-- это нужно для вкладки «Telegram Business» в настройках интеграций.
CREATE POLICY "Workspace managers see all business connections"
  ON public.telegram_business_connections
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.participants p
      JOIN public.workspace_roles wr
        ON wr.workspace_id = p.workspace_id
       AND wr.name = ANY(p.workspace_roles)
      WHERE p.user_id = auth.uid()
        AND p.workspace_id = telegram_business_connections.workspace_id
        AND p.is_deleted = false
        AND (wr.permissions->>'manage_workspace_settings')::boolean = true
    )
  );

-- INSERT/UPDATE/DELETE — только через service-role (Edge Function webhook).

-- ===========================================================================
-- 2. Системный «инбокс» сотрудника — флаг на projects
-- ===========================================================================
-- В отдельный системный проект складываем все Business-треды сотрудника.
-- Создаётся при первом подключении (или вручную через UI), один на сотрудника
-- в воркспейсе.

ALTER TABLE public.projects
  ADD COLUMN is_system_business_inbox boolean NOT NULL DEFAULT false,
  ADD COLUMN system_inbox_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Один инбокс на сотрудника в воркспейсе. Частичный UNIQUE-индекс — обычные
-- проекты (где is_system_business_inbox=false) под него не подпадают.
CREATE UNIQUE INDEX uq_projects_system_inbox_per_user
  ON public.projects(workspace_id, system_inbox_user_id)
  WHERE is_system_business_inbox = true;

-- ===========================================================================
-- 3. Поля треда под Business-диалог
-- ===========================================================================
-- Тред в системном инбоксе ссылается на конкретное business-соединение и
-- хранит tg_user_id клиента (с кем переписка). Плюс UNIQUE-индекс для
-- быстрого поиска «есть ли уже тред под этого клиента».

ALTER TABLE public.project_threads
  ADD COLUMN business_connection_id uuid REFERENCES public.telegram_business_connections(id) ON DELETE SET NULL,
  ADD COLUMN business_client_tg_user_id bigint;

CREATE UNIQUE INDEX uq_threads_business_per_client
  ON public.project_threads(business_connection_id, business_client_tg_user_id)
  WHERE business_connection_id IS NOT NULL
    AND business_client_tg_user_id IS NOT NULL
    AND is_deleted = false;

-- ===========================================================================
-- 4. updated_at triggers
-- ===========================================================================
CREATE TRIGGER tbc_set_updated_at
  BEFORE UPDATE ON public.telegram_business_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.telegram_business_connections IS 'Подключения Telegram Business: сотрудник ↔ его личный TG-аккаунт через @clientcase_bot.';
COMMENT ON COLUMN public.projects.is_system_business_inbox IS 'Системный проект «Личные диалоги Telegram» сотрудника (Telegram Business). Скрывается из обычных списков проектов.';
COMMENT ON COLUMN public.projects.system_inbox_user_id IS 'Чей это инбокс (только для is_system_business_inbox=true).';
COMMENT ON COLUMN public.project_threads.business_connection_id IS 'Если тред пришёл из Telegram Business — id соединения сотрудника.';
COMMENT ON COLUMN public.project_threads.business_client_tg_user_id IS 'Telegram user id клиента, с которым переписка в этом треде.';
