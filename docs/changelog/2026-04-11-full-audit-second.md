# Полный аудит — 2026-04-11 (второй за день)

Второй полный проход по зонам из `.claude/rules/refactoring.md`. Первый аудит этого дня уже породил пачку коммитов в `main` (S1 cleanup, S2/S3/S7 follow-ups, React Query keys consolidation, covering index, test-mock updates). Ниже — то, что осталось **после** этих исправлений.

## ✅ Статус исправлений (2026-04-11, вечер)

Весь приоритет P1–P7 пройден одним заходом. Тесты 253/253, lint 71 errors / 0 warnings (было 198 / 44), TypeScript чист.

| # | Задача | Статус | Комментарий |
|---|---|---|---|
| P1 | `oauth_states` RLS + `retry_undelivered` search_path | ✅ | Миграция `20260411_security_hardening.sql` применена. Supabase advisors security — 0 алертов. |
| P2 | ESLint cleanup | ✅ | 198 → 71. Все unused-vars, кавычки, a11y, react-refresh legacy — закрыты. Остаток — 49 `exhaustive-deps` + 22 react-compiler warnings, сознательно оставлены (не трогать без вдумчивой ревизии). |
| P3 | `queryKeys.ts` + `STALE_TIME` | ✅ | 9 новых фабрик (`projectThreadKeys`, `projectTemplateKeys`, `formTemplateKeys`, `documentKitTemplateKeys`, `folderTemplateKeys`, `knowledgeListKeys`, `fieldDefinitionKeys`, `workspaceTaskKeys` + расширение `participantKeys`). Константы `STALE_TIME.SHORT/MEDIUM/LONG`. ~70 callsite'ов переведено на фабрики, ~25 `staleTime` — на константы. |
| P4 | `ProjectThread` тип | ✅ | Добавлены `deleted_at`, `deleted_by`, `link_code`. Попутно починена регрессия в `googleDriveService.ts` (`<T>` дженерик). |
| P5 | `DocumentsTabContent` разбиение | ✅ | **624 → 442 строки** (−182). Props для `<DocumentsProvider>` и `<DocumentsDialogs>` вынесены в два новых хука `useDocumentsProviderProps` и `useDocumentsDialogsProps`, лежат рядом с остальными в `./Documents/hooks/`. |
| P6 | Фабрика ключа `thread-audit-events` | ✅ | Закрыт в рамках P3 — и чтение (`useThreadAuditEvents.ts`), и 5 инвалидаций используют `projectThreadKeys.auditEvents(threadId)`. Теперь переименование сломает обе стороны одновременно. |
| P7.1 | `castToProjectMessage` — `any` | ✅ | Оба `@ts-expect-error` + `any` удалены, заменены на `Record<string, unknown>` + `as unknown as ProjectMessage`. Добавлен JSDoc с предупреждением «использовать только для рядов из MESSAGE_SELECT». |
| P7.2 | `ComponentsShowcase.tsx` (855 строк) | ✅ | Удалён полностью. Файл был мёртвым кодом — ни один роут его не импортировал, ссылался на удалённый `SidebarNavigation` через заглушку с `any`. Минус 855 строк из `src/`. |
| P7.3 | TODO/FIXME с legacy-префиксами Z#-## | ✅ | 7 штук очищены: `Z1-04`, `Z1-05`, `Z1-10`, `Z3-03`, `Z5-10`, `Z5-12`, `Z5-15`, `Z6-11` → нормальные `TODO:`/`TODO a11y:` без мёртвых ссылок на старые аудиты. |

### Что сознательно **не трогали**

- **49 `react-hooks/exhaustive-deps` ошибок** — требуют вдумчивой ревизии: добавление в deps может вызвать бесконечные циклы. Отдельная задача.
- **8 `react-hooks/set-state-in-effect`** — потенциальные каскадные ре-рендеры, каждое место надо проверять руками.
- **9 `react-hooks/preserve-manual-memoization` + 5 `react-hooks/purity`** — предупреждения React Compiler, в основном информационные.
- **ESLint `--max-warnings 0` в CI** — не выставлен, потому что всё ещё 71 error (react-hooks/react-compiler). После точечной ревизии этих правил — включить в CI.

---

## Сводка

| Зона | Статус | Критич. | Средние | Низкие |
|-----:|:------:|:-------:|:-------:|:------:|
| 1. Безопасность / RLS | ⚠️ | **1** | 0 | 0 |
| 2. БД, миграции, RPC | ⚠️ | **1** | 0 | 0 |
| 3. Типы и контракты | ⚠️ | 0 | 1 | 1 |
| 4. React Query | ⚠️ | 0 | 3 | 0 |
| 5. Zustand | ✅ | 0 | 0 | 0 |
| 6. Компоненты | ⚠️ | 0 | 1 | 0 |
| 7. Роутинг / права | ✅ | 0 | 0 | 0 |
| 8. Тесты | ✅ | 0 | 0 | 0 |
| 9. Сборка / lint | ⚠️ | 0 | 1 | 154+44 |
| 10. Баг-лог / доки | ⚠️ | 0 | 0 | 11 |

**Итого:** 🔴 **2 критических**, 🟠 **6 средних**, 🟡 **170+ низких** (в основном ESLint `unused vars`).

---

## 🔴 Критические проблемы

### 1. `public.oauth_states` — RLS включён, но политик нет
- **Зона:** 1
- **Серьёзность:** 🔴 критическая
- **Описание:** таблица `oauth_states` защищает OAuth-флоу от CSRF. RLS включён, но ни одной `POLICY` не создано — что в Postgres означает «deny all» для обычных ролей, но сам факт отсутствия политик — это мина: любой хотфикс «временно включим anon доступ» превратится в дыру. Нужно явно прописать правила.
- **Решение:** миграция с политиками:
  - `INSERT` — для роли `anon` (коды выдаются до логина)
  - `SELECT` — только для `anon` и только по `state` (коротко живёт)
  - `DELETE` — через `SECURITY DEFINER cleanup_expired_oauth_states()` с `search_path=public`

### 2. `retry_undelivered_telegram_messages` — SECURITY DEFINER без `search_path`
- **Зона:** 2
- **Серьёзность:** 🔴 критическая
- **Описание:** из 110 `SECURITY DEFINER` функций — 109 с `search_path=public`, эта одна без. Классический вектор — подмена функции через теневую схему.
- **Решение:** миграция
  ```sql
  ALTER FUNCTION public.retry_undelivered_telegram_messages(uuid, uuid)
    SET search_path = public;
  ```

---

## 🟠 Средние проблемы

### 3. `ProjectThread` тип не синхронизирован с БД
- **Файл:** [src/hooks/messenger/useProjectThreads.ts:25](../../src/hooks/messenger/useProjectThreads.ts#L25)
- **Зона:** 3
- **Описание:** в `database.ts` у `project_threads` есть `deleted_at`, `deleted_by`, `link_code` — в интерфейсе `ProjectThread` этих полей нет. При касте данные теряются.
- **Решение:** добавить три поля в интерфейс (все nullable string).

### 4. Хардкоженные query keys вне `queryKeys.ts` — 156 вхождений
- **Зона:** 4
- **Описание:** несмотря на свежий follow-up `fc7e553` (React Query keys consolidation), всё ещё 156 мест с `queryKey: [...]` вне централизованного реестра. Самые громкие:
  - `['project_thread', threadId]` — [src/hooks/messenger/useProjectThreads.ts:85](../../src/hooks/messenger/useProjectThreads.ts#L85)
  - `['workspace-participants', workspaceId]` — [src/hooks/shared/useWorkspaceParticipants.ts:28](../../src/hooks/shared/useWorkspaceParticipants.ts#L28)
  - `['thread-audit-events', threadId]` — 4× в [src/components/tasks/useTaskMutations.ts](../../src/components/tasks/useTaskMutations.ts)
  - `['thread-members-map', ...]`, `['project-participants-full', projectId]`, `['project-templates', ...]`, `['documents']`
- **Решение:** добавить в `queryKeys.ts` группы `threadKeys`, `workspaceParticipantKeys`, `projectTemplateKeys`, `documentKeys`, `threadAuditEventsKey(threadId)` — и прогнать поиск ещё раз.

### 5. `staleTime` задаётся хардкодом в 30+ местах
- **Зона:** 4
- **Описание:** разные значения (`60_000`, `2 * 60 * 1000`, `5 * 60 * 1000`, `30_000`) разбросаны по хукам без единой стратегии. При необходимости «везде увеличить stale time» — придётся править десятки файлов.
- **Решение:** константы `STALE_TIME_SHORT / MEDIUM / LONG` в `queryKeys.ts` (или в `queryClient` конфиге) и использовать их.

### 6. `useTaskMutations` инвалидирует чужие ключи
- **Файл:** [src/components/tasks/useTaskMutations.ts](../../src/components/tasks/useTaskMutations.ts)
- **Зона:** 4
- **Описание:** мутации инвалидируют `['thread-audit-events', threadId]` — но сам ключ объявлен в `useThreadAuditEvents.ts`. Если переименуют там, инвалидация молча сломается.
- **Решение:** экспортировать фабрику ключа из `queryKeys.ts` и использовать её в обоих местах.

### 7. `DocumentsTabContent.tsx` — 626 строк
- **Файл:** [src/page-components/ProjectPage/components/DocumentsTabContent.tsx](../../src/page-components/ProjectPage/components/DocumentsTabContent.tsx)
- **Зона:** 6
- **Описание:** самый крупный содержательный компонент в проекте (типы и UI-sidebar не в счёт). Внутри — `useDocumentKitSetup`, `useDocuments`, `useCollapsedFolders`, `useFolderCRUD`, логика фильтрации, поиска и загрузки.
- **Решение:** вынести `DocumentsHeader`, `DocumentsList`, `DocumentsActions` в подкомпоненты; кастомные хуки — в `ProjectPage/components/Documents/hooks/`.

### 8. ESLint: 154 ошибки + 44 warnings (в основном `unused vars`)
- **Зона:** 9
- **Описание:** build чистый, но `npm run lint` шумит. Это не критично, но маскирует реальные регрессии. Самое показательное:
  - `folderStatuses`, `onFolderStatusChange` — [src/page-components/ProjectPage/components/Documents/FolderCard.tsx:46-47](../../src/page-components/ProjectPage/components/Documents/FolderCard.tsx#L46-L47) — пропсы не используются
  - `projectId`, `workspaceId` — [src/page-components/ProjectPage/components/Documents/SlotItem.tsx:38-39](../../src/page-components/ProjectPage/components/Documents/SlotItem.tsx#L38-L39) — деструктурировано, но не используется
  - `useDocumentEdit`, `useDocumentVerify`, `clearAllSelections` — [src/page-components/DocumentsTabContent.tsx:16-17](../../src/page-components/DocumentsTabContent.tsx#L16-L17) — мёртвые импорты
  - `projectId` — [src/page-components/ProjectPage/components/KnowledgeBaseTabContent.tsx:35](../../src/page-components/ProjectPage/components/KnowledgeBaseTabContent.tsx#L35)
  - `DropdownMenuSeparator`, `router` — [src/page-components/ProjectsPage.tsx:29](../../src/page-components/ProjectsPage.tsx#L29), [:46](../../src/page-components/ProjectsPage.tsx#L46)
  - `_userId` — [src/services/documents/sourceDocumentService.ts:286](../../src/services/documents/sourceDocumentService.ts#L286)
- **Решение:** пройти `eslint --fix`, руками добить остаток. Заодно зафиксировать в CI `--max-warnings 0`, чтобы не копилось.

---

## 🟡 Низкие проблемы

### 9. `castToProjectMessage` — `@ts-expect-error` + `any`
- **Файл:** [src/services/api/messenger/messengerService.helpers.ts:18,23](../../src/services/api/messenger/messengerService.helpers.ts#L18-L23)
- **Зона:** 3
- **Описание:** понятно, что Supabase-джойны не типизируются автоматически, но `any` + `@ts-expect-error` — грубовато.
- **Решение:** дженерик `<T extends Record<string, any>>` или явный расширенный Row-тип.

### 10. TODO/FIXME без задач — 11 штук в `src/`
- **Зона:** 10
- **Описание:** помечены кодами `Z1-04`, `Z1-05`, `Z1-10`, `Z3-03`, `Z5-10`, `Z5-12`, `Z5-15`, `Z5-21`, `Z6-11`, плюс blocked/low в DocumentKitTab. Это остатки предыдущих аудитов. Ни один не в `docs/bugs/`.
- **Решение:** либо разнести по `docs/bugs/open/`, либо закрыть, либо удалить из кода.

### 11. ESLint: неэкранированные кавычки в JSX
- [src/page-components/workspace-settings/permissions/ProjectRoleEditDialog.tsx:114](../../src/page-components/workspace-settings/permissions/ProjectRoleEditDialog.tsx#L114)
- [src/page-components/workspace-settings/permissions/WorkspaceRoleEditDialog.tsx:90](../../src/page-components/workspace-settings/permissions/WorkspaceRoleEditDialog.tsx#L90)
- **Решение:** `"` → `&quot;`.

### 12. `ComponentsShowcase.tsx` — 855 строк в бандле prod
- **Файл:** [src/page-components/ComponentsShowcase.tsx](../../src/page-components/ComponentsShowcase.tsx)
- **Зона:** 6/9
- **Описание:** dev-only showcase, уже помечен TODO «Consider excluding from production bundle». Попадает в прод-бандл.
- **Решение:** исключить через условный route в dev-режиме или dynamic import с `ssr: false` за флагом.

---

## ✅ Что в порядке

- **Зона 1 (кроме oauth_states):** все 113 таблиц с RLS, `SERVICE_ROLE_KEY` не утекает в клиент, `NEXT_PUBLIC_*` — только публичные значения, middleware защищает приватные роуты, логов с токенами нет.
- **Зона 2 (кроме retry_undelivered):** миграции идемпотентны, все корзинные RPC фильтруют `is_deleted = false`, 113 индексов с `workspace_id`/`is_deleted` — покрытие адекватное.
- **Зона 3:** `tsconfig` strict, `@ts-ignore`/`@ts-nocheck` — 0, `z.infer` дублей нет, `any` — 51 шт. в 20 файлах, серьёзных среди них нет.
- **Зона 5:** селекторы используются правильно, `sidePanelStore` и `documentKitUI` чистятся в `AuthContext:109-110` при логауте.
- **Зона 7:** `ProtectedRoute` в `app/(app)/layout.tsx:30-34` + server-side session check. Права проверяются через `useProjectPermissions`/`useWorkspacePermissions`, прямых `role === 'admin'` в JSX нет. Публичное/приватное не протекает.
- **Зона 8:** 253/253 теста зелёные, скипов 0, Vitest ~4.5s. Критические хуки (`queryKeys`, `useTrash`, `useProjectPermissions`) покрыты.
- **Зона 10 (частично):** `infrastructure.md` соответствует реальности, все 27 роутов на месте, мёртвых файлов (`.bak`, `_old`, `_backup`) нет. Открытых багов — 1 (`2026-04-10-telegram-reactions-media-group.md`).

---

## Приоритет исправлений

1. 🔴 **Миграция:** политики для `oauth_states` + `search_path` для `retry_undelivered_telegram_messages`.
2. 🟠 **queryKeys.ts + staleTime константы** — добить то, что не дошло в `fc7e553`.
3. 🟠 **`ProjectThread` тип** — три поля.
4. 🟠 **`DocumentsTabContent.tsx`** — разбить.
5. 🟠 **ESLint cleanup** + `--max-warnings 0` в CI.
6. 🟡 Остальные TODO, кавычки, ComponentsShowcase.
