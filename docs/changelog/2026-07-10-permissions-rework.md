# Доработка механизма прав: единый реестр, компактный UI, доступ к разделам и действия задач/чатов

**Дата:** 2026-07-10
**Тип:** feat (БД + фронт)
**Статус:** БД в проде (через MCP + миграция в репо); фронт — деплой (push в main → CI/CD blue/green)

---

Права доступа переведены на **единый реестр**, страница ролей стала компактной, и
роль Workspace получила два новых слоя настройки: **доступ к разделам** (Входящие,
Задачи, Календарь, Доски, Отчёты, Обновления источников, Финансы) и **спорные
действия** с задачами и чатами (удаление своего/любого, редактирование чужого,
смена статуса, назначение исполнителей, пересылка). Роль Проекта по структуре не
менялась — там остаются видимость модулей и действия по документам/анкетам/
комментариям, только диалог стал компактнее.

Ключевое архитектурное решение: **«что видно» — на роли Проекта, «что можно
делать опасного» + доступ к разделам — на роли Workspace.** Задачи и чаты бывают
без проекта (личные диалоги, Входящие), поэтому действия с ними живут на уровне
компании, а не проекта.

## 1. Что было не так

- Права описаны в трёх местах (`constants.ts`, инлайн-списки в диалоге, тип) —
  рассинхрон и дубли.
- Строки ролей крупные (иконка 40px + 2 строки), список занимал много места.
- У модулей «Задачи» и «Чаты» был только тумблер видимости — **ни одного
  «спорного» действия** (удаление задачи/сообщения нигде в коде не проверялось,
  grep = 0). Удалить задачу мог любой, у кого виден модуль.
- Разделы Входящие/Задачи/Календарь/Доски/Отчёты/Обновления источников/Финансы
  гейтились только «не клиент» — по ролям не настраивались.
- Битые данные: у системной роли **«Внешний сотрудник»** блок `permissions` был
  записан массивом вместо объекта → у роли по факту 0 прав (мёрдж молча игнорил).

## 2. Единый реестр (фронт)

Новый [`src/lib/permissions/registry.ts`](../../src/lib/permissions/registry.ts) —
источник правды:

- `WORKSPACE_PERMISSION_DEFS` + `WORKSPACE_PERM_GROUPS` — права роли Workspace по
  группам: компания / проекты / база знаний / **разделы** / **действия задач** /
  **действия чатов**. У каждого права: ключ, группа, подпись, описание, флаг
  `danger` (опасное), `ownerOnly`.
- `emptyWorkspacePermissions()` / `WORKSPACE_PERMISSION_KEYS` — заготовка прав и
  список ключей (используется в `useWorkspacePermissions` вместо жёсткого литерала).
- `PROJECT_MODULE_DEFS` — тумблеры модулей проектной роли.
- `PROJECT_ACTION_GROUPS` — действия внутри модулей (настройки/анкеты/документы/
  комментарии).

Тип `WorkspacePermissions` стал `Record<WorkspacePermission, boolean>`; union
`WorkspacePermission` расширен новыми ключами. Удалены `constants.ts` и
`ModulePermissionsSection.tsx`.

## 3. Компактный UI (фронт)

- Строки ролей: иконка 40→28px, одна строка (название + бейджи + приглушённое
  описание), высота ~44→~34px, действия по наведению.
- Диалоги ролей переписаны на реестр: модули — сеткой тумблеров-чипов в 2 колонки,
  действия — компактными группами с подсветкой «опасных». Общие компоненты в
  [`PermissionControls.tsx`](../../src/page-components/workspace-settings/permissions/PermissionControls.tsx).

## 4. База (в проде)

Миграция [`20260710120000_role_permissions_sections_and_thread_actions.sql`](../../supabase/migrations/20260710120000_role_permissions_sections_and_thread_actions.sql).

- Новые ключи в `workspace_roles.permissions`:
  - **Разделы:** `view_inbox`, `view_tasks_page`, `view_calendar`, `view_boards`,
    `view_reports`, `view_source_updates`, `view_finance`.
  - **Задачи:** `create_tasks`, `edit_any_task`, `change_task_status`,
    `manage_task_assignees`, `delete_own_task`, `delete_any_task`.
  - **Чаты:** `edit_own_message`, `forward_messages`, `react_messages`,
    `delete_own_message`, `delete_any_message`.
- Бэкфилл системных ролей по имени (`NEW || permissions` — существующие значения
  сохраняются). Дефолты без регрессии: Владелец/Админ — всё; Сотрудник — разделы
  да (кроме финансов), свои действия да, чужое удаление нет; Клиент — только свои
  сообщения; Внешний контакт — всё выключено.
- Обновлены функции-дефолты `get_owner_permissions`/`get_admin_permissions`/
  `get_employee_permissions`/`get_client_ws_permissions` (для новых воркспейсов).
- **Починена битая роль «Внешний сотрудник»**: массив → нормальный объект прав.

## 5. Enforcement (фронт, ждёт деплоя)

- **Разделы:** `sidebarSettings.hasAccess` гейтит пункты правами `view_*`; новый
  [`SectionGuard`](../../src/components/permissions/SectionGuard.tsx) редиректит с
  прямой ссылки на раздел при отсутствии права (выбор владельца — «скрыть + guard»).
- **Задачи:** новый хук [`useTaskActionPerms`](../../src/hooks/permissions/useTaskActionPerms.ts).
  Удаление гейтится в `TaskRow`, `BoardTaskRow`, `TaskPanelTaskHeader` (своя →
  `delete_own_task`, чужая → `delete_any_task`; «своя» = `created_by === me`).
  Создание — в `TaskListView`/`TaskListControls` (`create_tasks`). Смена статуса
  в меню строки — `change_task_status`.
- **Сообщения:** удаление own/any в `MessageList`; `edit_own_message`/
  `forward_messages` гейтят пункты меню через `MessengerProvider`
  (`MessengerTabContent`). Реакции **не гейтятся** (тип `onReact` обязателен,
  низкий приоритет).

## Грабли (на будущее)

- Список ключей прав роли Workspace — **только из реестра** (`WORKSPACE_PERMISSION_KEYS`).
  Добавить право = строка в `WORKSPACE_PERMISSION_DEFS`; тип-union и дефолты миграции
  синхронить. Тест `registry.test.ts` ловит дубли/пропуски.
- Enforcement действий — это **UI-гейт** (прячет кнопки/пункты), НЕ защита в БД/RLS.
  Для жёсткой защиты удаления добавлять проверку на стороне канала/RLS отдельно.
- «Что видно внутри проекта» → роль Проекта; «доступ к разделам» и «опасные
  действия задач/чатов» → роль Workspace. Не путать при добавлении новых прав.
- Смена типа `WorkspacePermissions` на `Record` требует, чтобы любой полный литерал
  прав (тесты, сиды) строился через `emptyWorkspacePermissions()` — иначе TS-ошибка
  на неполном объекте.

## Не сделано (следующий заход)

- Реакции на сообщения; инлайн-смена статуса и назначение исполнителей на досках
  (гейтится только меню строки). Ключи прав есть — застегнуть точечно.
- Прогнать `node scripts/db-drift-check.mjs --update` (миграция меняла
  `get_*_permissions`) и закоммитить обновлённый манифест.

## Проверки

- tsc 0, eslint 0 по изменённым файлам; **858 тестов** зелёные (+5 на реестр,
  тест `useWorkspacePermissions` адаптирован под новый тип).
- БД применена в прод через MCP; роли сверены (Владелец/Админ — всё, Сотрудник —
  разделы без финансов, битая роль починена, Клиент/контакт — выключено).
- Смок после деплоя фронта: роль без `view_source_updates` не видит раздел и
  редиректится с прямой ссылки; роль без `delete_any_task` не удаляет чужую задачу;
  роль без `delete_any_message` не удаляет чужое сообщение; компактный вид ролей и
  диалогов.

## Затронутые файлы

**Новые:** `src/lib/permissions/registry.ts`, `src/lib/permissions/registry.test.ts`,
`src/page-components/workspace-settings/permissions/PermissionControls.tsx`,
`src/components/permissions/SectionGuard.tsx`,
`src/hooks/permissions/useTaskActionPerms.ts`,
[`supabase/migrations/20260710120000_role_permissions_sections_and_thread_actions.sql`](../../supabase/migrations/20260710120000_role_permissions_sections_and_thread_actions.sql).

**Изменённые:** `src/types/permissions.ts`, `src/hooks/permissions/{index,useWorkspacePermissions,useWorkspacePermissions.test}.ts`,
`src/lib/sidebarSettings.ts`, `src/page-components/workspace-settings/PermissionsTab.tsx`,
`src/page-components/workspace-settings/permissions/{WorkspaceRoleEditDialog,ProjectRoleEditDialog,index}.tsx`,
7 страниц-разделов (`inbox/tasks/calendar/boards/reports/source-updates/finance`),
`src/components/tasks/{TaskRow,TaskListView,TaskListControls,TaskPanelTaskHeader}.tsx`,
`src/components/boards/BoardTaskRow.tsx`,
`src/components/messenger/{MessageList,MessengerTabContent}.tsx`,
`.claude/rules/messenger-ledger.md`.

**Удалённые:** `permissions/constants.ts`, `permissions/ModulePermissionsSection.tsx`.

**БД (в проде через MCP):** `workspace_roles.permissions` (бэкфилл + фикс битой роли),
`get_owner_permissions`, `get_admin_permissions`, `get_employee_permissions`,
`get_client_ws_permissions`.
