# TaskPanel режим «Проект» + фильтр активных дедлайнов + подсветка выбранного — 2026-04-12

**Дата:** 2026-04-12
**Тип:** feature, fix, refactoring
**Статус:** completed

---

## Что сделано

### Новый фильтр «Есть активные задачи с дедлайном» на доске проектов

- В настройках списка проектов на доске появилось поле фильтра `has_active_deadline_task` (Да / Нет)
- «Активная задача» = статус с `is_final = false` ИЛИ без статуса
- Позволяет отфильтровать проекты, у которых нет ни одной активной задачи с дедлайном
- Значение поля приходит из RPC `get_accessible_projects` как вычисляемая булева колонка (EXISTS по `project_threads` + `statuses.is_final`)
- Миграция `20260412_get_accessible_projects_has_active_deadline_task.sql` применена на продакшн
- Заодно в RPC добавлен фильтр `proj.is_deleted = false` — раньше его не было, удалённые проекты технически могли протечь в списки
- UI селектора Да/Нет уже поддерживался `FilterRuleRow` для `type === 'boolean'` — ничего дополнительно рисовать не пришлось

### Фикс: фильтры к спискам проектов на доске не применялись вообще

- `BoardListCard` рендерил проекты напрямую через `projects.map(...)`, минуя движок фильтров
- Хук `useFilteredProjects` существовал в `useFilteredListData.ts`, но его никто не вызывал
- Теперь вызов добавлен: `useFilteredProjects(projects, safeFilters, filterCtx, projectParticipantsMap)`
- Новый хук `useWorkspaceProjectParticipants` — одним запросом грузит карту `project_id → participants[]` для junction-фильтра «Участники» (запрос идёт только если на доске реально есть списки проектов)
- Новое поле `has_active_deadline_task` зарегистрировано в `PROJECT_FILTER_FIELDS` и в `fieldAccessors` движка фильтров

### Автообновление списка проектов после смены статуса/дедлайна задачи

- В `useUpdateTaskStatus` и `useUpdateTaskDeadline` добавлена инвалидация `accessibleProjectKeys.all` в `onSuccess`
- Смена статуса (финальный ↔ не финальный) и добавление/удаление дедлайна меняют значение `has_active_deadline_task` у проекта — инвалидация заставляет RQ перезапросить RPC
- Инвалидация централизованная: работает отовсюду, где вызываются эти мутации (BoardsPage inline-change, WorkspaceLayout TaskPanel, InboxPage, TaskListView, страница проекта)
- Цена: один SQL-запрос после мутации, только если юзер смотрит на список проектов

### TaskPanel: два режима содержимого в одной панели

**Режим 1 — «Открытый тред»** (как раньше)
- Шапка: статус, название, исполнители, настройки, дедлайн, ссылка на проект, кнопка «Другие задачи»
- Тело: `MessengerTabContent` (сообщения треда)

**Режим 2 — «Открытый проект»** (новый)
- Шапка: иконка проекта + название + кнопка «Открыть проект» (иконка `ExternalLink`) + «Закрыть»
- Вторая строка шапки: `Создан {formatSmartDate}` • описание проекта (светло-серым, `text-muted-foreground/70`, truncate с `title`)
- Тело: `TaskListView` с `projectId` — полноценный список задач проекта (фильтры, группировка, «+ Создать задачу»)
- Шапка двустрочная, левый отступ второй строки рассчитан так, чтобы текст начинался под названием проекта (с учётом кнопки «назад», если есть)

### Стек навигации — смешанный (task + project)

- `useTaskPanelSetup` переведён со стека `TaskItem[]` на `PanelStackItem[]` — дискриминированный юнион `{ kind: 'task', task } | { kind: 'project', project }`
- Новый тип `ProjectHeaderInfo` — минимум `{ id, name }` + опционально `created_at`, `description`
- Наружу хук отдаёт: `openThread` (верхний элемент, если задача), `openProject` (если проект), `setOpenThread`, `openProjectTasks`, `pushThread`, `pushProject`, `popThread`
- Дедупликация в стеке работает для обоих типов — элементы идентифицируются по `kind:id`
- Лимит глубины `MAX_STACK = 7` сохранён

### Новые точки входа в TaskPanel

- **Клик по проекту в списке на доске** (`BoardProjectRow`) → `useLayoutTaskPanel().openProject(...)` → Режим 2. Cmd/Ctrl+клик или средняя кнопка — отдаёт браузеру для открытия в новой вкладке.
- **Кнопка «Другие задачи» в открытой задаче** → `onOpenProjectInStack({ id, name })` → задача уходит в стек ниже, панель переключается в Режим 2. Возврат — кнопкой «назад». Оверлей `threadListOpen` с его контекстом-перехватчиком **удалён**.
- **Клик по задаче в списке внутри Режима 2** → `TaskListView` уже использует `layoutPanel.openThread()`. Внутри Режима 2 `TaskPanel` оборачивает `TaskListView` своим `TaskPanelContext.Provider`, где `openThread` делегирует в `onOpenThreadInStack` (push) — задача ложится поверх проекта.

### Локальный TaskPanelContext.Provider в BoardsPage

- `BoardsPage` использует собственный локальный `useTaskPanelSetup` + собственный `<TaskPanel>` (который передаётся в layout-уровневую панель при навигации на проект через `globalOpenThread`)
- Добавлен локальный `TaskPanelContext.Provider` с методами локального `tp`, иначе `BoardProjectRow` через `useLayoutTaskPanel()` открывал бы layout-уровневую панель, а не локальную
- В `WorkspaceLayout` контекст тоже обновлён: `openProject` и `pushProject` проброшены в провайдер, эффект закрытия панели при смене проекта учитывает Режим 2

### Подсветка выбранного проекта/задачи на доске

- `BoardProjectRow` и `BoardTaskRow` принимают проп `isSelected`
- Выделенная строка: `bg-brand-100` (яркий фон сразу, без необходимости ховера) + `border-brand-200` (в cards-режиме) + `text-brand-700 font-medium` для названия + `text-brand-600` для иконки
- `selectedProjectId` пробрасывается из `BoardsPage → BoardView → BoardColumn → BoardListCard → BoardProjectRow`, вычисляется как `tp.openProject?.id`
- `selectedThreadId` раньше прокидывался только до `BoardInboxList`, теперь ещё и до `BoardTaskRow` — задачи тоже подсвечиваются (был побочный дефект)

### Ленивая дозагрузка метаданных проекта в TaskPanel

- Если проект открыт через кнопку «Другие задачи» в задаче, наружу передаётся только `{ id, name }` (на стороне `TaskPanel` больше данных нет)
- Добавлен `useEffect`, который дотягивает `created_at` и `description` из `projects` одиночным запросом, если они не пришли на входе
- Для клика с доски этого не нужно — `BoardProjectRow` передаёт эти поля сразу из `BoardProject`

---

## Затронутые файлы

### Новые

- `supabase/migrations/20260412_get_accessible_projects_has_active_deadline_task.sql` — `DROP + CREATE` функции с новым `has_active_deadline_task` полем и фильтром `is_deleted = false`
- `src/components/boards/hooks/useWorkspaceProjectParticipants.ts` — карта `project_id → participants[]` для junction-фильтра

### Изменённые

**TaskPanel рефакторинг:**
- `src/components/tasks/TaskPanel.tsx` — 354 строки изменений, новые типы `ProjectHeaderInfo`/`PanelStackItem`, проп `stackTop` вместо `task`, ветка рендера Режима 2, удалён оверлей `threadListOpen`, ленивая дозагрузка метаданных проекта
- `src/components/tasks/useTaskPanelSetup.ts` — 183 строки изменений, стек с дискриминированным юнионом, новые методы `openProjectTasks`/`pushProject`, мутации сохраняют тип элемента при обновлении верхушки
- `src/components/tasks/TaskPanelContext.tsx` — добавлены `openProject?`, `pushProject?`
- `src/components/tasks/TaskListView.tsx` — fallback-рендер `<TaskPanel>` адаптирован под `stackTop`
- `src/components/WorkspaceLayout.tsx` — методы `openProject`/`pushProject` проброшены в провайдер, эффект закрытия учитывает Режим 2

**Доска — фильтрация проектов и подсветка:**
- `src/components/boards/BoardListCard.tsx` — вызов `useFilteredProjects`, `isSelected` в оба row-компонента
- `src/components/boards/BoardProjectRow.tsx` — клик → `layoutPanel.openProject` с `created_at`/`description`, подсветка `isSelected`, Cmd/Ctrl+клик ведёт на страницу проекта
- `src/components/boards/BoardTaskRow.tsx` — подсветка `isSelected` для list и cards режимов
- `src/components/boards/BoardColumn.tsx`, `BoardView.tsx` — прокидывают `selectedProjectId`
- `src/components/boards/filters/filterDefinitions.ts` — новое поле `has_active_deadline_task` в `PROJECT_FILTER_FIELDS`
- `src/components/boards/hooks/useFilteredListData.ts` — accessor для нового поля
- `src/components/boards/hooks/useWorkspaceProjects.ts` — `BoardProject` расширен полем

**Автообновление и страница досок:**
- `src/components/tasks/useTaskMutations.ts` — инвалидация `accessibleProjectKeys.all` в `useUpdateTaskStatus` и `useUpdateTaskDeadline`
- `src/page-components/BoardsPage/index.tsx` — локальный `TaskPanelContext.Provider`, передача `selectedProjectId`/`selectedThreadId` в `BoardView`
- `src/types/database.ts` — сигнатура `get_accessible_projects` обновлена (поле `has_active_deadline_task: boolean`)

---

## Проверки

- ✅ `tsc --noEmit` — 0 ошибок
- ✅ `npm run lint` — 0 ошибок / 0 предупреждений
- ✅ `npm test` — 620 / 620 тестов прошли (43 файла)
- ✅ Миграция применена на продакшн-БД через Supabase MCP

---

## Известные ограничения

- **Клик по проекту открывает панель только на доске.** В сайдбаре слева и на странице проектов клик ведёт на страницу проекта, как раньше — осознанное решение, чтобы не раздувать scope.
- **`BoardPage/index.tsx`** — мёртвый код, не импортируется нигде (роут `/boards/[boardId]` редиректит на `/boards` с вкладками). Не тронут.
- **Кнопка «Другие задачи» полностью заменяет содержимое панели** — раньше это был оверлей, который можно было закрыть и вернуться к той же задаче. Теперь задача уходит в стек, возврат — кнопкой «назад». Это было осознанное решение (Вариант A в обсуждении с пользователем).
- **`TaskPanel` на `BoardPage` (legacy)** — подсветка проекта там бы не работала, но страница всё равно редиректит на `/boards`, так что неактуально.
- **Create/soft-delete задач не инвалидируют** `accessibleProjectKeys` — мутации живут в отдельных хуках. Если на практике всплывёт — дотянем.
