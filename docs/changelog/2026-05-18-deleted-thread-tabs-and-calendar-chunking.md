# Вкладки удалённых тредов в правой панели + chunking запроса календарного виджета

**Дата:** 2026-05-18
**Тип:** fix (medium × 2)
**Статус:** completed

---

## Контекст

Два независимых бага, оба всплыли после вчерашнего backfill `owner_user_id` (см. [2026-05-17-secret-rotation-and-email-from-board](2026-05-17-secret-rotation-and-email-from-board.md)) — список видимых задач увеличился, и накопившиеся «мусорные» вкладки + URL-лимит PostgREST стали заметны.

## Сюжет 1: «мёртвые» вкладки в правой панели

### Что было

В правой панели открытые вкладки треды (например, цепочка GitHub-уведомлений `[kvp5...]`) сохранялись в `task_panel_tabs.tabs`. При мягком удалении треда (`is_deleted = true`) запись о вкладке оставалась — рендерилось 10+ мёртвых табов с битыми ссылками. Контент в каждой пустой, переключение между ними бесполезно.

### Фикс

[`useTaskPanelTabs.ts`](../../src/components/tasks/useTaskPanelTabs.ts) после загрузки `task_panel_tabs` собирает все `refId` вкладок типа `thread`, делает один `SELECT id FROM project_threads WHERE id IN (...) AND is_deleted = false` и оставляет только живые табы. Системные вкладки (`history`, `tasks` и т.п.) не фильтруются.

Дополнительно в [`useDeleteThread`](../../src/hooks/messenger/useProjectThreads.mutations.ts) `onSuccess` добавлена инвалидация `taskPanelTabsKeys.all` — чтобы при удалении треда вкладка исчезала **сразу**, без перезагрузки страницы.

Для broad-invalidate в [`queryKeys/misc.ts`](../../src/hooks/queryKeys/misc.ts) добавлен префикс `taskPanelTabsKeys.all = ['task-panel-tabs']`. Это позволяет одной инвалидацией задеть все scope (project / contact / разные пользователи).

### Что не сделано

Сами записи в `task_panel_tabs` не чистятся — мёртвые `refId` остаются в БД, просто не рендерятся. Это by design: следующий persist (`upsertMutation`) перетрёт `tabs` уже без удалённых. Если хочется чистить инкрементально — нужен БД-триггер `AFTER UPDATE ON project_threads`, который выкидывает соответствующий элемент из jsonb-массива во всех `task_panel_tabs`. На данном объёме мусора не критично.

## Сюжет 2: chunking запроса календарного виджета

### Что было

[`BoardListCalendarView`](../../src/components/boards/BoardListCalendarView.tsx) — календарный режим колонки доски. Чтобы не менять RPC `get_workspace_threads`, дополнительный запрос `SELECT id, start_at, end_at FROM project_threads WHERE id IN (taskIds) AND start_at NOT NULL AND end_at NOT NULL` подгружает интервалы для уже отфильтрованных задач.

После вчерашнего backfill `owner_user_id` у активного пользователя добавилось +15 задач без проекта. `taskIds` перевалил за ~50 UUID, GET-запрос превысил URL-лимит PostgREST → 400. Карта `times` оставалась пустой → ни одно событие не рендерилось в календарь.

Симптом: на доске «Входящие» в виджете «Календарь» исчезли все события (на скриншоте слот «18 пн 10:30-12:00» был пуст, хотя задача «Созвон Аня/Кирилл» с этим временем существует).

Это **второй раз** ловим один и тот же URL-лимит. Первый раз — вчера в `useTaskAssigneesMap` (см. [2026-05-18-task-assignees-chunking](2026-05-18-task-assignees-chunking.md)).

### Фикс

Тот же паттерн: `taskIds.slice` на чанки по 40, параллельный `Promise.all`, мерж результатов в одну `Record<string, {start_at, end_at}>`.

### Что не сделано (TODO)

В кодовой базе ещё ~15 мест с паттерном `.in('id', longList)` (см. `grep -rn ".in('id'" src/`). Большая часть — короткие списки (template fields, document kits), для них URL-лимит недостижим. Но потенциально опасны: `useThreadMembersMap`, `useTimelineMessages` (на больших ветках), `useChatSettingsData`. Превентивно не чиним — YAGNI. Если что-то ещё «пустеет» — применить тот же паттерн.

Долгосрочно — оба места стоит унести в RPC с агрегацией на стороне БД (один POST с jsonb-параметром вместо длинного GET). Это будет частью общего рефакторинга батч-запросов, пока не приоритет.

## Файлы

**Изменены:**

- [`src/components/tasks/useTaskPanelTabs.ts`](../../src/components/tasks/useTaskPanelTabs.ts) — фильтр мёртвых вкладок-тредов.
- [`src/hooks/messenger/useProjectThreads.mutations.ts`](../../src/hooks/messenger/useProjectThreads.mutations.ts) — инвалидация `taskPanelTabsKeys.all` при удалении треда.
- [`src/hooks/queryKeys/misc.ts`](../../src/hooks/queryKeys/misc.ts) — `taskPanelTabsKeys.all` для broad-invalidate.
- [`src/components/boards/BoardListCalendarView.tsx`](../../src/components/boards/BoardListCalendarView.tsx) — chunking запроса `start_at/end_at`.

**В БД:** ничего.

## Что проверить после деплоя

- [x] Правая панель: мусорных вкладок [kvp5...] не видно после reload.
- [x] При удалении треда из открытой вкладки — вкладка исчезает сразу.
- [x] Виджет «Календарь» в колонке доски показывает все задачи с заполненными `start_at/end_at`.
