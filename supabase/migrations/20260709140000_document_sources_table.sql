-- Унификация источников: единый список папок-источников Google Drive проекта.
-- Источник может быть привязан к набору (document_kit_id) или отдельным (null).
-- Файлы (source_documents) ссылаются на источник через source_id.
-- Аддитивно: старые поля (projects.source_folder_id, document_kits.drive_folder_id,
-- source_documents.document_kit_id) сохраняются — код на них продолжает работать.

create table if not exists public.document_sources (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  document_kit_id uuid references public.document_kits(id) on delete cascade,
  drive_folder_id text not null,
  name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_document_sources_project_folder
  on public.document_sources (project_id, drive_folder_id);
create index if not exists idx_document_sources_project on public.document_sources (project_id);
create index if not exists idx_document_sources_kit on public.document_sources (document_kit_id);

alter table public.document_sources enable row level security;

create policy "Users can view document_sources in their workspace"
  on public.document_sources for select
  using (workspace_id in (select participants.workspace_id from participants
    where participants.user_id = (select auth.uid())));
create policy "Users can insert document_sources in their workspace"
  on public.document_sources for insert
  with check (workspace_id in (select participants.workspace_id from participants
    where participants.user_id = (select auth.uid())));
create policy "Users can update document_sources in their workspace"
  on public.document_sources for update
  using (workspace_id in (select participants.workspace_id from participants
    where participants.user_id = (select auth.uid())));
create policy "Users can delete document_sources in their workspace"
  on public.document_sources for delete
  using (workspace_id in (select participants.workspace_id from participants
    where participants.user_id = (select auth.uid())));

alter table public.source_documents
  add column if not exists source_id uuid references public.document_sources(id) on delete set null;
create index if not exists idx_source_documents_source_id on public.source_documents (source_id);

-- ── Перенос существующих данных ──

-- Источники наборов (по document_kits.drive_folder_id)
insert into public.document_sources (project_id, workspace_id, document_kit_id, drive_folder_id, name)
select dk.project_id, dk.workspace_id, dk.id, dk.drive_folder_id, dk.name
from public.document_kits dk
where coalesce(dk.drive_folder_id, '') <> ''
on conflict (project_id, drive_folder_id) do nothing;

-- Отдельные источники проекта (по projects.source_folder_id)
insert into public.document_sources (project_id, workspace_id, document_kit_id, drive_folder_id, name)
select p.id, p.workspace_id, null, p.source_folder_id, 'Источник проекта'
from public.projects p
where coalesce(p.source_folder_id, '') <> '' and p.is_deleted = false
on conflict (project_id, drive_folder_id) do nothing;

-- source_id для файлов наборов
update public.source_documents sd
set source_id = ds.id
from public.document_sources ds
where sd.document_kit_id is not null
  and ds.document_kit_id = sd.document_kit_id
  and sd.source_id is null;

-- source_id для файлов отдельных источников проекта
update public.source_documents sd
set source_id = ds.id
from public.document_sources ds
where sd.document_kit_id is null
  and ds.document_kit_id is null
  and ds.project_id = sd.project_id
  and sd.source_id is null;
