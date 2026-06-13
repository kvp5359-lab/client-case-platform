# Аудит производительности и масштабируемости — 2026-06-13

4 агента + реальные замеры `EXPLAIN (ANALYZE, BUFFERS)` на проде (воркспейс
`8a946780…`: 1116 тредов, 12 215 сообщений, ветка `view_all`/Владелец = худший
случай) + Supabase performance advisors (272 находки) + `pg_stat_user_tables`.

Вопрос: где упрётся при росте числа **проектов / задач / пользователей / сообщений**.

**Вывод верхнего уровня:** код-инфра в целом зрелая (зрелый code-splitting,
кроны bounded `LIMIT 200`+`SKIP LOCKED`, триггер отправки = 1 http_post/сообщение
без fan-out, вложения батчатся, RLS-cleanup корректен, **нет непокрытых FK**).
Но есть **один доминирующий архитектурный обрыв (инбокс-RPC)** и **один скорый
тихий обрыв (пагинация на 1000)**. Ниже по приоритету.

---

## 🔴 P1 — Семейство inbox-RPC: линейный скан ВСЕХ сообщений на каждый вызов (главный обрыв)
Сошлось у 3 агентов + замеры. `get_inbox_threads_v2` и обёртки `_one`/`_unread`/
`_search`/`_page`/`_aggregates` строят ~14 CTE, 6+ из которых делают **полный
проход по `project_messages`/`message_reactions`/`audit_logs` всех доступных тредов**.

**Замерено (прод, 12k сообщений):**
- `get_inbox_threads_v2` — 143 мс / 44 326 буферов.
- `get_inbox_thread_one` (ОДИН тред) — 140 мс / 43 548 буферов (`Rows Removed by Filter: 1092` — платим за 1093 треда, отдаём 1).
- `get_inbox_unread_threads` (10 строк) — 158 мс / 44 398 буф.
- `get_inbox_threads_page` (LIMIT 50) — 149 мс (LIMIT после материализации всего инбокса).
- `get_inbox_thread_aggregates` — 69 мс / 25 247 буф.

**Рост линейный по числу сообщений:** 12k→143мс; 100k→~1.1с; 500k→5-6с (совпадает
с памятью проекта 800→10000 тредов = 790мс→7-10с и с backlog «95% нагрузки БД»).

**Усилитель (Agent D):** `useWorkspaceMessagesRealtime` (смонтирован в `WorkspaceLayout`
у КАЖДОГО онлайн-юзера) на каждое сообщение/реакцию воркспейса инвалидирует
`aggregates`+`unread`+`threads`. То есть на N онлайн-юзеров × поток сообщений =
N×(3 тяжёлых RPC) каждые ~400мс. При 10× тредов инбокс «залипнет» у всех разом.

**Направление:**
1. (Б筑) `get_inbox_thread_one`/`_unread`/`_aggregates` → **прямой адресный доступ** вместо `SELECT * FROM v2 WHERE…`: `_one` считает агрегаты только для `p_thread_id` (единицы буферов вместо 44k); `_unread`/`_aggregates` — лёгкий counter без материализации строк.
2. (Стратег.) денормализованная **таблица-проекция inbox** (строка на тред-пользователя: `last_message_at/text/sender`, `unread_count`, `last_reaction`), триггеры поддерживают → лента = keyset-индекс-скан O(страница), а не O(все сообщения). Единственное, что снимает линейный рост.
3. Realtime: таргетная инвалидация по `thread_id` из payload вместо broad-invalidate всего инбокса.

Файлы: `20260516_inbox_v2_add_last_read_at.sql`, `20260609_thread_access…sql`, `20260601_inbox_thread_one.sql`, `20260601_inbox_unread_threads.sql`, `useWorkspaceMessagesRealtime.ts:39`.

## 🟠 P2 — `get_workspace_threads`/`get_sidebar_data` без пагинации (рост по тредам) — ⚠️ premise про «cap 1000» ОТОЗВАН 2026-06-13
**Поправка:** изначально стояло «PostgREST cap 1000 → треды тихо пропадают СЕЙЧАС». **Неверно** —
проверено: `pgrst.db_max_rows` НЕ задан ни на одной роли (`authenticator`/`authenticated`/`anon`),
`get_workspace_threads` без LIMIT → все **1116 тредов возвращаются полностью, тихой потери НЕТ.**
Реальный риск роста тут — не обрезание, а `statement_timeout=8s` на роли `authenticated`: при
большом объёме тяжёлый запрос отвалится **с ошибкой** (не молча). Это та же категория, что P1
(не «ближайший фронт»), горизонт — крупный рост. Тем самым P2 понижен 🔴→🟠 и переехал в Tier 3.
- `get_workspace_threads` — без LIMIT, отдаёт все треды воркспейса; доски (`get_board_filtered_threads`) оборачивают → наследуют.
- `get_sidebar_data` — `json_agg` ВСЕХ тредов на каждую загрузку сайдбара (мегабайты JSON при 10k).
- `get_accessible_projects` — жёсткий `LIMIT 200` (при >200 проектах часть не покажется — вот тут потолок РЕАЛЬНЫЙ, но не «тихий обрыв пагинации»).

**Направление (когда дойдёт горизонт):** keyset-пагинация для досок/списков; `get_sidebar_data` — облегчить до индексного access-запроса (он строит только id/access_type/roles).

## ~~🔴 P3 — `inbox_sort_at` мёртвый~~ — ❌ ЛОЖНАЯ НАХОДКА (дрейф репо↔прод), отозвано 2026-06-13
**Аудит ошибся: колонка ЧИТАЕТСЯ.** Живой `get_inbox_threads_page` (снят с прода) считает
`sort_at = COALESCE(pt_meta.inbox_sort_at, GREATEST(last_message_at,last_event_at), created_at)`
и сортирует `ORDER BY sort_at DESC, thread_id DESC` + keyset-курсор по `(sort_at, thread_id)`.
Т.е. `inbox_sort_at` — **главный ключ сортировки инбокса** с фолбэками, а 2 триггера его
поддерживают. Это **материализованный sort-key ради быстрой keyset-пагинации**, не «пишем и
не читаем». Дроп колонки/триггеров сломал бы порядок ленты и курсор.

Причина ошибки: аудит читал **репо-версию** `get_inbox_threads_page` (там `COALESCE(GREATEST(...))`
без `inbox_sort_at`), а прод обновили напрямую (классический drift, см. memory
`project_rpc_drift_repo_vs_prod`). **Действий не требуется.** Записи 2026-06-10 в ledger/backlog
(«inbox_sort_at … не читаются … мёртвые») — исправлены. Остаточный долг: синхронизировать
репо-тело `get_inbox_threads_page` с живым (чтобы доки не врали; db push прод не откатит — он
не перезапускает старые миграции).

## 🔴 P4 — Фронт: нет виртуализации `/tasks`+`/lists` + `useThreadCounterpartName` per-row (квадратичный)
- **Нет виртуализации** ([TableShell.tsx:112], источник `useWorkspaceThreads` грузит ВСЕ треды): при 1000+ задач все `<tr>` в DOM, каждая `ThreadRow` тянет 2 mutation-хука + Radix Dropdown/DatePicker. `react-tanstack/virtual` уже в deps (применён в `FolderSectionContent`). #1 тормоз рендера при росте.
- **`useThreadCounterpartName`** ([useThreadCounterpartName.ts:24]) вызывается per-row (`ThreadRow:39`, `BoardTaskRow:49`): каждая строка делает `useSyncExternalStore`+`queryCache.subscribe` и на ЛЮБОЕ кэш-событие линейно сканит `data.pages[].items.find(...)` → **O(N×pages×items)** на каждый чих кэша. Сводит на нет `memo(ThreadRow)`. Дешёвый фикс: один `useMemo`-словарь на уровне таблицы, значение пропом.

## 🔴 P5 — `CommentBadge` N+1: счётчик комментариев отдельным запросом на КАЖДУЮ строку
[CommentBadge.tsx:46] (`useCommentCounts`) рендерится в каждой строке документа/слота/папки (`DocumentRow:166`, `DocumentItem:249`, `SlotRow:190`, `FolderSectionHeader:179`) — **ни один не передаёт `count` пропом** → каждый бейдж = свой запрос с одноэлементным массивом (queryKey уникален, дедупа нет). Проект с 90 доками/слотами/папками = ~90 запросов при открытии «Документов». **Функция `getCommentCounts` уже умеет батч — её просто не зовут с полным списком.** Тривиальный фикс.

## 🟠 Средние (рост по тредам/задачам)
- **`/tasks`+`/lists` — полная выборка `get_workspace_threads` + клиентский `applyFilters`** ([useWorkspaceThreads.ts:18]→`TaskListView:123`/`ThreadTableView:37`). Доски УЖЕ мигрированы на серверный фильтр (`getBoardFilteredThreads`) — списки и задачи отстали. Применить тот же подход.
- **`useTaskAssigneesMap`** ([useTaskAssignees.ts:29]) — 28 параллельных чанк-запросов + ~36-КБ queryKey (`sort().join`) на /tasks /lists /boards → один RPC `get_assignees_for_workspace(ws)`. (Уже в backlog.)
- **Realtime: 2 workspace-канала на юзера** (`useWorkspaceMessagesRealtime:86` + `useNewMessageToast:61`) слушают весь поток `project_messages`; тост делает до 3 доп. запросов на КАЖДОЕ чужое сообщение (`owner-check`, имя треда, аватар). Слить в один канал, брать данные из payload/кэша.
- **`useProjectMessages` full-refetch** ([useProjectMessages.ts:122]) всех страниц открытого треда на каждое событие → оптимистичный `setQueryData`-append на INSERT.
- **Inbox inline-колбэки ломают memo** ([InboxSidebar.tsx:183], `BoardInboxList:191`) — `InboxChatItem` мемоизирован, но новые функции-пропы на строку → все видимые строки перерисовываются на каждое сообщение; + синхронный `localStorage.getItem` per-row ([InboxChatItem.tsx:156]).
- **`useProjectParticipantsData`** ([:110]) — сырой useState/useEffect, 4 запроса + `participants.select('*')` на каждый монтаж, без React Query кэша.

## 🟡 Гигиена БД (advisors: 272 находки)
- **`project_messages` несёт 5 НЕиспользуемых индексов** (`idx_project_messages_email_*`, `idx_messages_unlinked_email`, `idx_project_messages_draft_sender`) — самая растущая таблица платит за 5 мёртвых индексов на каждом INSERT. Дроп ускорит приём/отправку.
- **`message_send_failures` — 5 unused index**; `projects`/`participants`/`project_threads` `_search`/`_name_trgm` — 0 сканов (следы global_search — либо не используется, либо проверить).
- **187 unused_index всего** (130+ на холодных таблицах — дроп безопасен, выигрыш мал).
- **Нет индекса `project_messages(thread_id, created_at DESC)`** — полезен ИСТОРИИ чата (адресный `WHERE thread_id ORDER BY created_at`), НЕ инбоксу (замерено: инбокс-агрегат от него не ускоряется). Нет `audit_logs(resource_id, created_at DESC)` partial — пригодится при росте audit_logs.
- **`multiple_permissive_policies` на 7 таблицах** — overhead RLS, но все холодные/справочные (горячая только легаси `tasks`, пустая на проде) → низкий приоритет.
- **НЕТ непокрытых FK, НЕТ дубль-индексов** — JOIN'ы при росте по этой причине не деградируют.

## Здорово (НЕ проблемы)
Bundle/code-splitting (26 lazy-точек, нет тяжёлых eager charts/pdf/xlsx); кроны (`scan_dispatch_failures`/`dispatch_scheduled`/gmail/calendar — LIMIT 200 + индексы + SKIP LOCKED); триггер отправки (1 http_post/сообщение); вложения (батч по 10); realtime-cleanup (7 хуков ch==rm); MessageList (keyset-пагинация, баблы memo); `useFilteredTasks` (applyFilters под useMemo); inbox на `useInfiniteQuery`.

---

## Приоритет (предложение)
**Tier 1 — безопасные быстрые победы (большой эффект):**
- P3: дроп мёртвого `inbox_sort_at` + 2 триггера (снимает write-amplification с hot-path).
- 🟡: дроп 5 unused email-индексов на `project_messages` + 5 на `message_send_failures` (ускоряет запись).
- P5: `CommentBadge` → батч `count` (функция готова).
- P4b: `useThreadCounterpartName` → словарь на уровне таблицы (квадратичный → линейный).

**Tier 2 — заметные, средний объём:**
- P4a: виртуализация `/tasks`+`/lists` (`@tanstack/react-virtual`, уже в deps).
- 🟠: `/tasks`+`/lists` на серверный фильтр (как доски); `useTaskAssigneesMap` → 1 RPC; inbox inline-колбэки → стабильные; realtime — слить 2 канала + payload вместо доп.запросов.

**Tier 3 — стратегические (большой объём/риск, отдельная сессия):**
- P1: денормализованная inbox-проекция + адресные `_one`/`_unread` (главный обрыв, но крупный DB-рефактор горячего пути).
- P2: keyset-пагинация `get_workspace_threads`/досок + облегчение `get_sidebar_data` (premise «cap 1000» отозван — НЕ срочно; риск роста = 8s timeout, далёкий горизонт).

**Выполнено 2026-06-13 (этот проход):** вариант 2 вкладки «Непрочитанные» (снят потолок 100
+ manually_unread наверх, миграция `20260613_inbox_unread_no_cap_manual_first`); дроп 4
неиспользуемых индексов `project_messages` (`20260613_drop_unused_pm_indexes`); P5 (CommentBadge
батч через `CommentCountsProvider`); P4b (`useThreadCounterpartNameMap` на уровне таблицы/доски).
**Отозвано как ложные после проверки прода:** P3 (`inbox_sort_at` живой — читается
`get_inbox_threads_page`), часть гигиены БД (6 из 10 индексов покрывали FK), premise P2 (нет cap 1000).
