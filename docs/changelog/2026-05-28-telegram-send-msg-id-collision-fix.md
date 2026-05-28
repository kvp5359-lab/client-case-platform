# Telegram — фикс коллизии msg_id между разными ботами в одной группе

**Дата:** 2026-05-28
**Тип:** bugfix (critical)
**Статус:** completed

---

## Контекст

Длинная история — расследование зависающих исходящих в Telegram, тянущееся с 22 мая. Параллельно работали 2 сессии. К 28 мая баг стал массовым у Анны Бурнаевой (6 застрявших сообщений за день) — что и помогло локализовать корень.

Полный разбор: [`docs/bugs/resolved/2026-05-28-telegram-send-stuck-pending.md`](../bugs/resolved/2026-05-28-telegram-send-stuck-pending.md).

---

## Симптом

Сотрудник пишет в треде через ЛК, баббл крутится «отправляется» 60 секунд, потом краснеет «Повторить отправку». **В Telegram сообщение реально доставлено клиенту сразу.** Нажимать «Повторить» опасно — даст дубль в TG.

## Прорывная диагностика

Параллельная сессия в коммите `3ade916` добавила assert на 0 affected rows в `markMessage{Sent,Failed}` — раньше supabase-js без `.select()` возвращал success даже при UPDATE 0 rows. После моего коммита `b349dc4` тот же assert появился в catch-fallback. Это превратило тихий баг в видимый: `send_failed_reason` стало показывать конкретную причину.

Дальше — `8244045` добавил запись `(chat, tg_msg_id, integration, tg_date, elapsed_ms)` в `telegram_error_detail` **до** `markMessageSent`. Это окупилось на следующем же случае: пойман `tg_msg_id=328`, `tg_date` свежий → значит Telegram реально отдал свежий msg_id, не кэш. SELECT по `(chat=-5065960967, msg_id=328)` показал запись от 20 мая через **другого** бота.

## Корневая причина

Разные боты в одной TG-группе имеют **независимую нумерацию msg_id** (Telegram нумерует per-bot-view-of-chat). Старый бот когда-то использовал `(chat, 328)`. Через 8 дней новый бот тоже добрался до своего `msg_id=328`.

Partial UNIQUE `uq_telegram_message_per_chat` индексировал только `(telegram_chat_id, telegram_message_id)` — без `telegram_bot_integration_id`. Поэтому считал сообщения от разных ботов в одной группе с одинаковым msg_id «дублями» и отбивал UPDATE на 23505.

В `gotchas.md` уже была заметка «UNIQUE не помогает multi-bot dedup'у» — но она оценивала только случай incoming (когда 2 бота получают одно и то же физическое сообщение). Не было оценки **обратного** сценария — когда 2 бота отправляют (или принимают) **разные** сообщения, которые случайно получили одинаковый msg_id. Заметка дополнена.

## Фикс

Миграция [`20260528_fix_uq_telegram_message_per_chat_include_bot.sql`](../../supabase/migrations/20260528_fix_uq_telegram_message_per_chat_include_bot.sql):

```sql
DROP INDEX IF EXISTS public.uq_telegram_message_per_chat;
CREATE UNIQUE INDEX uq_telegram_message_per_chat
ON public.project_messages (
  telegram_chat_id,
  telegram_message_id,
  COALESCE(telegram_bot_integration_id::text, 'secretary')
)
WHERE telegram_message_id IS NOT NULL AND telegram_chat_id IS NOT NULL;
```

NULL `telegram_bot_integration_id` (legacy secretary-bot без stamp'а) → `'secretary'` placeholder.

## Жертвы (manual recovery)

Все за день у Анны Бурнаевой в треде Анаит:

| id | время | content |
|---|---|---|
| `fb962b07` | 13:00 UTC | «нет, сейчас вы добавили в поле контактных данных…» |
| `43bc14a9` | 13:08 UTC | «Отлично! Я вам выше записала короткое видео…» |
| `c76bfd54` | 14:59 UTC | «Насчёт пошлин — мы можем сформировать вам квитанции…» |
| `6aefa4d6` | 15:00 UTC | «Еще мне знакомые обещают подписать…» |
| `d3b27721` | 16:11 UTC | «Анаит, и ещё важный вопрос по паспорту…» |
| `7e8bc228` | 16:40 UTC | «Тогда нужно будет приложить посадочный талон…» |

Все через `integration=1399d46a` (личный бот Анны).

## Дополнительные изменения

**Защитный код в `telegram-send-message`** оставлен — он окупился, и при любых будущих регрессиях с silent-failed-update даст моментальную диагностику в БД:

- `_shared/messageSendStatus.ts`: `markMessage{Sent,Failed}` ассертят affected rows (коммит `3ade916`).
- `telegram-send-message/index.ts`: catch-fallback тоже ассертит (`b349dc4`).
- `telegram-send-message/index.ts`: candidate-write в `telegram_error_detail` до `markMessageSent` (`8244045`) — оставлен permanently.

Также обновлён `gotchas.md` — раздел про multi-bot dedup дополнен предупреждением про `bot_integration_id` в UNIQUE.

## Затронутые файлы

- `supabase/migrations/20260528_fix_uq_telegram_message_per_chat_include_bot.sql` (apply)
- `supabase/functions/_shared/messageSendStatus.ts` (коммит 3ade916, deploy всех `*-send`)
- `supabase/functions/telegram-send-message/index.ts` (коммиты b349dc4 + 8244045, deploy)
- `.claude/rules/gotchas.md`
- `docs/bugs/open/2026-05-28-telegram-send-stuck-pending.md` → `docs/bugs/resolved/`

## Проверки

- Миграция применена к продовой БД через `mcp__supabase__apply_migration`.
- Edge function `telegram-send-message` задеплоена с флагом `--no-verify-jwt`.
- Manual recovery 6 жертв через UPDATE — все стали `sent`, в Telegram сообщения уже были.

## Уроки

1. **Symptom не равен root cause.** Сначала думали «edge function вернула 200 за 33мс без работы» (баг B), потом «realtime UPDATE не доехал» (баг C), потом «catch fallback silently 0 rows». Все три — слои одного бага. Истинный корень — UNIQUE constraint.
2. **Diagnostic writes до критичных операций окупаются.** Запись candidate-данных в БД до `markMessageSent` дала точный msg_id за 1 минуту следующего повторения.
3. **Documentation comments могут быть неполными.** `gotchas.md` говорил «UNIQUE не помогает», но не предупреждал что constraint **активно ломает** в обратную сторону. Дополнено.
