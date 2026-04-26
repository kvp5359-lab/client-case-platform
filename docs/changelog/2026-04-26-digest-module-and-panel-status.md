# Дневник проекта (новый модуль) + интерактивный статус в боковой панели

**Дата:** 2026-04-26
**Тип:** feat + fix
**Статус:** completed

---

## Контекст

День «продуктовой» работы. Главная фича — новый модуль **«Дневник проекта»**: автоматические сводки активности по проектам за любой период (день, диапазон, пресеты). Параллельно — серия UX-доработок боковой панели и карточек boards, плюс фикс старого бага с автообновлением списка проектов после смены статуса.

Всё в `main`, деплой автоматический.

---

## 1. Дневник проекта — новый модуль

### Идея

Жмёшь кнопку — система пробегается по всему, что произошло в проекте за день (сообщения, статусы задач, документы, поля анкет, комментарии), и собирает короткий человекочитаемый пересказ. Кнопка работает либо на одном проекте (вкладка «Дневник» в карточке проекта), либо пакетно по всем проектам с активностью за дату (новая страница `/workspaces/[id]/digests`).

Идемпотентно: повторный вызов за тот же период перезаписывает существующую карточку. Карточки складываются в ленту по убыванию даты — получается «дневник проекта».

### Бэкенд

- **Таблица `project_digests`** — карточки сводок. Поля: `period_start`, `period_end`, `digest_type` (day/week/month/custom), `content`, `raw_events` (jsonb со всем сырым таймлайном — для перегенерации без повторного сбора), `events_count`, `generation_mode` (`auto_list` / `llm`), `model`. Уникальный индекс `(project_id, period_start, period_end, digest_type)`.

- **Таблица `workspace_digest_settings`** — настройки воркспейса: `system_prompt` (если null → дефолт из кода функции), `min_events_for_llm` (порог авто/LLM, по умолчанию 5), `model`. Редактирует только владелец воркспейса.

- **RPC `get_projects_with_activity(workspace_id, period_start, period_end)`** — возвращает список проектов с активностью за период (фронт использует для пакетной генерации).

- **Edge Function `generate-project-digest`** — собирает события из трёх источников:
  - `audit_logs` (статусы, документы, задачи, участники, поля анкет)
  - `project_messages` (переписка по тредам)
  - `comments` (комментарии)

  Сообщения склеиваются: подряд от одного автора в одном треде в пределах 30 мин → одно событие (экономит токены). Если событий меньше порога — формируется простой авто-список без LLM. Иначе — зов Claude/Gemini через общий хелпер `_shared/ai-chat-setup.ts` (модель и API-ключ берутся из настроек воркспейса). Поддерживает `test_run` (не сохраняет, для предпросмотра в настройках) и `override_prompt`.

- **Тайм-зона** — Europe/Madrid. Границы дня считаются на фронте и передаются в edge function как `YYYY-MM-DD`.

См. миграции [`20260426_project_digests.sql`](../../supabase/migrations/20260426_project_digests.sql), [`20260426_get_projects_with_activity.sql`](../../supabase/migrations/20260426_get_projects_with_activity.sql), [`20260426_digest_permissions.sql`](../../supabase/migrations/20260426_digest_permissions.sql) и функцию [`supabase/functions/generate-project-digest/index.ts`](../../supabase/functions/generate-project-digest/index.ts).

### Фронт

- **Вкладка «Дневник» в проекте** — модуль `digest` в [`PROJECT_MODULES`](../../src/page-components/ProjectPage/moduleRegistry.ts), доступ контролируется правом `digest` в `module_access` проектной роли. Карточки в ленте, кнопка «Сделать сводку за период / Обновить за сегодня», пикер диапазона с пресетами, drawer с сырым таймлайном.

- **Страница `/workspaces/[id]/digests`** — общий Дневник по воркспейсу: пакетный прогон по всем проектам с активностью (concurrency 2 на фронте — никаких таймаутов edge function). Показывает все карточки, попадающие в выбранный диапазон (включая дневные внутри недели). Доступ — право `view_workspace_digest`.

- **Раздел «Дневник проекта» в настройках воркспейса** (только владелец) — редактор системного промпта, порог авто/LLM, выбор модели, тестовый прогон с произвольным проектом и датой без сохранения.

- **Общий компонент [`DigestPeriodPicker`](../../src/components/digests/DigestPeriodPicker.tsx)** — два инпута дат + дропдаун с 8 пресетами («Сегодня», «Вчера», «Последние 7 дней», «Текущая/прошлая неделя», «Прошлые выходные», «Текущий/прошлый месяц»). Используется и во вкладке проекта, и на общей странице.

- **Утилиты в [`digestDefaults.ts`](../../src/lib/digestDefaults.ts)** — пресеты, `digestTypeForPeriod` (day для одного дня, custom для диапазона), `formatPeriodLabel` (короткий формат: «Пт, 24 апр 2026» для дня, «20—26 апр 2026» для одного месяца, «20 апр — 5 мая 2026» через месяц), `shortenModel` (короткие лейблы: «sonnet 4.6», «haiku 4.5», «gemini 2.5 flash»). Дефолтный системный промпт мирорится с константой в edge function.

- **React Query** — новые хуки `useProjectDigests`, `useWorkspaceDigestsForPeriod`, `useProjectsWithActivity`, `useGenerateProjectDigest`, `useDeleteProjectDigest`, `useWorkspaceDigestSettings`, `useUpdateWorkspaceDigestSettings`. Ключи в [`queryKeys.ts`](../../src/hooks/queryKeys.ts).

- **Markdown-рендер** контента сводок через `react-markdown` + `remark-gfm` (уже были в проекте) — заголовки, жирный, списки, разделители рендерятся нормально.

- **UI-полировка** — компактные карточки (`px-4 py-2.5`, `text-sm` заголовки, иконки `w-3.5 h-3.5`), кнопки-действия скрыты до hover'a карточки, имя модели в title-tooltip (без layout-сдвигов).

### Права доступа — три уровня

1. **Workspace permission `view_workspace_digest`** — гейт для страницы `/digests` и пункта «Дневник» в сайдбаре. Дефолт: вкл у Владельца / Администратора / Сотрудника / Внешнего сотрудника, выкл у Клиента.

2. **Project module access `digest`** — гейт для вкладки «Дневник» в карточке проекта. Дефолт: вкл у Администратора / Исполнителя проекта, выкл у Клиента / Участника.

3. **Edge function** — проверяет `has_project_module_access(user, project, 'digest')` с фоллбэком на `has_workspace_permission(user, ws, 'view_workspace_digest')`. То есть API нельзя дёрнуть в обход скрытой вкладки.

Лейблы и иконки для редактора ролей добавлены в [`workspace-settings/permissions/constants.ts`](../../src/page-components/workspace-settings/permissions/constants.ts). Дефолты для новых воркспейсов прошиты в SQL-функциях `get_*_permissions()` и `get_project_*_module_access()`.

### Что не покрыто (по дизайну MVP)

- Изменения полей самого `projects` (кроме статуса и rename) — в `audit_logs` их нет, мы пишем только то, что уже логируется.
- Реакции на сообщения, прочитано/непрочитано — отбрасываем как шум.
- Нет «недельных» / «месячных» отдельных карточек — показываем дневные внутри диапазона; кастомная сводка за диапазон создаётся отдельной кнопкой и хранится с `digest_type='custom'`.

---

## 2. Интерактивный статус в боковой панели

В шапке боковой панели проекта (`PanelProjectInfoRow`) статус был **read-only бейджем** с собственным fetch'ем `statuses`. Теперь — `ProjectStatusPopover` с возможностью сменить статус прямо отсюда (если у роли есть `edit_project_info`).

Заодно:
- Шапка прячется целиком, когда боковая панель показывает **тот же проект**, что открыт на странице — иначе она дублировала шапку страницы. Кнопка скрытия панели «×» в этом случае уезжает в `TaskPanelTabBar`.
- Удалён собственный fetch статуса в `PanelProjectInfoRow` — теперь данные приходят через `ProjectStatusPopover` → `useProjectStatusesForTemplate`.

Файлы: [`PanelProjectInfoRow.tsx`](../../src/components/tasks/PanelProjectInfoRow.tsx), [`TaskPanelTabbedShell.tsx`](../../src/components/tasks/TaskPanelTabbedShell.tsx), [`TaskPanelTabBar.tsx`](../../src/components/tasks/TaskPanelTabBar.tsx), [`TaskPanelTabContents.tsx`](../../src/components/tasks/TaskPanelTabContents.tsx).

---

## 3. Поле «Статус» в карточках boards для проектов

Раньше «Статус» как настраиваемое поле карточки было только для **задач**. Теперь — и для **проектов**: в `CARD_FIELD_DEFS` `entityTypes: ['task', 'project']`. `BoardProjectRow` рендерит цветной бейдж статуса (имя + цветная подложка из `statuses.color`). `CardLayoutPreview` тоже умеет показывать превью статуса для project-карточек.

Заодно: убрали выравнивание «по центру» из настроек карточки — оставили только лево/право (упрощает UI и убирает редкий мусорный кейс). Сократили вёрстку редактора стилей полей в `ListSettingsAppearanceTab` (компактнее).

Файлы: [`BoardProjectRow.tsx`](../../src/components/boards/BoardProjectRow.tsx), [`CardLayoutPreview.tsx`](../../src/components/boards/CardLayoutPreview.tsx), [`listSettingsConfigs.ts`](../../src/components/boards/listSettingsConfigs.ts), [`ListSettingsAppearanceTab.tsx`](../../src/components/boards/ListSettingsAppearanceTab.tsx), [`cardLayoutUtils.ts`](../../src/components/boards/cardLayoutUtils.ts), [`types.ts`](../../src/components/boards/types.ts).

---

## 4. Фикс `ProjectStatusPopover` — не рисовать «Новый» при отсутствии статуса

При `currentStatusId = null` попровер брал `statuses[0]` как fallback и рисовал имя первого статуса шаблона. На `/projects` отображался «Новый», тогда как `/boards` (правильно) показывал «Без статуса». Список и доска расходились.

Фикс: убрали fallback. При `currentStatusId = null` рисуется неактивный пунктирный «—»-бейдж, кликом по которому всё ещё можно выбрать статус.

Файл: [`ProjectStatusPopover.tsx`](../../src/components/projects/ProjectStatusPopover.tsx) (попало в коммит ранее, упоминается для полноты).

---

## 5. Открытие проекта в списке `/projects` теперь открывает боковую панель

Раньше клик по строке проекта в `/projects` навигировал на страницу проекта. Сейчас — открывает боковую панель этого проекта (как уже работало в `/boards` через `BoardProjectRow`).

Ctrl/⌘-click и средняя кнопка по-прежнему открывают страницу проекта в новой вкладке (стандартное поведение `<Link>`).

Файл: [`ProjectsPage/components/ProjectRow.tsx`](../../src/page-components/ProjectsPage/components/ProjectRow.tsx).

---

## 6. Фикс — список проектов перегруппировывается после смены статуса без F5

Старый баг: меняешь статус проекта в боковой панели (или другим способом), а список на `/boards` и `/projects` остаётся со старой группировкой, пока не нажмёшь F5.

Причина: `updateProjectStatus.onSuccess` инвалидировал только `projectKeys.detail(projectId)` — детальный кэш одного проекта. А списки сидят на других ключах (`accessibleProjectKeys`, `projectKeys.listForUser`, `sidebarKeys.projects`). После мутации они продолжали отдавать стейл из кэша.

Фикс — broad-invalidate трёх префиксов в `onSuccess`:

```ts
queryClient.invalidateQueries({ queryKey: projectKeys.all })
queryClient.invalidateQueries({ queryKey: ['accessible-projects'] })
queryClient.invalidateQueries({ queryKey: ['sidebar', 'projects'] })
```

Группировка по статусу пересчитывается на клиенте через `useMemo` от свежих данных — никакой отдельной логики «перестроения» писать не пришлось.

Файл: [`useProjectMutations.ts`](../../src/page-components/ProjectPage/hooks/useProjectMutations.ts).

---

## Файлы

**Новые:**
- `supabase/migrations/20260426_project_digests.sql`
- `supabase/migrations/20260426_get_projects_with_activity.sql`
- `supabase/migrations/20260426_digest_permissions.sql`
- `supabase/functions/generate-project-digest/index.ts`
- `src/hooks/useProjectDigests.ts`
- `src/hooks/useWorkspaceDigestSettings.ts`
- `src/lib/digestDefaults.ts`
- `src/components/digests/DigestPeriodPicker.tsx`
- `src/page-components/WorkspaceDigestsPage.tsx`
- `src/page-components/workspace-settings/DigestSettingsTab.tsx`
- `src/page-components/ProjectPage/components/DigestTabContent.tsx`
- `src/app/(app)/workspaces/[workspaceId]/digests/page.tsx`
- `src/app/(app)/workspaces/[workspaceId]/settings/digest/page.tsx`

**Изменённые (ключевые):**
- `src/types/permissions.ts`, `src/types/database.ts`
- `src/hooks/queryKeys.ts`
- `src/components/WorkspaceSidebarFull.tsx`
- `src/page-components/WorkspaceSettingsPage.tsx`
- `src/page-components/ProjectPage/moduleRegistry.ts`
- `src/page-components/ProjectPage/hooks/useProjectModules.ts`
- `src/page-components/ProjectPage/hooks/useProjectMutations.ts`
- `src/page-components/ProjectPage/components/ProjectTabsContent.tsx`
- `src/page-components/ProjectsPage/components/ProjectRow.tsx`
- `src/page-components/workspace-settings/permissions/constants.ts`
- `src/components/tasks/PanelProjectInfoRow.tsx`
- `src/components/tasks/TaskPanelTabbedShell.tsx`
- `src/components/tasks/TaskPanelTabBar.tsx`
- `src/components/tasks/TaskPanelTabContents.tsx`
- `src/components/boards/BoardProjectRow.tsx`
- `src/components/boards/CardLayoutPreview.tsx`
- `src/components/boards/ListSettingsAppearanceTab.tsx`
- `src/components/boards/listSettingsConfigs.ts`
- `src/components/boards/cardLayoutUtils.ts`
- `src/components/boards/types.ts`
- `.claude/rules/infrastructure.md` (раздел «Дневник проекта»)

---

## Тесты

`npm test` — 613/613 зелёные. `npm run lint` — 0 ошибок. `npm run build` — компиляция чистая (TS-проверка). Edge function задеплоена и протестирована вручную: реальная сводка собирается, права работают, права редактирования промпта только у владельца.
