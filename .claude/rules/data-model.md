# ClientCase — Модель данных и фичи

Описание ключевых сущностей продукта и того, как они связаны. Инфраструктура (стек, деплой, БД-операции) — в [`infrastructure.md`](./infrastructure.md). Мессенджер — в [`channels.md`](./channels.md). Ловушки — в [`gotchas.md`](./gotchas.md).

## Единая модель «трэд»

`project_threads` — общая таблица для **задач, чатов и писем** (`type ∈ {task, chat, email}`). Все три ходят через одну RPC `get_workspace_threads` и одну вкладочную панель `TaskPanel`. При работе с задачами/чатами/почтой смотреть `project_threads`, а не искать отдельные сущности.

Сообщения треда — `project_messages` (с `thread_id`).

## Корзина (soft delete)

- **Таблицы**: `projects` и `project_threads` имеют `is_deleted` (BOOLEAN NOT NULL DEFAULT false), `deleted_at`, `deleted_by`.
- **Удаление** проектов и тредов выставляет `is_deleted = true` (не физический DELETE). Физически удаляется только из «Корзина».
- **Раздел «Корзина»** — `/workspaces/[id]/settings/trash`, видна только владельцу.
- **Каскад**: при удалении проекта сам проект помечается, треды/документы в БД не трогаются, но перестают показываться (RPC фильтруют `project.is_deleted = false`). При восстановлении проекта всё возвращается.
- **RPC с фильтром**: `get_user_projects`, `get_workspace_threads`, `get_sidebar_data`, `get_my_urgent_tasks_count` — все исключают `is_deleted = true`.
- **Хуки**: [`src/hooks/useTrash.ts`](../../src/hooks/useTrash.ts) — `useTrashedProjects/Threads`, `useRestore*`, `useHardDelete*`.
- **Миграции**: `20260410_trash_feature.sql`, `20260410_trash_rpc_updates.sql`.

## Права доступа к модулям проекта

Два независимых слоя, проверяются вместе:

1. **`project_templates.enabled_modules`** (`string[]`) — какие модули включены в шаблоне проекта (chats/tasks/documents/forms/finance/digest/…). Не включён в шаблоне — модуль не существует для проекта ни для кого, включая владельца.
2. **`project_roles.module_access`** (jsonb `{ module: boolean }`) — для каждой проектной роли. Резолв — `useProjectPermissions.hasModuleAccess(module)` ([`src/hooks/permissions/useProjectPermissions.ts`](../../src/hooks/permissions/useProjectPermissions.ts)). Multi-role → merge через OR.

**Правило**: модуль видим, если `enabled_modules.includes(module) AND hasModuleAccess(module)`. Нет автосинхронизации: если модуль отключают в шаблоне, в `module_access` ролей остаётся `true`, но скрыт фильтром `enabled_modules`. By design — чтобы не терять настройку при временном отключении.

**Куда смотреть при добавлении нового модуля**: реестр `ProjectModule` в `src/types/threadTemplate.ts`, `PROJECT_MODULES`, дефолтные `module_access` в seed-ролях, `useProjectPermissions.hasModuleAccess`.

## Статусы проектов

- **Хранение**: `projects.status_id` (uuid → `statuses.id`). Текстовая `projects.status` дропнута 2026-04-25.
- **Модель**: project-статусы в общем `statuses` (entity_type='project'). Связь м-к-м с шаблонами через junction `project_template_statuses (template_id, status_id, order_index, is_default, is_final)`. Один статус → несколько шаблонов с разными per-template флагами.
- **Резолв**: `useProjectStatusesForTemplate(workspaceId, templateId)` — JOIN на junction. `useAllProjectStatuses(workspaceId)` — для фильтров.
- **Глобальные `is_default/is_final` в `statuses`** дублируются для фильтра «Активные/Завершённые». Для точного per-template поведения используется junction.
- **Автопереход**: `thread_templates.on_complete_set_project_status_id`. БД-триггер `auto_advance_project_status` при переходе треда в финальный статус обновляет `projects.status_id`. Last write wins.
- **UI настройки**:
  - Редактор шаблона проекта (`/templates/project-templates/[id]`) — `ProjectTemplateStatusesSection`.
  - Справочник (`/directories/statuses`) — все project-статусы воркспейса.
  - В `ThreadTemplateDialog` — поле «При завершении перевести проект в статус» (только task-режим).
- **Удаление**:
  - Из шаблона → удаление записи в junction. Если есть проекты этого шаблона в статусе → `StatusReassignDialog` (затрагивает только проекты данного шаблона).
  - Из справочника → CASCADE на junction. Если есть проекты в статусе → реассайн.

## Календарь (time-grid задач)

Реализовано 2026-05-16. `/workspaces/[id]/calendar` + режим `display_mode='calendar'` у `board_lists`.

- **Модель**: `project_threads.start_at` и `end_at` (timestamptz). Задача в календаре только при заполненных ОБОИХ. Индекс `idx_project_threads_calendar` partial по `(workspace_id, start_at, end_at) WHERE start_at IS NOT NULL AND end_at IS NOT NULL AND is_deleted = false`.
- **⚠️ Синхронизация `deadline` ↔ `end_at`** (`20260516_sync_thread_deadline_end_at.sql`): триггер `sync_thread_deadline_end_at` BEFORE INSERT/UPDATE поддерживает равенство. «Вариант А»:
  - INSERT с `end_at NOT NULL` → `deadline := end_at`
  - UPDATE `end_at` → `deadline := end_at`
  - UPDATE `deadline` у задачи в календаре → двигаем интервал, сохраняя длительность; `start_at := new deadline - (old end_at - old start_at)`, `end_at := new deadline`
  - UPDATE `deadline` у задачи БЕЗ календаря → start_at/end_at не трогаются
  - Снять `deadline` у задачи в календаре → start_at и end_at обнуляются (уезжает из календаря)
  - Временное решение. Долгосрочно убрать `deadline` совсем — см. [`docs/feature-backlog/2026-05-16-drop-deadline-merge-with-end-at.md`](../../docs/feature-backlog/2026-05-16-drop-deadline-merge-with-end-at.md).
- **Страница**: [`src/page-components/CalendarPage/index.tsx`](../../src/page-components/CalendarPage/index.tsx). `react-big-calendar` + `withDragAndDrop` + `momentLocalizer`. 30-мин слоты. Drag/resize → `useUpdateThreadTime`.
- **Режим в `board_lists`**: `display_mode = 'calendar'`. [`BoardListCalendarView`](../../src/components/boards/BoardListCalendarView.tsx) дозапрашивает start_at/end_at по taskIds (чтобы не трогать `get_workspace_threads`).
- **Хуки**: `useCalendarThreads`, `useUpdateThreadTime`. Query key: `calendarKeys.byWorkspaceRange(workspaceId, fromIso, toIso)`.
- **Ограничения**: drag из обычных `@dnd-kit` списков в react-big-calendar (HTML5 DnD) не работает — два движка не интегрированы. Часовой пояс — системный браузера.

## Дневник проекта (digests)

Введён 2026-04-26. Для проекта за период (MVP — день, Europe/Madrid) собираем активность из `audit_logs`, `project_messages`, `comments`. Если мало событий — список, много — сводка через LLM.

- **Таблицы**:
  - `project_digests` (period_start, period_end, digest_type, content, raw_events, events_count, generation_mode `auto_list`/`llm`, model). UNIQUE `(project_id, period_start, period_end, digest_type)`.
  - `workspace_digest_settings` (system_prompt, min_events_for_llm, model). Редактирует только владелец.
- **Edge Function**: `generate-project-digest`. Принимает `workspace_id, project_id, period_start/end, force, test_run, override_prompt`. Использует `_shared/ai-chat-setup.ts` (Anthropic/Gemini, ключ из секретов воркспейса).
  - Подряд от одного автора в одном треде в пределах 30 мин → одно событие.
  - 0 событий → не сохраняем.
  - < `min_events_for_llm` → авто-список без LLM.
  - >= порога → LLM.
  - `test_run: true` → возвращает результат, не сохраняет.
- **RPC**: `get_projects_with_activity(workspace_id, period_start, period_end)` — список проектов с активностью.
- **Хуки**: [`src/hooks/useProjectDigests.ts`](../../src/hooks/useProjectDigests.ts), [`useWorkspaceDigestSettings.ts`](../../src/hooks/useWorkspaceDigestSettings.ts).
- **Дефолтный промпт**: `src/lib/digestDefaults.ts` (фронт) + `DEFAULT_SYSTEM_PROMPT` в edge function. **При изменении синхронизировать оба места.**
- **UI**:
  - Вкладка «Дневник» в проекте (модуль `digest` в `PROJECT_MODULES`).
  - Страница `/workspaces/[id]/digests` — пакетный прогон (concurrency 2 на фронте).
  - `/workspaces/[id]/settings/digest` — редактор промпта, порог, модель, тестовый прогон.
- **Тайм-зона**: Europe/Madrid. Граничные даты — на фронте, в edge function — `YYYY-MM-DD`.

## Настройки сайдбара воркспейса

Состав и порядок верхней части сайдбара (всё кроме списка проектов) — на уровне воркспейса. Пункты меню, доски и списки `item_lists` — «слоты» одного списка в двух зонах (топбар/список) или скрыты.

> **Будущий рефакторинг** (системные разделы как `link:<path>` + per-role) — [`docs/feature-backlog/2026-05-10-sidebar-redesign.md`](../../docs/feature-backlog/2026-05-10-sidebar-redesign.md). Папки уже реализованы.

- **Таблица**: `workspace_sidebar_settings (workspace_id PK, slots jsonb, updated_at, updated_by)`. RLS: SELECT — участникам; INSERT/UPDATE/DELETE — владельцу. Если строки нет — фронт берёт дефолт из `DEFAULT_SIDEBAR_SLOTS` в [`src/lib/sidebarSettings.ts`](../../src/lib/sidebarSettings.ts).
- **Структура `slots`**: `{ id, type, placement, order, badge_mode, parent_id?, name?, folder_icon? }`.
  - `id` — `nav:<key>` / `board:<uuid>` / `list:<uuid>` / `folder:<uuid>`.
  - `placement` — `topbar` | `list`.
  - `parent_id` — `null` или `folder:<uuid>`. **1 уровень вложенности** (нормализатор сбрасывает `parent_id` у `type='folder'`). Если folder из другой зоны — слот на верхний уровень.
  - `badge_mode`: `disabled` | `my_active_tasks` | `all_my_tasks` | `overdue_tasks` | `unread_messages` | `unread_threads`. Бейджи глобальные. Для папки — собственный бейдж либо сумма численных бейджей детей.
- **Скрытые элементы** не хранятся — отсутствуют в `slots`. На странице настроек — в секции «Доступные».
- **Мёртвые слоты** (удалённые доски) — фильтруются на рендере. Владельцу — предупреждение и кнопка «Очистить».
- **RPC `get_my_task_counts(workspace_id)`** — батч `{ active, all, overdue }`. При мутациях инвалидировать `myTaskCountsKeys.byWorkspace(workspaceId)` рядом с `taskKeys.urgentCount`.
- **`hasAccess` фильтр** — даже если пункт в `slots`, скрывается у юзеров без permission'а (`SIDEBAR_NAV_ITEMS[key].hasAccess`).
- **Скрытые роуты остаются доступными по прямой ссылке** — middleware не трогаем.
- **Хуки**: [`useWorkspaceSidebarSettings.ts`](../../src/hooks/useWorkspaceSidebarSettings.ts), `usePinnedBoards`, `usePinnedItemLists`.
- **UI**: `/workspaces/[id]/settings/sidebar` ([`SidebarSettingsTab.tsx`](../../src/page-components/workspace-settings/SidebarSettingsTab.tsx)). Три зоны (топбар/список/доступные), drag-n-drop, папки (кнопка в шапке, инлайн-переименование, попап «⋯» для перемещения).
- **Рендер**: [`SidebarSlotsRow.tsx`](../../src/components/WorkspaceSidebar/SidebarSlotsRow.tsx) разворачивает верхний уровень + папки. Папка в `topbar` → иконка-кнопка с popover снизу; в `list` → строка с popover справа.
- **⚠️ `reorderWithinZones`** — см. [`gotchas.md`](./gotchas.md#reorderwithinzones).
- **Открепить из сайдбара** — кнопка PinOff только владельцу при ховере на иконку (проп `hoverIconSlot`).
- **Миграции**: `20260427_workspace_sidebar_settings.sql`, `20260427_workspace_sidebar_pinned_boards.sql`, `20260427_workspace_sidebar_unified_slots.sql` (финальная унификация).

## Дефолтные вкладки боковой панели (TaskPanel) в шаблоне проекта

Реализовано 2026-05-15. В редакторе шаблона проекта вкладка «Боковая панель» — закрепляет вкладки TaskPanel **по умолчанию у новых проектов** шаблона.

- **Хранение**: `project_templates.default_panel_tabs jsonb` ([`20260515_project_template_default_panel_tabs.sql`](../../supabase/migrations/20260515_project_template_default_panel_tabs.sql)).
  - `NULL` → legacy: `tasks + history`.
  - `[]` → ничего не закреплять.
  - `[{type:'system', key:'tasks'|...} | {type:'thread_template', id:<uuid>}, …]` — в указанном порядке.
- **Типы**: [`panelTabsTypes.ts`](../../src/components/templates/project-template-editor/panelTabsTypes.ts).
- **Редактор**: [`PanelTabsSection.tsx`](../../src/components/templates/project-template-editor/PanelTabsSection.tsx). Drag через `@dnd-kit`, две зоны: «Закреплено» (с GripVertical и `×`) и «Доступно» (с `+`).
- **Сеялка**: при первом открытии панели у проекта без записи в `task_panel_tabs` ([`TaskPanelTabbedShellRenderer.tsx`](../../src/components/tasks/TaskPanelTabbedShellRenderer.tsx)) — подгружает `default_panel_tabs` шаблона, резолвит `thread_template_id → project_threads.id` через `source_template_id`, вызывает `seedTabs`. Только для НОВЫХ проектов.
- **⚠️ Костыль `task_panel_tabs` upsert** — см. [`gotchas.md`](./gotchas.md#task_panel_tabs-upsert).

## Импersonация — «войти под пользователем» (read-only)

Реализовано 2026-05-08. Владелец видит «глазами» сотрудника. **Только просмотр** — DML блокируется на уровне БД.

- **Кому**: только `Владелец`. Запрещено: импersonировать себя, другого Владельца, стартовать из импersonированной сессии.
- **TTL**: 30 минут.
- **Архитектура**: Edge Function `impersonate-start` подписывает кастомный JWT (HS256, секрет `JWT_SIGNING_SECRET` — см. [`gotchas.md`](./gotchas.md#jwt_signing_secret)) с claim `app_metadata.impersonated_by = owner_id`. Фронт `supabase.auth.setSession({ access_token, refresh_token: '' })` + reload. Бэкап оригинальной сессии — `localStorage` ключ `cc_impersonation_original_session_v1`.
- **Защита от записи** — БД-триггер `prevent_impersonation_writes` на ВСЕ public-таблицы (кроме `impersonation_sessions`). Проверяет `public.is_impersonating()`. При импersonации — `RAISE EXCEPTION`. Service-role и pg_cron проходят свободно.
- **Фронт**: глобальный `MutationCache.onError` ловит по тексту `Impersonation mode is read-only` → toast.
- **UI**: кнопка в [`ParticipantMenu.tsx`](../../src/page-components/workspace-settings/components/ParticipantMenu.tsx) + sticky-баннер [`ImpersonationBanner.tsx`](../../src/components/impersonation/ImpersonationBanner.tsx).
- **Аудит**: `impersonation_sessions`.
- **RPC**: `start_impersonation_session(...)` (service_role only), `end_impersonation_session(...)` (authenticated).
- **Helpers**: `public.is_impersonating()`, `public.impersonating_owner_id()`, `public.is_workspace_owner(...)`.
- **Edge Functions**: `impersonate-start` (`--no-verify-jwt`), `impersonate-end` (обычный).
- **Хук**: [`useImpersonation.ts`](../../src/hooks/useImpersonation.ts).
- **Ограничения**: импersonationный JWT истёк, а юзер успел сделать действие → ошибка аутентификации; баннер должен авто-выйти раньше.

## Блокировка участника (`participants.can_login`)

Реализовано 2026-05-13. Раньше — внутренний UI-флаг, теперь единый пайплайн через Edge Function.

- **Edge Function `set-participant-access`** (verify_jwt=true): `{ participant_id, can_login }`. Права — `is_workspace_owner` или `has_workspace_permission(... 'manage_workspace_settings')`. Запрещает блокировать владельца WS и себя. После UPDATE:
  - **Блокировка**: если у юзера НЕТ других активных participants → `auth.admin.updateUserById({ ban_duration: '876000h' })`. В любом случае → RPC `revoke_all_user_sessions(user_id)` (DELETE из `auth.sessions/refresh_tokens`). Access-token живёт ещё до часа, но server-side guard в layout режет доступ.
  - **Разблокировка**: `ban_duration: 'none'`.
- **RPC `revoke_all_user_sessions(uuid)`** — `SECURITY DEFINER`, GRANT только service_role.
- **Server-side guard**: `src/app/(app)/workspaces/[workspaceId]/layout.tsx` (server component) на каждом запросе проверяет `can_login` и `is_deleted`. При отказе → `redirect('/workspaces?blocked=<id>')`. Клиентская обёртка — `WorkspaceLayoutClient.tsx`.
- **Frontend**: `toggleAccessMutation`, `editMutation` в [`useParticipantsMutations.ts`](../../src/hooks/permissions/useParticipantsMutations.ts) → `supabase.functions.invoke('set-participant-access', ...)`.
- **Миграция**: `20260513_revoke_user_sessions.sql`.

## Фильтры — общий примитив

Реализован 2026-05-10. Общий формат и движок для тредов и проектов; используется колонками досок (`board_lists.filters`) и списками (`item_lists.filter_config`).

- **Типы и движок**: [`src/lib/filters/`](../../src/lib/filters/).
  - `types.ts` — `FilterCondition`, `FilterGroup`, `FilterRule`, `FilterFieldDef`, `FilterContext`, `OPERATOR_LABELS`, `SortField`, `SortDir`, `EMPTY_FILTER_GROUP`, `mergeFilterGroupsAnd`, `ThreadType`.
  - `filterEngine.ts` — `applyFilters(items, group, ctx, fieldAccessors, junctionAccessors)`. Чистая, поддерживает рекурсивные AND/OR, динамические даты (`__today__`, `__last_n_days:7__`), `__me__` / `__creator__`.
  - `filterDefinitions.ts` — `THREAD_FILTER_FIELDS` (`applicableTypes: ThreadType[]` у каждого), `PROJECT_FILTER_FIELDS`.
  - `fieldVisibility.ts` — `getApplicableThreadTypes`, `filterFieldsByThreadTypes`. Когда в фильтре условие на `type`, UI сужает список доступных полей.
- **UI-редактор**: [`src/components/filters/`](../../src/components/filters/) — `FilterGroupEditor`, `FilterRuleRow`, `FilterValueSelect`, `FilterDateValue`, `FilterDragOverlay`, `DraggableFilterRule`. Корневой компонент → `FilterRootGroupContext`, дочерние строки читают корневую группу для умной видимости полей.
- **`entity_type='thread'`** — единое имя для тредов. У `project_threads` своё поле `type ∈ {task, chat, email}`. У досок раньше было `entity_type='task'` — миграция `20260510_rename_task_to_thread_in_board_lists.sql` переименовала.
- **`entity_type='inbox'`** — только у `board_lists` (входящие чаты с `default_filter`); фильтр-движок не применяется.

## Списки `item_lists` (треды и проекты табличным видом)

Реализовано 2026-05-10. Доска — несколько подсписков, list — одна выборка по фильтру с табличным видом, чекбоксами, пакетными действиями.

- **Таблица**: `item_lists (id, workspace_id, owner_user_id, entity_type, name, icon, color, filter_config jsonb, sort_by, sort_dir, columns jsonb, created_by, created_at, updated_at, is_deleted, deleted_at, deleted_by)`.
- **owner_user_id**:
  - `NULL` — общий список (видят все участники, меняют владелец/менеджер с `manage_workspace_settings`).
  - `NOT NULL` — личный (видит/меняет только владелец).
- **`entity_type`**: `'thread' | 'project'`.
- **`filter_config`**: общий `FilterGroup`. Применяется через `applyFilters` (не RPC).
- **`columns`**: `[{ key, width, order, visible }]`. Реестр — [`src/page-components/ItemListPage/columns.ts`](../../src/page-components/ItemListPage/columns.ts). MVP: ресайз мышкой не реализован.
- **Корзина**: `is_deleted=true` через `useSoftDeleteItemList`. UI-восстановления пока нет.
- **RLS**: см. миграцию `20260510_item_lists.sql`.
- **Хуки**: [`src/hooks/useItemLists.ts`](../../src/hooks/useItemLists.ts). Query keys: `itemListKeys`.
- **UI**:
  - `/workspaces/[id]/lists` — обзор.
  - `/workspaces/[id]/lists/[listId]` — таблица + чекбоксы + тулбар пакетных действий + inline-редактирование статуса/дедлайна (для тредов).
  - `CreateItemListDialog`, `ItemListSettingsDialog` (3 вкладки: Общее, Фильтр, Колонки).
- **Пакетные действия**: треды — статус (только task), архив; проекты — статус, архив. Смешанная выборка (есть chats/email) → «Сменить статус» дизейблена.
- **Закрепить в сайдбар**: `usePinnedItemLists` → слот `list:<uuid>`.
- **Миграции**: `20260510_item_lists.sql`, `20260510_rename_task_to_thread_in_board_lists.sql`.

## Глобальный поиск и «Недавнее»

Реализовано 2026-05-18.

- **Постгрес**: `pg_trgm` + `unaccent`. Generated `search_vector tsvector` + GIN-индексы на: `project_threads`, `projects`, `knowledge_articles`, `participants`, `project_messages`. Плюс GIN trigram по `name`/`title` для fuzzy.
- **Конфиг FTS**: `russian` (морфология). Для `participants` name/email/phone — `simple`, `notes` — `russian`. У `knowledge_articles` HTML стрипается regex'ом.
- **Веса**: A — name/title, B — description/summary, C — content/notes.
- **RPC `global_search(workspace_id, query, limit)`**: union по 5 типам (`thread`, `project`, `knowledge_article`, `participant`, `message`). Ранкинг — `GREATEST(ts_rank, word_similarity)`. Fuzzy `word_similarity > 0.4` (опечатка в букву ~0.43). Мин 2 символа. `websearch_to_tsquery` (терпит любой ввод). `ts_headline` для сниппетов с `<mark>`. SECURITY INVOKER — фильтр через RLS.
- **`message` как результат**: title = имя треда, subtitle = имя проекта, сниппет с подсветкой. Клик открывает родительский тред в `TaskPanel`.
- **Таблица `recently_viewed`** (`user_id, workspace_id, entity_type, entity_id, opened_at`, PK по 4 первым). Enum `recent_entity_type ∈ {thread, project, knowledge_article, participant}`. RLS: own-rows only.
- **RPC `track_recent_view(workspace_id, entity_type, entity_id)`**: UPSERT с обновлением `opened_at = now()`. Режет хвост до 100 на (user, workspace).
- **RPC `get_recently_viewed(workspace_id, limit)`**: JOIN в исходные таблицы, фильтрует `is_deleted = false`. Берёт `limit * 3` в base CTE.
- **Фронт**:
  - Хуки: [`useGlobalSearch.ts`](../../src/hooks/useGlobalSearch.ts) — `useGlobalSearch`, `useRecentlyViewed`, `useTrackRecentView`, `useAutoTrackRecentView`, `useDebouncedValue`.
  - Компонент: [`SidebarGlobalSearch.tsx`](../../src/components/WorkspaceSidebar/SidebarGlobalSearch.tsx). Режимы: `input` (full sidebar) и `compact` (popover).
  - Монтаж: [`WorkspaceSidebarFull.tsx`](../../src/components/WorkspaceSidebarFull.tsx). Скрыто для `isClientOnly`.
- **Трекинг просмотров**:
  - Тред: `useEffect` на `activeThreadId` в [`TaskPanelTabbedShell.tsx`](../../src/components/tasks/TaskPanelTabbedShell.tsx) — при ЛЮБОМ открытии. UPSERT идемпотентен.
  - Проект: `useAutoTrackRecentView` в [`ProjectPage.tsx`](../../src/page-components/ProjectPage.tsx) после резолва short_id → UUID.
  - KB-статья: `useAutoTrackRecentView` в [`KnowledgeBaseArticleEditorPage.tsx`](../../src/page-components/KnowledgeBaseArticleEditorPage.tsx).
  - Участник: не трекается (нет страницы — карточка popover'ом).
- **Локальный поиск проектов** в `ProjectsList.tsx` оставлен (фильтрует только список проектов).
- **Миграция**: `20260518_global_search_and_recent.sql`.
- **Ограничения**:
  - Сообщения в комментариях не индексируются.
  - `project_messages` фильтруется только по `workspace_id` — доступ к треду на уровне RLS (`can_user_access_thread`). На объёмах MVP (7к сообщений) мгновенно. На сотнях тысяч — отсечение по доступу в RPC.
  - Префиксный поиск полагается на FTS lexeme matching — «прив» не найдёт «приветствие» без `:*`. Долгосрочно — `to_tsquery` с auto-prefix.

## Маркетплейс (фундамент)

- SQL-миграции: `supabase/migrations/20260404_marketplace_tables.sql` (НЕ применены).
- Таблицы: service_categories, lawyer_profiles, lawyer_services, orders, payments, payouts, reviews, blog_posts, blog_categories, custom_domains.
- API Routes: `/api/payments`, `/api/webhooks` (заглушки 501).

## Роуты (62)

`find src/app -name page.tsx | wc -l`. На 2026-05-11 — **62**.

**Root** (1): `/`

**Auth** (4): `/login`, `/login/email`, `/register`, `/auth/callback`

**Public** (5): `/lawyers`, `/blog`, `/about`, `/privacy`, `/terms`

**App** — приватные, защищены `(app)/layout.tsx` (52):
- Top-level: `/app`, `/profile`, `/dashboard`, `/workspaces`, `/select-workspace`
- Workspace base: `/workspaces/[id]`, `/inbox`, `/inbox/unmatched`, `/tasks`, `/digests`, `/personal-dialogs`, `/calendar`
- Projects: `/projects`, `/projects/[projectId]`
- Boards: `/boards`, `/boards/[boardId]`
- Lists: `/lists`, `/lists/[listId]`
- Settings: `/settings`, `/general`, `/participants`, `/permissions`, `/sidebar`, `/trash`, `/integrations`, `/domain`, `/digest`
- Directories: `/directories` + `/custom`, `/project-roles`, `/quick-replies`, `/statuses`, `/workspace-roles`, `/finance-*`
- Knowledge base: `/knowledge-base/[articleId]`, `/knowledge-base/qa/[qaId]`
- Templates: `/templates` + project-templates, thread-templates, document-templates, field-templates, folder-templates, form-templates, slot-templates, document-kit-templates

**API** (3): `/api/payments`, `/api/webhooks` (заглушки), `/api/resend-webhook` (Resend events).
