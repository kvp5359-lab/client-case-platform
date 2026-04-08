# Раздел «Задачи» — показ всех типов тредов + унификация TaskPanel — 2026-04-08

**Дата:** 2026-04-08
**Тип:** feature, refactoring
**Статус:** completed

---

## Что сделано

### Показ всех типов тредов в разделе «Задачи»
- Убран фильтр `type='task'` — теперь чаты и email тоже отображаются, если соответствуют фильтрам
- RPC переименована: `get_workspace_tasks` → `get_workspace_threads`, добавлено поле `type`
- Для чатов/email в строке после названия показывается иконка треда в accent_color
- Тексты обновлены: поиск, пустое состояние, ошибки мутаций — теперь не привязаны к слову «задача»

### TaskPanel — портал и позиционирование
- Панель рендерится через портал в `#workspace-panel-root` — одинаковая ширина с основной боковой панелью
- Убран backdrop: список задач кликабелен при открытой панели, клик по другому треду переключает панель
- Закрытие по клику вне панели (mousedown на document)
- Иконка треда (из поля `icon`) вместо хардкодных иконок по типу
- `data-task-panel-open` на body для сдвига тостов

### Устранение дублирования
- Создан `useTaskPanelSetup` — единый хук для мутаций и состояния TaskPanel
- Создан `newThreadToTaskItem()` — хелпер конвертации ProjectThread → TaskItem
- InboxPage, WorkspaceLayout, BoardsPage — заменены ~90 строк дублированного кода
- `useCreateTaskMutation` — убран дублирующий путь через `supabase.insert`, единый путь через `useCreateThread`

### Типы и стили
- `TaskItem.type` теперь обязательный
- BoardsPage передаёт `type` при конвертации
- Общий CSS-класс `.side-panel` для правых боковых панелей

### Прочие исправления
- `MinimalTiptapEditor` — синхронизация `editable` с `disabled`

---

## Затронутые файлы

- `src/components/tasks/TaskListView.tsx`
- `src/components/tasks/TaskPanel.tsx`
- `src/components/tasks/TaskRow.tsx`
- `src/components/tasks/taskListConstants.ts`
- `src/components/tasks/types.ts`
- `src/components/tasks/useTaskPanelSetup.ts` (новый)
- `src/components/tasks/useCreateTaskMutation.ts`
- `src/components/tasks/useTaskMutations.ts`
- `src/components/WorkspaceLayout.tsx`
- `src/components/messenger/MinimalTiptapEditor.tsx`
- `src/components/messenger/threadConstants.ts`
- `src/hooks/tasks/useWorkspaceTasks.ts`
- `src/page-components/BoardsPage/index.tsx`
- `src/page-components/InboxPage/index.tsx`
- `src/app/globals.css`
- SQL: `get_workspace_tasks` → `get_workspace_threads`
