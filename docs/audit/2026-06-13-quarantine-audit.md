# Аудит защищённых зон (карантин) 2026-06-13

5 агентов прочитали целиком: Telegram edge (v1/v2/send/business/mtproto-edge/reactions),
Wazzup/Gmail/Email + `_shared`, mtproto-service, фронт-хуки/сервисы мессенджера,
фронт-компоненты + критичная БД. Ниже — находки и план рефакторинга волнами.

Правило: карантин. Каждая правка — со смок-тестом (refactoring.md). Пользователь
тестирует после. Edge-функции деплоятся отдельно; mtproto-service — rsync+docker на VPS.

## Реальные баги

| # | Файл | Сев | Суть | Риск фикса |
|---|------|-----|------|-----------|
| B1 | mtproto `commands.ts:242` | 🔴 | запрос к несуществующей таблице `mtproto_sessions` (надо `telegram_mtproto_sessions`) → аватар-после-отправки тихо сломан | ~0 (1 строка) |
| B2 | mtproto `incoming.ts:44/51` | 🔴 | `withAlbumLock` Map не чистится (утечка) + сломанная identity-проверка промиса | низкий, смок альбома |
| B3 | `email-internal-send:207` | 🔴 | `m.created_at` не выбран в select(83) → анти-гонка email сломана → 2 письма без In-Reply-To | низкий, смок 2 писем |
| B4 | `useUnreadCount:203-221` | 🔴 | snapshot/restore пишут в `['inbox','threads']` вместо `inboxKeys.threads()`=`['inbox','threads-v2']` → rollback mark-read не работает | ~0 (2 строки) |
| B5 | `telegram-edit-message:133-149` | 🟠 | IDOR: auth-гейт в `if(workspaceId)`, для `project_id=NULL` тредов workspace не резолвится → проверка членства пропущена | средний (security), смок 2 тредов |
| B6 | mtproto send/react/edit/read | 🟠 | FLOOD_WAIT обработан только в backfill; в остальных → 500 вместо 429+Retry-After | средний (send-путь) |
| B7 | media.ts:134-180 | 🟡 | `attachment_error` too_large безусловно перезатирает failed-детали | низкий |
| B8 | `useToggleReaction:49-52` | 🟡 | onSuccess берёт pid без фоллбэка → mark-read пропускается для owner-не-участника | низкий |
| B9 | mtproto `/users/fetch-avatar` | 🟡 | не стампит `avatar_fetched_at` → лишние MTProto-запросы при NULL avatar_url | низкий |
| B10 | `useSendMessage:254` | 🟡 | мёртвый тернарник `channel==='internal'?'web':'web'` | ~0 |

## Архитектурное (НЕ трогать сейчас — расследование)

**F1 — дрейф v1↔v2 webhook.** Прод: 91 чат на v2, 1 на v1. `telegram-register-webhook:109`
ставит URL новых ботов на **v1**, а `channels.md` пишет «v1 legacy, удалить + дропнуть
`bot_version`». **Удаление v1 сломает приём во всех новых группах.** Нужно: свериться
`getWebhookInfo` по ботам, решить канонический webhook, потом синхронизировать. До разбора —
НЕ удалять v1, НЕ дропать `bot_version`. Отдельная задача-расследование.

## Мёртвый код (grep-подтверждён)

- mtproto `inbox.ts:87` `resolveSessionParticipantId` (0 импортёров)
- `_shared/gmailToken.ts:92` `getValidGmailTokenForAccount` (0)
- `wazzup-mark-read:27` `_userClient` (создаётся, не используется)
- `telegram-setup-webhook` — legacy env `TELEGRAM_BOT_TOKEN` (вероятно мёртвая, проверить)

## Дубли → _shared/хелперы

- mtproto: `fetchAndStoreAvatar` (×2 — эндпоинт должен звать хелпер, заодно чинит B9), `humanError` (×2), `SessionContext` тип (×3), `resolvePeer`-паттерн, `findMtprotoThread`
- email/wazzup/gmail: `stripHtml` (×3 байт-в-байт), `blobToBase64`/`arrayBufferToBase64` (×2 в encoding.ts vs ai-chat-setup/ai-extraction), RFC2047, RFC2822
- telegram: upload-slot `uploadDocumentCore` vs `handleSlotFileUpload` (~120 строк дубля), `sanitizeFileName`/`escapeHtml`
- фронт: `resolveParticipant` (×4 — useUnreadCount экспортирует, 3 хука пишут инлайн), accent-карты (×3: ReactionBadges/InboxChatItem/bubbleStyles)

## Типы / документация

- `gotchas.md` skip-list: `'email'` → `'email_internal'` (+ описать инверсию: email=легаси-исходящее, email_internal=входящее)
- комментарии про дедуп-индекс `uq_project_messages_telegram_dedup` (в syncTelegram*, webhook v1/v2) — оба индекса живы, но комменты путают; уточнить
- ledger/channels: `bot_version` «не используется» — НЕВЕРНО (используется в bindings/commands/sync/telegramBotToken)
- `email-internal-send`: слить `ThreadRow`+`ThreadRowExt`, убрать каскад `as`
- литеральные query-ключи в фабрику: `['project-thread-type']`, `['thread-members']`

## Не пилить (объективно)

MessageInput 662 (оркестратор, логика в 6 хуках), useMessengerAi/useChatSettingsActions/
useProjectThreads.mutations (оркестраторы/коллекции), upload-slot 875 (связная бот-логика).
htmlFormatting.ts — прочитан целиком, багов нет.

---

## План волнами

**Волна 1 — околонулевой риск:** B1, B4, B10, мёртвый код (resolveSessionParticipantId,
getValidGmailTokenForAccount, _userClient), doc-фиксы (gotchas skip-list, dedup-индекс,
bot_version). B5 (IDOR — security).

**Волна 2 — низкий риск, дедуп/типы:** B3 (created_at), B2 (album-lock), B7, B9+fetchAndStoreAvatar,
B8, stripHtml→_shared, blobToBase64 dedup, литеральные ключи в фабрику, accent-карты,
ThreadRow merge, mtproto humanError/SessionContext/findMtprotoThread.

**Волна 3 — средний риск (по согласованию):** B6 (FLOOD_WAIT helper), upload-slot D1 дедуп,
resolveParticipant унификация.

**Волна 4 — высокий риск / расследование:** F1 (v1/v2 дрейф), распил email-internal-send.

## Лог выполнения

### Волна 1 — околонулевой риск (2026-06-13)
- **B1** mtproto `commands.ts:242` — `mtproto_sessions` → `telegram_mtproto_sessions` (аватар-после-отправки). ✅
- **B4** `useUnreadCount` snapshot/restore — литералы `['inbox','threads'|'aggregates']` → `inboxKeys.threads()/aggregates()` (= `threads-v2`). Rollback mark-read теперь реально восстанавливает кэш. ✅
- **B5** `telegram-edit-message` IDOR — workspace резолвится из `project_messages.workspace_id` (NOT NULL у всех тредов), членство проверяется **всегда** (раньше — только при `project_id != NULL`). ✅
- **B10** `useSendMessage:254` — мёртвый тернарник `'web':'web'` → `'web'`. ✅
- **Мёртвый код**: `resolveSessionParticipantId` (mtproto inbox.ts), `getValidGmailTokenForAccount` (_shared/gmailToken.ts), `_userClient`+импорт `getUserClient` (wazzup-mark-read). ✅
- **Doc-фиксы**: gotchas skip-list `'email'`→`'email_internal'` (+`telegram_service`/`bot_event`, порядок веток из живого `dispatch_message_to_channels`); channels.md — v1 webhook НЕ удалять, `bot_version` активно используется (F1); комментарии дедуп-индексов в `syncTelegramIncomingMessage.ts` (cross-bot ловит content-индекс, не msg_id). ✅
- **Проверки**: фронт tsc+lint 0; mtproto `tsc --noEmit` 0; edge deno-check — 0 новых ошибок (pre-existing `npm:openai` type-resolution идентичен на HEAD).
- **Деплой**: ⏳ ждёт — edge (`telegram-edit-message`, `wazzup-mark-read`; `_shared/gmailToken` → redeploy gmail-send/webhook/watch-refresh/email-internal-send; `_shared/syncTelegramIncomingMessage` — comment-only, redeploy не обязателен) + mtproto rsync. Фронт — через push+CI.

### Волна 2 — низкий риск, баги + дедуп/типы (2026-06-13)
- **B3** `email-internal-send` — `created_at` добавлен в `.select()` И в интерфейс `MessageRow` (раньше `m.created_at` = undefined → анти-гонка двух писем подряд сломана, второе без In-Reply-To). ✅
- **B2** mtproto `incoming.ts` `withAlbumLock` — Map чистится по идентичности сохранённой цепочки (`chained`), раньше сравнение всегда ложно → утечка Map. ✅
- **B7** `media.ts` — `attachment_error` для `too_large` пишется only при отсутствии hard-fail'ов; раньше безусловно затирал download-детали. ✅
- **B8** `useToggleReaction` — `mutationFn` возвращает разрешённый pid (фоллбэк project→workspace), `onSuccess` шлёт mark-read по нему; раньше брал только prop → пропуск для owner-не-участника. ✅
- **B9** mtproto `/users/fetch-avatar` — success-путь стампит `avatar_fetched_at`. (Полный дедуп с `fetchAndStoreAvatar` НЕ делал: разные контракты `force`/TTL + void-return, а у эндпоинта НЕТ живых вызывающих — edge mtproto-функции его не зовут.) ✅
- **Дедуп/типы:** литералы query-ключей → фабрика (`projectThreadKeys.type/.members`); mtproto `SessionContext` ×3 → `handlers/types.ts`; `email-internal-send` `ThreadRow`+`ThreadRowExt` слиты (убран каскад `as unknown as`); `stripHtml` ×2 (wazzup-send + wazzup-send-reaction, байт-в-байт) → `_shared/channelText.ts#stripHtmlBasic`.
- **Сознательно НЕ сделал (объективно не нужно):** accent-карты (×3+ — параллельные context-specific Tailwind-карты, общие только ключи; значения разные → унификация = риск визуальных регрессий без выигрыша); mtproto `humanError` ×2 (контекстно-разные словари ошибок: send vs auth, общий только FLOOD_WAIT с РАЗНЫМ текстом); `findMtprotoThread` (не существует — ложный след); gmail-send `stripHtml` (отличается обработкой абзацев `</p><p>`→`\n\n`); `_shared/textProcessing#stripHtml` (list-aware, для KB — для канала изменил бы исходящий текст).
- **Проверки:** фронт tsc+lint+704 теста 0; mtproto `tsc --noEmit` 0; edge `channelText.ts` deno-check clean, остальные — 0 новых ошибок vs HEAD (openai-блокер идентичен).
- **Деплой ⏳:** + edge `wazzup-send`, `wazzup-send-reaction`, `email-internal-send`, `telegram-webhook-v2` (media.ts B7); mtproto rsync (B2/B9/SessionContext). Фронт — push/CI.

### Волна 3 — частично (2026-06-13)
- **B6** (FLOOD_WAIT → 429+Retry-After на всех mtproto-роутах) — ✅ сделан (хелпер `floodAwareError`, убран дубль в backfill). Cross-layer проверен: edge `!res.ok` обрабатывает 429 как 500, `failed` пишется в catch до ответа.
- **resolveParticipant унификация** — ⏸️ НЕ делал. Не тривиальный дедуп: `useSendMessage`/`useMessengerState` нужен ПОЛНЫЙ объект participant (name/role), остальным (`useToggleReaction`/`useUnreadCount`/`useMarkThreadReadIfFinal`/`useInboxMarkMutations`) — только id. Чистая унификация = два хелпера (`…Full`/`…Id`) в сервис-слой + правка ~6 карантинных хуков → большой смок-тест-фронт. Ждёт решения.
- **upload-slot D1** (~120 строк `uploadDocumentCore` vs `handleSlotFileUpload` в 875-строчном bot-файле) — ⏸️ НЕ делал. Самый рискованный дедуп зоны. Ждёт решения.

### Волна 4 — НЕ трогал (по плану)
- **F1** (дрейф v1↔v2 webhook) — расследование, НЕ удалять v1, НЕ дропать `bot_version`. Doc-предупреждения добавлены (channels.md).
- **email-internal-send** распил — высокий риск, отдельная задача.
