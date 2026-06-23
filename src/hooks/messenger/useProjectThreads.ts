/**
 * Хук для работы с тредами проекта (project_threads).
 *
 * Этот файл — barrel re-export, чтобы сохранить совместимость импортов
 * `from '@/hooks/messenger/useProjectThreads'`. Реальная реализация
 * разъехалась по трём соседним файлам:
 *
 *  - useProjectThreads.types.ts     — ThreadAccentColor + ProjectThread
 *  - useProjectThreads.queries.ts   — useProjectThreads / useProjectThreadById /
 *                                      useThreadIdByChannel
 *  - useProjectThreads.mutations.ts — useCreateThread / useDeleteThread /
 *                                      useRenameThread / usePinThread /
 *                                      useUpdateThread
 */

export type { ProjectThread, ThreadAccentColor } from './useProjectThreads.types'
export {
  useProjectThreadById,
  useProjectThreads,
  useThreadIdByChannel,
} from './useProjectThreads.queries'
export {
  useChangeThreadOwner,
  useCreateThread,
  useDeleteThread,
  usePinThread,
  useRenameThread,
  useUpdateEmailThreadMeta,
  useUpdateThread,
} from './useProjectThreads.mutations'
