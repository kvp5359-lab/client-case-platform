# «Создать и отправить» письмо из быстрых действий + единый механизм первого сообщения

**Дата:** 2026-06-28
**Тип:** fix/refactor
**Статус:** completed (ждёт деплоя фронта + смок)

---

## Симптом

В форме создания нажал «Создать и отправить» (email) → письмо НЕ ушло, тред стал
черновиком («Черновик письма / Нет сообщений»), набранный текст пропал.

## Корень

Из 4 мест создания треда три (`TaskListView`, `useBoardListCardSetup`, `InboxPage`)
после создания вызывали очередь первого сообщения (`useQueueThreadInitialMessage`:
`asDraft` → `stashThreadDraft`, иначе `setPendingInitialMessage` → `useMessengerState`
реально шлёт) и открывали тред. А `QuickActionsProvider` (глобальная «+/Новый» из
шаблона) только создавал тред с email-метаданными, **игнорируя `result.initialMessage`
и `result.asDraft`** — текст терялся, email-тред без сообщений выглядел черновиком.
Пред-существующий пробел, не баг фичи черновика.

## Что сделано (унификация всех точек входа)

- `QuickActionsProvider.tsx`: после создания вызывает `queueInitialMessage(thread,
  result)` + открывает тред (`globalOpenThread(newThreadToTaskItem(...))`).
- `InboxPage/index.tsx`: переведён с инлайн-дубля (senderName + asDraft/stash/
  setPending) на тот же хук `useQueueThreadInitialMessage`.
- Итог: 4 пути создания треда → один механизм очереди/черновика/открытия.

## Грабли

Любое НОВОЕ место создания треда обязано проводить `result` через
`useQueueThreadInitialMessage` (или зеркальную логику) и открывать тред — иначе
первое сообщение/письмо потеряется, а email-тред зависнет «черновиком». Не
создавать тред «голым» `createThread.mutate` без обработки `initialMessage`/`asDraft`.

## Файлы

- `src/components/quick-actions/QuickActionsProvider.tsx`
- `src/page-components/InboxPage/index.tsx`

## Проверки

tsc 0, lint 0, 753 теста. Чистый фронт. Смок после деплоя: «Создать и отправить»
письмо из «+/Новый» → уходит адресату; «Сохранить черновик» → черновик; то же из
инбокса/досок/списков единообразно.
