# Мессенджер: пустые строки в баббле, reply-с-файлом, утечка внутреннего сообщения с файлом (+плашка проекта)

**Дата:** 2026-07-08
**Тип:** fix (карантин — мессенджер; фронт + edge `telegram-send-message`)
**Статус:** edge `telegram-send-message` — задеплоен вручную; фронт — деплой push в main → CI/CD blue/green

---

Серия правок отображения/доставки сообщений. Детальный журнал (гипотезы, замеры,
грабли) — в [`messenger-ledger.md`](../../.claude/rules/messenger-ledger.md),
записи 2026-07-07/08. Здесь — сводка.

## 1. Reply с файлом уходил в Telegram без нативного reply (edge)

Ответ в сервисе с прикреплённой картинкой: в ЛК — reply, в Telegram — фото
отдельным сообщением без reply. Причина: текст резолвит цель reply триггер БД
(server-side), а вложения идут фронт-invoke'ом (`attachments_only`) БЕЗ
`reply_to_telegram_message_id`. Фикс (self-contained, покрывает все invoke-пути):
в attachment-ветке `telegram-send-message` цель дорезолвивается из самого
сообщения (`reply_to_message_id` → `telegram_message_id` оригинала) → через
per-bot карту (`resolveReplyIdForSendingBot`) → нативный `reply_parameters`.
Файл: `supabase/functions/telegram-send-message/index.ts`.

## 2. В баббле пропадали пустые строки наших сообщений (фронт)

Пустая строка в конце абзаца из редактора (`<p>текст.<br></p>`) не рисовалась —
хвостовой `<br>` ВНУТРИ `<p>` браузер не отображает (замер в браузере: gap 0),
хотя в Telegram `</p><p>` = `\n\n` (пустая строка видна). Фикс: `moveTrailingParaBreaks`
выносит хвостовой `<br>` из `<p>` наружу — между блоками он рисуется как пустая
строка, совпадает с Telegram.

## 3. Копирование из бабла двоило пустые строки при вставке (фронт, старый баг)

Пустая строка кодировалась bare `<br>` между блоками — он грязно сериализуется
при копировании и при вставке в tiptap-композер давал ДВЕ пустые строки. Фикс:
`normalizeRootBlankLines` кодирует пустую строку как `<p><br></p>` — round-trip в
редактор ровно в одну пустую строку (замер настоящего paste в tiptap).

**Регресс от п.3 (исправлен в тот же день):** `normalizeRootBlankLines` оборачивал
ЛЮБОЙ root-level `<br>` в `<p><br></p>`. Plain-text сообщения из Telegram
(`source=telegram`, content без тегов) рендерятся через `.replace(/\n/g,'<br>')` —
одиночный `\n` («Привет!\nПодготовил») давал `<br>` между инлайн-текстом, который
ошибочно становился пустой строкой (в TG её нет). Фикс: оборачиваем только когда
сосед-БЛОК (`P/DIV/OL/UL/LI/BLOCKQUOTE/TABLE…`) хотя бы с одной стороны; `<br>`
между инлайн-текстом = перенос строки, не трогаем.

Файлы п.2-3: `src/utils/format/messengerHtml.ts`, `messengerHtml.test.ts` (25 тестов).

## 4. 🔴 Утечка: внутреннее сообщение с файлом уходило клиенту в канал (фронт + edge)

Внутреннее (Команде/Заметка/Только я) сообщение с вложением проскакивало клиенту
в Telegram-группу. Текст внутренних сообщений блокирует триггер БД, но вложения
идут фронт-invoke'ом мимо триггера — и там не было проверки `visibility`.
Внутренний черновик с файлом — тот же путь (публикация = UPDATE is_draft, триггер
не срабатывает).

Фикс, два слоя:
- **Фронт (первичный):** гейт `isClientVisible` на всех путях внешней доставки
  вложений — `sendMessage` (TG/Wazzup/MTProto/Email) и `publishDraft` (TG). Файл
  всё равно загружается в сервис, но в канал не уходит.
- **Edge backstop (`telegram-send-message`):** если `visibility != 'client'` —
  `markMessageSent` + return ДО отправки. Защита канала, если путь забудет гейт.

Файлы: `src/services/api/messenger/messengerService.send.ts`, `messengerDraftService.ts`,
`supabase/functions/telegram-send-message/index.ts`.

## 5. Попутно: цвет плашки названия проекта

Плашка названия проекта во «Входящих» и в тостах — `bg-slate-200` → `bg-[#e6ebf2]`
(чуть более прохладный серо-голубой тон). Файлы: `InboxChatItem.tsx`,
`MessageToastContent.ts` (параллельная сессия).

## Проверки

- Фронт: tsc 0, eslint 0; 25 тестов `messengerHtml`.
- Edge `telegram-send-message` задеплоен `--no-verify-jwt`.
- Замеры: реальный HTML сообщений из `project_messages`, рендер и paste в
  настоящем tiptap (Playwright).
- Смок за пользователем после деплоя фронта: пустые строки видны как в Telegram и
  не двоятся при копировании; одиночный перенос из TG не даёт пустой строки;
  внутреннее сообщение с файлом клиенту НЕ уходит; reply с файлом → нативный reply.

## Затронутые файлы

`supabase/functions/telegram-send-message/index.ts`,
`src/utils/format/messengerHtml.ts`, `src/utils/format/messengerHtml.test.ts`,
`src/services/api/messenger/messengerService.send.ts`,
`src/services/api/messenger/messengerDraftService.ts`,
`src/components/messenger/InboxChatItem.tsx`,
`src/hooks/messenger/MessageToastContent.ts`.
