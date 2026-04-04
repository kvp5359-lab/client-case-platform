/**
 * Бизнес-сущности — реэкспорт типов из сервисов и компонентов.
 * Единая точка входа для удобных импортов вида:
 *   import type { Participant, Project } from '@/types/entities'
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
export type DocumentStatus = Tables<'statuses'>
