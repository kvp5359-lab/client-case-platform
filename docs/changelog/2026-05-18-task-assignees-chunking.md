# Chunking батч-запроса исполнителей задач (URL-лимит PostgREST)

**Дата:** 2026-05-18
**Тип:** fix (high)
**Статус:** completed

---

## Контекст

После вчерашнего backfill `owner_user_id` (см. [2026-05-17-secret-rotation-and-email-from-board](2026-05-17-secret-rotation-and-email-from-board.md)) в списке задач у владельца воркспейса появилось +15 старых тредов без проекта. Список перевалил за ~50 UUID — и сразу всплыла регрессия, дремавшая с момента написания `useTaskAssigneesMap`:

- У всех задач на UI пропали аватарки исполнителей.
- Фильтр «Мои задачи» отдавал пустой список — потому что `effectiveAssigneeFilter` опирается на `membersMap`, а карта была пуста.
- Колонки на досках со сборкой по исполнителю тоже пустели.

При этом в карточке задачи (отдельный запрос через `useTaskAssigneeIds`) исполнители показывались — это и сбивало с толку.

## Корень

[`useTaskAssigneesMap`](../../src/components/tasks/useTaskAssignees.ts) одним запросом грузил `task_assignees` для всех видимых тредов:

```ts
.from('task_assignees')
.select('thread_id, participants!inner(...)')
.in('thread_id', threadIds)
```

PostgREST конвертирует `.in()` в query-string `thread_id=in.(uuid1,uuid2,...)`. На 50+ UUID URL переваливает за лимит (Supabase отдаёт 400 «URL too long»). React Query кэширует ошибку, `data = undefined`, `membersMap = {}`. На фронте никаких видимых ошибок (хук ошибку не пробрасывает наружу), просто пустая карта.

Регрессия дремала, потому что обычно у активного пользователя меньше 50 видимых задач. Backfill вчера спустил курок.

## Фикс

В [`useTaskAssigneesMap`](../../src/components/tasks/useTaskAssignees.ts) добавлен chunking: список `threadIds` бьётся на куски по 40, запросы шлются параллельно через `Promise.all`, результаты мержатся.

```ts
const ASSIGNEE_CHUNK_SIZE = 40
const chunks: string[][] = []
for (let i = 0; i < threadIds.length; i += ASSIGNEE_CHUNK_SIZE) {
  chunks.push(threadIds.slice(i, i + ASSIGNEE_CHUNK_SIZE))
}
const results = await Promise.all(
  chunks.map((chunk) =>
    supabase.from('task_assignees')
      .select('thread_id, participants!inner(...)')
      .in('thread_id', chunk),
  ),
)
```

40 — с запасом по URL-лимиту: один UUID + кодирование ~50 символов, 40 × 50 = 2000 + остальная часть URL ≈ 2.5KB, в безопасных пределах для всех инфраструктур (nginx, CloudFlare, edge proxies).

## Что проверить

- [x] У задач в списке снова видны аватарки исполнителей.
- [x] Фильтр «Мои задачи» возвращает мои задачи.
- [x] Network-tab: запросы к `task_assignees?thread_id=in.(...)` теперь все 200, нет 400.

## Известные ограничения

- Аналогичная проблема может быть в любом месте, где мы делаем `.in('uuid_col', longList)`. Стоит поискать другие batch-запросы и применить тот же паттерн — но без явных симптомов на проде делать заранее не нужно (YAGNI).
- На очень больших списках (1000+ задач) chunking уже не спасёт — будет 25+ параллельных запросов, упрутся в connection pool. Если когда-нибудь дойдём до таких объёмов — RPC-функция с агрегацией на стороне БД.
