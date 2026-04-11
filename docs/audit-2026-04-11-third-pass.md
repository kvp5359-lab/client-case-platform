# Аудит 2026-04-11 — Третий проход за день

**Это третий полный аудит 2026-04-11, идущий после двух предыдущих:**
1. **Первый (утренний)** — коммиты `f84ca84..c1e23b0`. Md-отчёт не сохранён; находки закрыты прямо коммитами S1–S7 (S1 cleanup legacy channel cache, S2/S3/S7 React Query keys + STALE_TIME, S5 covering index `3564fa1`, P1/P2 — закрыты позже в `14efaa1`). Коммит `3564fa1` явно говорит: S4 (`get_board_lists` без `is_deleted` фильтра) — признан false alarm, т.к. board-таблицы не в корзине.
2. **Второй (вечерний, 16:53)** — `docs/changelog/2026-04-11-full-audit-second.md`. Закрыл P1 (`oauth_states` RLS) + P2 (`retry_undelivered_telegram_messages` search_path) миграцией `20260411_security_hardening.sql` + коммит `14efaa1`. Плюс P3-P7: ESLint cleanup, query keys consolidation, ProjectThread тип, DocumentsTabContent extraction, castToProjectMessage, ComponentsShowcase drop, TODO cleanup.
3. **Третий (этот, 18:17)** — текущий документ.

**Цель третьего прохода:** найти то, что **пропустили** первые два — в основном за счёт параллельного анализа живой Postgres-БД через Supabase MCP (performance advisors, pg_catalog queries). Все находки ниже проверены против находок вторых двух — дублей нет.

Живой документ. Заполняется по зонам (`.claude/rules/refactoring.md`). После исправления — помечать `[x]` и указывать, в каком коммите/миграции пофиксили.

Легенда серьёзности: 🔴 критическая · 🟠 средняя · 🟡 низкая.

---

## Зона 1 — Безопасность и RLS

### 🟠 [ ] `get_board_lists` без проверки доступа

- **Важно — это ДРУГАЯ проблема, не S4 из первого аудита.** Коммит `3564fa1` зафиксировал, что S4 (`get_board_lists` не фильтрует `is_deleted`) — false alarm, потому что board-таблицы не в корзине. Это правильно. Но никто не проверил **права доступа**. Функция `SECURITY DEFINER`, значит обходит RLS, а в теле нет проверки `auth.uid()`.
- **Где:** RPC-функция в БД (локальная миграция `supabase/migrations/20260407_board_lists_sort.sql`, вызов в `src/components/boards/hooks/useBoardQuery.ts:31`)
- **Проблема:** функция объявлена как `SECURITY DEFINER` (обходит RLS), принимает только `p_board_id` и не проверяет доступ пользователя к доске. Зная UUID доски, любой авторизованный пользователь может получить настройки её списков (названия, фильтры, сортировки, visible_fields). Сами карточки не утекают — они читаются из таблиц с корректным RLS.
- **Почему не критическая:** UUID угадать практически невозможно; утекают только метаданные, не пользовательские данные.
- **Решение (предпочтительное):** убрать `SECURITY DEFINER` у функции. RLS-политика `board_lists_select` уже правильная — функция просто делает `SELECT` и RLS отфильтрует доступ сам.
- **Альтернатива:** оставить `SECURITY DEFINER`, но в теле функции проверять `auth.uid()` через `participants`/`boards` (по образцу `get_workspace_boards`).
- **Миграция:** создать `supabase/migrations/20260411_get_board_lists_drop_security_definer.sql`.

### 🟡 [ ] Локальные миграции рассинхронизированы с реальной БД

- **Где:** вся папка `supabase/migrations/`
- **Проблема:** ни в одной локальной миграции нет `ENABLE ROW LEVEL SECURITY`, хотя в продакшен-БД RLS включён на всех таблицах `public`. Миграции в репозитории неполные — если развернуть проект с нуля, получится база без RLS. Историческая причина: БД общая с оригинальным `ClientCase`, часть схемы применялась оттуда или через панель Supabase.
- **Почему важно:** вводит в заблуждение AI-инструменты и новых разработчиков. Во время этого аудита sub-агент выдал ложное срабатывание «нет RLS на boards» именно по этой причине.
- **Решение — выбрать стратегию:**
  1. Явно задокументировать в `.claude/rules/infrastructure.md`, что миграции схемы живут в исходном репо ClientCase, а `supabase/migrations/` в этом проекте — только дельта для новых фич. Объяснить, что ground truth схемы — это продакшен-БД.
  2. Либо: `pg_dump --schema-only` с продакшена → сохранить как baseline-миграцию `20260101_initial_schema.sql`, чтобы локальная папка отражала реальность.
- **Рекомендация:** вариант 1 — он честнее отражает текущую организацию (БД общая с другим проектом) и не создаёт иллюзии автономности.

---

## Зона 2 — БД, миграции, RPC

### 🔴 [ ] Мёртвая таблица `project_template_tasks` + код, который в неё пишет

- **Контекст:** сегодня (2026-04-11) прошла миграция — шаблоны задач переехали из `project_template_tasks` в `thread_templates.owner_project_template_id`. Комментарий в `src/components/templates/project-template-editor/useProjectTemplateData.ts:72-76` это подтверждает. Но код, читающий и пишущий старую таблицу, остался.
- **Где код:**
  - Хук `useLinkedTemplateTasks` в `src/components/templates/project-template-editor/useProjectTemplateData.ts:243-260`
  - Мутации `addTaskMutation`, `updateTaskMutation`, `removeTaskMutation` в `src/components/templates/project-template-editor/useProjectTemplateMutations.ts:255-302` и экспорт :314-316
  - `linkedTasksQuery` / `linkedTasks` в `useProjectTemplateData.ts:271,309` (экспортируется, но нигде не читается — проверено grep-ом `\.linkedTasks`)
- **Где БД:** `public.project_template_tasks` — 14 осиротевших строк, структура минимальная (id, project_template_id, name, sort_order, created_at).
- **Почему критическая:** это ловушка двойной записи. Если какой-то забытый путь UI вызовет `addTaskMutation`, он создаст строку в мёртвой таблице, которая никогда не появится в UI (UI уже читает `thread_templates`). Плюс 14 строк — это реальные шаблоны задач клиентов, которые могли не переехать.
- **Шаги исправления:**
  1. SQL: проверить 14 строк — есть ли для каждой `project_template_id` соответствующая запись в `thread_templates` с `owner_project_template_id` и похожим `name`. Если нет — мигрировать (INSERT в `thread_templates` с `thread_type = 'task'`).
  2. Удалить хук `useLinkedTemplateTasks` и его вызов `linkedTasksQuery` из `useProjectTemplateData.ts`, удалить поле `linkedTasks` из возвращаемого объекта.
  3. Удалить все три мутации из `useProjectTemplateMutations.ts` и их экспорты.
  4. Удалить `projectTemplateKeys.tasks` если больше нигде не используется.
  5. Новая миграция `supabase/migrations/20260411_drop_project_template_tasks.sql`: `DROP TABLE public.project_template_tasks CASCADE;`
  6. Перегенерировать `src/types/database.ts` (строки 4161-4195 уйдут).

### 🟠 [ ] `auth.uid()` в 283 RLS-политиках — перевычисляется на каждой строке

- **Где:** RLS-политики на `projects`, `project_threads`, `tasks`, `boards`, `board_lists`, `workspaces`, `participants`, `documents` и др. Всего 283 замечания в `auth_rls_initplan` advisor.
- **Проблема:** политики вида `user_id = auth.uid()` — Postgres перевычисляет `auth.uid()` для каждой строки, т.к. функция STABLE, а не IMMUTABLE. При росте таблиц это реальный тормоз hot-path.
- **Решение:** миграция, переписывающая все политики с оборачиванием в подзапрос: `user_id = (SELECT auth.uid())`. Планировщик кеширует результат подзапроса на весь запрос.
- **Рекомендация:** делать не все сразу, а по таблицам — начать с hot-path (projects, project_threads, tasks, boards, board_lists), замерить до/после на локальной копии с реальным объёмом данных (если есть), потом остальные.

### 🟠 [ ] Завершить миграцию inbox с `get_inbox_threads` v1 на v2

- **Где:**
  - `src/services/api/inboxService.ts:70-79` — `getInboxThreads` помечена `@deprecated`
  - `src/hooks/messenger/useInbox.ts:41,82,118,136` — **4 вызова** v1 из разных useQuery
  - `src/page-components/InboxPage/InboxChatHeader.tsx:84` — единственное место с v2
  - БД: обе функции существуют параллельно, разные контракты (`InboxThread` vs `InboxThreadEntry`)
- **Проблема:** v1 без `SECURITY DEFINER`, v2 с. Две параллельные функции с «одна deprecated» — источник багов. Контракты расходятся (в v2 нет `deadline` — см. комментарий в `InboxChatHeader.tsx:84`).
- **Решение:**
  1. Сравнить контракты v1 и v2 — какие поля есть только в v1 и реально нужны потребителям (например `deadline`, `legacy_channel` и т.п.)
  2. Расширить v2 недостающими полями, мигрировать через `CREATE OR REPLACE FUNCTION`
  3. Переключить 4 вызова в `useInbox.ts` на `getInboxThreadsV2`
  4. Удалить v1 из БД и `inboxService.ts`, удалить тип `InboxThread`

### 🟠 [ ] Дубликаты сигнатур у 5 RPC-функций

- **Где (БД):**
  - `add_document_version` (2 версии, новая с `p_file_id`)
  - `create_status_with_button_label` (2 версии, новая с `p_text_color`)
  - `update_status_with_button_label` (2 версии, новая с `status_text_color`)
  - `log_audit_action` (2 версии, новая с `p_project_id`, `p_user_id`)
  - `fn_write_audit_log` (2 версии, новая с `p_project_id`)
- **Проблема:** старые сигнатуры оставлены «на всякий случай». Любой ручной вызов из SQL Editor или старого миграционного скрипта может попасть в устаревшую ветку.
- **Решение:**
  1. Grep по `src/` — проверить, что все вызовы используют новую сигнатуру (передают все новые параметры).
  2. Миграция `DROP FUNCTION` для старых версий, с явным указанием сигнатуры.

### 🟠 [ ] Добавить индексы на горячие FK в `project_threads`

- **Где:** `project_threads.status_id`, `project_threads.source_template_id`
- **Проблема:** `status_id` — по нему группируется канбан, джойнится тип статуса. Без индекса — seq scan. Supabase advisor жалуется.
- **Решение:** миграция:
  ```sql
  CREATE INDEX IF NOT EXISTS idx_project_threads_status_id
    ON public.project_threads (status_id) WHERE is_deleted = false;
  ```
  `source_template_id` — частичный индекс на него уже есть (`idx_project_threads_source_template`), перепроверить, что он реально используется.

### 🟠 [ ] Объединить `tasks_update` и `tasks_delete` RLS-политики

- **Где:** RLS на `tasks`, UPDATE-команда
- **Проблема:** две PERMISSIVE политики на одной команде — Postgres выполняет обе через OR, что медленнее. Supabase advisor: `multiple_permissive_policies`.
- **Решение:** разобраться, зачем их две (возможно, одна — legacy), объединить в одну политику с явным условием. Убедиться, что права не расширяются случайно.

### 🟠 [ ] Дубликат индекса на `knowledge_embeddings`

- **Где:** `public.knowledge_embeddings` — два идентичных индекса `idx_knowledge_embeddings_vector` и `knowledge_embeddings_embedding_idx`
- **Проблема:** один из двух — копия, занимает место, замедляет INSERT/UPDATE в базе знаний.
- **Решение:** `DROP INDEX public.idx_knowledge_embeddings_vector;` (или второй — посмотреть, какой создан автогенерацией Supabase). Лёгкая победа.

### 🟡 [ ] Поле `legacy_channel` уже не legacy

- **Где:** колонка `project_threads.legacy_channel`, 76 строк с заполненным значением. Использование в 11 файлах (`useFilteredInbox.ts`, `BoardInboxList.tsx`, `WorkspaceLayout.tsx`, `InboxPage`, `history`, и др.)
- **Проблема:** префикс `legacy_` подразумевает «устаревшее к удалению», но на деле поле — основной переключатель приватности чата (`client` / `internal`), активно используется в фильтрации inbox, группировке, роутинге сообщений. Путает новых разработчиков.
- **Решение:** миграция `ALTER TABLE project_threads RENAME COLUMN legacy_channel TO privacy_channel;` (или `visibility`) + правки во всех ~15 файлах. Низкий приоритет — чисто DX-улучшение.

### 🟡 [ ] Анализ потенциально unused indexes

- **Где:** Supabase advisor `unused_index` выдаёт 76 индексов. На hot-path: `projects_workspace_is_deleted_idx`, `project_threads_workspace_deleted_at_idx`, `idx_tasks_workspace_id`, `idx_tasks_deadline`.
- **Проблема:** индекс создан, но Postgres его не использует — занимает место, замедляет INSERT/UPDATE.
- **ВАЖНО — не дропать вслепую:**
  - `projects_workspace_is_deleted_idx` и `project_threads_workspace_deleted_at_idx` — **корзинные**, не использованы сейчас потому что фильтр по `is_deleted = true` редкий и на малых данных planner выбирает seq scan. Они **включатся при росте**. ОСТАВИТЬ.
  - `idx_tasks_workspace_id` — потенциально дублирует `idx_tasks_active` (partial WHERE `is_deleted = false`). Проверить grep-ом, есть ли запросы к `tasks` без фильтра по `is_deleted`. Если нет — можно дропнуть.
- **Решение:** отложенная задача. Сначала завершить критичные фиксы, потом отдельным проходом разобрать список 76 индексов по каждому.

---

## Зона 3 — Типы и контракты

**Контекст:** второй аудит утверждал «`any` — 51 шт. в 20 файлах, серьёзных нет». Реально в `src/` — **11 в 6 файлах**. Расхождение скорее всего потому что второй аудит считал включая `ComponentsShowcase.tsx` (855 строк, удалён в `c1e23b0`) или `database.ts`-генерёнку. Актуальная ситуация лучше, чем казалось.

### 🟠 [ ] `any`-касты в модуле документов — остаток рефакторинга `4909924`

- **Где:**
  - `src/page-components/ProjectPage/components/DocumentsTabContent.tsx:141` — `uploadDocument as unknown as any`
  - `src/page-components/ProjectPage/components/DocumentsTabContent.tsx:240` — `softDeleteDocument as unknown as any`
  - `src/page-components/ProjectPage/components/DocumentsTabContent.tsx:244` — `sourceDrop as unknown as any`
  - `src/page-components/ProjectPage/components/Documents/hooks/useDocumentsDialogActions.ts:29-30` — пропсы типизированы как `(...args: unknown[]) => Promise<unknown>`
  - `src/page-components/ProjectPage/components/Documents/hooks/useDocumentsDialogActions.ts:200,202` — `uploadDocument as any`, `softDeleteDocument as any` при передаче в `useDocumentMerge`
- **Проблема:** сегодняшний рефакторинг `4909924` вынес пропсы `DocumentsTabContent` в хуки, но не донёс типы. Функции-мутации React Query возвращают `UseMutateAsyncFunction<T, Error, V, C>`, а потребители ожидают `(args) => Promise<result>`. Команда срезала путь через `as unknown as any`. В результате пропсы `uploadDocument`/`softDeleteDocument` в `useDocumentsDialogActions` типизированы как `(...args: unknown[]) => Promise<unknown>` — «тип-помойка». Компилятор не ловит неправильное число и порядок аргументов. Дальше эти «типы-помойки» передаются в `useDocumentMerge` с ПОВТОРНЫМ `as any`.
- **Почему средняя:** это ядро модуля документов (загрузка, мёржинг, мягкое удаление). Регрессия по типам молча проскочит в рантайм.
- **Решение:**
  1. Вынести тип `UploadDocumentFn = UseMutateAsyncFunction<...>` в `src/hooks/useDocuments.types.ts` (или в `types/entities.ts`).
  2. То же для `SoftDeleteDocumentFn`.
  3. Для `sourceDrop` — экспортировать `type UseSourceDocumentDropReturn = ReturnType<typeof useSourceDocumentDrop>`.
  4. Использовать эти типы в пропсах `useDocumentsDialogActions`, `useDocumentsFileUpload`, `useDocumentMerge`.
  5. Удалить все `as unknown as any` и `eslint-disable @typescript-eslint/no-explicit-any` в этих местах.
- **Оценка сложности:** 30-60 мин, рантайм не меняется, только типы.

### 🟡 [ ] `supabase.from(dynamicTable) as any` в TemplateAccessPopover

- **Где:** `src/components/knowledge/TemplateAccessPopover.tsx:130`
- **Проблема:** `table` — динамическая строка-параметр из пропсов. Supabase-клиент не умеет типизировать динамическое имя таблицы. `as any` — временное решение.
- **Решение:** сузить `table` до union-типа (`'knowledge_article_project_templates' | 'knowledge_group_project_templates'` — надо проверить, какие конкретные имена туда приходят) и сделать switch. Либо оставить с явным комментарием, что обоснован.

### 🟡 [ ] `folderTemplates.push({...} as any)` в useFolderOperations

- **Где:** `src/components/projects/DocumentKitsTab/hooks/useFolderOperations.ts:100`
- **Проблема:** собирается объект-«подобие» `folder_templates` только из части полей, остальное не проставлено. Комментарий: «Остальные поля folder_templates не используются в UI».
- **Решение:** ввести локальный `type MinimalFolderTemplate = Pick<FolderTemplate, 'id' | 'name' | 'description' | ...>`, `folderTemplates: MinimalFolderTemplate[]`.

### 🟡 [ ] `any` в тестовых моках (2 файла, 4 вхождения)

- **Где:**
  - `src/hooks/useFormKitFilter.test.ts:18,32,97` — `const template: any = { id: 'tpl', ... }` + `as any` в возвращаемом объекте
  - `src/services/api/projectService.test.ts:195` — `;(supabase as any).auth = { getUser: ... }`
- **Проблема:** моки для тестов, но не типизированы. Правила `.claude/rules/refactoring.md` Зоны 8 не требуют строгой типизации тестов, и тесты 253/253 зелёные — низкий приоритет.
- **Решение (если чистить):**
  - `useFormKitFilter.test.ts` — хелпер `makePartialTemplate(): Partial<FormTemplate>`.
  - `projectService.test.ts` — `vi.mocked(supabase).auth.getUser = ...` вместо присваивания через as any.

### 🟡 [ ] `infrastructure.md` врёт про Zod

- **Где:** `.claude/rules/infrastructure.md`, строка со стеком — «React Hook Form + Zod 7.x»
- **Проблема:** в `package.json` **нет** `zod` и **нет** `@hookform/resolvers`. Grep `from 'zod'` по `src/` — 0. Grep `z.object\(|z.infer<` — 0. Zod в проекте не используется. Либо никогда не внедрялся, либо убрали и забыли.
- **Решение:** переписать строку в `infrastructure.md` как «`react-hook-form 7.x` — формы. Валидация: встроенные rules + TS-типы из `database.ts`» (если это правда) ИЛИ установить Zod, если он должен был быть. Требует решения от владельца.
- **Также в Зоне 10 (документация).**

### 🟡 [ ] Устаревший комментарий `project_chats.id` в sidePanelStore.types

- **Где:** `src/store/sidePanelStore.types.ts:134` — JSDoc `/** Активный chatId для гибких чатов (project_chats.id) */`
- **Проблема:** таблица `project_chats` переименована в `project_threads` при мерже `8c977ae`. Комментарий не обновлён.
- **Решение:** `project_chats.id` → `project_threads.id` (id с type='chat').

---

## Зона 4 — React Query

**Контекст:** два предыдущих аудита заявили P3 «закрыт» (коммиты `fc7e553`, `8abd899`). Реально: `queryKeys.ts` раздут до 30+ фабрик (446 строк, очень хорошо), но **migration не завершён**. Осталось 46 хардкодов ключей и 71 inline staleTime.

### 🔴 [ ] Два `useProjectTemplate` с эквивалентным queryKey, но разными выборками

- **Где:**
  - `src/page-components/ProjectPage/hooks/useProjectData.ts:18-48` — хардкод ключа `['project-template', templateId]`, `SELECT id, name, enabled_modules, root_folder_id + join(project_template_document_kits, project_template_forms)`
  - `src/components/templates/project-template-editor/useProjectTemplateData.ts:27-44` — `projectTemplateKeys.detail(templateId)` (массив эквивалентен), `SELECT *` (все колонки), без join
- **Проблема:** два хука с одинаковым именем в разных модулях пишут в **один кеш**. Какой смонтируется первым, того форма и останется в кеше. Второй получит объект с неправильным набором полей — либо undefined.name, либо тихая подмена данных в UI. Это **настоящая гонка**, не теория: достаточно открыть один проект, где рендерятся и `ProjectPage`, и `project-template-editor` в одном дереве.
- **Почему критическая:** рантайм-баг, сложно диагностировать пользователю, легко — через React Query DevTools. Ни один из двух предыдущих аудитов эту проблему не нашёл.
- **Решение:**
  1. Оставить единственный `useProjectTemplate` — в `useProjectTemplateData.ts` (там он уже использует фабрику).
  2. Если потребителю из `useProjectData.ts` нужен **другой набор полей** (с join-ами) — ввести отдельный ключ `projectTemplateKeys.detailWithRelations(id)` и отдельный хук `useProjectTemplateWithRelations`.
  3. Удалить `useProjectTemplate` из `useProjectData.ts`, переключить потребителей.

### 🟠 [ ] `['project-ai', 'messenger-messages', projectId]` в двух инвалидациях одного файла

- **Где:** `src/hooks/messenger/useProjectMessages.ts:94-96` и `:184-186`
- **Проблема:** захардкоженные инвалидации, фабрики нет. Если где-то в коде ключ пишется под другой записью — инвалидация молча промахнётся. Паттерн «ключ чтения знает один хук, ключ инвалидации — другой».
- **Решение:** добавить в `queryKeys.ts`:
  ```ts
  export const projectAiKeys = {
    all: ['project-ai'] as const,
    messengerMessages: (projectId: string) => ['project-ai', 'messenger-messages', projectId] as const,
  }
  ```
  Перевести обе инвалидации и место **чтения** (найти grep-ом) на `projectAiKeys.messengerMessages(projectId)`.

### 🟠 [ ] Два `useWorkspaceProjects` с одинаковым именем в разных модулях

- **Где:**
  - `src/components/boards/hooks/useWorkspaceProjects.ts:11-33` — ключ `['boards', 'projects', workspaceId]` (совпадает с существующей фабрикой `boardKeys.projectsByWorkspace`, но хук фабрику не использует), `SELECT *` + template_name, лимит 200
  - `src/components/messenger/hooks/useChatSettingsData.ts:34-55` — ключ `['workspace-projects-list', workspaceId]`, `SELECT id, name, description + template_name`, без лимита
- **Проблема:**
  1. Имена функций идентичны — при импорте легко получить не тот.
  2. Первый хук игнорирует существующую фабрику `boardKeys.projectsByWorkspace`.
  3. Оба параллельно запрашивают одни и те же проекты одного воркспейса — дубль запросов, когда открыты и board, и chat settings.
- **Решение:**
  1. Первый хук — перевести на `boardKeys.projectsByWorkspace(workspaceId)` (фабрика уже есть).
  2. Второй — переименовать в `useWorkspaceProjectsLight` или `useProjectsForChatSettings`, добавить фабрику `projectKeys.lightListByWorkspace(wsId)`.
  3. (Опционально) объединить в единый хук с `select` для разных форм, если лимит 200 достаточен для boards.

### 🟠 [ ] `['project-template', templateId]` захардкожен в двух инвалидациях

- **Где:**
  - `src/components/templates/project-template-editor/RootFolderSection.tsx:60`
  - `src/components/templates/project-template-editor/BriefTemplateSection.tsx:61`
- **Проблема:** ключ совпадает с `projectTemplateKeys.detail(templateId)`, но фабрика не используется. 5-минутная правка.
- **Решение:** заменить на `projectTemplateKeys.detail(templateId)`.

### 🟠 [ ] Три хардкода ключей без фабрик: workspace-settings, notifications, trash

- **Где:**
  - `src/page-components/workspace-settings/components/SendDelaySettingsSection.tsx:59` — `['workspace-settings', workspaceId]`
  - `src/page-components/workspace-settings/components/NotificationSettingsSection.tsx:58` — `['workspace-notification-settings', workspaceId]`
  - `src/page-components/ProjectsPage.tsx:108` — `['trash']`
- **Проблема:** фабрик нет, используются только в инвалидациях. Риск — рассинхрон с местами чтения этих же ключей.
- **Решение:** добавить в `queryKeys.ts`:
  ```ts
  export const workspaceSettingsKeys = {
    settings: (workspaceId: string) => ['workspace-settings', workspaceId] as const,
    notifications: (workspaceId: string) => ['workspace-notification-settings', workspaceId] as const,
  }
  export const trashKeys = { all: ['trash'] as const }
  ```

### 🟡 [ ] 71 inline `staleTime` против 28 через `STALE_TIME` константы

- **Где:** 50 файлов (см. grep `staleTime:\s*\d` в аудите). Миграция на константы: 28%.
- **Проблема:** не все inline — баги, некоторые осмысленные. Но mass-миграцию начали и не довели до конца.
- **Решение:** отдельным проходом после 🔴+🟠. Приоритет — hot-path (inbox, project list, messenger). Там, где у хука явное «нестандартное» значение (например `keepPreviousData`) — комментировать в коде, почему не стандарт.

### 🟡 [ ] Остаток ~41 хардкод queryKey в файлах меньшего приоритета

- **Где:** остаток grep-результата `queryKey:\s*\[` после вычета уже перечисленных мест (46 − 5 = 41).
- **Проблема:** технический долг консолидации, не гонки кешей.
- **Решение:** отложенная задача после критических фиксов. Пройти по списку, для каждого — либо создать фабрику, либо переключить на существующую.

---

## Зона 5 — Zustand-сторы

**Контекст:** второй аудит пометил Зону 5 как ✅ «в порядке». В целом так и есть — оба стора (`sidePanelStore` и `documentKitUI`) чистятся при логауте, `sidePanelStore` использует селекторы везде правильно, для `documentKitUI` построена развитая инфраструктура из 15+ гранулярных `useShallow`-селекторов в `selectFunctions.ts`. Но один паттерн в коде расходится с тем, как Zustand подписывается на стор.

### 🟠 [ ] 7 мест деструктурируют actions из `documentKitUI` без селектора → лишние ре-рендеры

- **Где:**
  - `src/page-components/ProjectPage/components/Documents/hooks/useDocumentsDialogsProps.ts:92-94` — два вызова
  - `src/components/projects/DocumentKitsTab.tsx:49` + `:73`
  - `src/components/projects/DocumentKitsTab/hooks/useDocumentMerge.ts:66`
  - `src/hooks/documents/useGlobalBatchActions.ts:66`
  - `src/hooks/documents/useGlobalBatchMerge.ts:26`
- **Проблема:** комментарий в `src/store/documentKitUI/selectors.ts:7` говорит: *«Для actions используйте useDocumentKitUIStore() напрямую»* — это технически неверно. State через `useShallow(selectXXX)` работает правильно, но вызов `useDocumentKitUIStore()` без селектора подписывает компонент на **весь объект стора**. Да, ссылки на actions стабильны, но **любой `set()` на любое поле** возвращает новый snapshot → `Object.is(prev, next) = false` → компонент ре-рендерится.
- **Практический эффект:** в `documentKitUI` 65+ полей state + 20+ actions. `set()` вызывается очень часто (dialog open/close, каждый progress tick при merge/compress/export). Компонент, которому нужен только `closeMoveDialog`, ре-рендерится на каждый progress tick export-а.
- **Почему не низкая:** все 7 мест на hot-path (документ-диалоги, kit tab, batch operations). Правило Зоны 5 прямо говорит: «селекторы используются, а не достаётся весь стор».
- **Решение (два варианта):**
  1. Простой — заменить деструктуринг на индивидуальные селекторы:
     ```ts
     const closeEditDialog = useDocumentKitUIStore((s) => s.closeEditDialog)
     const updateEditForm = useDocumentKitUIStore((s) => s.updateEditForm)
     const closeContentViewDialog = useDocumentKitUIStore((s) => s.closeContentViewDialog)
     ```
  2. Красивый — через `useShallow`:
     ```ts
     import { useShallow } from 'zustand/shallow'
     const { closeEditDialog, updateEditForm, closeContentViewDialog } = useDocumentKitUIStore(
       useShallow((s) => ({
         closeEditDialog: s.closeEditDialog,
         updateEditForm: s.updateEditForm,
         closeContentViewDialog: s.closeContentViewDialog,
       }))
     )
     ```
- **Также исправить:** комментарий в `src/store/documentKitUI/selectors.ts:7` — описать правильный паттерн.

### 🟡 [ ] Флаг `threadsEnabled` протекает между проектами при навигации

- **Где:** `src/store/sidePanelStore.ts:186` + `src/page-components/ProjectPage.tsx:213-215`
- **Проблема:** `setThreadsEnabled(modules.threads)` вызывается **только** в `ProjectPage`, когда `modules` загружен. Сценарий:
  1. Проект A с `threads=true` → флаг `true`
  2. Навигация на Inbox → флаг остаётся `true`
  3. Проект B с `threads=false` → до загрузки новых permissions `FloatingPanelButtons` показывает кнопки мессенджера из проекта A
  4. Клик на кнопку может попасть в проект B, где модуль выключен — RLS-ошибка либо пустая панель.
- **Почему низкая:** между переходами проектов ~200-500мс до загрузки permissions, вероятность клика низкая; RLS не даёт реального вреда.
- **Решение:** в `setContext` сбрасывать `threadsEnabled: false` при смене `projectId`:
  ```ts
  setContext: (ctx) =>
    set((state) => {
      const projectChanged = ctx.projectId && ctx.projectId !== state.pageContext.projectId
      return {
        pageContext: { ...state.pageContext, ...ctx },
        ...(projectChanged ? { threadsEnabled: false } : {}),
        // ...existing localStorage logic
      }
    })
  ```

---

## Зона 6 — Компоненты и структура

**Контекст:** второй аудит закрыл самые крупные файлы (`DocumentsTabContent` 626→442, `ComponentsShowcase` 855 строк удалён, `MessengerContext` 28→7 props, `FloatingBatchActions` 379→180). По дублям UI и правильности `memo` — в основном всё OK. Но второй аудит **искал только крупные .tsx-компоненты** по размеру и пропустил monster-хуки и два диалога.

### 🟠 [ ] `ListSettingsDialog.tsx` — 536 строк, монолитный диалог

- **Где:** `src/components/boards/ListSettingsDialog.tsx:88-536` — одна функция-компонент на 448 строк
- **Проблема:** диалог настроек списков досок держит всё в одном файле — константы-конфиги, форма, switch-рендер для 4 типов списков (task/project/inbox/docs) × 4 вкладок (general/filters/fields/grouping). Работает, но сложно читать и менять.
- **Решение:**
  1. Константы (`TASK_SORT_FIELDS`, `PROJECT_VISIBLE_FIELDS`, `TASK_GROUP_BY_OPTIONS`, ...) → `src/components/boards/listSettingsConfigs.ts` (~80 строк)
  2. Вкладки → 4 подкомпонента: `ListSettingsGeneralTab`, `ListSettingsFiltersTab`, `ListSettingsVisibleFieldsTab`, `ListSettingsGroupByTab`
  3. Главный `ListSettingsDialog` становится ~120 строк, держит state формы и оркестрирует вкладки
- **Сложность:** средняя (state формы shared между вкладками — пробросить через пропсы или локальный context)

### 🟠 [ ] `FilterGroupEditor.tsx` — 575 строк, утилиты + UI в одном файле

- **Где:** `src/components/boards/filters/FilterGroupEditor.tsx` (структура: 6 top-level функций + 3 интерфейса)
- **Проблема:** чистые path-утилиты (getRuleByPath, removeByPath, insertAtPosition, adjustPathAfterRemoval, adjustIndexAfterRemoval, pathToId, idToPath — строки 23-128, ~100 строк) сидят в одном файле с компонентами `DraggableRule`, `InnerGroupEditor`, `DragOverlayContent`, `FilterGroupEditor`, `FilterGroupEditorRoot`. Логика tree-based фильтров действительно большая, но утилиты не должны быть рядом с UI.
- **Решение:**
  1. Все 8 path-утилит → `src/components/boards/filters/filterPathUtils.ts` (чистые функции, тестируются отдельно)
  2. `DraggableRule` → `DraggableFilterRule.tsx` (~65 строк)
  3. `DragOverlayContent` → `FilterDragOverlay.tsx` (~24 строки)
  4. Главный файл сокращается до ~380 строк
- **Сложность:** средняя (утилиты — тривиально, компоненты — 15 минут)

### 🟠 [ ] Два monster-хука по 450+ строк — `useChatSettingsActions` + `useDocumentKitSetup`

- **Где:**
  - `src/components/messenger/hooks/useChatSettingsActions.ts` — **462 строки** на один хук
  - `src/components/projects/DocumentKitsTab/hooks/useDocumentKitSetup.ts` — **490 строк** на один хук
- **Проблема:** 450+ строк **одного хука** — это god-component, только на хуке. Внутри каждого — 20+ `useCallback`/`useMutation` разной природы. Второй аудит искал только `.tsx`-компоненты по размеру (P5 был именно про это), хуки не смотрел. Главный минус: любой `useCallback` внутри такого хука перегенерится при изменении любого из общих deps, компоненты-потребители получают пачку «свежих» функций и ре-рендерятся.
- **Решение:** разбить каждый на 4-5 узких хуков по обязанности. Пример для `useChatSettingsActions`:
  - `useChatSettingsAccessActions` (добавить/удалить участника)
  - `useChatSettingsProjectActions` (сменить проект)
  - `useChatSettingsChannelActions` (канал, тип)
  - `useChatSettingsDeleteActions` (удаление, архив)

  Главный хук либо уходит совсем, либо становится тонкой композицией узких хуков (facade).
- **Сложность:** средняя-высокая — много внутренних зависимостей, распутывать аккуратно.

### 🟡 [ ] `KnowledgeBaseArticleView` лежит в page-components/ProjectPage/, но используется двумя страницами

- **Где:**
  - Определение: `src/page-components/ProjectPage/components/KnowledgeBaseArticleView.tsx`
  - Использование: `src/page-components/ProjectPage/components/KnowledgeBaseTabContent.tsx:18` (OK, та же страница) **+** `src/page-components/KnowledgeBasePage/KnowledgeTreeView.tsx:13` (другая страница!)
- **Проблема:** правило Зоны 6 говорит «`src/page-components/` — только страницы, `src/components/` — переиспользуемое». Здесь компонент используется двумя разными страницами, значит он переиспользуемый и должен жить в `src/components/knowledge/`. Сейчас `KnowledgeBasePage` тянет файл через pages-границу из `ProjectPage/components/` — неочевидная цепочка, хрупкая при рефакторинге ProjectPage.
- **Это НЕ цикл импортов** (подтверждено — ни `KnowledgeBaseArticleView`, ни `KnowledgeBaseTabContent` не импортируют из `KnowledgeBasePage/`, импорт односторонний).
- **Решение:** переместить файл в `src/components/knowledge/KnowledgeBaseArticleView.tsx`, обновить 2 импорта. 10 минут.

### 🟡 [ ] Наблюдать, не трогать: `InboxPage/index.tsx` 486, `ProjectPage.tsx` 414, `BoardsPage/index.tsx` 404, `WorkspaceLayout.tsx` 451

- **Где:** все 4 файла — главные страницы или layout.
- **Проблема:** на границе правила «> 400 строк». Но это **оркестровка** (загрузка данных, условные рендеры, lazy-компоненты, передача пропсов), а не бизнес-логика. Разбивать без явной боли при редактировании = создавать шум.
- **Решение:** не трогать сейчас. Если при работе над одной из них будет ощущение «сложно ориентироваться» — разбить прицельно в рамках этой задачи. Отмечено для наблюдения, не для фикса.

---

## Зона 7 — Роутинг и права доступа

_(не начато)_

---

## Зона 8 — Тесты

_(не начато)_

---

## Зона 9 — Сборка, зависимости, lint

_(не начато)_

---

## Зона 10 — Баг-лог и документация

_(не начато)_
