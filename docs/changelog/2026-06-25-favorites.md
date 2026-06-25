# Избранное: персональное, кнопка у поиска, поповер по группам, DnD-порядок

**Дата:** 2026-06-25
**Тип:** feat
**Статус:** completed (БД в проде; фронт ждёт деплоя)

---

## Что это

Персональное «Избранное» — любой тред, проект, доска или список добавляется в
избранное и доступен из одной точки в сайдбаре. Данные **на пользователя**, не
на воркспейс (каждый видит только своё).

## БД

Миграция `20260625_user_favorites.sql` (применена в прод через MCP):

- Таблица `user_favorites (id, user_id, workspace_id, entity_type ∈
  thread|project|board|list, entity_id, sort_order, created_at)`.
- Уникальность `(user_id, workspace_id, entity_type, entity_id)`.
- RLS «только свои строки» (select/insert/delete по `user_id = auth.uid()`).
- `sort_order` — ручной порядок внутри типа.

## Хук `useFavorites.ts`

- `useFavorites(ws)` — список (сортировка `sort_order`, затем `created_at`).
- `useToggleFavorite(ws)` — add/remove. **Существование проверяется запросом к
  БД, не по кэшу** — иначе `onMutate` уже клал оптимистичную строку с фейковым
  id и `mutationFn` пытался удалить её (баг `22P02 invalid uuid`).
- `useReorderFavorites(ws)` — пишет `sort_order = index` для группы (оптимистично).

## UI — `SidebarFavoritesButton.tsx`

- Минималистичная **серая звезда внутри поля поиска** справа (проп `trailing` у
  `SidebarGlobalSearch`; показывается, когда строка пуста).
- Клик → поповер:
  - список избранного, **сгруппированный по типам** (Проекты · Треды и задачи ·
    Доски · Списки); клик по пункту открывает (тред — через `globalOpenThread`,
    т.е. саму сущность, а не «ссылку на место, откуда добавил»; остальное —
    переход); ×-удаление по ховеру;
  - кнопка **«Добавить текущую страницу»** — внизу, под всеми позициями; ловит
    открытый тред (`activeThreadId`), проект/доску/список (по URL);
  - кнопка-шестерёнка справа в шапке → **режим переупорядочивания**: появляются
    «грипы», drag-and-drop внутри группы (`@dnd-kit`), кнопка меняется на
    «Готово»; режим сбрасывается при закрытии поповера.

## Файлы

- `supabase/migrations/20260625_user_favorites.sql` (нов)
- `src/hooks/useFavorites.ts` (нов)
- `src/components/WorkspaceSidebar/SidebarFavoritesButton.tsx` (нов)
- `src/components/WorkspaceSidebar/SidebarGlobalSearch.tsx` (проп `trailing`)
- `src/components/WorkspaceSidebarFull.tsx` (подключение)
- `src/types/database.ts` (тип `user_favorites`)

## Ограничения (MVP)

- «Текущая страница» для проекта/доски ловится по UUID в URL / `activeProjectId`
  / резолву доски по short_id из кэша. Если проект открыт по short_id и панель
  проекта не активна — кнопка «добавить текущее» может не показаться (список и
  добавление других сущностей работают всегда).
- Переупорядочивание — внутри своей группы типа (тред нельзя смешать с проектом).
