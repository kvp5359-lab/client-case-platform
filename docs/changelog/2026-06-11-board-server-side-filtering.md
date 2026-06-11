# Доски: серверная фильтрация списков (union-prefilter)

**Дата:** 2026-06-11
**Тип:** feature + perf
**Статус:** completed (ждёт смок-теста в браузере)

---

## Проблема

Доски грузили **все** треды воркспейса на клиент (`useWorkspaceThreads` → RPC
`get_workspace_threads`) и фильтровали их в браузере (`applyFilters`). Это упёрлось
в лимит PostgREST 1000 строк: воркспейс перерос 1000 тредов (~1070), и треды за
границей лимита не доходили до клиента — на досках/списках пропадали элементы.

Временный фикс (постраничная загрузка в `useWorkspaceThreads`) вернул корректность,
но «грузить всё на клиент» растёт линейно. Нужна серверная фильтрация.

## Решение — вариант A (union-prefilter)

**Принцип:** сервер сужает выборку ГРУБО (с запасом), клиентский движок
(`src/lib/filters`) дорезает ТОЧНО. Один запрос на доску = union (OR) фильтров всех
её списков. Так надёжнее, чем «точная» фильтрация на сервере: компилятор фильтра
обязан возвращать **надмножество** того, что отдаёт TS-движок — баг компилятора
даёт лишние данные, а не неправильный список. Единственный источник правды по
семантике фильтра остаётся TS-движок (он же общий с `item_lists`).

Касается **всех досок во всех воркспейсах** — переведены оба входа: вкладки
`/boards` и отдельная страница `/boards/[boardId]`. Inbox-списки на доске не
затронуты (идут отдельным путём `useFilteredInbox`, в union не попадают).

### БД (миграция `20260611_board_server_side_filter.sql`, **применена в проде**)

- `get_board_filtered_threads(ws, user, filter jsonb)` и
  `get_board_filtered_projects(...)` — оборачивают существующие
  `get_workspace_threads` / `get_accessible_projects` как подзапрос с алиасом `b` и
  накладывают серверный WHERE. Доступ и вычисляемые поля не дублируются.
- Компилятор фильтра: `_board_compile_group` (рекурсия AND/OR) +
  `_board_compile_condition` + хелперы `_board_filter_uuid_list` /
  `_board_filter_text_list` / `_board_value_has_sentinel`.
- Понимает: `status_id`, `project_id`, `template_id`, `name (contains)`, `type`,
  `created_by`, булевы (`is_pinned`, `has_active_deadline_task`, `is_lead_template`),
  `final_kind`, `contact_participant_id`, junction `assignees` / `participants`.
  **Не понимает → `true`** (надмножество): даты (в v1 не сужаем), неизвестные поля,
  неразрешённый `__me__`. `__no_status__` обрабатывается (= IS NULL).
- Инъекции невозможны: имена колонок — из белого списка (CASE), значения — через
  `quote_literal` / валидацию uuid-регуляркой.
- Проектная RPC дополнительно отдаёт `next_task_id/name/deadline` (lateral) — теперь
  «ближайшая задача» проекта считается на сервере, проектные списки **больше не
  зависят** от загрузки всех тредов воркспейса (убрана скрытая связь).

### Клиент

- [`lib/filters/lowerForServer.ts`](../../src/lib/filters/lowerForServer.ts) (новый):
  `buildBoardServerFilter` (OR списков нужного типа + AND board-level среза + разворот
  `__me__` в id; неразрешимый `__me__` → noop-условие, сервер → `true`),
  `lowerFilterForServer`.
- [`lib/filters/types.ts`](../../src/lib/filters/types.ts): `mergeFilterGroupsOr`.
  Список без фильтра среди слагаемых → union вырождается в пустую группу (= грузим
  всё, клиент дорежет). Это заложенный предел метода: выигрыш по объёму есть только
  когда **все** списки доски отфильтрованы.
- [`services/api/boardFilterService.ts`](../../src/services/api/boardFilterService.ts)
  (новый): `getBoardFilteredThreads` / `getBoardFilteredProjects`.
- [`components/boards/hooks/useBoardData.ts`](../../src/components/boards/hooks/useBoardData.ts)
  (новый): `useBoardThreads` / `useBoardProjects`. Ключ запроса включает
  сериализованный union-фильтр — при смене фильтров списков запрос перевыбирается.
- [`queryKeys/misc.ts`](../../src/hooks/queryKeys/misc.ts): `boardFilteredKeys`.
- Переключены [`BoardTabContent.tsx`](../../src/page-components/BoardsPage/BoardTabContent.tsx)
  и [`BoardPage/index.tsx`](../../src/page-components/BoardPage/index.tsx).
- `next_task` берётся из проекта (узкий тип `NextTaskInfo`):
  [`useBoardListCardSetup.ts`](../../src/components/boards/hooks/useBoardListCardSetup.ts),
  [`useWorkspaceProjects.ts`](../../src/components/boards/hooks/useWorkspaceProjects.ts),
  [`BoardProjectRow.tsx`](../../src/components/boards/BoardProjectRow.tsx),
  [`DraggableBoardProjectRow.tsx`](../../src/components/boards/DraggableBoardProjectRow.tsx).
- Инвалидация/оптимистик новых кэшей:
  [`useUpdateProjectStatusOnBoard.ts`](../../src/components/boards/hooks/useUpdateProjectStatusOnBoard.ts)
  (патч серверно-фильтрованных кэшей проектов по префиксу — иначе при drag карточка
  «отскакивала»),
  [`useProjectThreads.mutations.ts`](../../src/hooks/messenger/useProjectThreads.mutations.ts)
  (удаление треда), `boardInvalidateKeys` в `BoardTabContent` (смена статуса/дедлайна).

## Сохранено без изменений

Группировки (`group_by`), сортировки (вкл. `manual_order` из `board_list_item_order`),
ручной cross-list DnD, режимы `display_mode` (list/cards/calendar), inbox-списки.

## Ограничения / на будущее

- Даты сервер в v1 не сужает (клиент дорезает точно). Если появятся тяжёлые
  дата-фильтры — добавить во вторую итерацию.
- Доска с catch-all колонкой (список без фильтра) → выигрыша по объёму нет.
- Временный фикс пагинации в `useWorkspaceThreads` оставлен — им ещё пользуются
  не-доски (TaskListView и др.). Кандидат на серверную фильтрацию во вторую очередь.

## Прочее в этом коммите

- `src/types/database.ts` перегенерирован от боевой БД. Помимо новых функций,
  синхронизированы давние расхождения: добавлены типы `get_inbox_message_status`,
  `get_inbox_search_threads` (RPC из июньских правок инбокса), удалён тип бэкап-таблицы
  `_backup_project_telegram_chats_20260528` (в проде её уже нет).

## Проверки

- `npx tsc --noEmit && npm run lint && npm test` — зелёные (tsc 0, lint 0, 700 тестов;
  +14 новых на `lowerForServer`).
- RPC применены в проде, паритет проверен на 1070 тредах: точное совпадение
  серверного результата с ручным эталоном по `status_id (in/not_in)` и
  `assignees (in/is_null)`; `next_task_deadline` отдаётся корректно.
- Смок-тест в браузере (рендер доски, cross-list DnD) — **не проводился**.
