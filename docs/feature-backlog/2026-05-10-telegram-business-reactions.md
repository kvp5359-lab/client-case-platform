# Реакции для Telegram Business — эмуляция через reply-эмодзи

**Дата:** 2026-05-10
**Статус:** Backlog. Отдельная задача, не блокирует другие.
**Оценка:** 2-3 часа.

## Зачем

Telegram Bot API **не поддерживает реакции для Business-чатов** нативно:
- `setMessageReaction` не принимает `business_connection_id`.
- `message_reaction` update не приходит для 1-на-1 Business-чатов (Telegram требует
  бот-админа, а в личке админов нет).

Но Telegram-клиент при тапе на реакцию в Business-чате **отправляет её как
обычное сообщение** — короткий reply на исходное сообщение с эмодзи в content.
Это значит, что **на нашей стороне можно эмулировать реакции** в обе стороны.

## План

### 1. Приём реакции от клиента (webhook → детектор)

Когда приходит `business_message` с признаками реакции — конвертируем в
запись `message_reactions` вместо обычного сообщения в `project_messages`.

**Эвристика «это реакция»:**
- `source = 'telegram_business'`
- `reply_to_message_id` указывает на наше исходящее сообщение
- `content` состоит **только** из 1-3 emoji codepoint без любого другого текста

Если все условия — пишем в `message_reactions` (по модели уже существующей
для group/MTProto), а само сообщение **не вставляем** в `project_messages`.

**Где править:**
- `supabase/functions/_shared/syncTelegramIncomingMessage.ts` — детектор перед
  insert. Пример хелпера: `isEmojiOnlyReaction(text, replyToId)`.
- Утилита для определения «только эмодзи»: regex по Unicode-классам
  `\p{Extended_Pictographic}` (TS поддерживает с `u` флагом).

**Что НЕ ломаем:**
- Если клиент реально хочет «ответить только смайликом как сообщением» —
  редкий кейс, но возможный. Можно дать в UI кнопку «не реакция, обычное
  сообщение» в выпадающем меню, чтобы юзер мог сконвертировать обратно.
  Альтернатива: реакция остаётся реакцией, и тогда юзеру стоит написать
  эмодзи + любой текст рядом. На MVP — не делаем «обратное преобразование».

### 2. Отправка реакции от нас (UI → Edge Function)

Кнопка реакции в `MessageReactionsBar` уже существует для других каналов.
Для Business-сообщений нужно:
- В `messengerReactionService.ts` (фронт) для `source='telegram_business'`
  добавить ветку: вместо `telegram-set-reaction` шлём через
  **`telegram-business-send`** с `reply_parameters` и `text=<emoji>`.
- На стороне `telegram-business-send` дополнительно: ничего не меняем —
  эта функция уже умеет отправлять reply.
- Локально записываем в `message_reactions`, чтобы сразу нарисовать в UI
  у того же `participant_id = me`.

**Лимиты:**
- Один эмодзи на сообщение (Bot API не позволяет несколько в одной
  реакции — но мы шлём как сообщение, так что хоть 5 могли бы; ограничим
  одним для соответствия UX обычных реакций).
- Запрет на дубликат: если у юзера уже стоит реакция — клик на ту же
  снимает (удаляет соответствующее сообщение в Telegram + строку в
  `message_reactions`). Удаление через `deleteMessage` с
  `business_connection_id` (Bot API 7.x+).

### 3. UI

`MessageBubble` уже умеет рисовать реакции у parent-сообщения через
`message_reactions`. Никаких UI-изменений не нужно — данные просто
попадут в правильную таблицу.

## Что осознанно НЕ делаем

- Не ловим «удаление реакции от клиента» — клиент может убрать реакцию
  (`deleteMessage` своего эмодзи-сообщения), но Bot API нам это пришлёт
  как `deleted_business_messages` update. **Делать**: если удалённое
  сообщение по эвристике было реакцией — снимать строку в
  `message_reactions`. Это +30 минут к плану, можно сразу.
- Custom emoji (Premium-стикер-эмодзи): для Business только обычные
  unicode-эмодзи. Если клиент шлёт custom — детектор не срабатывает,
  и оно остаётся обычным сообщением. Принимаем.

## Чек-лист

- [ ] Хелпер `isEmojiOnlyReaction(text)` в `_shared/`
- [ ] В `syncTelegramIncomingMessage.ts` ветка для реакций (только при
      `source='telegram_business'` + reply на наше)
- [ ] Обработка `deleted_business_messages` → удаление из
      `message_reactions` если соответствует
- [ ] `messengerReactionService.toggleReactionByChannel` ветка для
      Business — отправка через `telegram-business-send` reply с эмодзи
- [ ] Локальная запись в `message_reactions` (optimistic update)
- [ ] Smoke-тест в проде: поставил реакцию у нас → клиент видит как
      эмодзи-сообщение; клиент нажал реакцию у себя → у нас реакция
      на parent-сообщении

## Связанные файлы

- `supabase/functions/_shared/syncTelegramIncomingMessage.ts`
- `supabase/functions/telegram-business-webhook/index.ts`
- `supabase/functions/telegram-business-send/index.ts`
- `src/services/api/messenger/messengerReactionService.ts`
- `src/components/messenger/MessageReactionsBar.tsx`
- `infrastructure.md` → секция «Telegram Business» → блок про реакции
  (обновить после реализации).
