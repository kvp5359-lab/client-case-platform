# Фильтры досок в отдельную вкладку, шапки-теги, единая система доступа — 2026-04-09

**Дата:** 2026-04-09
**Тип:** feature, security, refactoring
**Статус:** completed

---

## Что сделано

### Фильтры — отдельная вкладка в настройках списка
- Диалог настроек разделён на вкладки: «Основное» и «Фильтры»
- Бейдж с количеством активных фильтров на вкладке
- Drag-and-drop условий фильтра с синей линией-индикатором позиции (@dnd-kit)
- Рамки вокруг условий и групп для визуального разделения
- Подписи «все условия должны совпасть» / «достаточно одного совпадения» под И/ИЛИ
- Фикс: отмена (закрытие без «Сохранить») корректно откатывает изменения — useEffect по open

### Шапки списков — теги в стиле Notion
- Шапка списка переделана в тег (rounded-full, цветной фон)
- Произвольный цвет через нативный color picker (hex)
- Новая колонка `header_color` в `board_lists`, обновлён RPC `get_board_lists`
- Меню (⋮ вертикальное) — показывается только при наведении
- Кнопки «Выше»/«Ниже» в меню для сортировки списков в колонке
- Заголовки групп оформлены как маленькие теги (rounded-full bg-muted-foreground/10)
- Увеличен шрифт в тегах (text-sm), увеличен gap между списками

### Единая система контроля доступа (security fix)
- **Проблема:** доски и страница задач загружали ВСЕ треды/проекты без проверки прав — любой пользователь видел все данные workspace
- Создана единая функция `canAccessThread()` в `src/utils/threadAccess.ts` — 8 правил доступа, используется везде
- RPC `get_workspace_threads` — добавлена фильтрация по `p_user_id` на уровне БД (precompute arrays + WHERE)
- Новый RPC `get_accessible_projects` — возвращает только проекты, к которым у пользователя есть доступ
- Хуки `useWorkspaceTasks` и `useWorkspaceThreads` передают `user.id` в RPC
- Новый хук `useAccessibleProjects` заменяет `useWorkspaceProjects`
- Рефакторинг `useAccessibleThreadIds` и `useFilteredInbox` → единый import из utils
- BoardsPage и BoardPage переведены на `useAccessibleProjects`

---

## Затронутые файлы

- `src/components/boards/ListSettingsDialog.tsx`
- `src/components/boards/filters/FilterGroupEditor.tsx`
- `src/components/boards/BoardListCard.tsx`
- `src/components/boards/BoardColumn.tsx`
- `src/components/boards/types.ts`
- `src/components/boards/hooks/useListMutations.ts`
- `src/utils/threadAccess.ts` (новый)
- `src/hooks/shared/useAccessibleProjects.ts` (новый)
- `src/hooks/tasks/useWorkspaceTasks.ts`
- `src/hooks/tasks/useWorkspaceThreads.ts`
- `src/hooks/messenger/useAccessibleThreadIds.ts`
- `src/hooks/messenger/useFilteredInbox.ts`
- `src/page-components/BoardPage/index.tsx`
- `src/page-components/BoardsPage/index.tsx`

### SQL миграции
- `add_header_color_to_board_lists`
- `update_get_board_lists_add_header_color`
- `get_workspace_threads_with_access` + `fix_get_workspace_threads_roles_check`
- `get_accessible_projects` + `fix_get_accessible_projects_roles_check`
