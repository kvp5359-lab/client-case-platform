/**
 * Типы для ProjectPage.
 *
 * Доменные типы переехали в нейтральный `@/types/project` (T1/D1 аудита
 * 2026-06-13), чтобы их могли использовать опущенные вниз moduleRegistry/хуки
 * без инверсии. Здесь — реэкспорт для существующих импортёров ProjectPage.
 */

export type { Project, ProjectTemplateWithRelations, ProjectTab } from '@/types/project'
