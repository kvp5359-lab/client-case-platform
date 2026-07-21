# 2026-07-21 — Унификация доставки вложений: файл идёт тем же серверным конвейером, что и текст

## Что было не так

- Файл с вложением доходил до клиента **другим путём**, чем текст. Текст шёл
  сервером (триггер `notify_telegram_on_new_message` → `dispatch_message_to_channels`
  → `dispatch_send_http` → запись в `message_send_dispatch`, а watchdog
  `scan_dispatch_failures` добивал зависшее в `failed`). А файл досылался **из
  браузера** — fire-and-forget `supabase.functions.invoke('*-send', { attachments_only })`.
- Если браузерный вызов не доходил (сеть, зависший `getSession`, закрытая вкладка) —
  сообщение **навечно висело в `pending` без следа**: watchdog его не видел (тот
  читает `message_send_dispatch`, которую наполняет только серверный `net.http_post`),
  а «Повторить» звало dispatch **без force** → триггер вложения пропускал → файл не
  переотправлялся. Инцидент 2026-07-21: PDF-инвойс в WhatsApp-лид (WAHA) завис
  навсегда, хотя edge-функция была исправна (ручной вызов доставил файл мгновенно).

## Что сделал

- **Единый серверный путь.** Фронт после `uploadAttachments` зовёт канонический
  `deliver_message(id)` (существующий, гейт «только автор») вместо прямых
  per-канальных invoke. `deliver_message` → `dispatch_message_to_channels(id, has_att)`
  → per-channel `*-send` через `dispatch_send_http` → `message_send_dispatch` →
  watchdog покрывает результат. Первая попытка и повтор идут ОДНИМ путём — как у
  текста и как у публикации черновика (`messengerDraftService`). Единый вызов
  заменил 4 ветки `channelKind` + отдельный tg-group-блок; удалён мёртвый импорт
  `resolveThreadChannel`.
- **«Повторить» (`notify_on_send_status_retry`) теперь форсит вложения**
  (`dispatch(id, true)`). Для текста `force` ничего не меняет, для файла —
  переотправляет и файл.
- **Точечная правка `dispatch_message_to_channels` (тело снято с прода, drift):**
  mtproto-ветка передаёт `has_attachments` в payload — mtproto-service шлёт файлы
  ТОЛЬКО при этом флаге (📎-плейсхолдер он и так превращает в пустую подпись).
  Раньше триггер флаг не передавал → через триггер файлы MTProto не ушли бы.

## Осознанно НЕ унифицировал

- **Email** оставлен на фронт-invoke (диспетчер email-вложения пропускает) — иначе
  при публикации email-черновика была бы двойная отправка (draft-путь + dispatch).
- **Business** пропускает вложения — `telegram-business-send` файлы не поддерживает,
  force слал бы клиенту `caption/📎` без файла + ложный `sent`.

## Грабли

- Новый путь отправки вложений — серверный `deliver_message`/`dispatch(id, true)`,
  НЕ браузерный invoke `*-send`. Двойной отправки нет: INSERT-триггер всегда
  `dispatch(false)` (вложения пропускает), `force=true` только из фронт-resend и
  «Повторить».
- mtproto-service шлёт файлы только при `has_attachments:true` в payload — любой
  новый серверный путь MTProto-вложений обязан передавать флаг.
- Сырой `dispatch_message_to_channels` наружу не отдавать — доступ только через
  `deliver_message` (membership-гейт).

## Проверки

- tsc 0, lint 0, тесты зелёные. БД в проде через MCP. **⏳ Ждёт живого смока по всем
  каналам (карантин):** отправка файла (+caption, +альбом) в WhatsApp-WAHA / Wazzup /
  TG-группу / MTProto / Business / Email → доходит; «Повторить» на упавшем файле
  реально переотправляет; внутреннее (team/note) с файлом клиенту НЕ уходит.

## Файлы

- `supabase/migrations/20260721140000_unify_attachment_dispatch.sql` (dispatch:
  mtproto `has_attachments`; retry-force)
- `src/services/api/messenger/messengerService.send.ts` (non-email → `deliver_message`,
  email → фронт-invoke; удалён per-канальный if/else + tg-блок + мёртвый импорт)
- `supabase/schema/schema-manifest.json` (хеши изменённых функций)
