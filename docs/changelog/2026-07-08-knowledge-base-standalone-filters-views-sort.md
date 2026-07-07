# База знаний: вынос из настроек, фильтры/представления на общем движке, сортировка, рефактор блока управления

**Дата:** 2026-07-08
**Тип:** feat + refactor + fix (фронт + БД)
**Статус:** деплой (push в main → CI/CD blue/green)

---

Большая проработка модуля базы знаний за сессию. Ниже — по блокам. Соответствует
коммитам `refactor(knowledge)` (перенос), `feat(knowledge)` (фильтры/представления/
сортировка) и `fix(knowledge)` (спойлеры).

## 1. Вынос базы знаний из настроек в отдельный раздел

**Проблема:** база знаний открывалась по `/workspaces/[id]/settings/knowledge-base`,
из-за чего левый сайдбар переключался на меню настроек (`isSettingsRoute =
pathname.includes('/settings')`). База знаний — контент, а не настройка.

**Фикс:** раздел переехал в `/workspaces/[id]/knowledge-base` (роуты + статья +
Q&A — git распознал как rename, 100%). Пункт сайдбара `knowledge_base` переведён с
пути `settings/knowledge-base` на `knowledge-base`; обновлены все ~10 ссылок
(глобальный поиск, онбординг, открытие статьи/Q&A, редиректы после сохранения);
убран костыль подсветки пункта «Настройки» в `WorkspaceSidebarFull`.

## 2. Фильтры статей на общем движке src/lib/filters

Движок фильтров (`src/lib/filters`, ранее только `thread`/`project`) расширен типом
`knowledge_article`: введён `FilterEntityType`, добавлен `KNOWLEDGE_ARTICLE_FILTER_FIELDS`
(название, статус, группы, теги, автор, опубликовано, режим доступа, статус
индексации, даты), расширены компоненты `src/components/filters/*`, источники
значений в `FilterValueSelect` (статусы/группы/теги БЗ — read-хуки
[`useKnowledgeTaxonomy.ts`](../../src/hooks/knowledge/useKnowledgeTaxonomy.ts) с теми
же query-ключами, что page-хуки → общий кэш). Адаптер статьи —
[`knowledgeArticleFilters.ts`](../../src/page-components/KnowledgeBasePage/knowledgeArticleFilters.ts)
(`knowledgeFieldAccessors` + `buildKnowledgeJunctionAccessors` — группы/теги берутся
из уже загруженной статьи, без доп. запросов). Опции «без статуса/группы/тега»
(сентинел `__none__`).

## 3. Сохранённые представления как вкладки

**БД:** таблица `knowledge_article_views` (+ поле `view_mode`) с RLS-зеркалом
`item_lists`: личные (`owner_user_id = uid`) и общие (`NULL`, меняют управляющие
БЗ/админы). Миграции
[`20260707150000`](../../supabase/migrations/20260707150000_knowledge_article_views.sql),
[`20260707160000`](../../supabase/migrations/20260707160000_knowledge_article_views_add_view_mode.sql).

**UI:** представления — вкладки в верхнем ряду рядом с Дерево/Таблица/Q&A/Подбор.
Каждое помнит свой вид (дерево/таблица). Создание из текущего фильтра кнопкой «+»
(захватывает и быстрые чипы, и доп. условия — `buildCombinedFilter`). Правки
активного представления **автосохраняются** (debounce 700мс, сравнение через
канонический `stableStringify` — jsonb не гарантирует порядок ключей). Управление —
через меню `⌄` на вкладке ([`ViewTabMenu.tsx`](../../src/page-components/KnowledgeBasePage/components/ViewTabMenu.tsx)):
переименовать, сменить вид, настроить фильтр, удалить. Активация раскладывает единый
фильтр обратно на чипы + доп. условия (`parseFilterToChips`).

## 4. Сортировка таблицы

Отдельный селектор в тулбаре: название / дата создания / дата изменения, по
возрастанию и убыванию, «без сортировки». Локальная для таблицы (дерева не
касается).

## 5. Рефактор блока управления (Notion-подобная структура)

Блок сжат с 5 уровней до 3: `вкладки` → `тулбар` → `строка фильтров`.
- **Единый фильтр** вместо дубля «быстрые чипы vs расширенный редактор»:
  [`KnowledgeFilterBar.tsx`](../../src/page-components/KnowledgeBasePage/components/KnowledgeFilterBar.tsx)
  — одна строка чипов Статус/Группа/Тег + `+ Фильтр` (добавляет любое поле чипом с
  попап-редактором на `FilterRuleRow`). Строка — по кнопке «Фильтр» (общий
  `showFilters` поднят в хук, открывается и из меню представления).
- **Тулбар разгружен:** управление группами/тегами свёрнуто в меню `⋯`.
- Управление представлением ушло из панели фильтра на вкладку.

## 6. Fix: спойлеры (accordion) схлопывались при возврате на вкладку браузера

**Симптом (прод/локалка):** статья открыта в боковой панели; при переключении на
другую вкладку браузера и обратно раскрытый спойлер («Шаг 1…») сворачивался.

**Метод — ЗАМЕР, не гадание:** первая гипотеза (`refetchOnWindowFocus`) отвергнута —
он глобально `false` ([`Providers.tsx`](../../src/components/providers/Providers.tsx)).
Спойлер — нативный `<details data-type='accordion'>` (`globals.css`), `open` живёт в
DOM. Диагностический лог mount/unmount показал: блок статьи **перемонтируется** —
React вставляет `innerHTML` заново, и нативный `open` сбрасывается к свёрнутому
состоянию из БД.

**Фикс** ([`KnowledgeArticleTabContent.tsx`](../../src/components/tasks/KnowledgeArticleTabContent.tsx)):
раскрытые спойлеры пишутся в модульную карту `openAccordionsByArticle` (по
`articleId`, переживает перемонтаж). `MutationObserver` на контейнере ловит любую
замену `innerHTML` и восстанавливает `open`; клики ловятся делегированием `toggle` в
capture-фазе (`toggle` не всплывает). `sanitizeHtml` мемоизирован.

**Проверено замером:** раскрыл спойлер → форсировал замену `innerHTML` (эмуляция
перемонтажа) → новый DOM-узел создан свёрнутым → MutationObserver восстановил
`open=true`.

## Грабли (на будущее)

- Любой JOIN/резолв доступа к треду через `projects` ломается на orphan — не про БЗ,
  но: доступ к представлениям — RLS-зеркало `item_lists`.
- `filter_config` в jsonb не сохраняет порядок ключей — для сравнения «изменился ли
  фильтр» использовать канонический stringify (сорт ключей), иначе автосейв зациклит.
- Нативный `<details open>` живёт в DOM, а не в React — при любой замене `innerHTML`
  (перемонтаж/смена контента) сбрасывается. Для сохранения состояния — карта вне
  компонента + MutationObserver + `toggle` в capture (событие не всплывает).
- `refetchOnWindowFocus` глобально выключен — «схлопывание при возврате на вкладку»
  искать не в рефетче, а в перемонтаже/замене DOM.

## Проверки

- tsc 0, eslint 0, **848 тестов** (24 новых — движок фильтров статей, конвертеры
  чипов↔фильтр, round-trip parse).
- Браузерные замеры: строка фильтров, «+ Фильтр», представления-вкладки, выбор вида,
  автосейв (запись в БД), сортировка, восстановление спойлера — подтверждены.
- Живые записи в `knowledge_article_views` создавались/удалялись под RLS-юзером
  (insert/delete работают), тестовые записи убраны.

## Затронутые файлы

Роуты `knowledge-base/*` (rename из settings); `sidebarSettings.ts`,
`WorkspaceSidebarFull.tsx`, `SidebarGlobalSearch.tsx`, `WorkspacePage.tsx`,
`SearchPage/index.tsx`; `src/lib/filters/{types,filterDefinitions}.ts`,
`src/components/filters/*`; `src/hooks/knowledge/{useKnowledgeArticleViews,useKnowledgeTaxonomy}.ts`,
`queryKeys/knowledge.ts`; `KnowledgeBasePage.tsx` + `KnowledgeBasePage/*`
(`useKnowledgeBasePage`, `KnowledgeTableView`, `KnowledgeTreeView`, `KnowledgeFilterBar`,
`ViewTabMenu`, `GroupTreeFilterContent`, `knowledgeArticleFilters` + тест);
`KnowledgeArticleTabContent.tsx`; миграции `20260707150000`, `20260707160000`;
`database.ts` (тип `knowledge_article_views` — вошёл в коммит `feat(share)` другой сессии).
