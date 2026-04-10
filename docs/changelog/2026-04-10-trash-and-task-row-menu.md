# Корзина воркспейса, меню задач, приглушение финальных — 2026-04-10

**Дата:** 2026-04-10
**Тип:** feature, refactoring, fix
**Статус:** completed

---

## Что сделано

### Раздел «Корзина» — мягкое удаление проектов и тредов

- В настройках воркспейса появилась вкладка «Корзина» (только для владельца)
- В корзину уходят удалённые проекты, задачи, чаты и email-треды
- Каждый элемент можно восстановить или удалить навсегда
- Показывается дата удаления и кто удалил (имя участника)
- Проекты удаляются вместе со своим содержимым (треды внутри помеченного проекта перестают показываться, при восстановлении — возвращаются автоматически)
- Отдельные удалённые треды (без удаления проекта) — отдельной секцией

### Мягкое удаление (soft delete)

- `useDeleteThread` — теперь UPDATE вместо DELETE, пишет `is_deleted`, `deleted_at`, `deleted_by`
- `deleteProjectMutation` в `ProjectsPage` — тоже soft delete, подтверждение «В корзину» вместо «Удалить»
- `projectService.deleteProject` — аналогично для API-сервиса
- Инвалидация кэша `['trash']` после мутаций — корзина обновляется сразу

### Фильтры `is_deleted = false` во всех SELECT

- `useProjectThreads`, `useSidebarData` (оба запроса), `useWorkspaceProjects` (боды)
- `useChatSettingsData` (2 места), `projectService.getProjectsByWorkspace`
- `useNewMessageToast` (при новом сообщении не открывать удалённые треды)
- Вычисление `max sort_order` при создании треда — исключает удалённые, чтобы не было «дыр»

### RPC: исключение тредов из удалённых проектов

- `get_user_projects` — добавлен фильтр `is_deleted = false`
- `get_workspace_threads` — добавлен `(p.id IS NULL OR p.is_deleted = FALSE)`
- `get_sidebar_data` — аналогично, треды из удалённых проектов не попадают в сайдбар
- `get_my_urgent_tasks_count` — удалённые проекты не раздувают счётчик срочных задач

### Меню «три точки» на строках задач

- На каждой строке задачи — меню `MoreVertical` сразу после аватаров исполнителей
- Пункты: «Открыть» и «Удалить» (красным)
- Появляется при наведении на строку (как drag handle)
- Единый `DeleteThreadDialog` для чатов и задач — корректные тексты «Удалить задачу…» / «Удалить чат…»
- Сигнатура `useDeleteThread` ослаблена до `{id, name, type, project_id}` — работает и с `ProjectThread`, и с `TaskItem`

### Приглушение задач в финальном статусе

- Аватары исполнителей — opacity 20%, возвращаются на 100% при наведении
- Дедлайн — аналогично, opacity 20% с восстановлением на hover
- `DeadlinePopover` принимает новый проп `isFinal`, `AssigneesPopover` — `dimmed`

### Новые треды вставляются в конец списка

- При создании чата/задачи вычисляется `sort_order = max(sort_order) + 10`
- Раньше все новые записи получали `sort_order = 0` (default) и вставлялись в начало
- Теперь новый тред всегда в конце своего проекта

### Фикс ресайза сайдбара

- При перетаскивании правой границы сайдбара она больше не «скачет» к позиции курсора
- Вычисляется начальное смещение `pointerOffsetRef` от правого края при `mousedown`
- Ширина = `e.clientX - rect.left - pointerOffset`, с clamp [200, 480]

### Регенерация Supabase TypeScript-типов

- `src/types/database.ts` пересгенерирован через `supabase gen types typescript`
- Новые колонки `is_deleted`/`deleted_at`/`deleted_by` теперь видны TS
- Заодно ушли 7 старых TS-ошибок, возникших из-за устаревания типов

### Audit log

- Добавлены действия `restore` и `hard_delete` в `AuditAction`

---

## Затронутые файлы

### Новые
- `src/hooks/useTrash.ts`
- `src/page-components/workspace-settings/TrashTab.tsx`
- `src/app/(app)/workspaces/[workspaceId]/settings/trash/page.tsx`
- `supabase/migrations/20260410_trash_feature.sql`
- `supabase/migrations/20260410_trash_rpc_updates.sql`

### Изменённые
- `src/hooks/messenger/useProjectThreads.ts`
- `src/hooks/messenger/useNewMessageToast.ts`
- `src/components/WorkspaceSidebar/useSidebarData.ts`
- `src/components/WorkspaceSidebar/useSidebarResize.ts`
- `src/components/WorkspaceSidebarFull.tsx`
- `src/components/boards/hooks/useWorkspaceProjects.ts`
- `src/components/messenger/hooks/useChatSettingsData.ts`
- `src/components/messenger/DeleteThreadDialog.tsx`
- `src/components/tasks/TaskRow.tsx`
- `src/components/tasks/TaskGroupList.tsx`
- `src/components/tasks/TaskListView.tsx`
- `src/components/tasks/AssigneesPopover.tsx`
- `src/components/tasks/DeadlinePopover.tsx`
- `src/page-components/ProjectsPage.tsx`
- `src/page-components/WorkspaceSettingsPage.tsx`
- `src/services/api/projectService.ts`
- `src/services/api/projectService.test.ts`
- `src/services/auditService.ts`
- `src/types/database.ts` (регенерация)
- `.claude/rules/infrastructure.md`

### SQL миграции
- `20260410_trash_feature` — колонки `is_deleted`/`deleted_at`/`deleted_by` в `projects` и `project_threads`, индексы, обновлена `get_user_projects`
- `20260410_trash_rpc_updates` — `get_workspace_threads`, `get_sidebar_data`, `get_my_urgent_tasks_count` теперь исключают треды из удалённых проектов

---

## Оригинальный ClientCase (общая БД)

Миграция безопасна для оригинального проекта: он удаляет жёстко, `is_deleted` у его записей всегда останется `false`. После миграции в оригинальном проекте нужно регенерировать Supabase-типы, иначе TS в dev-режиме не будет знать про новые колонки:

```bash
cd /Users/kvp5359/Проекты/ClientCase
npx supabase gen types typescript --project-id zjatohckcpiqmxkmfxbs > src/types/database.ts
```
