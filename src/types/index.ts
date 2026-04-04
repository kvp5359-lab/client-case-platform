/**
 * Types - единая точка входа для всех типов приложения
 *
 * Использование:
 * ```tsx
 * // Auto-generated типы Supabase
 * import { Tables, Database } from '@/types'
 *
 * // Бизнес-сущности
 * import { Document, Project, FormKit } from '@/types/entities'
 * ```
 */

// Auto-generated типы Supabase (НЕ РЕДАКТИРОВАТЬ ВРУЧНУЮ)
export * from './database'

// Бизнес-сущности (удобные обертки)
export * as Entities from './entities'

// Permissions types
export * from './permissions'

// FormKit types (специфичные для форм)
export * from './formKit'

// Dialog types (базовые типы для диалогов)
export * from './dialogs'

// History types
export * from './history'

// Comments types
export * from './comments'

// Custom directories types
export * from './customDirectories'

// Thread template types
export * from './threadTemplate'
