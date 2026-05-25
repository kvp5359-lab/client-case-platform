import { lazy } from 'react'

/**
 * Code-split ChatSettingsDialog: он тянет Tiptap (~200 KB) через ComposeField.
 * Грузим только когда юзер реально открывает диалог создания/редактирования
 * задачи или чата. Импортируется из 5+ мест — поэтому общий wrapper.
 */
export const LazyChatSettingsDialog = lazy(() =>
  import('@/components/messenger/ChatSettingsDialog').then((m) => ({
    default: m.ChatSettingsDialog,
  })),
)
