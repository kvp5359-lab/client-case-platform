# Дефолтные вкладки боковой панели в шаблоне проекта + фикс upsert/DnD

**Дата:** 2026-05-15
**Тип:** feature (medium) + fix (small × 2)
**Статус:** completed

---

## Контекст

В правой панели проекта (`TaskPanel`) у каждого пользователя свой набор закреплённых вкладок: «Задачи», «История», конкретные треды и т.д. До этого изменения **дефолт был хардкодом**: при первом открытии любого проекта сеялка ставила «Задачи + История» — и всё. Если шаблон проекта подразумевал, что для этого типа дел всегда нужны «Документы», «Контекст проекта» или какой-то конкретный тред (например «Клиенты»), каждому участнику приходилось закреплять их руками. На новых проектах это повторялось.

Сделали настройку «Боковая панель» в редакторе шаблона проекта — какие вкладки и в каком порядке закреплять у новых проектов этого типа. Заодно вылез и был починен старый баг: `task_panel_tabs.upsert(...)` не работал с 10 мая после миграции `20260510_task_panel_tabs_contact_scope.sql` — никакие новые записи вообще не писались. Без этого фикса вся фича просто не сохранялась.

## Главное: настройка в шаблоне проекта

### Что появилось у пользователя

В редакторе шаблона проекта (`/workspaces/[id]/settings/templates/project-templates/[id]`) появилась пятая вкладка — «Боковая панель». На ней две зоны:

- **Закреплено** — drag-list (через `@dnd-kit`) с возможностью открепить через `×`. Порядок задаётся drag-ом и сохраняется.
- **Доступно** — клик-кнопки `+`. Системные вкладки (Задачи, Документы, Анкеты, Полезные материалы, История, Контекст проекта, AI-ассистент) отфильтрованы по `enabled_modules` шаблона. Шаблоны тредов (`thread_templates` шаблона проекта) — список с типом задача/чат/email.

Когда участник **впервые** открывает проект на основе этого шаблона, сеялка автоматически закрепляет указанные вкладки в указанном порядке. Для уже существующих записей в `task_panel_tabs` ничего не меняется — настройка влияет только на новых пользователей в проекте либо новые проекты.

### Архитектура

**Хранение** — `project_templates.default_panel_tabs jsonb` ([миграция](../../supabase/migrations/20260515_project_template_default_panel_tabs.sql)):

- `NULL` → legacy-поведение: сеять `tasks + history` (как было до фичи).
- `[]` → ничего не закреплять.
- `[{type:'system', key:'tasks'|...} | {type:'thread_template', id:<uuid>}, …]` → закрепить эти вкладки в этом порядке.

**Типы и общие хелперы** — [`panelTabsTypes.ts`](../../src/components/templates/project-template-editor/panelTabsTypes.ts):

- `DefaultPanelTabItem`, `SystemPanelTabKey`
- `SYSTEM_PANEL_TAB_LABELS` — единый источник лейблов системных вкладок (используется и в редакторе, и в сеялке)
- `isDefaultPanelTabsArray` — type-guard

**UI редактора** — [`PanelTabsSection.tsx`](../../src/components/templates/project-template-editor/PanelTabsSection.tsx):

- Две зоны (Закреплено / Доступно)
- `@dnd-kit/sortable` для drag в зоне «Закреплено»
- При каждом изменении (drag, +, ×) — мутация `updateDefaultPanelTabsMutation` в [`useProjectTemplateMutations.ts`](../../src/components/templates/project-template-editor/useProjectTemplateMutations.ts), которая делает `UPDATE project_templates SET default_panel_tabs = ...`. Drag канонически нормализует порядок (без re-канонизации сервером — массив сохраняется как есть).

**Сеялка** — [`TaskPanelTabbedShellRenderer.tsx`](../../src/components/tasks/TaskPanelTabbedShellRenderer.tsx):

- Новый useQuery с ключом `projectTemplateKeys.defaultPanelTabsByProject(projectId)` — отдельный от `idByProject`, чтобы не конфликтовать с другими местами (мессенджер, ThreadTemplatePicker), где грузится только `template_id`.
- При `isNewProject === true` и пустом `tabs`: подгружаем `default_panel_tabs` через JOIN `projects → project_templates`. Если `null` — fallback на legacy (tasks+history). Если массив — формируем итоговый список `TaskPanelTab[]`:
  - Для system-items: системные вкладки фильтруются через `visibleSystemTypes` (`usePanelTabsVisibility` — права пользователя). Те, к которым у участника нет доступа, тихо пропускаются.
  - Для thread_template-items: резолвим `thread_template_id → project_threads.id` через `project_threads.source_template_id` в `scopeThreads`. Если соответствующий тред в проекте ещё не создан (создание тредов идёт асинхронно при создании проекта) — ждём следующего рендера, не сеем неполный набор.
- Все элементы получают `pinned: true`. `seedDoneRef` гарантирует одноразовый запуск на скоуп.

## Фикс 1: `task_panel_tabs` upsert не работал с 10 мая

После миграции [20260510_task_panel_tabs_contact_scope.sql](../../supabase/migrations/20260510_task_panel_tabs_contact_scope.sql) UNIQUE-индексы на таблице стали **partial** (по сценариям project-scope / contact-scope):

```sql
CREATE UNIQUE INDEX task_panel_tabs_uq_project
  ON task_panel_tabs(user_id, project_id)
  WHERE project_id IS NOT NULL AND contact_participant_id IS NULL;
```

PostgREST `.upsert({ onConflict: 'user_id,project_id' })` не работает с partial unique — отдаёт `42P10: there is no unique or exclusion constraint matching the ON CONFLICT specification`. Из-за этого с 10 мая **ни одна новая запись в `task_panel_tabs` не писалась**. Старые перезаписывались по id (PK), новые — нет. Сеялки молча падали.

Без этого фикса фича дефолтных вкладок просто не работала бы.

**Что сделано** — [`useTaskPanelTabs.ts`](../../src/components/tasks/useTaskPanelTabs.ts) `upsertMutation` переписан на ручной паттерн:

```
SELECT id FROM task_panel_tabs WHERE user_id = $1 AND <scopeColumn> = $2 AND <oppositeColumn> IS NULL
  IF found: UPDATE … WHERE id = $existing
  ELSE: INSERT …
```

Это работает с partial unique корректно. При следующем рефакторинге можно мигрировать на RPC `INSERT … ON CONFLICT (cols) WHERE …` или сменить тип constraint, но пока — рабочее решение без миграции.

## Фикс 2: drag вкладки на разделитель сбрасывал её в unpinned

При попытке перетащить pinned-вкладку в самую правую позицию pinned-зоны (на разделитель `SEPARATOR_ID`) она «возвращалась обратно».

**Причина** — в [`TaskPanelTabBar.handleDragEnd`](../../src/components/tasks/TaskPanelTabBar.tsx) формула `pinned = activePos < sepPos` после `arrayMove` решала, что активная вкладка оказалась за разделителем и стала unpinned. Перерисовка возвращала её в pinned-блок (потому что `orderedTabs` сортирует pinned первыми, и в `localTabs` она была pinned), но визуально это выглядело как «вкладка возвращается на место».

Усугублялось вторым — после merge-миграции `default_panel_tabs` ([см. ниже](#merge-миграция-существующих-проектов)) в `task_panel_tabs.tabs` могли лежать **смешанные** массивы (pinned + unpinned вперемешку): `reorderTab` вставлял активную перед первой попавшейся unpinned, и если та лежала в середине массива — pinned после неё снова оставались pinned, а активная встраивалась не в конец pinned-блока, а в его середину.

**Что сделано:**

1. [`TaskPanelTabBar.handleDragEnd`](../../src/components/tasks/TaskPanelTabBar.tsx) — отдельный кейс для `oid === SEPARATOR_ID`: активная сохраняет свою сторону (была pinned → остаётся pinned), `insertBeforeId` берётся как «первый unpinned в `orderedTabs`».
2. [`useTaskPanelTabs.reorderTab`](../../src/components/tasks/useTaskPanelTabs.ts) — после каждой перестановки **нормализует** `localTabs` каноничным порядком: `[...pinned, ...unpinned]`. Это убирает смешанные массивы из БД при первом же drag-действии.

## Merge-миграция существующих проектов

После публикации фичи прогнали разовый PL/pgSQL-скрипт по всем проектам, у которых `project_templates.default_panel_tabs IS NOT NULL` (на момент запуска — два шаблона «Бизнес-план» и «ВНЖ cuenta propia»):

- Для каждого участника проекта (`participants.user_id`) брали его существующий `task_panel_tabs.tabs` (или `[]`, если записи не было).
- Шли по `default_panel_tabs` шаблона; для каждого элемента, которого **нет** в `tabs` участника (system — сравнение по `type`, thread_template — по разрешённому `project_threads.id`), дописывали его в конец массива с `pinned: true`.
- UPSERT по partial unique (тем же паттерном SELECT id → UPDATE/INSERT, что и в коде).

В сумме обработано **72 проекта, 182 пары user/project**. Ничьи личные настройки (открепления, кастомный порядок, открытые треды) не пострадали — мерж только дописывал недостающее.

## Прочее

- [`infrastructure.md`](../../.claude/rules/infrastructure.md) — новый раздел «Дефолтные вкладки боковой панели в шаблоне проекта» + ⚠️ блок про костыль `task_panel_tabs` upsert, чтобы следующий рефакторящий не наступил на те же грабли.

## Что осталось на будущее

- **Сменить partial UNIQUE на полный constraint** (или RPC с `ON CONFLICT … WHERE …`), убрать костыль SELECT+UPDATE/INSERT в `useTaskPanelTabs`.
- **`active_tab_id` для новых проектов** — сеялка сейчас не выставляет активную вкладку; по умолчанию открывается последняя из засеянных. Возможно, стоит дать в редакторе шаблона выбрать «которая открыта по умолчанию».
- **Удалённые `thread_templates`** — если ссылка в `default_panel_tabs` указывает на удалённый шаблон треда, сеялка тихо пропускает. UI шаблона не показывает «мёртвые» ссылки и не предлагает их почистить — это не критично (вреда нет), но в идеале — лёгкий cleanup.
