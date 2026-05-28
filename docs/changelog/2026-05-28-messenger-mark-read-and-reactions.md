# Мессенджер — UX-фиксы mark-as-read и реакций

**Дата:** 2026-05-28
**Тип:** bugfix (UX)
**Статус:** completed

---

## Контекст

Два независимых UX-бага в мессенджере, обнаружены во время смок-теста после унификации webhook v1+v2 (см. [`2026-05-28-telegram-webhook-unified.md`](2026-05-28-telegram-webhook-unified.md)). Ни один не связан с унификацией напрямую — это давние проблемы, которые проявились на свежем тесте.

---

## 1. Реакции из сервиса не доходили до TG (fallback цепочка)

**Симптом:** в группе, где сидит только секретарь (например `rs1_support_bot`), реакция из ClientCase ставилась в БД (виден 👍 в UI), но в Telegram не появлялась. Edge Function `telegram-set-reaction` возвращала 502.

**Корень:** [`telegram-set-reaction/index.ts:133`](../../supabase/functions/telegram-set-reaction/index.ts:133) выбирала **одного** бота по приоритету:
1. Личный `telegram_employee_bot` реагирующего юзера (если есть).
2. Бот, отправивший оригинал (`telegram_bot_integration_id`).
3. Бот-секретарь (`resolveBotToken`).

Делала **одну попытку**. Если у юзера есть личный бот (например `rs_help123_bot` для Кирилла), но этот бот не в данной группе — Bot API возвращал `Bad Request: chat not found`, функция возвращала 502, реакция в TG не ставилась. Это типичный сценарий для владельца workspace, у которого есть свой бот, но в эту конкретную группу он не приглашён — там только секретарь.

**Фикс:** три источника собираются в массив `candidates` (с дедупом если один и тот же бот). Цикл попыток: на `chat not found` / `not a member` / `member not found` — пробуем следующего. На других ошибках TG (например `REACTION_INVALID`) — `break`, fallback не поможет.

```ts
for (const { token, label } of candidates) {
  const r = await fetch(`.../setMessageReaction`, ...);
  const j = await r.json();
  if (j.ok) return { ok: true, sent_by: label };
  if (!isNotMemberError(j.description)) break;
}
```

Воспроизведено: реакция в группе с одним только `rs1_support_bot` теперь ставится корректно (fallback'ом на секретаря).

---

## 2. Лаг 3-4 сек до исчезновения красного контура у бабблов

**Симптом:** при клике «Прочитано» в треде:
- В сайдбаре бейдж непрочитанных пропадал мгновенно.
- В самом треде красный контур у непрочитанных бабблов — через 3-4 сек.

**Корень:** архитектурная асимметрия двух хуков:

- [`useInboxMarkMutations.ts`](../../src/hooks/messenger/useInboxMarkMutations.ts) (свайп ✓✓ в инбокс-листе) — `patchCachesForMarkRead` в `onMutate` → бейдж сайдбара обновляется мгновенно.
- [`useUnreadCount.ts → useMarkAsRead`](../../src/hooks/messenger/useUnreadCount.ts) (кнопка «Прочитано» внутри треда) — `applyOptimisticMarkRead` (включает тот же patch) в `onSuccess` → patch только после ответа БД (~300-500 мс) и пока realtime не доедет до `messengerKeys.lastReadAtByThreadId`. Красный контур читает именно этот ключ.

То есть 3-4 секунды = round-trip к БД + рассинхронность с realtime.

**Фикс:** в `useMarkAsRead`/`useMarkAsUnread` patch перенесён в `onMutate` (как в `useInboxMarkMutations`), с rollback в `onError` по snapshot всех затронутых кэшей. Инвалидации остались в `onSuccess` — догоняем БД, но это уже невидимо для пользователя.

Дополнительно удалены хелперы `applyOptimisticMarkRead` / `applyOptimisticMarkUnread` — после разнесения patch+invalidate по фазам они стали мёртвым кодом.

---

## Затронутые коммиты

- `0bccdad` — fix(telegram-set-reaction): fallback цепочка при выборе бота для реакции
- `529e2e2` — fix(messenger): optimistic mark-as-read убирает красный контур мгновенно

---

## Связано

- [Унификация webhook v1+v2 — этим тестированием баги и нашлись](2026-05-28-telegram-webhook-unified.md)
- [.claude/rules/channels.md → Подсветка сообщений сотрудников в клиентских чатах](../../.claude/rules/channels.md) — `last_read_at` и красные контуры
