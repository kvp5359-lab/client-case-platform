# Устранение дублирования + разбиение крупных файлов — 2026-04-12

**Дата:** 2026-04-12
**Тип:** refactoring
**Статус:** completed

---

## Что сделано

### Часть 1: устранение дублирования и унификация логики

#### Удаление дубликатов

- **useWorkspaceTasks → useWorkspaceThreads**: оба хука вызывали одну и ту же RPC `get_workspace_threads` с идентичными параметрами. `useWorkspaceTasks` удалён, 10 файлов переведены на единый `useWorkspaceThreads`. Тип `WorkspaceTask` перенесён в `useWorkspaceThreads.ts`. `taskKeys.workspace` заменён на `workspaceThreadKeys.workspace` во всех callsite'ах.

- **useInbox — 6 хуков дублировали один запрос**: `useTotalUnreadCount`, `useIsManuallyUnread`, `useHasUnreadReaction`, `useUnreadReactionEmoji`, `useProjectUnreadCounts` — все повторяли `queryKey + queryFn + enabled + staleTime`. Выделен приватный `useInboxBase<T>(workspaceId, select?)`, публичные хуки стали тонкими обёртками с `select`. React Query дедуплицирует запросы по ключу.

- **sidePanelStore — мёртвый код**: поля `messengerOpen` и `aiOpen` нигде не читались в компонентах (производные от `panelTab`). Методы `close(panel?)` и `toggle(type)` использовались только в тестах. Удалены поля, методы и соответствующие тесты.

#### Унификация паттернов

- **CRUD-хуки → queryHelpers**: 4 файла (`useQuickReplies`, `useQuickReplyGroups`, `useCustomDirectories`, `useDirectoryFields`) переведены с ручного `if (error) throw error` на существующие `safeFetchOrThrow`, `safeInsertOrThrow`, `safeUpdateVoidOrThrow`, `safeDeleteOrThrow`. Добавлено автоматическое логирование через `logger.error`.

- **useOptimisticMutation**: новая фабрика (`src/hooks/shared/useOptimisticMutation.ts`) — устраняет бойлерплейт `onMutate → cancel → snapshot → setQueryData → onError → rollback → onSettled → invalidate`. Применена к 3 мутациям в `useDocumentKitsQuery` (delete, rename, move). Каждая сократилась с ~35 строк до ~10.

- **Таблицы → shadcn Table**: `ParticipantsTable` и `TelegramContactsTable` использовали ванильный HTML (`<table>`, `<th>`, `<tr>`). Переведены на компоненты `Table`, `TableHeader`, `TableBody`, `TableHead`, `TableRow`, `TableCell` из `src/components/ui/table.tsx`.

- **RoleEditDialogBase**: общий каркас для `WorkspaceRoleEditDialog` и `ProjectRoleEditDialog`. Содержит Dialog → Header → name/description inputs → children → Footer. Оба диалога используют его через composition.

- **queryKeys**: добавлен алиас `inboxKeys.threads` (идентичен `threadsV2`), `threadsV2` помечен `@deprecated`.

### Часть 2: разбиение крупных файлов (> 400 строк)

| Файл | Было | Стало | Выделенные модули |
|------|-----:|------:|-------------------|
| TaskPanel.tsx | 663 | 210 | TaskPanelProjectView.tsx, TaskPanelTaskHeader.tsx |
| ProjectTemplateThreadList.tsx | 511 | 342 | SortableTemplateRow.tsx |
| TaskListView.tsx | 498 | 366 | TaskListControls.tsx |
| InboxPage/index.tsx | 497 | 355 | InboxSidebar.tsx, useInboxFilters.ts |
| TaskGroupList.tsx | 487 | 380 | DraggableTaskRow.tsx |
| WorkspaceLayout.tsx | 475 | 358 | ChatSettingsSection.tsx |
| BoardsPage/index.tsx | 426 | 134 | BoardTabContent.tsx, BoardTab.tsx |
| BoardListCard.tsx | 405 | 306 | boardListUtils.ts |

**Не разбивались** (разбиение не оправдано):
- `useDocumentKitSetup.ts` (490) — оркестратор-хук, логически неразделим
- `DocumentsTabContent.tsx` (434) — уже чистая композиция из 15+ хуков
- `ProjectPage.tsx` (414) — аналогично, оркестратор
- `FilterGroupEditor.tsx` (409) — 3 компонента уже в файле, каждый маленький
- `useProjectPermissions.ts` (405) — один хук с мемоизацией, нечего отделять
- `filterEngine.ts` (370) — чистые функции, логически неразделимы
- `tiptap-editor.tsx` (367) — обёртка библиотеки, нечего отделять

---

## Статистика

- **45 файлов** затронуто
- **14 новых модулей** создано
- **1 файл удалён** (useWorkspaceTasks.ts)
- **Нетто: ~150 строк сокращение** (с учётом новых файлов)
- TypeScript: 0 ошибок
- Тесты: 609/609 проходят

---

## Затронутые файлы

### Новые
- `src/hooks/shared/useOptimisticMutation.ts`
- `src/page-components/workspace-settings/permissions/RoleEditDialogBase.tsx`
- `src/components/tasks/TaskPanelProjectView.tsx`
- `src/components/tasks/TaskPanelTaskHeader.tsx`
- `src/components/tasks/TaskListControls.tsx`
- `src/components/tasks/DraggableTaskRow.tsx`
- `src/components/ChatSettingsSection.tsx`
- `src/components/templates/project-template-editor/SortableTemplateRow.tsx`
- `src/components/boards/boardListUtils.ts`
- `src/page-components/BoardsPage/BoardTabContent.tsx`
- `src/page-components/BoardsPage/BoardTab.tsx`
- `src/page-components/InboxPage/InboxSidebar.tsx`
- `src/page-components/InboxPage/useInboxFilters.ts`

### Удалённые
- `src/hooks/tasks/useWorkspaceTasks.ts`

### Изменённые
- `src/components/tasks/TaskPanel.tsx`
- `src/components/tasks/TaskListView.tsx`
- `src/components/tasks/TaskGroupList.tsx`
- `src/components/tasks/taskListConstants.ts`
- `src/components/tasks/useTaskPanelSetup.ts`
- `src/components/WorkspaceLayout.tsx`
- `src/components/boards/BoardListCard.tsx`
- `src/components/boards/BoardColumn.tsx`
- `src/components/boards/BoardView.tsx`
- `src/components/boards/BoardTaskRow.tsx`
- `src/components/boards/hooks/useFilteredListData.ts`
- `src/components/templates/project-template-editor/ProjectTemplateThreadList.tsx`
- `src/hooks/messenger/useInbox.ts`
- `src/hooks/queryKeys.ts`
- `src/hooks/tasks/useWorkspaceThreads.ts`
- `src/hooks/useDocumentKitsQuery.ts`
- `src/hooks/useQuickReplies.ts`
- `src/hooks/useQuickReplyGroups.ts`
- `src/hooks/custom-directories/useCustomDirectories.ts`
- `src/hooks/custom-directories/useDirectoryFields.ts`
- `src/page-components/BoardPage/index.tsx`
- `src/page-components/BoardsPage/index.tsx`
- `src/page-components/InboxPage/index.tsx`
- `src/page-components/workspace-settings/components/ParticipantsTable.tsx`
- `src/page-components/workspace-settings/components/TelegramContactsTable.tsx`
- `src/page-components/workspace-settings/permissions/WorkspaceRoleEditDialog.tsx`
- `src/page-components/workspace-settings/permissions/ProjectRoleEditDialog.tsx`
- `src/store/sidePanelStore.ts`
- `src/store/sidePanelStore.types.ts`
- `src/store/sidePanelStore.test.ts`
- `src/store/documentKitUI/dialogsSlice.ts`
