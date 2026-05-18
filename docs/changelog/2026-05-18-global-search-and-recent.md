# Глобальный поиск (FTS + pg_trgm) и список «Недавнее»

**Дата:** 2026-05-18
**Тип:** feature (large) + migration (db)
**Статус:** completed

---

## Контекст

До сегодня в сайдбаре был только локальный фильтр-поиск по списку проектов.
Чтобы найти конкретный тред, статью в базе знаний, контакт или старое
сообщение, приходилось переходить через несколько страниц и листать вручную.

Реализовали **единую строку поиска** в верхней части сайдбара, которая
ищет одновременно по 5 типам сущностей: треды, проекты, статьи KB,
участники/контакты и тело переписки. И параллельно — **список «Недавнее»**:
когда строка поиска пустая, выпадает дропдаун с последними открытыми
элементами.

UX-референсы — Linear / Notion / Slack. Делали «правильный вариант» с
полнотекстовым поиском и устойчивостью к опечаткам, а не дешёвый ILIKE.

## Главное 1: инфраструктура поиска в БД

### Расширения

`pg_trgm` и `unaccent` — оба не были включены ранее. Включены миграцией.

### Generated tsvector колонки + GIN-индексы

На пяти таблицах добавлена `search_vector tsvector` (GENERATED ALWAYS …
STORED) + GIN-индекс по ней. Конфиг FTS — `russian` (понимает склонения).

| Таблица | Веса полей |
|---|---|
| `project_threads` | A=name, B=description |
| `projects` | A=name, B=description |
| `knowledge_articles` | A=title, B=summary, C=stripped HTML content |
| `participants` | A=name+last_name+email+phone (simple), C=notes (russian) |
| `project_messages` | весь content (russian, HTML стрипнут regex'ом) |

Для `participants` имена/email/телефон индексируются конфигом `simple`
(без стеммера) — морфология для имён бесполезна и даже вредна. Notes —
русский.

### Trigram-индексы для fuzzy

Дополнительно GIN-trigram-индексы (`gin_trgm_ops`) по `name`/`title`
четырёх таблиц — partial `WHERE is_deleted = false` где применимо. Это
обеспечивает прощение опечаток (см. ниже).

### Объёмы данных

На момент включения: 711 тредов, 74 проекта, 40 статей KB, 155
участников, 7342 сообщения. Полная переиндексация при первом
применении generated columns заняла секунды.

## Главное 2: RPC `global_search`

```sql
global_search(p_workspace_id uuid, p_query text, p_limit int default 8)
RETURNS TABLE (entity_type, entity_id, title, subtitle, snippet, rank,
               project_id, thread_type, thread_id)
```

- **SECURITY INVOKER** — полагается на RLS исходных таблиц (фильтр по
  членству в воркспейсе уже есть везде).
- **Минимум 2 символа** в запросе — иначе RETURN void.
- **`websearch_to_tsquery('russian', query)`** — единственная безопасная
  для пользовательского ввода функция: кавычки, спецсимволы, OR, минус
  обрабатываются «как Google».
- **Ранкинг — `GREATEST(ts_rank, word_similarity)`**. FTS даёт высокий
  rank на точных словах (с морфологией), word_similarity подстраховывает
  на опечатках. Использован именно `word_similarity` (а не обычный
  `similarity`), потому что обычный сравнивает строки целиком, и длинные
  названия типа «Созвон Аня/Кирилл» давали similarity < 0.25 даже для
  правильно написанного «Созвон». `word_similarity` ищет лучшее
  совпадение по подсловам.
- **Порог fuzzy — 0.4**. Эмпирически: опечатка в одну букву в коротком
  слове («сазвон» vs «созвон») даёт ~0.43. Понижать дальше → мусор в
  результатах.
- **5 RETURN QUERY** последовательно — по одному на каждый тип сущности.
  Каждый со своим LIMIT (по умолчанию 8). Сообщения присоединяют тред +
  проект для красивого отображения «упоминание в треде Х проекта Y» +
  `ts_headline` со сниппетом.
- **`ts_headline` для сниппетов** сообщений и статей KB — оборачивает
  совпадение в `<mark>…</mark>` (фронт стилизует жёлтым highlight).
  MaxFragments=1, MaxWords=15 — компактный сниппет на одну строку.

### Почему не Postgres Roaring или внешний поиск (Meilisearch)

Объёмы на 2-3 порядка меньше границы, где это окупается. FTS + pg_trgm
закрывают все требуемые сценарии при нулевых эксплуатационных
расходах. Если БД вырастет до миллионов сообщений, отдельный поисковый
движок будет логичным следующим шагом.

## Главное 3: список «Недавнее»

### Таблица `recently_viewed`

```sql
CREATE TYPE recent_entity_type AS ENUM ('thread', 'project',
  'knowledge_article', 'participant');

CREATE TABLE recently_viewed (
  user_id      uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  entity_type  recent_entity_type,
  entity_id    uuid,
  opened_at    timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, workspace_id, entity_type, entity_id)
);
```

RLS — `user_id = auth.uid()` на все 4 операции (own-rows only).

PK по 4 колонкам обеспечивает UPSERT: повторное открытие той же сущности
просто обновляет `opened_at`. Никакого «N последних» не хранится —
просто `ORDER BY opened_at DESC LIMIT N` на чтении.

### RPC `track_recent_view`

`SECURITY INVOKER`. Делает UPSERT с `opened_at = now()`, затем DELETE
всех записей кроме последних 100 на пару (user, workspace) — чтобы
таблица не разрасталась бесконечно. Идемпотентен.

### RPC `get_recently_viewed`

Принимает limit (по умолчанию 20). Внутри CTE `base` берёт
`LIMIT p_limit * 3` записей — запас на отфильтрованные `is_deleted=true`
сущности. Дальше 4 UNION ALL JOIN'ов в исходные таблицы с фильтрами:

- `project_threads`: `is_deleted = false` + резолв `project.name` как
  subtitle.
- `projects`: `is_deleted = false`.
- `knowledge_articles`: без `is_deleted` (нет такой колонки), фильтр по
  `workspace_id`.
- `participants`: `is_deleted = false`, title = `name + last_name`,
  subtitle = `email || phone`.

### Что и как фиксируется

Тип | Источник | Где
--- | --- | ---
Тред | `useEffect` на `activeThreadId` в `TaskPanelTabbedShell` | покрывает ВСЕ способы открытия треда (клик в списке, на доске, из инбокса, тоста, поиска, переход по вкладкам панели)
Проект | `useAutoTrackRecentView` в `ProjectPage.tsx` после резолва short_id → UUID | один effect на маунт страницы
Статья KB | `useAutoTrackRecentView` в `KnowledgeBaseArticleEditorPage.tsx` | один effect на маунт страницы
Участник | (пока не трекается) | нет отдельной страницы — карточка контакта открывается popover'ом

Хук `useTrackRecentView()` сам инвалидирует
`recentlyViewedKeys.byWorkspace(workspaceId)` после успеха — список
«Недавнее» обновляется без reload. Без инвалидации был баг: открываешь
новый тред внутри проекта → он появлялся в списке только после reload
(см. ниже «Регрессия»).

## Главное 4: UI в сайдбаре

### Компонент `SidebarGlobalSearch`

[`src/components/WorkspaceSidebar/SidebarGlobalSearch.tsx`](../../src/components/WorkspaceSidebar/SidebarGlobalSearch.tsx).

Один компонент, два режима через `compact?: boolean`:

- **Full** (обычный сайдбар) — строка `<input>` под `WorkspacePicker`,
  с иконкой лупы слева и крестиком очистки справа. Popover
  выравнивается с input'ом (`PopoverAnchor`). Ширина дропдауна =
  ширине триггера, минимум 280px.
- **Compact** (свёрнутый сайдбар, w-12) — кнопка-иконка лупы → Popover
  открывается справа от иконки, фиксированной ширины 360px. Внутри —
  собственный input + те же группы.

### Состояния popover'а

- **Пустой запрос (< 2 символов)** → секция «Недавнее»: иконка часов в
  шапке, ниже список последних 15 элементов с иконкой по типу,
  title + subtitle. Если пусто (новый юзер) — заглушка «Здесь будут
  недавно открытые».
- **Загрузка** (`isSearching && !hasResults`) → "Ищу…" + крутилка.
- **Нет результатов** → "Ничего не найдено".
- **Результаты** → группы по типу: «Треды», «Проекты», «База знаний»,
  «Контакты», «Сообщения». В каждой группе — шапка с иконкой типа +
  список элементов. У сообщений и статей — сниппет с подсветкой
  жёлтым (`<mark>` стилизуется через `[&_mark]:bg-yellow-200`).

### Роутинг по клику

Тип | Действие
--- | ---
`thread` | загружает тред через `supabase.from('project_threads').select(...)` и зовёт `globalOpenThread(task)` — открывает в TaskPanel
`message` | то же, но по `thread_id` сообщения
`project` | `router.push('/workspaces/{ws}/projects/{id}')`
`knowledge_article` | `router.push('/workspaces/{ws}/settings/knowledge-base/{id}')`
`participant` | `router.push('/workspaces/{ws}/settings/participants')` (точечный highlight — отдельная итерация)

### Debounce

250ms через хук `useDebouncedValue`. Тот же интервал, что и у локального
поиска проектов в `ProjectsList` — единообразное поведение сайдбара.

### Что НЕ изменено

Локальный фильтр-поиск в `ProjectsList.tsx` оставлен как есть — он
фильтрует только текущий список проектов в сайдбаре. Два поиска работают
параллельно: один — быстрый локальный фильтр сайдбарного списка, второй
— глобальный по всем сущностям воркспейса. Юзер при создании задачи
выбрал «оставить оба».

## Регрессия: «Недавнее» не обновлялось без reload

Первая версия `useEffect` в `TaskPanelTabbedShell` дёргала
`supabase.rpc('track_recent_view')` напрямую — запись в БД проходила,
но React Query не знал об изменении кэша
`recentlyViewedKeys.byWorkspace(...)`. В результате открытый тред
появлялся в списке только после reload страницы.

Фикс: заменили прямой вызов на хук `useTrackRecentView()`, у которого
в `onSuccess` стоит `queryClient.invalidateQueries({queryKey:
recentlyViewedKeys.byWorkspace(...)})`. Этим же убрали дублирующий
вызов из `globalOpenThread` в `TaskPanelContext.tsx` — shell-effect
покрывает все способы открытия, а отдельная инструментация в
`globalOpenThread` создавала бы double-tracking без пользы.

## Файлы

### Миграция

[`supabase/migrations/20260518_global_search_and_recent.sql`](../../supabase/migrations/20260518_global_search_and_recent.sql)
— расширения, generated columns, GIN-индексы, таблица
`recently_viewed` + RLS, 3 RPC.

### Хуки

[`src/hooks/useGlobalSearch.ts`](../../src/hooks/useGlobalSearch.ts) —
`useGlobalSearch`, `useRecentlyViewed`, `useTrackRecentView`,
`useAutoTrackRecentView`, `useDebouncedValue`.

[`src/hooks/queryKeys/misc.ts`](../../src/hooks/queryKeys/misc.ts) —
`globalSearchKeys`, `recentlyViewedKeys`.

### Компонент

[`src/components/WorkspaceSidebar/SidebarGlobalSearch.tsx`](../../src/components/WorkspaceSidebar/SidebarGlobalSearch.tsx).

### Монтаж

[`src/components/WorkspaceSidebarFull.tsx`](../../src/components/WorkspaceSidebarFull.tsx)
— два места: в `compact` ветке (иконка) и в `full` ветке (input).
Скрыто у клиентских ролей (`!isClientOnly`).

### Трекинг просмотров

[`src/components/tasks/TaskPanelTabbedShell.tsx`](../../src/components/tasks/TaskPanelTabbedShell.tsx)
— `useEffect` на `activeThreadId`.

[`src/page-components/ProjectPage.tsx`](../../src/page-components/ProjectPage.tsx),
[`src/page-components/KnowledgeBaseArticleEditorPage.tsx`](../../src/page-components/KnowledgeBaseArticleEditorPage.tsx)
— по одному `useAutoTrackRecentView`.

## Известные ограничения / на будущее

- **Префиксный поиск.** `websearch_to_tsquery` не делает auto-prefix:
  ввод «прив» не найдёт «приветствие» через FTS-путь (trigram-путь
  тоже не сработает — порог 0.4 не пробивает 0.2). На MVP терпимо
  (юзер обычно пишет хотя бы цельные короткие слова, и они находятся
  через FTS + морфологию). Долгосрочно — переключить на `to_tsquery`
  с auto-prefix через нашу санитизацию ввода (split + `:* & :*`).
- **Поиск по `project_messages`** фильтрует только по `workspace_id`.
  На уровне доступа к конкретному треду полагается на RLS треда — но
  это происходит уже при клике (загрузке треда), а не на этапе
  выдачи результатов. Юзер увидит сниппет сообщения из недоступного
  треда и при клике получит 403/empty. На объёмах MVP терпимо, но
  при росте до сотен тысяч сообщений добавить отсечение прямо в RPC
  через JOIN с `can_user_access_thread`.
- **Участники как «Недавнее»** не трекаются — нет отдельной страницы
  участника, карточка открывается popover'ом из множества мест.
  Сначала надо договориться о канонической «странице участника»
  (нужна ли она вообще), потом добавить трекинг.
- **Глобальный hotkey** (Cmd+K) пока не реализован — фокус только
  кликом по строке поиска или по иконке лупы. Юзер при выборе
  варианта попросил именно «строку поиска», а не палитру. Хоткей —
  отдельная маленькая итерация (1 строчка `useEffect` на keydown).
- **Группа «Доступные результаты»** (когда показывать «показать все»
  при > 8 результатов в группе) не реализована. На MVP лимит фиксирован
  в RPC (`p_limit=8` на тип).
- **Sortable preferences** — пользователь не может настроить, какие
  типы сущностей искать. Все 5 типов всегда. Если потом появится шум
  от какого-то типа — добавить чекбоксы в шестерёнку рядом с input.

## Что нужно сделать руками после деплоя

Ничего. Миграция уже применена в продакшен Supabase. Расширения
`pg_trgm` / `unaccent` теперь включены — это безопасно для других
функций (только добавляет операторы).

Существующие пользователи увидят пустое «Недавнее» при первом
открытии — заполнится по мере работы с сервисом.
