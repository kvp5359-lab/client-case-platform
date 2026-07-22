# Из письма ушёл 1 файл из 14: приём личного Telegram не регистрировал файл в реестре

**Дата:** 2026-07-22
**Тип:** fix (мессенджер: приём MTProto + почта + WhatsApp)
**Статус:** edge + mtproto-service — в проде; фронт — деплой push в main

---

Журнал расследования (замеры, отвергнутые гипотезы, грабли) — в
[`messenger-ledger.md`](../../.claude/rules/messenger-ledger.md), запись 2026-07-22 (4).

## Симптом

Письмо отправлено из сервиса с 14 вложениями (1 загружен с компьютера, 13
пересланы из личного Telegram-диалога). У клиента в Gmail — **один** файл. В
сервисе сообщение помечено как успешно отправленное, ошибки не показано.

## Корень

Задумано, что любой файл попадает в общий реестр `files` (там бакет и путь), а
`message_attachments.file_id` на него ссылается. Отправляющая функция просто
спрашивает реестр, где лежит файл.

Приём личного Telegram — отдельный сервис на VPS (`mtproto-service`) со **своей
копией** логики сохранения. Он клал файл в бакет `message-attachments` и вставлял
строку **без записи в реестр**. Скан всей базы (5006 вложений) подтвердил:
`telegram_mtproto` — 620 из 620 без `file_id`, у всех остальных каналов — 0.
Так с запуска канала 3 мая.

Следствие: `email-internal-send` скачивал вложения жёстко из бакета `files` → для
таких файлов 404 → запись в лог и **молчаливый пропуск**. Тот же хардкод был в
`attachment-proxy` (по нему качает Wazzup) и `waha-send`, то есть пересылка таких
файлов в WhatsApp была сломана так же. Размер ни при чём: 18 МБ против 25 МБ
лимита Gmail.

## Что сделано

1. **Приём MTProto регистрирует файл в `files`** (`mtproto-service/handlers/media.ts`)
   и пишет `file_id`. Сбой реестра не роняет приём — файл сохранится, просто без
   ссылки.
2. **Общий резолвер** `_shared/storageHelpers.ts#resolveAttachmentLocation`
   (реестр → fallback **`message-attachments`**, не `files`) подключён в
   `email-internal-send`, `wazzup-send`, `waha-send`. Паттерн уже жил в
   `telegram-send-message/attachments.ts` и во фронтовом `resolveFileLocation`.
3. **`attachment-proxy` больше не гадает бакет** — он приезжает в подписанном
   токене (поле `b`). Старые токены (живут 1 час) обслуживаются перебором
   `files` → `message-attachments`.
4. **Почта не отправляется наполовину:** если хоть один файл не скачался,
   сообщение помечается `failed` с причиной `attachments_unavailable: …`, а не
   уезжает клиенту частично со статусом «отправлено».
5. **«Повторить» чинит письмо с вложениями** (`useRetryTelegramSend`): такой
   путь теперь сам зовёт `email-internal-send`. Иначе один перевод в `pending`
   вешал бы сообщение навсегда — диспетчер email-ветку с вложениями пропускает
   даже при force (чтобы не задваивать с публикацией черновика).

## Чего сознательно не делали

**Бэкфилл реестра для 655 старых строк.** Fallback на `message-attachments`
покрывает их все (это ровно то, что делает фронт, и по ним файлы открываются).
Записать бакет вслепую — риск указать неверное место: среди строк есть
мартовские, до запуска MTProto, а проверить наличие объекта из SQL нельзя —
файлы лежат в R2.

## Проверки

- `deno check` четырёх функций: 5 ошибок, все пред-существующие (4 в
  `sendFailureLog`, `to:` в `email-transports`), новых 0; lockfile не тронут.
- mtproto `tsc` 0; фронт tsc 0, eslint 0, **1168 тестов** (заодно починена
  тест-фабрика `useFilteredInbox.test.ts` — не знала о `has_mixed_unread`).
- mtproto-service после пересборки: `/health` 200, сессия восстановлена.

## Смок за владельцем (карантин)

Клиент присылает файл в личный Telegram → переслать его в письмо **и** в
WhatsApp → доходит. Письмо с несколькими файлами уходит целиком. Недоступный
файл → бабл краснеет с причиной, «Повторить» реально переотправляет. Обычная
отправка вложений в Telegram-группу / Wazzup / WAHA не сломана.

**Те 13 файлов клиенту не ушли — переслать заново после деплоя фронта.**

## Затронутые файлы

`mtproto-service/src/handlers/media.ts`,
`supabase/functions/_shared/{storageHelpers,attachmentToken}.ts`,
`supabase/functions/email-internal-send/index.ts`,
`supabase/functions/attachment-proxy/index.ts`,
`supabase/functions/wazzup-send/index.ts`,
`supabase/functions/waha-send/index.ts`,
`src/hooks/messenger/useRetryTelegramSend.ts`,
`src/hooks/messenger/useFilteredInbox.test.ts`.
