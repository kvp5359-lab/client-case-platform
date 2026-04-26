-- Дневник проекта: дневные (и в будущем недельные/месячные) сводки активности.
--
-- project_digests           — карточки сводок (одна = один период по одному проекту).
-- workspace_digest_settings — настройки дневника на уровне воркспейса (промпт, порог авто/LLM, модель).
--
-- Источники активности (читаются Edge Function'ом, тут НЕ дублируются):
--   audit_logs        — статусы, документы, задачи, участники, поля анкет
--   project_messages  — переписка по тредам (chat/task/email)
--   comments          — комментарии
--
-- RLS-модель:
--   project_digests           — видят участники проекта (или view_all_projects), пишет/обновляет — Edge Function через service_role (политики написаны на edit_all_projects как фоллбэк).
--   workspace_digest_settings — видят все участники воркспейса (нужно функции при чтении), редактирует только владелец.

-- ── 1. project_digests ───────────────────────────────────────────────────────

create table if not exists public.project_digests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  digest_type text not null default 'day' check (digest_type in ('day','week','month','custom')),
  content text not null default '',
  raw_events jsonb not null default '[]'::jsonb,
  events_count integer not null default 0,
  generation_mode text not null check (generation_mode in ('auto_list','llm')),
  model text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_digests_period_check check (period_end >= period_start),
  constraint project_digests_unique unique (project_id, period_start, period_end, digest_type)
);

create index if not exists project_digests_project_period_idx
  on public.project_digests (project_id, period_start desc);

create index if not exists project_digests_workspace_period_idx
  on public.project_digests (workspace_id, period_start desc);

alter table public.project_digests enable row level security;

create policy "project_digests_select"
  on public.project_digests for select
  using (
    exists (
      select 1
      from project_participants pp
      join participants p on p.id = pp.participant_id
      where pp.project_id = project_digests.project_id
        and p.user_id = (select auth.uid())
        and p.is_deleted = false
    )
    or has_workspace_permission((select auth.uid()), workspace_id, 'view_all_projects')
  );

create policy "project_digests_insert"
  on public.project_digests for insert
  with check (
    has_workspace_permission((select auth.uid()), workspace_id, 'edit_all_projects')
    or exists (
      select 1
      from project_participants pp
      join participants p on p.id = pp.participant_id
      where pp.project_id = project_digests.project_id
        and p.user_id = (select auth.uid())
        and p.is_deleted = false
    )
  );

create policy "project_digests_update"
  on public.project_digests for update
  using (
    has_workspace_permission((select auth.uid()), workspace_id, 'edit_all_projects')
    or exists (
      select 1
      from project_participants pp
      join participants p on p.id = pp.participant_id
      where pp.project_id = project_digests.project_id
        and p.user_id = (select auth.uid())
        and p.is_deleted = false
    )
  );

create policy "project_digests_delete"
  on public.project_digests for delete
  using (
    has_workspace_permission((select auth.uid()), workspace_id, 'edit_all_projects')
    or created_by = (select auth.uid())
  );

comment on table public.project_digests is 'Дневник проекта: сводки активности за период. period_start=period_end для дневных карточек; digest_type=day в MVP, week/month/custom — на будущее.';

-- ── 2. workspace_digest_settings ─────────────────────────────────────────────

create table if not exists public.workspace_digest_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  system_prompt text,
  min_events_for_llm integer not null default 5 check (min_events_for_llm >= 1 and min_events_for_llm <= 100),
  model text not null default 'claude-sonnet-4-6',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.workspace_digest_settings enable row level security;

create policy "workspace_digest_settings_select"
  on public.workspace_digest_settings for select
  using (
    exists (
      select 1 from participants p
      where p.workspace_id = workspace_digest_settings.workspace_id
        and p.user_id = (select auth.uid())
        and p.is_deleted = false
    )
  );

create policy "workspace_digest_settings_insert"
  on public.workspace_digest_settings for insert
  with check (is_workspace_owner((select auth.uid()), workspace_id));

create policy "workspace_digest_settings_update"
  on public.workspace_digest_settings for update
  using (is_workspace_owner((select auth.uid()), workspace_id))
  with check (is_workspace_owner((select auth.uid()), workspace_id));

create policy "workspace_digest_settings_delete"
  on public.workspace_digest_settings for delete
  using (is_workspace_owner((select auth.uid()), workspace_id));

comment on table public.workspace_digest_settings is 'Настройки дневника проекта на уровне воркспейса: системный промпт, порог авто/LLM, выбор модели. Если строки нет — Edge Function использует дефолты из кода.';
