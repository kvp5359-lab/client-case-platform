/**
 * Типы функций-мутаций `useDocuments` — выделены отдельно, чтобы потребители
 * могли типизировать пропсы без обращения к `UseMutateAsyncFunction` из React
 * Query. Раньше здесь стояли `as unknown as any`-касты с комментарием «mutation
 * signature mismatch» — это был обход того, что сигнатуры кастомно склеивались
 * из `mutateAsync` без публичного алиаса.
 *
 * `ReturnType<typeof useDocuments>` — автоматически извлекаем формы из
 * реального хука, чтобы типы не дрейфовали при изменении реализации.
 */

import type { useDocuments } from './useDocuments'

type UseDocumentsReturn = ReturnType<typeof useDocuments>

/** Загрузить файл и создать документ. */
export type UploadDocumentFn = UseDocumentsReturn['uploadDocument']

/** Пометить документ как удалённый (мягкое удаление). */
export type SoftDeleteDocumentFn = UseDocumentsReturn['softDeleteDocument']
