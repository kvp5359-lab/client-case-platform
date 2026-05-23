# Доски DnD, календарь, scope боковой панели

**Дата:** 2026-05-23
**Тип:** UX + bugfix + refactor
**Статус:** completed

---

## Контекст

Три блока работы за день, объединённые темой «UX боковой панели и работы
с карточками»:

1. На досках карточки при перетаскивании не раздвигали соседей —
   приходилось «целиться вслепую» по тонкой полоске-индикатору.
2. В календаре все события одного цвета — невозможно с одного взгляда
   понять, что уже сделано и что просрочено.
3. Боковая панель смешивала все «бесхозные» треды (без проекта и без
   контакта) в один глобальный pool — два разных внутренних треда
   делили один набор вкладок. Плюс статьи базы знаний открывались
   модальным окном, теряясь при переключении вкладок.

## 1. Доски: расталкивание карточек при drag + flash после drop

Раньше `useDraggable` без `SortableContext` — `dnd-kit` не двигал соседей,
позиция drop'а определялась только по синей полосе сверху/снизу.

- Перевели `DraggableBoardTaskRow` / `DraggableBoardProjectRow` на
  `useSortable` (id остался `task:<id>:<listId>` / `project:<id>:<listId>`).
- В `BoardListCard` обернули три места рендера (projects-группа,
  tasks-группа, flat tasks) в `<SortableContext strategy={verticalListSortingStrategy}>`.
- В `BoardView.collisionDetection` добавлен явный фильтр id самих
  sortable-нод — иначе они перебивают приоритет `task-row:` / `list-cards:` / `group:`.
- `DragOverlay` получил `dropAnimation` (220ms, soft ease) — карточка
  плавно «приземляется» на финальную позицию.
- Новая tailwind-keyframe `drop-flash` (голубой фон + ring → fade out
  за 0.7s). После успешного drop (manual reorder / status change через
  list-cards / status change через group) BoardView выставляет
  `recentlyDroppedId` и проброс через `boardCardDnd` подсвечивает
  ту карточку, где она оказалась.

## 2. Календарь: прошедшие приглушены, финальные зачёркнуты

`eventPropGetter` обоих календарей (глобальный `/calendar` и
`BoardListCalendarView` в списке доски):

- `event.end < now` → `style.opacity: 0.55`. Внешние Google-события
  тоже приглушаются.
- `task.status_id` в множестве финальных (`statuses.is_final = true`,
  тип `task`) → `line-through` на заголовке. Эффекты независимы и
  совмещаются.

`useTaskStatuses(workspaceId)` подгружает статусы один раз на маунте
календаря, маппинг `finalStatusIds: Set<string>` в `useMemo`.

## 3. Боковая панель: standalone + knowledge scope

### Проблема

Модель scope была двухуровневой: `project_id` ИЛИ `contact_id`. Тред без
обоих → `scopeKey = null` → запись `task_panel_tabs (project_id=NULL,
contact_id=NULL)` стала глобальным pool'ом. Два разных внутренних треда
показывали один и тот же набор вкладок (см. скриншот в обсуждении).
Статьи KB открывались модалкой — параллельный UI-паттерн, рвущий
flow «открыл — переключился — вернулся».

### Решение

Расширили модель до трёх scope'ов: **project** / **contact** /
**knowledge** (для KB) + явный **standalone**-режим для «бесхозных» тредов.

#### Standalone-режим (для тредов без project/contact)

Локальный state `standaloneThread` в `useTaskPanelTabbedShell`. При
открытии треда без обоих:
- Не пишется в `task_panel_tabs`.
- TabBar и info-row не рендерятся — только сам тред.
- Сбрасывается при открытии любого scoped-треда, проекта, системной
  вкладки или при `hidePanel`.

Старые «глобальные» записи в `task_panel_tabs (project_id=NULL,
contact_id=NULL)` остались в БД, но больше не подгружаются — хук
неактивен для standalone. Чистка SQL'кой — отдельной задачей.

#### Knowledge scope (для KB)

Миграция [`20260523_task_panel_tabs_knowledge_scope.sql`](../../supabase/migrations/20260523_task_panel_tabs_knowledge_scope.sql):

- Колонка `workspace_id UUID` в `task_panel_tabs`.
- Partial UNIQUE `(user_id, workspace_id) WHERE workspace_id NOT NULL
  AND project_id NULL AND contact_id NULL`.
- Расширенный CHECK: ровно один из трёх scope-полей NOT NULL.

`useTaskPanelTabs` получил третий kind `'knowledge'` (key = workspaceId),
SELECT/INSERT теперь обрабатывают три scope-колонки через маппинг
`SCOPE_COLUMN`.

Новый тип вкладки `'knowledge_article'` + хелпер `buildKnowledgeArticleTab`
+ компонент [`KnowledgeArticleTabContent.tsx`](../../src/components/tasks/KnowledgeArticleTabContent.tsx):
- Загружает статью через `knowledgeBaseKeys.article(id)`.
- Шапка: title + Badge режима доступа + кнопка ×.
- Контент: `max-w-3xl mx-auto` внутри отдельного скроллящегося
  контейнера → скроллбар у правого края панели, текст центрирован
  в колонке 768px. Те же prose-стили, что в `KnowledgeBaseArticleView`
  (синхронизировать оба места при правках).
- Read-only режим: блокировка Ctrl+C/Ctrl+A и contextmenu.

API `openKnowledgeArticleTab(articleId, title)` в `TaskPanelTabbedShellApi`
и в `TaskPanelContext` сам решает scope:
- Активен project/contact → вкладка статьи в их pool (вариант D).
- Иначе → включается `knowledgeMode`, вкладка в workspace-pool
  (вариант A). Knowledge-вкладки персистятся в БД.

Точки вызова:
- [`KnowledgeBaseTabContent`](../../src/page-components/ProjectPage/components/KnowledgeBaseTabContent.tsx)
  — вкладка «Полезные материалы» в проекте. Модал убран.
- [`KnowledgeTreeView`](../../src/page-components/KnowledgeBasePage/KnowledgeTreeView.tsx)
  — общая KB-страница `/settings/knowledge-base`. Модал убран.

`KnowledgeBaseArticleView` (модальный диалог) больше нигде не
используется — можно удалить отдельной задачей.

## Файлы

- Миграция: `20260523_task_panel_tabs_knowledge_scope.sql` (применена).
- Новый компонент: `src/components/tasks/KnowledgeArticleTabContent.tsx`.
- Изменения: `BoardView.tsx`, `BoardListCard.tsx`, `DraggableBoardTaskRow.tsx`,
  `DraggableBoardProjectRow.tsx`, `BoardListCalendarView.tsx`,
  `CalendarPage/index.tsx`, `tailwind.config.ts`,
  `TaskPanelTabbedShell.tsx`, `TaskPanelTabbedShellRenderer.tsx`,
  `TaskPanelContext.tsx`, `TaskPanelTabBar.tsx`,
  `taskPanelTabs.types.ts`, `useTaskPanelTabs.ts`, `WorkspaceLayout.tsx`,
  `KnowledgeBaseTabContent.tsx`, `KnowledgeTreeView.tsx`,
  `src/types/database.ts` (регенерированы).

## Известные ограничения

- Knowledge-вкладки видны только в scope-less местах воркспейса
  (общая KB, дашборд, инбокс без открытого треда). При переключении
  в проект они **прячутся**, но сохраняются в БД — вернутся, когда
  scope снова станет пустым. Если выяснится что нужно «глобально
  доступная статья поверх любого scope» — мигрируем на вариант B
  (pinned-вкладки выше project/contact).
- Старые «мусорные» записи `task_panel_tabs` с обоими NULL — остались.
  Их можно одним SQL'ом удалить (никто их теперь не читает), но
  это не критично.
