# Склейка Telegram-альбома в один бабл + распознавание файлов, перетащенных из чата

**Дата:** 2026-07-12
**Тип:** feat + fix (мессенджер: приём/фронт; документы: импорт вложений)
**Статус:** деплой (push в main → CI/CD blue/green)

---

Две независимые задачи одной сессии. Диагностика велась замерами (данные прода /
консоль), а не по чтению кода.

## 1. Склейка Telegram-альбома в один бабл (feat)

**Симптом.** Клиент шлёт альбом (несколько файлов/картинок одним сообщением) в
TG-группу → в ЛК каждый файл отдельным баблом. В MTProto-диалоге тот же альбом —
один бабл.

**Причина (по коду, 3 картографа + замер).** Фронт одинаков для всех каналов:
**1 бабл = 1 запись `project_messages`**, все её вложения рисуются внутри. Разница
на ПРИЁМЕ: MTProto склеивает альбом в 1 запись через `telegram_grouped_id`
(+ мьютекс), а групповой бот `media_group_id` **игнорировал** → N update = N
записей. Причина расхождения — среда: MTProto постоянный процесс (мьютекс
надёжен), бот — stateless Deno edge (мьютекс в памяти не работает).

**Замер `media_group_id` (в проде).** Приходит и для документов, непустой;
одинаков у всех файлов альбома; `(sender, date)` одинаковы и бот-независимы (на
них держится кросс-бот дедуп); каст строки→`bigint` работает.

**Решение — склейка на ФРОНТЕ, не в приёме.** Приём — самая опасная зона (5 багов
дублей/потери файлов); кросс-бот дедуп уже отдаёт N чистых строк с общим
`grouped_id`. Поэтому приём трогаем минимально (только пишем `grouped_id`), а N
записей визуально склеиваем в один бабл. Ключ склейки — бот-независимые
`(telegram_sender_user_id, telegram_message_date)` + флаг
`telegram_grouped_id IS NOT NULL` («это альбом»), БЕЗ сравнения значения
`grouped_id` (устойчивость к multi-bot, где значение у ботов может различаться).

**Реализация:**
- Приём (`_shared/syncTelegramIncomingMessage.ts`) — пишет
  `telegram_grouped_id = media_group_id` в INSERT (общий хелпер → покрывает и
  Business при его редеплое).
- Фронт — чистая `mergeAlbumMessages` (`src/components/messenger/`): соседние
  строки одного альбома → 1 синтетическая запись (attachments/reactions/
  telegram_message_ids concat, caption = первый непустой, attachment_status =
  худший). Исходные объекты кэша НЕ мутируются. Подключена в `MessageList` в
  существующий `useMemo` (после дедупа оптимистиков) → весь список (timeline,
  `messages[i-1]`, скролл) консистентно видит слитый массив. MTProto (1 запись) →
  no-op; Wazzup (grouped=NULL) → не трогается.
- Миграция `20260712230000_project_messages_telegram_grouped_id.sql` — фиксирует
  дрейф колонки (была в проде вне миграций).

**Известные краевые ограничения** (задокументированы, основной сценарий не задет):
удаление ВСЕГО альбома-бабла снесёт только первый файл (удаление отдельного файла
через меню вложения — работает); reply/jump на не-первый файл альбома не сработает;
двойной счётчик реакции при реакции на несколько файлов одним эмодзи.

## 2. Распознавание/открытие файлов, перетащенных из чата без `file_id` (fix)

**Симптом.** Файл, перетащенный из **личного диалога** в «Документы», не
распознавался (кнопка «Просмотреть содержимое» неактивна), позже — не
открывался/не объединялся в PDF.

**Причина (замер по конкретному файлу).** Вложения из MTProto хранятся в бакете
`message-attachments` **без `file_id`** (только `storage_path`). Резолверы
документов при `file_id=null` уходят в бакет `document-files` и файла не находят
(`text_content` пустой, download → «Object not found»). Обычная загрузка всегда
создаёт `files`-строку с верным бакетом, поэтому у неё работает.

**Решение.** Единый хелпер `createDocumentFromAttachment` (`documentService.ts`):
при `file_id=null` создаёт/переиспользует `files`-строку с реальным бакетом
вложения (`message-attachments`, `UNIQUE(bucket, storage_path)` → SELECT-then-
INSERT), приводя документ к виду обычной загрузки — чинит разом извлечение текста,
открытие, скачивание, merge. Оба пути импорта вложения в документы (drag из чата
`useMessengerAttachmentDrop` и «Добавить в проект» `AddToProjectDialog`) переведены
на хелпер — устранён дубль, из-за которого второй путь оставался сломанным.

**Заметка по merge на локалке.** Отдельная ошибка объединения PDF на локалке
оказалась неполным `NEXT_PUBLIC_STORAGE_R2_BUCKETS` в `.env.local` (только `files`,
а `document-files`/`message-attachments` тоже на R2). На проде список полный —
merge там работает. Правка `.env.local` не коммитится.

## Проверки

- tsc 0, eslint 0 по всем изменённым файлам.
- Тесты: `mergeAlbumMessages` (7 кейсов), `createDocumentFromAttachment` (5 кейсов,
  ветка `file_id=null`). Полный прогон зелёный.
- Приём альбома проверен замером в проде (grouped_id пишется, приём не сломан);
  распознавание drag подтверждено вживую (OCR извлёк текст).

## Затронутые файлы

Склейка альбома (коммит `03918dda`):
`supabase/functions/_shared/syncTelegramIncomingMessage.ts`,
`src/components/messenger/mergeAlbumMessages.ts` (+тест),
`src/components/messenger/MessageList.tsx`,
`src/services/api/messenger/messengerService.types.ts`,
`supabase/migrations/20260712230000_project_messages_telegram_grouped_id.sql`.

Распознавание drag (коммит `28b3fc03`):
`src/services/documents/documentService.ts` (+ `createDocumentFromAttachment.test.ts`),
`src/components/documents/Documents/hooks/useMessengerAttachmentDrop.ts`,
`src/components/messenger/AddToProjectDialog.tsx`.
