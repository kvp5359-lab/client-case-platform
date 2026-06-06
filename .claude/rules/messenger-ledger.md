# 📓 Messenger Ledger — журнал и точка входа по мессенджеру

> **Мессенджер — самый чувствительный блок проекта.** Это его единая дверь.
> Любая правка/расследование мессенджера начинается отсюда и фиксируется сюда.

## ⛔ Прежде чем трогать мессенджер

1. **Прочитай этот файл целиком** — раздел «Повторяющиеся грабли» экономит часы.
2. Затем профильный источник правды (этот файл их **не дублирует**, а ссылается):
   - [`channels.md`](./channels.md) — как устроены каналы (матрица, контракты, авторизация Edge).
   - [`gotchas.md`](./gotchas.md) — ловушки кода/БД (RLS, дедуп, секреты, маршрутизация).
   - [`docs/bugs/`](../../docs/bugs/) — детальные разборы багов.
3. Мессенджер — **карантинная зона** ([`refactoring.md`](./refactoring.md)): не рефакторить «заодно», только точечно под задачу, со смок-тестом.

## ✍️ После правки мессенджера — обнови этот файл

- Новое расследование (даже неудачное) → строка в «Журнал расследований» с **гипотезами, включая отвергнутые**.
- Изменилось что работает/в процессе → поправь «Текущее состояние».
- Нашёл новые грабли → допиши в «Повторяющиеся грабли».
- Контракт кода/БД → в `gotchas.md`, сюда только ссылку.

> Гипотезы и **развороты** — самое ценное здесь. Они не попадают в changelog, но именно они не дают второй раз чинить не там.

---

## 🟢 Текущее состояние

**Каналы** (детали — [`channels.md`](./channels.md#матрица-возможностей)): TG group (бот-секретарь + личные боты сотрудников), TG Business, TG MTProto, Wazzup, Email. Единый `send_status` (`pending`/`sent`/`failed`), авторетраев нет — только кнопка «Повторить».

**Открытые вопросы / в работе:**

| Дата | Тема | Статус |
|------|------|--------|
| 2026-06-05 | **Reply-цитата в multi-bot группах** (cross-bot). Фикс «дозапись связки бот-владельцем» в проде (v2 v67, v1, business) | ⏳ **Ждёт смок-теста** на боевой группе с двумя активными ботами (оригинал от одного бота, реплай ловит другой) |
| 2026-06-05 | **Bot-to-Bot Communication Mode** (Bot API 10.0) как альтернатива | ⏸ Тумблер у ботов включён, но **не активен** (нужно передобавить ботов в группу). НЕ активировать без защиты от дублей (см. грабли §G6) |

**Известные пределы платформы Telegram (не баги, чинить нельзя):**
- Бот **не видит сообщения других ботов** — даже админ/privacy off. Отсюда весь multi-bot reply (§G5).
- Reactions/edit/delete не поддержаны WhatsApp/Wazzup.
- MTProto — только private chats, не группы.

---

## 🔬 Журнал расследований (хронология)

Формат: **симптом → гипотезы (вкл. ✗отвергнутые) → корень → фикс → ссылки**.

### 2026-06-05 — Reply-цитата теряется в группе с несколькими ботами
- **Симптом:** клиент отвечает реплаем на наше исходящее в группе — в ЛК цитата не подтягивается. «Через раз».
- **Гипотезы:**
  - ✗ «Telegram не отдаёт `reply_to_message.date`, починим фолбэком по дате» → date-фолбэк (коммит `8578780`) **не сработал** на cross-bot. Измерено: 100% корреляция cross-bot ↔ нет цитаты.
  - ✗ «Нерешаемо: бот не видит чужих ботов, данных нет ни у кого» → **ложь**. Данные есть у бота-**владельца** оригинала.
  - ✓ **Истинный корень:** Telegram гарантированно отдаёт реплай боту-владельцу письма (он видит свой оригинал). Но при **гонке вставки** строку часто пишет другой («слепой») бот без связки, а правильную связку от владельца наш `enrich` отбрасывал — UPDATE стоял с `.is(bot_integration_id, null)` (дозапись только поверх секретаря, не поверх другого employee-бота).
- **Фикс:** при 23505 любой бот, разрешивший reply (`replyToDbId`), дописывает `reply_to_message_id` туда, где он ещё `NULL` — не трогая чужой `bot_integration_id`, не перезаписывая готовую связку. Коммит `eb2a3a0`.
- **Подтверждено докой:** [Bot API changelog 10.0](https://core.telegram.org/bots/api-changelog), [Bots FAQ](https://core.telegram.org/bots/faq).
- **Статус:** в проде, ждёт смок-теста (см. «Текущее состояние»).
- **Урок:** «нереально» относилось к ложной картине. Чинить надо было **свой код**, не Telegram. Скепсис заказчика к первому выводу заставил перемерить факты.

### 2026-05-28 — Сообщения зависают в pending (msg_id collision) ⭐
- **Симптом:** ~6 сообщений у одного сотрудника за день — баббл крутится → красное, хотя в TG доставлены.
- **Гипотезы (4 слоя одной поломки):** ✗ «33мс ответ / кэш» → ✗ «realtime UPDATE не пришёл» → ✗ «catch fallback тихо глотает» → ✓ **23505 на `uq_telegram_message_per_chat`**.
- **Корень:** UNIQUE индексировал `(chat, msg_id)` **без бота**. Разные боты в группе имеют **независимую нумерацию msg_id** → законно пересекаются. Старый бот занял `(chat,328)`, новый через дни дошёл до своего 328 → 23505 на `markMessageSent` → зависание.
- **Фикс:** миграция `20260528_fix_uq_telegram_message_per_chat_include_bot` — третий компонент `COALESCE(bot_integration_id::text,'secretary')`. Manual recovery 6 жертв.
- **Урок:** **diagnostic write до критичной операции** (`candidate_markSent` перед `markMessageSent`) окупился в первый же случай.
- **Ссылки:** [`docs/bugs/resolved/2026-05-28-telegram-send-stuck-pending.md`](../../docs/bugs/resolved/2026-05-28-telegram-send-stuck-pending.md), [`gotchas.md`](./gotchas.md#️-uq_telegram_message_per_chat-обязательно-включает-bot_integration_id).

### 2026-05-28 — Зомби-тосты «Не удалось отправить»
- **Симптом:** баббл синий (sent), но тосты «Повторить» висят. Опасно — повтор создаёт дубль в TG.
- **Корень:** при переходе в `sent` (вкл. manual recovery) `message_send_failures.resolved_at` не обновлялся.
- **Фикс:** триггер `AFTER UPDATE OF send_status` → при `pending/failed → sent` закрывает все `message_send_failures` по этому message_id. Миграция `20260528_auto_resolve_send_failures_on_sent`.

### 2026-05-28 — Потеря вложений (downloadAttachments race)
- **Симптом:** ложная плашка «Файл из Telegram не загружен», хотя файл лежит.
- **Корень:** `downloadAttachments` вызывался при любом непустом `rowId`, включая `enriched` (второй бот) → повторный upload `upsert:false` → 23505 → `attachment_status='failed'` поверх успешной загрузки.
- **Фикс:** вызывать **строго** при `outcome === 'inserted'`. Коммит `0e4e6c2`.
- **Ссылки:** [`docs/bugs/resolved/2026-05-27-telegram-lost-attachments.md`](../../docs/bugs/resolved/2026-05-27-telegram-lost-attachments.md), [`gotchas.md`](./gotchas.md#downloadattachments-только-при-outcomeinserted).

### 2026-05-27 — Бот-секретарь не привязан к группе (self-healing)
- **Симптом:** «chat not found» от личного бота + fallback на секретаря падает 500 (`integration_id=NULL`). 18% групп — «сироты».
- **Корень:** webhook `/link` не записывал `integration_id`.
- **Фикс:** `findSecretaryInGroup` через TG `getChat`, self-healing `resolveBotToken`, `/link` пишет id, маркер `ERR_NO_SECRETARY_IN_GROUP`, UI `ThreadHealthBanner`. Backfill 13/15. Коммит `fc66885`.
- **Ссылки:** [`docs/changelog/2026-05-27-telegram-secretary-self-healing-ux-fixes.md`](../../docs/changelog/2026-05-27-telegram-secretary-self-healing-ux-fixes.md).

### 2026-05-26 — Вложения внутреннего чата висят в pending
- **Корень:** в `dispatch_message_to_channels` ранний `RETURN` на `has_attachments=true` стоял **до** проверки канала.
- **Фикс:** перенёс проверку внутрь каждой ветки канала. Миграция `20260526_fix_internal_thread_attachments_send_status`.

### 2026-05-26 — Multi-file dedup теряет сообщения
- **Корень:** клиент шлёт 3 файла за секунду → UNIQUE по `md5(content='📎')` глотал 2-й/3-й.
- **Фикс:** расширить дедуп-ключ на `telegram_file_unique_id`. Миграция `20260526_telegram_file_unique_id_dedup`, коммит `9d96681`.

### 2026-05-13 — INSERT...RETURNING на project_threads падает 42501 (RLS) ⭐
- **Симптом:** создание треда падает с 42501. Ловили **5 раз** (регрессии).
- **Корень:** `can_user_access_thread(uuid,uuid)` перечитывал тред; для RETURNING-строки SELECT-полиция внутри SECURITY DEFINER не видела свежевставленную строку → false.
- **Фикс (постоянный):** row-overload `can_user_access_thread(project_threads, uuid)` — получает row через тип, не перечитывает. Миграция `20260524_can_user_access_thread_row_overload`. Short-circuit `created_by` больше **не нужен**.
- **Ссылки:** [`docs/bugs/resolved/2026-05-13-thread-insert-returning-rls.md`](../../docs/bugs/resolved/2026-05-13-thread-insert-returning-rls.md), [`gotchas.md`](./gotchas.md#-rls-на-project_threads--закрыто-2026-05-24).

### 2026-05-13 — Дубли сообщений клиента (multi-bot) ⭐
- **Корень:** 2+ бота в группе → Telegram даёт каждому **свой** msg_id для одного сообщения клиента. UNIQUE по msg_id их не ловит.
- **Фикс:** content-based dedup `uq_project_messages_telegram_content_dedup` (chat, sender, date, md5(content), file_unique_id).
- **Ссылки:** [`docs/bugs/resolved/2026-05-13-telegram-multibot-message-duplicates.md`](../../docs/bugs/resolved/2026-05-13-telegram-multibot-message-duplicates.md), [`gotchas.md`](./gotchas.md#️-дедуп-между-несколькими-ботами-в-одной-telegram-группе).

### Ранее (апрель — середина мая) — крупные вехи
Полные детали — в changelog (см. Индекс). Кратко:
- **2026-04-19 / 05-02** — telegram-webhook-v2, серверная настройка вебхука, токены ботов из БД (не env).
- **2026-05-03** — общие хелперы `_shared/` для реакций и входящих; MTProto end-to-end.
- **2026-05-04** — Wazzup + рефакторинг мессенджера.
- **2026-05-07** — апгрейд группы→супергруппы (migrate_to_chat_id), reply после миграции.
- **2026-05-11** — распил монолитов webhook-v2 и send-message на модули.
- **2026-05-21** — идемпотентность отправки (защита от двойных).
- **2026-05-22** — unified `send_status` по всем каналам.
- **2026-05-28** — унификация webhook: employee-боты на v2.

---

## 🪤 Повторяющиеся грабли (где «лечили не там»)

**G1. Multi-bot: у каждого бота своя нумерация msg_id.**
В группе с 2+ ботами `message_id` уникален только в пределах одного бота. Никогда не полагаться на «msg_id уникален в чате». Затрагивает: дедуп incoming (§2026-05-13), UNIQUE на отправке (§2026-05-28), reply (§2026-06-05).

**G2. Бот не видит сообщения других ботов.**
Даже админ / privacy off / Bot-to-Bot. Reply на сообщение чужого бота приходит без `reply_to_message`. Cross-bot связку доносит **только бот-владелец** оригинала (§2026-06-05). Не пытаться «прочитать чужого бота» через Bot API — только MTProto (юзер-аккаунт).

**G3. RLS на project_threads + INSERT...RETURNING.**
SECURITY DEFINER STABLE функция, перечитывающая тред, ломает RETURNING. Закрыто row-overload (§2026-05-13). Не возвращать перечитывающую сигнатуру для SELECT-полиции. Старую `(uuid,uuid)` НЕ удалять — её юзают 8 политик смежных таблиц.

**G4. Дедуп через раннюю вставку, а не проверку.**
Полагаемся на UNIQUE + 23505 → outcome (`inserted`/`enriched`/`duplicate`). Любая операция «после вставки» (downloadAttachments, enrich, markSent) должна учитывать, какой именно outcome (§downloadAttachments, §reply).

**G5. enrich дописывает поверх секретаря, не другого employee.**
Историческое условие `.is(bot_integration_id, null)` в enrich рассчитано на «секретарь вставил, личный дописывает». Для employee-over-employee — промахивается. Reply-дозапись (§2026-06-05) это обходит отдельным UPDATE без фильтра по боту.

**G6. Bot-to-Bot Mode → риск дублей.**
Если активировать (передобавить ботов + админка/privacy off), боты начнут видеть исходящие друг друга → наши `web`-исходящие прилетят как `telegram`-входящие (обычный content-dedup не ловит, т.к. разный source) → дубли. **До активации** нужна защита: в группе игнорировать сообщения, отправленные ботами (`msg.from.is_bot`). Защита НЕ трогает цитаты (они приходят от людей).

**G7. Diagnostic write до критичной операции — окупается.**
Паттерн `candidate_*` в `telegram_error_detail` перед `markMessageSent` дал корень бага 05-28 в первый же случай. Применять при тёмных гонках.

**G8. Деплой Edge: флаг и хелперы.**
Webhook'и и `*-send` — `--no-verify-jwt` (иначе 401 от шлюза). Правка `_shared/syncTelegram*` требует **редеплоя всех** тянущих функций: `telegram-webhook-v2`, `telegram-webhook` (v1), `telegram-business-webhook`. См. [`gotchas.md`](./gotchas.md#--no-verify-jwt-для-webhook-и--send).

---

## 🗂 Индекс

**Правила:** [`channels.md`](./channels.md) · [`gotchas.md`](./gotchas.md) · [`refactoring.md`](./refactoring.md) (карантин) · [`audit-false-positives.md`](./audit-false-positives.md)

**Багдоки (resolved):**
- [2026-05-28 send stuck pending (msg_id collision)](../../docs/bugs/resolved/2026-05-28-telegram-send-stuck-pending.md)
- [2026-05-27 lost attachments](../../docs/bugs/resolved/2026-05-27-telegram-lost-attachments.md)
- [2026-05-13 multibot message duplicates](../../docs/bugs/resolved/2026-05-13-telegram-multibot-message-duplicates.md)
- [2026-05-13 thread insert RETURNING RLS](../../docs/bugs/resolved/2026-05-13-thread-insert-returning-rls.md)
- [2026-04-10 reactions media-group](../../docs/bugs/resolved/2026-04-10-telegram-reactions-media-group.md)

**Changelog (по теме):** `docs/changelog/` — фильтр `telegram|wazzup|gmail|messenger|send|secretary|mtproto`. Ключевые: `2026-05-28-telegram-send-msg-id-collision-fix`, `2026-05-28-telegram-webhook-unified`, `2026-05-27-telegram-secretary-self-healing-ux-fixes`, `2026-05-22-unified-send-status`, `2026-05-03-telegram-mtproto-end-to-end`, `2026-05-04-wazzup-and-messenger-refactor`, `2026-04-19-telegram-bot-v2`.

**Ключевые файлы кода:**
- Приём: `supabase/functions/telegram-webhook-v2/` (модули), `_shared/syncTelegramIncomingMessage.ts`, `_shared/syncTelegramReactions.ts`
- Отправка: `supabase/functions/telegram-send-message/`, `telegram-business-send`, `telegram-mtproto-send`, `wazzup-send`, `email-internal-send`; статус — `_shared/messageSendStatus.ts`
- Маршрутизация: триггер `notify_telegram_on_new_message` (БД)
- Фронт: `src/components/messenger/`, `src/hooks/messenger/`

**История git:** `git log --oneline -- 'supabase/functions/telegram*' '_shared/syncTelegram*' 'src/components/messenger'`
