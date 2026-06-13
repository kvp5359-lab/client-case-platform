/**
 * Hooks для ProjectPage.
 *
 * useProjectData/useProjectTemplate/useProjectMutations/useProjectModules
 * переехали в общий слой `@/hooks/projects/*` (D1 аудита 2026-06-13) — чтобы
 * компоненты не импортировали вверх из page-components. Реэкспорт для
 * внутренних потребителей ProjectPage.
 */

export * from '@/hooks/projects/useProjectData'
export * from '@/hooks/projects/useProjectModules'
export * from '@/hooks/projects/useProjectMutations'
export * from './useProjectAccess'
export * from './useProjectHeaderParticipants'
