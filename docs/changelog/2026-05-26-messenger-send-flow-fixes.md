# Messenger — отправка, файлы, UI бабла

**Дата:** 2026-05-26
**Тип:** bugfix + feature + chore (трассировка)
**Статус:** completed

---

## Контекст

Пакет из пяти связанных правок по мессенджеру: дедупликация входящих
файлов, статус доставки исходящих с вложениями, контекстное меню /
фокус / цитирование в баббле, имя файла при скачивании и трассировка
бага «крутится → красное» в `telegram-send-message`. Все правки
возникли из живых репортов пользователя — чинились по одному.

---

## 1. Telegram multi-file dedup терял сообщения

**Симптом:** клиент отправляет 2-3 файла «за секунду» (pack фоток / pdf
через «Прикрепить») → в БД доезжают не все. Воспроизведение: 2026-05-25
16:27, тред Анаит — два фото DNI + AEAT.pdf одной секундой → в БД дошли
только два, pdf пропал.

**Причина:** UNIQUE-индекс `uq_project_messages_telegram_content_dedup`
включал `md5(content)`. У файлов content одинаковый — `📎`. Гранулярность
`telegram_message_date` — секунда. При нескольких файлах от одного
отправителя в одной секунде второй и третий INSERT ловили 23505 и в
`syncTelegramIncomingMessage.ts` молча отбрасывались как `duplicate`.

**Фикс** ([`20260526_telegram_file_unique_id_dedup.sql`](../../supabase/migrations/20260526_telegram_file_unique_id_dedup.sql)):

1. Колонка `project_messages.telegram_file_unique_id` (стабильный TG-id
   файла, одинаковый у разных ботов для одного файла).
2. UNIQUE-индекс расширен до `(chat, sender, date, md5(content),
   COALESCE(file_unique_id, ''))`.
3. [`syncTelegramIncomingMessage.ts`](../../supabase/functions/_shared/syncTelegramIncomingMessage.ts)
   извлекает `file_unique_id` из document / photo[last] / video / voice
   / audio / animation / sticker / video_note и пишет в новую колонку.
   Enrich-логика тоже фильтрует по file_id — иначе личный бот мог
   обновить не ту строку при multi-file.

Multi-bot dedup сохраняется: один файл от 2+ ботов даёт одинаковый
`file_unique_id`, второй INSERT по-прежнему схлопывается.

Коммит: `9d96681`.

---

## 2. Меню для ссылок + фокус + цитирование

Три связанные правки UX:

**Контекстное меню для ссылок в бабле.** Правый клик на ссылке внутри
сообщения теперь открывает меню «Перейти по ссылке» / «Копировать
ссылку», а не общее меню сообщения. Реализация — native listener на
capture phase + `stopImmediatePropagation`, чтобы перехватить событие
раньше React event delegation на root, иначе `ContextMenuTrigger`
родителя выигрывает гонку. Файл —
[`BubbleLinkMenu.tsx`](../../src/components/messenger/BubbleLinkMenu.tsx).

**Фокус в input после reply / прикрепления.** Reply: `useEffect`
завязан на `[replyTo, editor]`, используется `setTimeout(50)` — RAF
(16ms) иногда проигрывал Radix-возврату фокуса. Attachments (скрепка /
DnD / DocumentPicker / paste): тот же `setTimeout(50)` в `onFilesAdded`.

**Цитирование.**
- Кнопка «Цитировать» не появлялась если `mouseup` случался вне баббла
  (выделение тянули за границы) — детектор переключён с `onMouseUp` div'а
  на `mouseup` на `document`.
- Повторное цитирование того же текста не вставлялось: `useEffect`
  зависел от string и не реагировал на `setQuoteText(sameText)`.
  `quoteText` теперь хранится как `{ text, nonce }` — nonce растёт на
  каждый клик, прокидывается отдельным пропом `quoteNonce`.
- Вставка цитаты: если `editor.isFocused` — в текущую позицию курсора,
  иначе `focus('end')` + вставка в конец.

Коммит: `7532c15`.

---

## 3. Вложения во внутреннем чате не висят в pending

**Симптом:** Анна Бурнаева в чате без подключённых каналов отправляет
текст + 3 docx (`AVISO LEGAL.docx`, `POLÍTICA DE COOKIES.docx`,
`POLÍTICA DE PRIVACIDAD.docx`). Текстовая запись становится `sent`,
файловая записывается в БД и навсегда висит в `pending`. Через 60 сек
`DeliveryIndicator` красит её красным. Кнопка «Повторить отправку»
бесполезна — retry-trigger `notify_on_send_status_retry` срабатывает
только на переходе `failed → pending`, а у нас в БД статус **уже**
pending (красное — это локальный таймер).

**Причина:** в `dispatch_message_to_channels` ранний RETURN на
`has_attachments=true` стоял **до** проверки канала:

```sql
IF NEW.has_attachments = true AND NOT p_force_attachments THEN
  RETURN;
END IF;
```

Смысл этой защиты: для TG / Wazzup / MTProto / Email отправку файлов
инициирует фронт через `invoke` после загрузки в Storage (иначе race —
триггер мог стартовать `*-send` до того, как файлы залились). Но в
тредах без внешних каналов фронт ничего не инвоукает, а финальный
`UPDATE send_status='sent'` (для internal-тредов) стоит **ниже** этого
RETURN'а и недостижим.

**Фикс** ([`20260526_fix_internal_thread_attachments_send_status.sql`](../../supabase/migrations/20260526_fix_internal_thread_attachments_send_status.sql)):
перенёс проверку `has_attachments` **внутрь** каждой ветки канала
(mtproto / business / wazzup / telegram). Если канала нет — проваливаемся
в финальный UPDATE как и для текстовых сообщений в internal-тредах.

Плюс backfill уже застрявших сообщений того же класса.

Коммит: `3ab912e`.

---

## 4. Корректное имя файла при скачивании из бабла

**Симптом:** при клике на файл в чате открывался signed URL без
`Content-Disposition`. Для mime, которые браузер не умеет показать
inline (docx / xlsx / zip / …), сразу появлялся Save dialog с именем
из URL = `storage_path` — сгенерированный uuid типа
`1779790794292-r4s10x` — а не реальное имя файла.

**Фикс:** в `getAttachmentUrl` добавлен опциональный `downloadName`. Если
передан — Supabase Storage возвращает `Content-Disposition:
attachment; filename="…"`, браузер скачивает с правильным именем.
Помощник `canInlinePreview(mime)` определяет, нужен ли download: для
pdf / image / video / audio / text оставляем inline preview в новой
вкладке, для остального форсим download.

Остальные вызывальщики `getAttachmentUrl` (ComposeField,
AudioAttachmentPlayer, draft download) не задеты — 3-й параметр
опциональный, дефолт сохраняет старое поведение.

Коммит: `a99bcd0`.

---

## 5. Трассировка для бага «крутится → красное» через employee_bot

**Симптом:** периодически Edge Function `telegram-send-message`
возвращает 200 OK за ~33 мс, не отправив текст в Telegram и не вызвав
`markMessage{Sent,Failed}`. В БД остаётся stamp
`telegram_bot_integration_id`, `send_status='pending'`. Сообщение
доставляется в Telegram (по словам пользователя), а в БД висит.
DeliveryIndicator через 60 сек красит баббл красным. Watchdog
`scan_dispatch_failures` пропускает — status_code=200.

В БД на момент диагностики 5 свежих застрявших сообщений с этим
паттерном (с 22 мая, первое — `b7de300b`). Все через employee_bot
(stamp есть, message_id нет). Отправители разные (Кирилл, Анна) —
поломка общая для пути, не у одного бота.

По коду такой путь возможен **только** при
`wantTextOnly = false` И `attachments_only = false`. Это требует
`body.content === "📎"`. Но в БД у всех сообщений `content` нормальный
HTML-текст. Очередь `net.http_request_queue` к моменту диагностики
почистилась, тело pg_net-запроса посмотреть нельзя. Корневая причина
не ясна — нужна трассировка вживую.

**Что добавил** ([`telegram-send-message/index.ts`](../../supabase/functions/telegram-send-message/index.ts)):

- `trace("request.start", …)` — расширил: `typeof body.attachments_only`,
  preview `body.content` (первые 80 знаков), флаг `content === "📎"`.
- `trace("branch.decision", …)` сразу после вычисления `wantTextOnly`:
  какая ветка будет выбрана, обе ли пропускаются.
- Локальный флаг `statusWritten` — выставляется в каждой из шести точек
  после `markMessage{Sent,Failed}` (текстовая ветка — sent/fallback/failed;
  split-text — failed; attachments — sent/failed).
- Финальная проверка перед `return`: если `statusWritten === false` —
  `console.error` с трейсом `BUG.no_branch_wrote_status` **и** UPDATE
  на `project_messages.telegram_error_detail` с метаданными
  (content_paperclip, attachments_only, wantTextOnly, content_len). Так
  post-mortem можно делать SQL'ом, не лазая в Functions Logs.
- `trace("request.end")` теперь включает `statusWritten`, ответ
  `{ok:true, statusWritten}`.

Логику отправки не трогал — только наблюдатели. Сознательно **не**
возвращаю 500 при `statusWritten=false`: если сообщение реально
доставлено в Telegram, watchdog поставил бы failed, пользователь нажал
бы «Повторить» → дубль. Сейчас собираем данные.

**Когда следующее воспроизведение** — SQL для поиска:

```sql
SELECT id, sender_name, created_at, telegram_error_detail
FROM project_messages
WHERE telegram_error_detail LIKE 'BUG no_branch_wrote_status:%'
ORDER BY created_at DESC;
```

Этого хватит чтобы понять в каком сценарии функция вылетает за 33мс.

Коммит: `4c68216`.

---

## Затронутые файлы

- `supabase/migrations/20260526_telegram_file_unique_id_dedup.sql` (+ apply)
- `supabase/migrations/20260526_fix_internal_thread_attachments_send_status.sql` (+ apply, + backfill)
- `supabase/functions/_shared/syncTelegramIncomingMessage.ts`
- `supabase/functions/telegram-send-message/index.ts` (+ deploy `--no-verify-jwt`)
- `src/types/database.ts` (regenerated)
- `src/components/messenger/BubbleLinkMenu.tsx` (new)
- `src/components/messenger/BubbleTextContent.tsx`
- `src/components/messenger/MessageBubble.tsx`
- `src/components/messenger/MessageInput.tsx`
- `src/components/messenger/MessengerTabContent.tsx`
- `src/components/messenger/hooks/useMessengerState.ts`
- `src/components/messenger/hooks/useQuoteInsertion.ts`
- `src/components/messenger/AttachmentMenuButton.tsx`
- `src/components/messenger/FileAttachment.tsx`
- `src/services/api/messenger/messengerAttachmentService.ts`
- `src/services/api/messenger/messengerService.ts`

## Проверки

- Миграции применены к продовой БД через MCP `apply_migration`.
- `telegram-send-message` задеплоена через `supabase functions deploy
  --no-verify-jwt` (новая версия 94).
- Backfill миграции `_fix_internal_thread_attachments_send_status`
  починил сообщение Анны `5b692239` (3 docx → sent). После применения
  оставшихся pending-с-вложениями в internal-тредах не осталось.
- Открытые вопросы:
  1. Баг B (employee_bot, 33мс) — ждём следующего воспроизведения,
     чтобы прочитать `telegram_error_detail` с диагностикой.
  2. Watchdog `scan_dispatch_failures` пропускает «ответ 2xx без
     выставления send_status» — нужно расширить: если status='pending'
     дольше N минут, переводить в failed.
