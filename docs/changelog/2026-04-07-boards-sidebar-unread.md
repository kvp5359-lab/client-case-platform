# Доски, задачи, сайдбар, бейджи — 2026-04-07

**Дата:** 2026-04-07
**Тип:** feature + fix + ui
**Статус:** completed

---

## Что сделано

### 1. Доски (Boards) — новая функциональность
- Полный CRUD досок: создание, редактирование, удаление
- Списки внутри досок с фильтрами, сортировкой и двумя режимами отображения (список / карточки)
- Группировка задач в списках по статусу, проекту, исполнителю, дедлайну
- Настройки каждого списка: видимые поля, фильтры, сортировка, группировка, режим отображения
- Фильтры дат: операторы `<`, `≤`, `>`, `≥`, `=`, `между` + относительные пресеты (Сегодня, Вчера, Завтра, Текущая/Прошлая/Следующая неделя/месяц, Последние/Следующие N дней, конкретная дата)
- SQL миграции: `boards_tables`, `board_lists_sort`, `board_lists_display`, `board_lists_group_by`, `get_workspace_threads`, `add_sort_order_to_get_workspace_tasks`

### 2. Задачи — drag & drop
- `TaskGroupList.tsx` — drag & drop с линией-индикатором (не sortable раздвигание)
- Перестановка внутри группы + перенос между группами (меняет дедлайн)
- `TaskPanel.tsx` — новый компонент панели задачи
- `useTaskMutations.ts` — мутации sort_order

### 3. Бейджи непрочитанных — исправления
- `UnreadBadge.tsx` — переписан на `getBadgeDisplay`: корректно обрабатывает `manually_unread` (точка), реакции (эмодзи), числовые бейджи
- Цвет бейджа берётся из `accent_color` задачи/чата, а не фиксированный `bg-primary`
- `ParticipantAvatars.tsx` — добавлен prop `size` (sm: 18px, md: 24px)

### 4. Статус в настройках чата
- `ChatSettingsStatusPopover.tsx` — заменён кастомный рендер на общий `StatusDropdown` для единообразного вида
- `status-dropdown.tsx` — размер кружка sm: 13px

### 5. Сайдбар — Notion-style размеры
- Все элементы: высота 30px, border-radius 6px, font 14px/500, иконки 18px
- Gap между элементами: 1px (было 2px)
- Gap иконка-текст: 8px (было 12px)
- Заголовок секции «Проекты»: 12px font-medium (без uppercase)
- Бейджи в навигации: Notion-стиль (rounded-4px)
- Выравнивание: иконки nav, inbox/tasks/boards и проектов на одном уровне (контейнер 22x22, px-0 на обёртке проектов)

### 6. Мессенджер — рефакторинг inbox
- `InboxChatItem.tsx`, `ChatTabItem.tsx` — рефакторинг бейджей на `getBadgeDisplay`
- `useFilteredInbox.ts` — рефакторинг фильтрации
- `inboxUnread.ts` — `getBadgeDisplay`, `getAggregateBadgeDisplay`, `formatBadgeCount`

## Файлы

### Новые
- `src/app/(app)/workspaces/[workspaceId]/boards/page.tsx`
- `src/components/boards/**` (15+ файлов)
- `src/components/tasks/TaskPanel.tsx`
- `src/hooks/tasks/useWorkspaceThreads.ts`
- `src/page-components/BoardPage/`, `src/page-components/BoardsPage/`
- `supabase/migrations/20260406_*.sql`, `supabase/migrations/20260407_*.sql` (6 миграций)

### Изменённые (31 файл)
- Sidebar: `WorkspaceSidebarFull.tsx`, `SidebarNavButton.tsx`, `ProjectListItem.tsx`, `ProjectsList.tsx`
- Tasks: `TaskGroupList.tsx`, `TaskRow.tsx`, `TaskDialog.tsx`, `TaskListView.tsx`, `UnreadBadge.tsx`, `types.ts`, `taskListConstants.ts`, `useTaskFilters.ts`, `useTaskMutations.ts`
- Messenger: `ChatSettingsDialog.tsx`, `ChatSettingsStatusPopover.tsx`, `InboxChatItem.tsx`, `ChatTabItem.tsx`, `MessengerPanelContent.tsx`, `CreateThreadPopover.tsx`, `MessageBubble.tsx`
- UI: `status-dropdown.tsx`, `ParticipantAvatars.tsx`, `DismissAllToasts.tsx`, `FloatingPanelButtons.tsx`, `PanelTabs.tsx`
- Hooks: `queryKeys.ts`, `useWorkspaceTasks.ts`, `useFilteredInbox.ts`, `useMessengerPanelData.ts`
- Types: `database.ts`, `inboxUnread.ts`
