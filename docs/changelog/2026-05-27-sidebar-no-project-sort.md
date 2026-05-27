# Сайдбар — «Без проекта» сортируется по последней активности

**Дата:** 2026-05-27
**Тип:** UX
**Статус:** completed

---

## Симптом

В списке проектов сайдбара виртуальная запись «Без проекта»
(контейнер для тредов с `project_id = NULL` — личные диалоги
TG Business / MTProto / Wazzup / Email) **всегда висела внизу**,
независимо от активности. Сортировка проектов работает по
`last_activity_at desc`, но виртуала в ней не было.

Пользователь ожидал, что при новом сообщении в любом личном
диалоге «Без проекта» поднимется вверх — как любой проект.

## Корень

В `WorkspaceSidebarFull.tsx` виртуал просто пришивался в конец
массива:

```ts
return [...rawProjects, virtual]
```

Поле `last_activity_at` у виртуала уже считалось (`useSidebarInboxCounts`
возвращает `noProjectLastActivityAt` = max `last_message_at` тредов
без `project_id`), но в порядке списка не использовалось.

## Фикс

[`WorkspaceSidebarFull.tsx`](../../src/components/WorkspaceSidebarFull.tsx) —
вставка виртуала в правильное место:

- Парсим `noProjectLastActivityAt` в ms.
- Через `findIndex` ищем первый проект в `rawProjects` с
  `last_activity_at` старше виртуала (или null).
- Вставляем виртуал перед ним.
- Если `noProjectLastActivityAt = null` (тредов без проекта нет
  вообще) или парсинг даты упал — fallback на прежнее поведение
  (виртуал в конец).

`rawProjects` уже отсортированы БД по `last_activity_at desc` —
вставка O(n), порядок остальных проектов не меняется. Pinned-логика
не задета (виртуал не закрепляется: `usePinnedProjects` хранит UUID,
а `NO_PROJECT_VIRTUAL_ID` — sentinel).

## Затронутые файлы

- `src/components/WorkspaceSidebarFull.tsx`

## Проверки

- `npx eslint --max-warnings 0` — чисто.
- `npx tsc --noEmit` — чисто.
