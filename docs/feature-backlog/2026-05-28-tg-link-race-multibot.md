# `/link` race condition в группе с несколькими employee-ботами

**Дата создания:** 2026-05-28
**Тип:** UX fix (race condition)
**Приоритет:** низкий (визуальная странность, функционально работает)

---

## Проблема

В группе сидят два или больше employee-ботов одного воркспейса (типичный сценарий: каждый сотрудник в команде имеет свой личный бот). Админ группы пишет `/link 1A4D404B`. Все боты получают webhook, все вызывают `cmdLink`. Гонка:

1. Бот A: `SELECT project_telegram_chats WHERE thread_id=X → null`
2. Бот B: `SELECT project_telegram_chats WHERE thread_id=X → null`
3. Бот A: `INSERT project_telegram_chats (thread_id=X, ...)` → ✅ успех, отвечает «Группа привязана».
4. Бот B: `INSERT project_telegram_chats (thread_id=X, ...)` → 23505 `uq_project_telegram_chats_thread_id`, отвечает «Не удалось привязать. Причина: duplicate key…»

Юзер видит в чате две карточки бота подряд: одна с галочкой, вторая с красным треугольником и техническим текстом ошибки в БД. Визуально пугает, но функционально всё работает — binding создан.

Воспроизведено 2026-05-28 12:33 локального времени в группе клиента, где сидят `rs_help123_bot` (Kirill) и `rs_help102_bot` (Anna).

## Что не так

Сейчас `cmdLink` в [`v2/commands.ts:171-218`](../../supabase/functions/telegram-webhook-v2/commands.ts:171) делает SELECT + INSERT/UPDATE как обычные **не-atomic** операции, без обработки UNIQUE violation. Любой проигравший в гонке бот пишет в чат сырое сообщение об ошибке БД (включая имя индекса).

## Решение

Ловить `error.code === '23505'` от INSERT и трактовать как **«binding уже привязан другим ботом — успех, молчу»**:

```ts
const { error: linkError } = existing
  ? await service.from("project_telegram_chats").update(payload).eq("id", existing.id)
  : await service.from("project_telegram_chats").insert(payload);

if (linkError?.code === '23505') {
  // Race: другой бот в этой же группе успел INSERT'нуть первым. binding
  // создан — наша задача выполнена. Молчим, не дублируем «Группа привязана»
  // от своего имени (первый бот уже сказал).
  return;
}
if (linkError) { /* остальная обработка как сейчас */ }
```

Альтернатива через `upsert` с `onConflict: 'thread_id'` — менее наглядна и требует учёта `integration_id`-логики, оставленной в текущем коде.

## Edge cases

- **Партнёр-бот по-прежнему рапортует** «Группа привязана» — это первый бот, выигравший гонку. Это и правильно: один бот = одна карточка.
- **Если оба бота шлют /link одновременно** и оба попадают в `existing → null`, второй упадёт 23505. Покрыто фиксом.
- **Если binding к ДРУГОМУ thread_id уже есть** в этой же группе — это другая ситуация (одна группа = один проект), сейчас падает с осмысленной ошибкой. Не трогаем.

## Сложность

~10 строк в `v2/commands.ts`. Низкий риск, не трогает _shared/. Тесты — отправить `/link` от тестового бота в группе с двумя ботами, проверить что второй бот молча возвращает после INSERT первого.

## Связано

- [Унификация webhook v1+v2](../changelog/2026-05-28-telegram-webhook-unified.md) — этим тестированием race поймался.
- `.claude/rules/channels.md` → раздел Telegram (групповой бот) → multi-bot dedup.
