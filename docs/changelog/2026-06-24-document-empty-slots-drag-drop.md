# 2026-06-24 — Drag & drop пустых слотов документов

Реордеринг и перенос пустых слотов в модуле «Документы» проекта (зеркалит документный DnD, но проще).

## Что сделано

- **Реордер пустых слотов внутри блока слотов папки** — drop слота на слот, линия-индикатор сверху/снизу по позиции курсора.
- **Перенос слота в другую папку** — drop слота на карточку папки → слот уезжает в конец её блока слотов (`folder_id` + `sort_order` в `folder_slots`).
- Заполненные слоты не таскаются — они двигаются как документ внутри них. Порядок слотов ведётся отдельным блоком под документами (общий порядок с документами не смешивается).

## Реализация

- **Новый хук** `useSlotsDragDrop` (`src/components/documents/Documents/hooks/`): состояние перетаскивания, пересчёт `sort_order`, оптимистик-патч кэша `folderSlotKeys.byProject` с откатом при ошибке. MIME-маркер `SLOT_DND_MIME = 'application/x-slot-id'` — чтобы DnD слота не конфликтовал с DnD документов/source-doc/messenger-attachment.
- **Мутация** `reorderSlots` в `useFolderSlots` — батч UPDATE `folder_slots` (слотов в папке немного, отдельная RPC не нужна), инвалидация по проекту.
- **Проброс по цепочке провайдера:** `DocumentsContext`, `useDocumentsProviderProps`, `DocumentsTabContent`, `SlotItem` (draggable + drop), `DocumentItem` и `useFolderCardDragDrop` (пропуск SLOT-дропа, чтобы всплыл к нужному уровню), `PlanDocsProvider` (noop-заглушки — в режиме плана DnD слотов не нужен).

## Файлы

`useSlotsDragDrop.ts` (нов), `useFolderSlots.ts`, `DocumentsContext.tsx`, `Documents/hooks/index.ts`, `useDocumentsProviderProps.ts`, `DocumentsTabContent.tsx`, `SlotItem.tsx`, `DocumentItem.tsx`, `useFolderCardDragDrop.ts`, `PlanDocsProvider.tsx`.

## Проверки

tsc 0, lint 0, 735 тестов зелёные. Ждёт деплоя фронта + смок (перетащить пустой слот внутри папки и в другую папку).
