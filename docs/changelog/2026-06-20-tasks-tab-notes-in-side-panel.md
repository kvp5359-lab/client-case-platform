# Заметки на вкладке «Задачи» — зеркалирование в боковую панель + файл миграции

**Дата:** 2026-06-20
**Тип:** refactor + db (repo↔prod) + fix
**Статус:** completed (фронт ждёт деплоя CI; БД project-context уже в проде)

---

Продолжение фичи «материалы команды на вкладке Задачи» (см.
[2026-06-20-messenger-composer-and-context-access.md](./2026-06-20-messenger-composer-and-context-access.md),
блок 2). Три небольших блока, уезжают одним пушем отдельными коммитами.

## 1. Универсальная вкладка задач — заметки и в боковой панели

**Проблема:** блок «Заметки» (контекст проекта) добавлялся в `ProjectTabsContent`
(полная страница проекта). Боковая панель проекта рендерит список задач
**напрямую** через `TaskListView` (`TaskPanelProjectView`), минуя
`ProjectTabsContent`, — поэтому заметок там не было. Любая доработка вкладки
задач пришлось бы дублировать в двух местах.

**Решение:** единый источник тела вкладки задач — `TasksTabContent`.

- `TasksTabContent` стал универсальным: `TaskListView` + блок «Заметки».
  Заметки **гейтятся сами** (`useProjectData` → `useProjectModules` → модуль
  `project_context`), чтобы вызывающему коду не нужно было прокидывать `modules`.
  Принимает `showProject`/`showProjectLink` (в панели колонка проекта скрыта).
- `ProjectTabsContent` — рендерит `TasksTabContent` (убран inline-блок заметок).
- `TaskPanelProjectView` (боковая панель) — рендерит `TasksTabContent` вместо
  голого `TaskListView`. Заметки появляются и в панели.

**Итог:** доработки вкладки задач делаются в одном месте (`TasksTabContent`) и
автоматически повторяются на полной странице и в боковой панели.

**Техдолг (осознанно):** `TaskPanelProjectView` (слой `components/`) импортирует
`TasksTabContent` (слой `page-components/`) — ещё одна `components → page-components`
связь (известный T1). Принято ради единого источника; чистый вариант — вынести
`TasksTabContent` и блок заметок в `components/` (отдельная задача).

**Файлы:** [`TasksTabContent.tsx`](../../src/page-components/ProjectPage/components/TasksTabContent.tsx),
[`ProjectTabsContent.tsx`](../../src/page-components/ProjectPage/components/ProjectTabsContent.tsx),
[`TaskPanelProjectView.tsx`](../../src/components/tasks/TaskPanelProjectView.tsx).

## 2. Миграция видимости заметок — закрыт дрейф repo↔prod

Изменения БД для «кто видит заметку» (колонки `access_type`/`access_roles`,
таблица `project_context_item_members`, функция `context_note_visible`,
переписанный SELECT-RLS) применялись через MCP и **не имели файла-миграции** в
репо (drift). Файл добавлен — фича воспроизводится из репо. SQL идемпотентен
(`IF NOT EXISTS` / `OR REPLACE` / guard на constraint).

**Файл:** [`20260620_project_context_items_visibility.sql`](../../supabase/migrations/20260620_project_context_items_visibility.sql).

## 3. Мессенджер — пункт меню «Переслать»

`MessageMenuBody.tsx` — пункт «Переслать сообщение» сокращён до «Переслать»
(влезает в одну строку рядом с иконкой).

## Миграции / Edge Functions

- Файл миграции `20260620_project_context_items_visibility.sql` зафиксирован в
  репо (изменения уже в проде с момента применения через MCP). `supabase db push`
  безопасен — миграция идемпотентна.
- Edge Functions не трогались.

## Проверки

- `tsc` 0, `lint` 0, **726 тестов** зелёные.
- Живой смок в боковой панели (заметки под задачами) — за пользователем.
