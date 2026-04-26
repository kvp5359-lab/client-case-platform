# Доски: DnD списков и колонок · Боковая панель: вкладки с DnD/закреплением · RLS-защита истории

**Дата:** 2026-04-26
**Тип:** feat + fix + security
**Статус:** completed

---

## Контекст

Большая «продуктово-инфраструктурная» сессия после `digest-module-and-panel-status`. Тема — доводка досок (DnD внутри колонок и между ними), новая система вкладок боковой панели (закрепление + DnD), несколько UX-фиксов и закрытие давней утечки в «Истории», когда клиент с включённым модулем мог видеть сообщения из тредов, к которым у него формально не было доступа.

Всё в `main`, деплой автоматический через GitHub Actions → VPS.

---

## 1. Доски — DnD списков, новая колонка, скролл, фильтры

### Drag-and-drop списков между колонками

В шапке каждого списка появляется ручка `GripVertical` (на hover). Тянешь — список двигается между колонками или внутри колонки. Реализовано через `@dnd-kit/core` с кастомным collision detection (`gap → list → col`):

- Бросить **выше/ниже** другого списка — синяя горизонтальная черта показывает позицию (top/bottom считается по pointer Y).
- Бросить **в зазор между колонками** (`ColumnGap`) — спавнится новая колонка на этом индексе, существующие сдвигаются на +1.
- Бросить **в пустую часть колонки** — добавляется в конец.
- Pointer-based collision (а не closestCenter) — даже если курсор между списками, выбирается ближайший по Y; индикатор всегда стабилен.

Бэкенд: новая мутация `useReorderLists` с оптимистичным апдейтом. Пакетно апдейтит `column_index` и `sort_order` (шаг 10), новая колонка реализуется через сдвиг `column_index` всех списков за дроп-точкой.

Файлы: [`BoardView.tsx`](../../src/components/boards/BoardView.tsx), [`BoardColumn.tsx`](../../src/components/boards/BoardColumn.tsx), [`BoardListHeader.tsx`](../../src/components/boards/BoardListHeader.tsx), [`useListMutations.ts`](../../src/components/boards/hooks/useListMutations.ts).

### Скролл колесом без полосы прокрутки

При добавлении DnD-обёртки нечаянно сломалась цепочка `h-full` для `list_height='full'` — список рос по контенту, колесо скроллило страницу, а не список. Починено двумя правками:

- `<div className="flex shrink-0 h-full">` вокруг колонки + `h-full` на `DroppableColumn` (передача высоты).
- `DroppableListWrapper` пробрасывает `flex flex-col flex-1 min-h-0` для `list_height='full'`, чтобы карточка списка участвовала в флекс-распределении высоты колонки.
- На внутренний скроллер списка добавлен `scrollbar-hide` (CSS-утилита из [`globals.css:117`](../../src/app/globals.css)) — скролл работает, но полоса не отображается.

### Прочие фиксы

- **Бейджи групп выровнены по левой границе** — `px-2 pb-1` → `px-0 pb-1` на обёртке заголовка группы внутри списка ([`BoardListCard.tsx`](../../src/components/boards/BoardListCard.tsx)).
- **Отступ между списками +50%** (20→30px): `gap-5` → `gap-[30px]`.
- **Ошибка `arr.map is not a function`** в `filterEngine.ts:156` — старые рулсы могли иметь скалярное `value` для `in`/`not_in` (до миграции на multi-select). `resolveArray` теперь принимает `unknown` и нормализует в массив.
- **Селект шаблонов в фильтре** — `template_id` добавлен в `SELECTABLE_FIELDS` ([`FilterRuleRow.tsx`](../../src/components/boards/filters/FilterRuleRow.tsx)). Раньше рисовался текстовый input, хотя `FilterValueSelect` уже умел показывать опции из `useProjectTemplatesQuery`.

### Per-board URL и мелкое UX

- Каждая доска теперь имеет шарабельный URL `/workspaces/[id]/boards/[boardId]`. Старый `?board=<id>` поддерживается для обратной совместимости (авто-мигрирует в путь). После reload остаётся открытой та же доска. Сайдбар (закреплённые доски) ведёт на новые пути.

---

## 2. Боковая панель — вкладки с закреплением и DnD

Сильный апгрейд UX вкладок [`TaskPanelTabBar`](../../src/components/tasks/TaskPanelTabBar.tsx).

### Закрепление

- Контекстное меню по правому клику: «Закрепить/Открепить», «Закрыть».
- Закреплённые вкладки рендерятся **слева**, отделены тонким серым вертикальным разделителем от остальных.
- **Pinned-вкладки компактные**: `w-7 h-6 px-1.5 justify-center` — только иконка по центру, без заголовка. Бейдж (число/точка/эмодзи) лежит мини-маркером в правом-верхнем углу с белым `ring-1`.
- Поле `pinned?: boolean` в [`taskPanelTabs.types.ts`](../../src/components/tasks/taskPanelTabs.types.ts), мутации `togglePin`/`reorderTab`/`seedTabs` в [`useTaskPanelTabs.ts`](../../src/components/tasks/useTaskPanelTabs.ts).

### Drag-and-drop с понятной анимацией

- Вкладка едет за курсором через `useDraggable.transform` + CSS — без отдельного `DragOverlay`, движение видно прямо в ряду.
- Драгаемая вкладка получает `ring-2 ring-blue-500/60`, лёгкий `scale-105 rotate-1`, `cursor-grabbing`.
- **Синяя вертикальная черта** (`w-[3px]`, glow, `animate-pulse`) на левом или правом краю вкладки-цели — показывает, куда ляжет.
- Сторона (left/right) считается по реальной X курсора, отслеживаемой через window-listener `pointermove` во время drag (dnd-kit-овский `activatorEvent.clientX + delta.x` в портале давал смещение).
- Коллизии — `pointerWithin` (что под курсором) с fallback на `rectIntersection`.
- Конец ряда — `DropEnd` droppable с такой же синей чертой.

При drop: если бросили в правую половину таба X — вставляем после X; если в левую — перед. `reorderTab` обрабатывает индекс с учётом границы pinned/unpinned (закреплённые остаются в pinned-блоке).

### Авто-сидинг для новых проектов

При первом открытии панели в проекте, если в БД ещё нет записи `task_panel_tabs` для этой пары user/project, а у пользователя есть доступ к модулям `tasks` и `history` — обе вкладки автоматически открываются как **закреплённые**. Защита от повторного сидинга через `seedDoneRef` + флаг `isNewProject`. Уважает права роли — если у клиента `module_access.history === false`, «История» не сеется.

См. [`TaskPanelTabbedShell.tsx`](../../src/components/tasks/TaskPanelTabbedShell.tsx).

### Бейдж точкой для manually_unread

Раньше при ручной пометке треда непрочитанным на вкладке светилась цифра `1` (через хак в `TaskPanelTabbedShell`). Теперь используется единый источник правды [`getBadgeDisplay`](../../src/utils/inboxUnread.ts) — тот же, что для списка задач и inbox. На вкладке рисуется **полноразмерный (16×16) синий кружок без числа** — как в списке задач.

---

## 3. Авто-обновление списка по `has_active_deadline_task`

### Проблема

В фильтре «Есть активные задачи с дедлайном = Нет» при добавлении задачи со сроком в проект — список не обновлялся без F5.

### Фикс на двух уровнях

**Frontend.** `useCreateThread` и soft-delete треда инвалидируют `accessibleProjectKeys.all` при создании/удалении задачи с дедлайном — фильтр пересчитывается на доске мгновенно. Изменение дедлайна уже инвалидировало этот ключ. См. [`useProjectThreads.ts`](../../src/hooks/messenger/useProjectThreads.ts).

**Backend.** Расширили действие фильтра на все типы тредов (раньше учитывались только `type='task'`). Теперь любой тред с дедлайном — task / chat / email — считается «активной задачей с дедлайном», главное чтобы тред не был удалён и его статус не финальный (или статус не задан). Поле в `RETURNS TABLE` оставлено с прежним именем `has_active_deadline_task` ради совместимости с типами и фронтом.

См. миграцию [`20260426_has_active_deadline_thread_all_types.sql`](../../supabase/migrations/20260426_has_active_deadline_thread_all_types.sql).

---

## 4. Безопасность — RLS-гейт для тредов и сообщений

### Проблема (давний баг)

`AllHistoryContent` использует `useProjectThreads(projectId)` (прямой select из `project_threads`) и `useTimelineMessages` (прямой select из `project_messages`). RLS на этих таблицах гейтила доступ только на уровне **участника воркспейса/проекта**, без учёта `access_type`/`access_roles`/`project_thread_members`. В коде есть `canAccessThread` (8 правил), но клиентом он на эти данные **не накладывался**.

Результат: клиент с включённым модулем «История» в проектной роли мог увидеть сообщения из:
- приватных тредов (`access_type='roles'` без пересечения),
- кастом-тредов (`access_type='custom'` без явного членства),
- любых других, к которым по правилам не должен иметь доступ.

То же — при прямом запросе из DevTools.

### Фикс (миграция [`20260426_thread_access_rls.sql`](../../supabase/migrations/20260426_thread_access_rls.sql))

- **Helper-функция `can_user_access_thread(thread_id, user_id)`** — `STABLE SECURITY DEFINER`, зеркалит все 8 правил из [`src/utils/threadAccess.ts`](../../src/utils/threadAccess.ts):
  1. Workspace-level тред (без проекта) → доступен любому участнику воркспейса.
  2. `view_all_projects` / workspace owner → полный доступ.
  3. Project admin (`Администратор`) → доступ ко всем тредам проекта.
  4. Создатель треда → доступ.
  5. Исполнитель задачи (`task_assignees`) → доступ.
  6. `access_type='all'` + участник проекта → доступ.
  7. `access_type='roles'` + пересечение ролей → доступ.
  8. `access_type='custom'` + в `project_thread_members` → доступ.

- **`project_threads_select`** теперь дополнительно гейтит project-level треды через `can_user_access_thread`. Workspace-level (без проекта) — без изменений.

- **`project_messages_select`** добавлен пункт: либо `thread_id IS NULL`, либо `can_user_access_thread(thread_id, ...)`. Старые гейты (project_participant + channel/internal/draft) сохранены.

### Эффект

- Утечка закрыта на уровне БД — даже прямой `supabase.from('project_messages').select()` ничего лишнего не вернёт.
- В UI «История» больше не показывает сообщения из недоступных тредов.
- Workspace owner / `view_all_projects` пользователи проходят как раньше.
- Возможный побочный эффект: `useProjectThreads` теперь возвращает меньше тредов для не-админов в местах, где раньше показывал всё. Это правильное поведение; если где-то поломает UX — поправим точечно.

---

## Файлы

### Фронт

- `src/components/boards/BoardView.tsx`
- `src/components/boards/BoardColumn.tsx`
- `src/components/boards/BoardListCard.tsx`
- `src/components/boards/filters/FilterRuleRow.tsx`
- `src/components/boards/filters/filterEngine.ts`
- `src/components/tasks/TaskPanelTabBar.tsx`
- `src/components/tasks/TaskPanelTabbedShell.tsx`
- `src/components/tasks/taskPanelTabs.types.ts`
- `src/components/tasks/useTaskPanelTabs.ts`
- `src/hooks/messenger/useProjectThreads.ts`

### Миграции

- `supabase/migrations/20260426_has_active_deadline_thread_all_types.sql`
- `supabase/migrations/20260426_thread_access_rls.sql`

---

## Что дальше

- Проверить, не сжалась ли видимость тредов в неожиданных местах (списки задач, шапка проекта, realtime-подписки) после ужесточения RLS — у не-админов теперь приходит только то, к чему есть доступ.
- Возможно, добавить кнопку «Закрепить вкладку» прямо в TabBar (без правого клика), если контекстное меню окажется неочевидным.
- DnD списков на доске на тач-устройствах не тестировался.
