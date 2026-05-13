---
id: 2026-05-13-telegram-multibot-message-duplicates
title: Сообщения клиента в Telegram-группе дублируются 2-3 раза в треде
status: resolved
severity: high
area: telegram-webhook, project_messages, rls
first-seen: 2026-05-02 (с появлением employee-ботов в воркспейсах)
last-investigated: 2026-05-13
resolved: 2026-05-13
resolution: новый UNIQUE-индекс на `(chat_id, sender_user_id, date, md5(content))` для дедупа между ботами
reproduced: yes
---

## Решение (2026-05-13)

Миграция `20260513090031_project_messages_dedupe_across_bots.sql` — добавляет
`UNIQUE INDEX uq_project_messages_telegram_content_dedup` по
`(telegram_chat_id, telegram_sender_user_id, telegram_message_date, md5(content))`
с `WHERE source = 'telegram'`. Первый webhook успешно записывает входящее
сообщение, остальные получают 23505 (unique violation) и существующий код в
`_shared/syncTelegramIncomingMessage.ts` возвращает `outcome='duplicate'`.

Дополнительно подчистил 6 существующих дублей в треде «Клиенты» проекта
«Анаит Дарбинян» (оставил каноничные копии от workspace_bot, удалил
дополнительные от employee_bot'ов).

## Симптомы

Когда клиент пишет сообщение в Telegram-группе, у которой в воркспейсе
несколько ботов (workspace_bot + employee_bot'ы для имитации сотрудников),
у нас в треде сервиса появляется 2-3 одинаковых копии этого сообщения.

Пример: тред «Клиенты» проекта «БП - Анаит Дарбинян» 2026-05-13 в 08:33 — клиент
написала «4. Цена ноута когда я покупала где то 900 евро», а в сервисе
отобразилось 3 копии этого сообщения подряд.

## Как воспроизвести

1. Создать в воркспейсе несколько telegram-ботов: один `telegram_workspace_bot`
   и один или несколько `telegram_employee_bot` (по 1 на сотрудника).
2. Добавить ВСЕХ ботов в одну Telegram-группу с клиентом.
3. Клиент пишет одно сообщение.
4. В сервисе появляется по копии на каждого бота.

## Корень бага

**Telegram Bot API при наличии нескольких ботов в одной группе с включённым
privacy mode присваивает каждому боту СВОЙ message_id для одного и того же
сообщения** — у каждого бота свой локальный счётчик. Например, для одного
сообщения клиента три бота получают webhook'и с message_id = 179 (бот A),
321 (бот B), 546 (бот C). chat_id у всех ботов одинаковый.

Существующий `UNIQUE INDEX uq_telegram_message_per_chat ON (telegram_chat_id,
telegram_message_id) WHERE source='telegram'` рассчитан на дедуп
**повторных доставок одного webhook'а** (retry от Telegram при HTTP 500).
Между ботами он не дедупит — message_id у них разные.

В результате каждый webhook успешно вставляет свою копию.

## Расследование

1. Найдены 9 строк в `project_messages` за час: 3 группы по 3 копии одного
   текста. Каждая копия с уникальным `telegram_message_id`, одинаковым
   `telegram_chat_id`, одинаковым `telegram_sender_user_id`, одинаковым
   `telegram_message_date`.
2. У копий разный `telegram_bot_integration_id` — три разных бота:
   `relostart102_bot`, `relostart123_bot`, и workspace_bot (null).
3. Сгруппировка по integration_id показала, что у каждого бота **свой
   последовательный диапазон message_id** в одном чате:
   - relostart102_bot: 179, 180, 181
   - relostart123_bot: 320..326
   - workspace_bot: 546, 547, 548
4. Эти диапазоны не пересекаются и идут последовательно для каждого бота —
   значит у каждого бота свой счётчик message_id в Telegram. Это
   подтверждает гипотезу о per-bot privacy-mode-счётчиках.
5. Echo-гипотеза (триггер `notify_telegram_on_new_message` шлёт обратно)
   отвергнута: триггер уже содержит `'telegram'` в skip-листе, и timing
   между копиями (30 мс) короче, чем echo-цикл (~1 сек).

## Альтернативы, которые рассматривали

**A. Запретить employee_bot'ам обрабатывать сообщения в группах** (фильтр
в webhook v1 как в v2). Отброшено: в БД 13 чатов с 118 сообщениями, где
employee_bot — единственный источник (workspace_bot не подключён). Такой
фильтр поломал бы все эти чаты.

**B. Дополнительный UNIQUE по content+sender+date** (выбранное решение).
Один любой бот успевает записать первым, остальные дедупятся на БД.

**C. Изменить существующий UNIQUE, убрав message_id из ключа**. Отброшено
как более рисковое — много кода может зависеть от текущего ключа дедупа.

## Зона поражения

- Все воркспейсы, где в одной Telegram-группе с клиентом сидят несколько
  ботов (workspace + employee, или несколько employee).
- Симптом: 2-3 одинаковых сообщения подряд в треде сервиса.
- Outgoing-сообщения (`source='web'`) **не задеты** — они отправляются
  через `telegram-send-message` и записываются один раз.

## Профилактика

В `.claude/rules/infrastructure.md` (раздел «Telegram (групповой бот)»)
добавлено правило: при добавлении новых типов Telegram-интеграций
(`telegram_*_bot`), которые слушают одни и те же группы, **обязательно**
полагаться на UNIQUE `uq_project_messages_telegram_content_dedup` для
дедупа между ботами. Не предполагать, что message_id один на сообщение —
это верно только для одного бота.
