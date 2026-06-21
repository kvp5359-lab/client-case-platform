-- Профили настроек интерфейса (UI: «Профиль настроек»).
-- Каркас «наборов настроек» а-ля Планфикс: переключаемый контейнер настроек интерфейса
-- воркспейса. Сейчас config = { slots: [...] } (то, что раньше жило в
-- workspace_sidebar_settings). Позже в тот же config добавятся quick_actions,
-- custom_menus, default_route — без новой схемы.
--
-- Доступ (каркас): профили ОБЩИЕ на воркспейс (owner_user_id = null), любой участник
-- видит и переключается сам, редактирует владелец воркспейса. Колонка owner_user_id
-- заложена под будущие личные профили; привязка к ролям — отдельной таблицей позже.

create table if not exists public.interface_presets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  icon text,
  color text,
  is_default boolean not null default false,
  owner_user_id uuid references auth.users(id) on delete cascade, -- null = общий профиль
  config jsonb not null default '{}'::jsonb,                       -- { slots: [...] }
  order_index integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_deleted boolean not null default false,
  deleted_at timestamptz
);

-- Не более одного дефолтного ОБЩЕГО профиля на воркспейс.
create unique index if not exists uq_interface_presets_default
  on public.interface_presets (workspace_id)
  where is_default and owner_user_id is null and not is_deleted;

create index if not exists idx_interface_presets_workspace
  on public.interface_presets (workspace_id)
  where not is_deleted;

alter table public.interface_presets enable row level security;

-- SELECT: общие профили — любому активному участнику воркспейса; личные — их владельцу.
create policy interface_presets_select
  on public.interface_presets for select
  using (
    not is_deleted and (
      owner_user_id = (select auth.uid())
      or (
        owner_user_id is null
        and exists (
          select 1 from public.participants p
          where p.workspace_id = interface_presets.workspace_id
            and p.user_id = (select auth.uid())
            and p.is_deleted = false
        )
      )
    )
  );

-- INSERT/UPDATE/DELETE: общие профили — владелец воркспейса; личные — их владелец.
create policy interface_presets_insert
  on public.interface_presets for insert
  with check (
    (owner_user_id is null and is_workspace_owner((select auth.uid()), workspace_id))
    or owner_user_id = (select auth.uid())
  );

create policy interface_presets_update
  on public.interface_presets for update
  using (
    (owner_user_id is null and is_workspace_owner((select auth.uid()), workspace_id))
    or owner_user_id = (select auth.uid())
  )
  with check (
    (owner_user_id is null and is_workspace_owner((select auth.uid()), workspace_id))
    or owner_user_id = (select auth.uid())
  );

create policy interface_presets_delete
  on public.interface_presets for delete
  using (
    (owner_user_id is null and is_workspace_owner((select auth.uid()), workspace_id))
    or owner_user_id = (select auth.uid())
  );

comment on table public.interface_presets is
  'Профили настроек интерфейса воркспейса (UI: «Профиль настроек»). config jsonb = { slots, [quick_actions], [custom_menus], ... }. owner_user_id null = общий профиль. Каркас «наборов» а-ля Планфикс.';

-- ── Активный профиль пользователя в воркспейсе (персональный выбор) ───────────
create table if not exists public.user_active_preset (
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  preset_id uuid not null references public.interface_presets(id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (user_id, workspace_id)
);

alter table public.user_active_preset enable row level security;

-- Только свои строки.
create policy user_active_preset_all
  on public.user_active_preset for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

comment on table public.user_active_preset is
  'Какой профиль настроек активен у пользователя в воркспейсе. Переключение персональное.';

-- ── Миграция данных: текущие настройки сайдбара → дефолтный профиль «Основное» ─
insert into public.interface_presets (workspace_id, name, is_default, config, created_by)
select s.workspace_id, 'Основное', true,
       jsonb_build_object('slots', s.slots), s.updated_by
from public.workspace_sidebar_settings s
where not exists (
  select 1 from public.interface_presets ip
  where ip.workspace_id = s.workspace_id
    and ip.is_default and ip.owner_user_id is null and not ip.is_deleted
);
