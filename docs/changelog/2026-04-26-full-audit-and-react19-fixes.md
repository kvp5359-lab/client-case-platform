# Полный аудит проекта, разбиение тяжёлых компонентов, фиксы React 19

**Дата:** 2026-04-26 (работа шла 25-26 апреля)
**Тип:** chore + refactor + fix
**Статус:** completed

---

## Контекст

После рефакторинга боковой панели (коммит `b86dcf4`, замена legacy main panel на унифицированную систему вкладок Threada) пользователь запустил **полный аудит проекта по 10 зонам** из [`refactoring.md`](../../.claude/rules/refactoring.md). По итогам — серия чисток, оптимизаций БД, и два важных фикса (один косметический бейдж, второй — давний баг RPC, который мешал отправке файлов).

Закрыто 8 коммитов плюс этот заключительный с фиксом React 19 reducer-фазы. Всё в `main`, деплой автоматический.

---

## 1. Аудит по зонам — что нашли и что починили

### Зона 1. Безопасность и RLS

- **RLS-оптимизация для `email_accounts` и `project_thread_email_links`** — заменили `auth.uid()` на `(SELECT auth.uid())` в WHERE-выражениях политик. Стандартная Supabase-оптимизация: убирает 252× `auth_rls_initplan` из performance advisors. Семантика политик идентична. См. [`20260425_rls_perf_email_and_telegram_comment.sql`](../../supabase/migrations/20260425_rls_perf_email_and_telegram_comment.sql).

- **Storage bucket `participant-avatars`** — удалили широкую SELECT-политику «Anyone can read». Bucket публичный, файлы доступны через CDN-URL без RLS, политика лишь разрешала клиентам **листать** все аватары через `.list()` (нигде в коде не используется). INSERT/UPDATE/DELETE-политики (для членов воркспейса) сохранены. См. [`20260425_storage_drop_avatars_select_policy.sql`](../../supabase/migrations/20260425_storage_drop_avatars_select_policy.sql).

- **`telegram_bot_sessions`** — добавили `COMMENT ON TABLE`, что RLS включена без политик намеренно (доступ только из edge functions через service-role). Раньше это было задокументировано только в коде.

- **Buckets `docbuilder` и `docbuilder-covers`** — намеренно не трогали: они принадлежат соседнему приложению DocBuilder, делящему БД с ClientCase.

### Зона 2. БД, миграции, RPC

- **Удалили устаревшую колонку `projects.status` (TEXT)** — досрочно по решению пользователя (планировалось 2026-05-09). Все читатели/писатели уже на `status_id` (uuid → `statuses.id`). Перед DROP COLUMN пересоздали два триггера, ссылавшихся на старую колонку: `trg_audit_project_update` и `trg_project_self_activity` — теперь смотрят на `status_id`. См. [`20260425_drop_projects_status_text.sql`](../../supabase/migrations/20260425_drop_projects_status_text.sql).

- **Перегенерили [`src/types/database.ts`](../../src/types/database.ts)** через `supabase gen types` после дропа колонки — типы синхронизированы со схемой.

### Зона 4. React Query

- **Новые константы `GC_TIME` в [`queryKeys.ts`](../../src/hooks/queryKeys.ts)** — вынесли 9 разрозненных литералов `10 * 60 * 1000` в `GC_TIME.LONG`. Затронуто: `Providers.tsx`, `useProjectPermissions.ts`, `useCurrentParticipant.ts`, `useProjectData.ts`, `useProjectAccess.ts`.

- **Консолидация inline queryKeys в фабрики.** Раньше ключи строились вручную в 5+ местах, что грозило рассинхронизацией с инвалидациями. Добавлены фабрики:
  - `projectKeys.participantsFilter(workspaceId)`
  - `projectTemplateKeys.nameById(templateId)`
  - `statusKeys.detailById(statusId)`, `statusKeys.projectByTemplate(workspaceId, templateId)`
  - `messengerKeys.lastReadAtByProjectPrefix(projectId)` — для broad-invalidate без userId

  Заменили inline-ключи в [`PanelProjectInfoRow.tsx`](../../src/components/tasks/PanelProjectInfoRow.tsx), [`useStatuses.ts`](../../src/hooks/useStatuses.ts), [`ProjectTemplateStatusesSection.tsx`](../../src/components/templates/project-template-editor/ProjectTemplateStatusesSection.tsx), [`useChatSettingsActions.ts`](../../src/components/messenger/hooks/useChatSettingsActions.ts), [`useProjectsPageData.ts`](../../src/page-components/ProjectsPage/hooks/useProjectsPageData.ts), [`useUnreadCount.ts`](../../src/hooks/messenger/useUnreadCount.ts). Ключи **bit-for-bit идентичны** прежним — никакого изменения поведения.

- **`useTelegramLink` `staleTime: 0 → STANDARD`** — раньше каждый рендер `useTelegramLink` заново ходил в БД за `project_telegram_chats`. Привязка меняется редко (через UI), polling-механика во время диалога привязки работает через `refetchInterval` независимо от staleTime.

### Зона 5. Zustand

- **`useDocumentKitStoreState`** — раньше подписывался на весь стор (`useDocumentKitUIStore()` без селектора), что вызывало ре-рендеры при любом изменении state. Добавили `selectActions` selector + `useShallow` обёртку — теперь подписка только на actions (стабильные функции).

### Зона 6. Компоненты

- **Удалили `src/_archive/legacy-side-panel/`** — 4 файла, ~523 строки. Архив старой панели после рефакторинга `b86dcf4`. Ниоткуда не импортировался.

- **Разбит [`TaskPanelTabbedShell.tsx`](../../src/components/tasks/TaskPanelTabbedShell.tsx) (693 → 392 строк)** на:
  - [`TaskPanelTabContents.tsx`](../../src/components/tasks/TaskPanelTabContents.tsx) — `ThreadTabContent`, `TasksTabContent`, `SystemTabBody`, `SystemTabContent` (256 строк)
  - [`usePanelTabsVisibility.ts`](../../src/components/tasks/usePanelTabsVisibility.ts) — хук видимости системных вкладок по правам (41 строк)
  - [`threadToTaskItem.ts`](../../src/components/tasks/threadToTaskItem.ts) — маппер ProjectThread → TaskItem (34 строк)

- **Разбит [`MessageActions.tsx`](../../src/components/messenger/MessageActions.tsx) (460 → 183 строк)**: вынесли `renderMessageMenuBody` + `DROPDOWN_COMPONENTS`/`CONTEXT_COMPONENTS` + типы в [`MessageMenuBody.tsx`](../../src/components/messenger/MessageMenuBody.tsx) (290 строк). Логика реакций, форварда, draft, copy, view-email — перемещена дословно. Никакого изменения поведения.

- **`useDocumentKitSetup.ts` (489 строк) и `TaskPanel.tsx` (458 строк)** — намеренно НЕ разбивали:
  - `useDocumentKitSetup` уже оркестратор поверх 10+ подхуков; дальнейший split = просто перетасовка кода между файлами.
  - `TaskPanel` имеет тесно сплетённые эффекты (forward message, history view, last_read_at), завязанные на общий closure — split увеличил бы сложность, не уменьшая связности.

- **Замена inline `<button>` на shadcn `<Button>`** в [`TaskPanelTaskHeader.tsx`](../../src/components/tasks/TaskPanelTaskHeader.tsx) (submit-кнопка инлайн-редактирования имени треда). Inline `<input>` оставлен — у него специфичный стиль (прозрачный фон + нижняя граница), shadcn `<Input>` сломает UX.

### Зона 9. Сборка, зависимости, lint

- **Починены 6 lint-ошибок в `useTaskPanelTabs.ts` и `TaskPanelTabbedShell.tsx`** — это были регрессии от рефакторинга `b86dcf4`:
  - `react-hooks/refs`: мутация `upsertMutationRef.current = upsertMutation` во время рендера → перенесена в `useEffect`.
  - `react-hooks/set-state-in-effect` ×3: `setState` синхронно в эффектах → один случай конвертирован в render-time pattern из React docs (state-adjustment-on-prop-change), два других обёрнуты в `eslint-disable-next-line` с пояснением (queue-processor для pending-вкладок и сброс painted-флага при закрытии панели — оба оправданы, альтернативы дороже).
  - Удалены неиспользуемые импорты: `ChevronsRight` из `FloatingPanelButtons.tsx`, `useSidePanelStore` из `WorkspaceSidebarFull.tsx`, `useRef` из `TaskPanelTabbedShell.tsx`. Это были артефакты рефакторинга.

  Без этого фикса CI рассыпался на `--max-warnings 0` и не пускал деплой.

- **Чистка `package.json`:**
  - **Удалено как unused:** `@radix-ui/react-{accordion,menubar,navigation-menu,radio-group,slider}` (соответствующих UI-обёрток в `src/components/ui/` нет, импортов нигде нет), `@testing-library/jest-dom` (не используется в тестах).
  - **Добавлено явно:** `@tiptap/core`, `@tiptap/pm`, `@tiptap/extension-code` — раньше подтягивались транзитивно через `@tiptap/extension-*`, но импортировались прямо.
  - **Не трогали:** `autoprefixer`, `postcss` — depcheck показал их как unused (false positive: они подключаются через `postcss.config.mjs`).

### Зоны 3, 7, 8, 10 — найденное

- **Тесты:** `npm test` — все 613 тестов проходят за ~5с. Исправлены 5 TS-ошибок в моках после добавления поля `isClientOnly` в `WorkspacePermissionsResult` и `last_message_attachment_{name,count}` в `InboxThreadEntry`.
- **Типы:** strict mode полностью включён, 0 `@ts-ignore`. 25 `: any` — все в `.test.ts` (мок Supabase RPC, допустимо).
- **Роутинг/права:** middleware → server `(app)/layout.tsx` → клиентский `ProtectedRoute` → RLS — тройная защита работает. `useProjectPermissions` остаётся единым источником правды, ручных `role === 'admin'` в auth-логике не найдено.
- **Баг-лог:** в `docs/bugs/open/` всего 1 баг (`2026-04-22-scroll-jitter-touchpad.md`). Артефактов вроде `.bak` / `old_*` нет. 3 TODO-комментария в коде (`DestinationSection`, `roleConfig`, `commentService`) — содержательные backlog-заметки, оставлены.

---

## 2. Фиксы багов (отдельные коммиты)

### 2.1 RPC `get_chat_state` ссылалась на несуществующую таблицу

**Симптом:** при открытии чата в браузере 404 на `/rest/v1/rpc/get_chat_state` (на самом деле 500 из-за `relation "email_links" does not exist`, PostgREST показывал 404). Ронял `MessengerTabContent` в ErrorBoundary. Иногда отправка сообщений с файлами падала — повторная попытка проходила, потому что падал только preload-запрос, а не сам send.

**Причина:** RPC писалась когда-то под старую таблицу `email_links`, но та была переименована в `project_thread_email_links`, а функцию забыли обновить.

**Фикс:** заменили `FROM email_links` на `FROM project_thread_email_links`. Колонки идентичны (`id, thread_id, contact_email, subject`), плюс добавили `is_active = true` filter для консистентности с обычным чтением. См. [`20260425_fix_get_chat_state_email_links.sql`](../../supabase/migrations/20260425_fix_get_chat_state_email_links.sql).

### 2.2 Бейджи непрочитанных показывали разные числа

**Симптом:** в одном проекте — сайдбар показывает «3», задача в списке тоже «3», а вкладка треда в боковой панели — «1».

**Причина:** в `TaskPanelTabbedShell.tsx` была inline-математика для `unreadByThreadId`, которая считала только `unread_count + unread_event_count` без `reactionCount`. А сайдбар и список задач используют единый `calcThreadUnread()` из [`utils/inboxUnread.ts`](../../src/utils/inboxUnread.ts), включающий реакции.

**Фикс:** заменили inline-математику на вызов `calcThreadUnread(t)` из общего модуля. Теперь все три места синхронны.

### 2.3 React 19: «Cannot update Router while rendering WorkspaceLayoutImpl»

**Симптом:** при работе с вкладками боковой панели в DevTools падала ошибка. Стек-трейс: `setUrlActive → router.replace` вызывается во время рендера `WorkspaceLayoutImpl`.

**Причина:** в `openTab` и `closeTab` вызовы `setUrlActive(...)` (которая дёргает `router.replace`) были сделаны **внутри** updater-функций `setLocalTabs((prev) => {...})`. React 19 строже относится к таким паттернам — updater запускается в reducer-фазе, и `router.replace` оттуда воспринимается как «setState чужого компонента (Router) во время рендера».

**Фикс:** вынесли вычисления `next/nextActive` наружу updater'а — теперь `setLocalTabs(next)`, `persist(next, ...)`, `setUrlActive(...)` вызываются последовательно, не вложенно. Поведение идентично, правила React не нарушаются. См. [`useTaskPanelTabs.ts`](../../src/components/tasks/useTaskPanelTabs.ts).

---

## 3. Что не делали (с обоснованием)

- **Дальнейшее разбиение `useDocumentKitSetup` и `TaskPanel`** — уже оптимально декомпозированы (см. Зона 6).
- **`useTelegramLink staleTime` уже сделано** в Зоне 4 — но ставили `STANDARD` осторожно: refetchInterval polling работает независимо от staleTime, проверено по коду.
- **3 TODO в коде** — это содержательные backlog-комментарии с пояснением «почему», не баги. Если решим — заведём в `docs/bugs/open/`.

---

## 4. Метрики

- **Размер ключевых файлов до/после:**
  - `TaskPanelTabbedShell.tsx`: 693 → 392 (−43%)
  - `MessageActions.tsx`: 460 → 183 (−60%)
  - Удалён `_archive/legacy-side-panel/`: −523 строк
- **Performance advisors:**
  - `auth_rls_initplan` warnings: −252 (от RLS-оптимизации email)
- **Тесты:** 613/613 проходят
- **Lint:** 0 errors, 0 warnings (после фиксов в Зоне 9)
- **Build:** проходит, 46 роутов

---

## 5. Что протестировать после деплоя

Внимательно проверить Telegram-цепочку — сегодня она была задета сильно (queryKeys, MessageActions split, RPC fix, React 19 reducer-фикс):

1. Отправить сообщение из ЛК → пришло в Telegram.
2. Ответить из Telegram → появилось в ЛК + unread-бейдж.
3. Поставить реакцию из ЛК → синхронизировалось в Telegram (и обратно).
4. Переслать сообщение в другой чат через `MessageActions`.
5. Открыть привязку Telegram → poll-механика (раз в 2с) работает.
6. Открыть и закрыть несколько вкладок в боковой панели подряд — не должно быть React-ошибки про Router в консоли.
7. Аватары участников — продолжают отображаться (после удаления SELECT-политики).
8. Статусы проектов — корректно меняются (после удаления колонки `status` TEXT и пересоздания триггеров).
