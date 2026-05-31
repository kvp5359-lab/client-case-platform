import type { TaskItem } from '@/components/tasks/types'
import type { FolderSlotWithDocument } from '@/components/documents/types'
import type { PlanBlockDisplay } from './PlanBlockItem'

/** Элемент объединённого плоского списка плана: задача ИЛИ блок (текст/заголовок/слот). */
export type MergedItem =
  | { kind: 'task'; id: string; sort: number; task: TaskItem }
  | {
      kind: 'block'
      id: string
      sort: number
      display: PlanBlockDisplay
      /** Полный слот документа — для рендера настоящим SlotItem. */
      fullSlot?: FolderSlotWithDocument | null
    }
