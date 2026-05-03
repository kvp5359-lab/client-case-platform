# Telegram MTProto: канал готов end-to-end

**Дата:** 2026-05-03
**Тип:** feat
**Статус:** completed

---

## Контекст

В сервисе уже работали два «личных» Telegram-канала для сотрудника:
бот-секретарь в групповых чатах и Telegram Business (Premium-only,
бот-делегат в личных диалогах). Не покрывал кейс «обычный личный
Telegram сотрудника без Premium» — а именно через него идёт основная
переписка с клиентами у большинства команд. Решение — MTProto-сессия
сотрудника на нашем VPS-сервисе через `gramjs`. Сегодня закрыли весь
скоп до состояния, в котором сотрудник может включить интеграцию из
UI и пользоваться без оглядки на бота.

## Причина

До этого MTProto-канал был сделан только в части скелета (этапы 1-4
из исходного плана):

- Сервис на VPS поднят, сессия Жанны подключена через curl-вызовы.
- Триггер маршрутизировал текст в MTProto-ветку, но не файлы.
- Реакции, прочитанность, входящие медиа, UI подключения — отсутствовали.
- В UI таблички сидели плейсхолдеры: «(вложение)», `tg:34068591`
  вместо имени, никаких галочек прочитано/доставлено.

Без этих кусков канал нельзя выдавать пользователям — оставался
«внутренний прототип».

## Решение

### Авторизация и UI подключения

- Edge Function `telegram-mtproto-auth` — единый прокси с маршрутом
  `op` (send-code / verify-code / verify-password / disconnect /
  status). JWT обязателен; `user_id` всегда берётся из JWT (нельзя
  подключить чужую сессию даже зная чужой `user_id`).
- Объединили вкладку «Telegram Business» в **«Личный Telegram
  сотрудника»** с двумя табами:
  - **MTProto (любой аккаунт)** — телефон → код → опц. 2FA-пароль.
  - **Telegram Business (Premium)** — старый поток с делегатом-ботом.
- Кнопка «Подключить» появляется только в строке текущего юзера
  (защита от «админ привязал чужой телефон»).

### Исходящие сообщения и файлы

- Триггер `notify_telegram_on_new_message` пускает MTProto-ветку
  даже при `has_attachments=true`. Early-return по `has_attachments`
  оставлен для бот-каналов и Business — у них вложения отдаёт фронт.
- Сервис `/messages/send` принимает `has_attachments`, дёргает из
  Storage все вложения и шлёт через `client.sendFile`:
  - **1 файл** — обычный sendFile с caption.
  - **2+ файла** — `CustomFile` массив, gramjs соберёт альбом
    (`groupedId`), TG отрендерит одной карточкой.
- Гонка с фронтом (триггер срабатывает до того как все вложения
  попали в `message_attachments`) решена polling'ом «до стабилизации
  количества» — две подряд одинаковые цифры => считаем что фронт
  закончил.

### Входящие сообщения и файлы

- `incoming.ts` теперь распаковывает `msg.media` (Document /
  Photo), скачивает через `client.downloadMedia`, кладёт в Storage,
  инсёртит `message_attachments` — UI после реалтайма видит
  настоящее вложение, не плейсхолдер «(вложение)».
- Альбомы (`groupedId`): Telegram доставляет каждый файл альбома
  отдельным `updateNewMessage`. Чтобы получить **одну** карточку в
  сервисе вместо N штук, добавлено:
  - Колонка `project_messages.telegram_grouped_id BIGINT` + индекс.
  - In-process `albumLocks` Map<key, Promise> сериализует обработку
    `(threadId, groupedId)` — без него N конкурентных
    SELECT-then-INSERT создавали N дублей вместо склейки.
- Контакты-собеседники upsert'ятся в `participants` с ролью
  «Telegram-контакт» (имя/фамилия/avatar пробрасываются из
  Telegram-entity). Раздел «Telegram-контакты» подхватывает их
  автоматически, кнопка «Привязать к участнику» работает через
  существующий RPC `merge_telegram_contact`.

### Реакции

- **В TG из сервиса**: edge function `telegram-mtproto-react` (с
  JWT-проверкой), фронт `messengerReactionService` — третья ветка
  для `source = 'telegram_mtproto'`. Шлёт `messages.sendReaction`
  через MTProto — нативная реакция (иконка ❤️ под бабблом, не
  отдельное сообщение-эмодзи).
- **В сервис из TG**: ключевое открытие — Telegram **не** шлёт
  `UpdateMessageReactions` в личных чатах. Вместо этого реакция
  приходит как `UpdateEditMessage` с заполненным `msg.reactions`.
  `handleEdit` вычитывает реакции и пускает их через общий
  `processReactions`. Авторы реакций резолвятся в `participants` по
  `telegram_user_id` → UI показывает аватар, не «tg:42…» плейсхолдер.

### Прочитанность ✓✓ и индикаторы

- `TgDeliveryStatus` получил состояние `'read'`,
  `useTelegramDeliveryStatus` показывает его, когда у сообщения
  заполнен `recipient_read_at` (стампится в сервисе по
  `UpdateReadHistoryOutbox`).
- Условие показа индикатора расширено: раньше требовался
  `isTelegramLinked` (только групп-боты), теперь так же триггерится
  если у сообщения уже есть `telegram_message_id` — это покрывает
  MTProto и Business треды без добавления новых отдельных флагов.
- `BubbleTimestamp` показывает иконку «отправлено напрямую из
  Telegram» (`MessageSquareText`) для исходящих с `source =
  telegram_mtproto` или `telegram_business` — отличает «написано
  из сервиса» от «написано с телефона».

### Связанные правки

- `handleEdit` больше не затирает контент пустой строкой при
  edit-only-реакциях (раньше ставил `(вложение)` поверх «📎»).
- Секрет `INTERNAL_FUNCTION_SECRET` синхронизирован с тем, что
  ждёт VPS-сервис — раньше у нас было два разных значения и все
  вызовы из Edge → service отбивались 401-ми.

## Файлы

- `mtproto-service/src/routes/commands.ts` — `/messages/send` с
  альбомами, `fetchAttachments` со стабильным polling'ом.
- `mtproto-service/src/handlers/incoming.ts` — медиа-распаковка,
  `groupedId`-склейка, `albumLocks`, upsert participants для
  собеседников и сотрудников (sender_name теперь не NULL).
- `mtproto-service/src/handlers/raw.ts` — общий `processReactions`,
  edit-handler без затирания, реакции из `UpdateEditMessage.reactions`.
- `mtproto-service/src/handlers/inbox.ts` — `ensureClientParticipant`,
  `resolveSessionParticipant` (возвращает имя для sender_name).
- `supabase/functions/telegram-mtproto-react/index.ts` — реакция из UI.
- `supabase/functions/telegram-mtproto-auth/index.ts` — auth-flow
  прокси (новый файл).
- `src/page-components/workspace-settings/IntegrationsTab.tsx` —
  вкладка «Личный Telegram сотрудника» с двумя табами,
  MTProtoConnectDialog.
- `src/services/api/messenger/messengerService.types.ts` —
  `recipient_read_at`.
- `src/components/messenger/TelegramDeliveryIndicator.tsx`,
  `bubbleUtils.ts`, `BubbleTimestamp.tsx` — `'read'`-состояние,
  расширенное условие показа индикатора, MessageSquareText значок
  для MTProto/Business.
- Миграции: `20260503_notify_telegram_mtproto_branch.sql` (с
  обновлённым секретом), `20260503_project_messages_telegram_grouped_id`
  (telegram_grouped_id + индекс), `20260503_notify_telegram_mtproto_attachments`
  (триггер не делает early-return для MTProto при has_attachments).

## Почему так

**Объединили Business и MTProto в одну вкладку.** Они решают одну
задачу — «личный Telegram сотрудника, отвечать от своего имени». Но
имеют принципиально разные требования (Premium / без Premium) и
техническую базу (Bot API через делегат / клиентский MTProto). Тред
выглядит для пользователя одинаково — поэтому общая вкладка с двумя
техническими режимами правильнее, чем два разных раздела навигации.

**Lock на groupedId in-process, не через UNIQUE-индекс.** UNIQUE на
`(thread_id, telegram_grouped_id)` дал бы дубли-блокер на стороне
БД, но требовал retry-логики после 23505 в каждом конкурентном
обработчике. In-process Promise-lock проще и точнее — при
горизонтальном масштабировании сервиса (несколько инстансов) lock
работать не будет, но MTProto-сессия и так живёт в **одном** инстансе
(stateful gramjs-клиент), поэтому ограничение не релевантно.

**Polling до стабилизации, не фиксированный таймаут.** Альтернатива —
ждать N секунд после первого появления вложения, надеясь что фронт
успеет залить. Стабильность даёт точную нижнюю границу: как только
два опроса подряд показали одинаковое количество, мы знаем что фронт
закончил, и не платим лишнего ожидания.

**Реакции через UpdateEditMessage — особенность Telegram, не наша.**
Документация Telegram (и поведение MTProto в личных чатах) — реакции
доставляются как edit оригинального сообщения с обновлённым полем
`reactions`. UpdateMessageReactions приходит только для каналов /
групп. Соответственно `handleEdit` стал универсальной точкой входа
для реакционных событий в личке.

**Деплой**: edge functions `telegram-mtproto-react` и
`telegram-mtproto-auth` — стандартный `verify_jwt = true`. VPS-сервис
поднят на `mtproto.kvp-projects.com` за nginx + Let's Encrypt, контейнер
`clientcase-mtproto` в `relostart_web`-сети. Обновляется через
`docker compose up -d --build mtproto` на VPS — этот шаг сегодня делался
после каждой итерации, фронтовые правки уйдут на прод стандартным
blue/green pipeline'ом из `.github/workflows/deploy.yml`.
