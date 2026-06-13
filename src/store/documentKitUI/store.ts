"use client"

/**
 * Непосредственно zustand-store. Вынесен из index.ts чтобы selectors.ts
 * мог импортировать useDocumentKitUIStore без циклической зависимости:
 * старая схема `index -> selectors -> index` создавала cycle.
 */

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { createUISlice, initialUIState } from './uiSlice'
import { createDialogsSlice, initialDialogsState } from './dialogsSlice'
import { createOperationsSlice, initialOperationsState } from './operationsSlice'
import { createGoogleDriveSlice, initialGoogleDriveState } from './googleDriveSlice'
import type { DocumentKitUIStore } from './types-store'

export const useDocumentKitUIStore = create<DocumentKitUIStore>()(
  devtools(
    (...args) => ({
      ...createUISlice(...args),
      ...createDialogsSlice(...args),
      ...createOperationsSlice(...args),
      ...createGoogleDriveSlice(...args),

      // Global reset. Собираем из initial-стейтов слайсов — новое поле в любом
      // слайсе автоматически попадает в reset (раньше поля копировались руками
      // и легко рассинхронизировались → состояние «протекало» между проектами).
      // collapsedFolders/compressingDocIds — свежие Set, чтобы reset не делил
      // ссылку с initial-объектом слайса.
      resetState: () => {
        const [set] = args
        set({
          ...initialUIState,
          ...initialDialogsState,
          ...initialOperationsState,
          ...initialGoogleDriveState,
          collapsedFolders: new Set(),
          compressingDocIds: new Set<string>(),
        })
      },
    }),
    {
      name: 'DocumentKitUI',
      enabled: process.env.NODE_ENV === 'development',
    },
  ),
)
