# Полный аудит по зонам — исправления находок

**Дата:** 2026-06-27
**Тип:** refactoring / hardening
**Статус:** completed (БД в проде, фронт ждёт деплоя)

---

> Полный аудит по 10 зонам ([`refactoring.md`](../../.claude/rules/refactoring.md)),
> карантин (мессенджер/email/mtproto) не трогался. Критических находок (🔴) — ноль.
> Линт ✅, tsc ✅, 752 теста ✅.

## 🟠 Средние

### 1. `search_path` для функций повторяющихся задач
3 функции фичи «повторяющиеся задачи» (`recurring_task_rules_touch_updated_at`,
`recurring_task_rules_set_next`, `recurring_next_occurrence`) были объявлены без
`set search_path` (advisor `function_search_path_mutable`). Добавлен
`set search_path to 'public'` — как уже сделано в `generate_recurring_tasks`.
Применено в прод через MCP, тела идентичны исходной миграции.

### 2. Удалены 3 неиспользуемых пакета
Остаток отката IndexedDB-персиста (ledger 2026-06-15): код удалён, пакеты остались.
Убраны `idb-keyval`, `@tanstack/query-async-storage-persister`,
`@tanstack/react-query-persist-client` через `npm uninstall` (lockfile обновлён).

### 3. REVOKE anon с подписочных RPC
Снят лишний `anon` EXECUTE с 4 RPC, требующих авторизованного участника
(`get_thread_subscribers`, `is_thread_subscribed_me`, `set_my_thread_subscription`,
`set_thread_subscription_for`). `can_view_thread`/`has_project_permission` оставлены
(грант через PUBLIC, для anon возвращают `false`, PUBLIC-revoke ранее ломал прод);
`has_workspace_permission` оставлен — он в anon-facing RLS-политике.

## 🟡 Низкие

### 4. Нарушение слоёв `components → page-components`
`useProjectTemplatesQuery` вынесен из `page-components/ProjectsPage/hooks/` в новый
`src/hooks/useProjectTemplates.ts` (возвращает `{id, name}[]`, без зависимости от
типов страницы). Старое место реэкспортит для совместимости; `FilterValueSelect`
теперь импортирует из слоя `hooks`.

### 5. Осиротевшие типы
Удалены `TimelineEntry`/`TimelineMessage` из `src/types/history.ts` — нигде не
импортировались (в `TimelineFeed.tsx` свой локальный тип на `TimelineMessageEntry`).

### 6. Комментарии к `as never`
7 мест (`BoardListCalendarView`, `cardDragHandlers`, `ThreadTableView`,
`ProjectTableView`, `useInterfacePresets`×3) снабжены пояснениями, чтобы каст не
выглядел сокрытием ошибки типов.

### 7. Inline query-ключи → фабрики
6 ключей перенесены в `queryKeys/misc.ts` (+broad-префиксы `mapAll`/`singleAll` в
`assigneeKeys`): `favorite-thread-names`, `add-from-template`, `project-people-by-role`,
`qa-*` (3), `project-contact-name`, `task-assignees(-map)`. Запрос и инвалидация
теперь из одной фабрики — убран риск рассинхрона (`project-people-by-role`,
`task-assignees` имели инвалидацию в других файлах).

### 8. Док-дрейф
`.claude/rules/data-model.md` — число роутов 65 → 67.

## Не трогали (осознанно)
- Бакеты `docbuilder`/`docbuilder-covers` — принадлежат другому приложению (DocBuilder
  на общей БД), в этом коде не используются.
- `participant-avatars` — публичное чтение аватаров by-design.

## Файлы

**Новые:** `src/hooks/useProjectTemplates.ts`,
`supabase/migrations/20260627_recurring_funcs_search_path.sql`,
`supabase/migrations/20260627_revoke_anon_subscription_rpcs.sql`

**Изменены:** `package.json`, `package-lock.json`, `.claude/rules/data-model.md`,
`src/types/history.ts`, `src/hooks/queryKeys/misc.ts`, `src/hooks/useInterfacePresets.ts`,
`src/hooks/useProjectPeopleByRole.ts`, `src/components/tasks/useTaskAssignees.ts`,
`src/components/filters/FilterValueSelect.tsx`,
`src/components/WorkspaceSidebar/SidebarFavoritesButton.tsx`,
`src/components/projects/AddFromTemplateDialog.tsx`,
`src/components/boards/BoardListCalendarView.tsx`,
`src/components/boards/board-view/cardDragHandlers.ts`,
`src/page-components/ItemListsPage/{BulkActionsBar,ProjectTableView,ThreadTableView}.tsx`,
`src/page-components/ProjectPage/components/GoogleDriveSection.tsx`,
`src/page-components/ProjectsPage/hooks/useProjectsPageData.ts`,
`src/page-components/workspace-settings/SidebarSettings/QuickActionsEditor.tsx`
