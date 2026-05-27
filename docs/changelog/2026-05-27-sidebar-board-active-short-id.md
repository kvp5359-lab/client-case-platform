# Сайдбар — подсветка board-слота при URL с short_id

**Дата:** 2026-05-27
**Тип:** bugfix (UX)
**Статус:** completed

---

## Симптом

Закреплённая в сайдбаре доска (например, «Входящие») при открытии
не подсвечивалась серым фоном, как обычные пункты. Конкретно:
URL `/boards/1` (short_id доски), а в сайдбаре подсветка пустая.

## Корень

В [`SidebarSlotsRow.tsx`](../../src/components/WorkspaceSidebar/SidebarSlotsRow.tsx)
подсветка board-слота:

```ts
isActive={isNavActive('boards') && pathname.includes(`/boards/${board.id}`)}
```

`board.id` — UUID, а в URL на subdomain (`rs.clientcase.app`) короткий
путь `/boards/<short_id>`. `pathname.includes('/boards/<uuid>')` —
всегда false. Подсветка не включалась.

Та же проблема в [`WorkspaceSidebarFull.tsx`](../../src/components/WorkspaceSidebarFull.tsx)
для `isNavItemActive('boards')` — он сравнивает pathname с UUID
закреплённых досок, чтобы не подсвечивать папку «Доски» внутри
pinned-доски. На URL с short_id это не работало → папка «Доски»
оставалась активной параллельно.

У `item_lists` поля `short_id` нет (только UUID), там проблема не
проявляется.

## Фикс

### 1. Миграция RPC

[`20260527_get_workspace_boards_short_id.sql`](../../supabase/migrations/20260527_get_workspace_boards_short_id.sql) —
`get_workspace_boards` теперь возвращает `short_id`. PostgreSQL
не разрешает менять RETURNS TABLE через CREATE OR REPLACE
(`42P13 cannot change return type`), поэтому DROP + CREATE.

Применена через MCP `apply_migration` (CLI ругается на расхождение
истории миграций, см. project rules).

Типы Database регенерированы: `supabase gen types typescript ...`
В `src/types/database.ts` теперь `short_id: number` в Returns
get_workspace_boards.

### 2. Фронт

- [`Board`](../../src/components/boards/types.ts) — добавлено
  поле `short_id: number | null`.
- [`SidebarSlotsRow.tsx`](../../src/components/WorkspaceSidebar/SidebarSlotsRow.tsx) —
  тип `allBoards` расширен `short_id`, подсветка проверяет
  pathname на оба варианта:
  ```ts
  const isThisBoardActive =
    pathname.includes(`/boards/${board.id}`) ||
    (board.short_id != null && pathname.includes(`/boards/${board.short_id}`))
  ```
- [`WorkspaceSidebarFull.tsx`](../../src/components/WorkspaceSidebarFull.tsx) —
  `isNavItemActive('boards')` резолвит UUID каждой pinned-доски
  через `allBoards.find(...).short_id` и проверяет pathname на
  оба токена. Папка «Доски» больше не подсвечивается параллельно
  с pinned-board.
- [`WorkspaceSidebarCompact.tsx`](../../src/components/WorkspaceSidebar/WorkspaceSidebarCompact.tsx) —
  тип пропа `allBoards` расширен под новый shape.

## Затронутые файлы

- `supabase/migrations/20260527_get_workspace_boards_short_id.sql` (new, applied)
- `src/types/database.ts` (regen)
- `src/components/boards/types.ts`
- `src/components/WorkspaceSidebar/SidebarSlotsRow.tsx`
- `src/components/WorkspaceSidebar/WorkspaceSidebarCompact.tsx`
- `src/components/WorkspaceSidebarFull.tsx`

## Проверки

- `npx eslint --max-warnings 0` — чисто.
- `npx tsc --noEmit` — чисто.
- `npm test` — 660/660 passed.
