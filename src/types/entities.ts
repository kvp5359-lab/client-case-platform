/**
 * Бизнес-сущности — реэкспорт Row-типов БД.
 * Единая точка входа для удобных импортов вида:
 *   import type { Participant, Project } from '@/types/entities'
 *
 * Не создавай локальные `type X = Tables<'...'>` в файлах-консьюмерах —
 * используй отсюда. Это убирает копипаст и держит один источник правды.
 */

import type { Tables, Database } from './database'

// ── Participants ──
export type Participant = Tables<'participants'>

// ── Projects ──
export type Project = Tables<'projects'>
export type ProjectInsert = Database['public']['Tables']['projects']['Insert']
export type ProjectUpdate = Partial<ProjectInsert>

// ── Workspaces ──
export type Workspace = Tables<'workspaces'>

// ── Documents ──
export type Document = Tables<'documents'>
export type Folder = Tables<'folders'>
export type DocumentStatus = Tables<'statuses'>

// ── Statuses ──
export type Status = Tables<'statuses'>

// ── Form templates ──
export type FormTemplate = Tables<'form_templates'>
