# Split text+files, реакции на альбом, единый баббл в TG и полный аудит

**Дата:** 2026-04-22
**Тип:** audit + feat + fix + refactor
**Статус:** completed

---

## Контекст

Сессия началась как полный аудит кода по зонам из [`refactoring.md`](../../.claude/rules/refactoring.md). В процессе выяснилось, что баг-лог (`docs/bugs/open/`) содержит давнюю проблему с реакциями на media group в Telegram, а ещё есть хронический диссонанс между тем, как сообщение «текст + файлы» выглядит в ЛК и в TG. По ходу починки реакций случилась регрессия — текст вообще перестал уходить в TG — и это раскопало цепочку дополнительных проблем с деплоем edge-функций и секретами. В итоге пачка изменений разрослась до крупного пакета правок мессенджера.

Ниже по блокам.

---

## 1. Аудит проекта по 10 зонам

Проведён полный аудит по зонам из `refactoring.md`. Делегирован 7 субагентам параллельно (безопасность/RLS, БД/миграции, типы, React Query, Zustand, компоненты, роутинг/тесты, сборка, документация).

**Найдено и починено:**
- 🔴 **RLS на `boards`, `board_members`, `board_lists`** — таблицы были без `ENABLE ROW LEVEL SECURITY`, хотя политики существовали. Любой авторизованный пользователь мог читать/писать чужие доски. Миграция: [`20260421_enable_rls_boards.sql`](../../supabase/migrations/20260421_enable_rls_boards.sql).
- 🟠 Вынесен `isClientOnly` в [`useWorkspacePermissions`](../../src/hooks/permissions/useWorkspacePermissions.ts) — 4 места с ручным `userRoles.every(... === CLIENT)` заменены на одно поле.
- 🟡 **PanelTabs** a11y: `role="tablist"` / `role="tab"` / `aria-selected` / `aria-controls`.
- 🟡 **TagFilterBar**: кнопка удаления тега видна на touch (`[@media(hover:none)]:flex`) + `aria-label`.
- 🟡 **AppSettingsSection**: нативные `<select>` заменены на shadcn `<Select>`.
- 🟡 **MessengerPanelContent**: убран `as`-каст `legacy_channel`, заменён на рантайм-сравнение.

Без изменений (ложные тревоги субагентов или out of scope): `gcTime` в `useProjectHeaderParticipants`, `noExplicitAny` (уже `warn` в ESLint), `sidebar.tsx` — shadcn-примитив.

## 2. Разбиение больших файлов

**[`ProjectsPage.tsx`](../../src/page-components/ProjectsPage.tsx): 655 → 267 строк.**
Вынесены:
- [`hooks/useProjectsPageData.ts`](../../src/page-components/ProjectsPage/hooks/useProjectsPageData.ts) — queries + mutations (`useProjectsQuery`, `useProjectTemplatesQuery`, `useProjectParticipantsQuery`, `useProjectsPageMutations`).
- [`components/ProjectRow.tsx`](../../src/page-components/ProjectsPage/components/ProjectRow.tsx) — одна строка списка.
- [`components/ProjectsPageControls.tsx`](../../src/page-components/ProjectsPage/components/ProjectsPageControls.tsx) — строка управления (пресет + поиск + создать).

**[`AiChatInput.tsx`](../../src/components/ai-panel/AiChatInput.tsx): 430 → 189 строк.**
- [`hooks/useChatFileDrop.ts`](../../src/components/ai-panel/hooks/useChatFileDrop.ts) — drag-and-drop + валидация файла.
- [`components/ChatScopePicker.tsx`](../../src/components/ai-panel/components/ChatScopePicker.tsx) — popover выбора скоупа чатов.
- [`components/SourceToggles.tsx`](../../src/components/ai-panel/components/SourceToggles.tsx) — чипы «Анкеты/Документы» + БЗ.
- [`components/AttachedDocumentsBadges.tsx`](../../src/components/ai-panel/components/AttachedDocumentsBadges.tsx) — бейджи прикреплённых файлов.

**[`MessageInput.tsx`](../../src/components/messenger/MessageInput.tsx): 423 → 363 строки.**
- [`hooks/useTaskStatusPending.ts`](../../src/components/messenger/hooks/useTaskStatusPending.ts) — Планфикс-стиль переключателя статуса задачи (localStorage + mutation).
- [`hooks/useQuoteInsertion.ts`](../../src/components/messenger/hooks/useQuoteInsertion.ts) — вставка blockquote в редактор.

## 3. Реакции на Telegram media group + infrastructure-грабли

Открытый баг [`2026-04-10-telegram-reactions-media-group`](../bugs/resolved/2026-04-10-telegram-reactions-media-group.md): клиент ставит реакцию в TG на файл из media group — у нас в чате всплывает «паразитное» текстовое сообщение с эмодзи вместо реакции под сообщением.

### Корневая причина
Одна запись в `project_messages` соответствует **нескольким** TG-сообщениям (текст + каждый файл = отдельный message_id в Telegram). Webhook искал источник реакции по единственной колонке `telegram_message_id` — и не находил для 2-го+ элемента media group. Срабатывал fallback, который записывал реакцию как новое project_messages с `content = emoji`.

### Вариант B (выбранный)
1. **Миграция** [`20260421_telegram_message_ids_array.sql`](../../supabase/migrations/20260421_telegram_message_ids_array.sql) — колонка `telegram_message_ids bigint[]` + GIN-индекс + бэкфилл из `telegram_message_id`.
2. **Миграция** [`20260421_sync_telegram_message_ids_trigger.sql`](../../supabase/migrations/20260421_sync_telegram_message_ids_trigger.sql) — BEFORE INSERT/UPDATE trigger автоматически кладёт `telegram_message_id` в массив. Это избавляет edge-функции от необходимости вручную обновлять массив.
3. **Миграция** [`20260421_append_telegram_message_id_rpc.sql`](../../supabase/migrations/20260421_append_telegram_message_id_rpc.sql) — RPC `append_telegram_message_id(uuid, bigint, bigint)` для безопасного дописывания id всех элементов media group / всех документов.
4. **`telegram-send-message`** — после каждого успешного `sendMediaGroup` / `sendDocument` вызывает RPC, чтобы сохранить **все** TG-id в массив.
5. **`telegram-webhook` и `telegram-webhook-v2`** — `handleReaction` ищет исходник через `.contains('telegram_message_ids', [msgId])`. Fallback, создававший паразитные сообщения, удалён.
6. Миграция [`20260421_reactions_track_tg_source_message.sql`](../../supabase/migrations/20260421_reactions_track_tg_source_message.sql) + webhooks — добавлена колонка `message_reactions.telegram_source_message_id`. Раньше при реакции на один элемент бабла (например, файл) мы стирали **все** реакции юзера на общий `project_messages.id` — и реакция на текст затиралась реакцией на файл. Теперь delete scoped по source-id, реакции на разные части бабла не перезаписываются.
7. Паразитные сообщения с эмодзи за период 10.03–21.04 (25 шт.) удалены SQL-ом.

### Грабли с деплоем (описаны в infrastructure.md)
В процессе починки регрессировала отправка текста в TG. Ушло много времени на диагностику — причин было **две**:
- `supabase functions deploy` по умолчанию ставит `verify_jwt = true`. Шлюз Supabase отбивал запросы триггера БД (`net.http_post` без Authorization-заголовка) с `UNAUTHORIZED_NO_AUTH_HEADER` — наш код вообще не запускался. Решение: всегда деплоить `telegram-send-message`, `telegram-webhook`, `telegram-webhook-v2` с флагом `--no-verify-jwt`.
- `INTERNAL_FUNCTION_SECRET` в runtime функции оказался рассинхронизирован с vault. `supabase secrets list` показывал правильное значение, но функция его не видела. Принудительный `supabase secrets set KEY=value` оживил его.

Обе ловушки зафиксированы в [`.claude/rules/infrastructure.md`](../../.claude/rules/infrastructure.md) — чтобы будущий Claude (или я через неделю) не наступал повторно.

Для ускорения диагностики будущих провалов добавлена колонка [`project_messages.telegram_error_detail`](../../supabase/migrations/20260422_project_messages_tg_error_detail.sql) — edge-функция пишет туда ответ Telegram API (или sentinel вроде `"no attachments found"`), чтобы root-cause доставался SQL-запросом, не требуя доступа к log-стриму.

## 4. Один баббл в TG вместо трёх

До: «текст + 2 PDF» из ЛК превращался в три отдельных TG-сообщения — текст, файл, файл.

### Шаги
1. **`sendMediaGroup(type=document)`** для 2+ документов. До этого фотки уходили альбомом, а документы — последовательными `sendDocument`. Теперь 2+ PDF/docx/xlsx уходят одним альбомом в TG. Сохранена поддержка chunk'ов по 10.
2. **Текст как caption первого файла** — при одном сообщении с текстом и ≤1024 char caption.
3. **Триггер БД пропускает отправку текста, если `has_attachments = true`** — иначе триггер отправлял бы текст отдельным sendMessage, а потом edge-функция ещё раз через caption → дубль.
4. **Текст сверху отдельным сообщением при 2+ файлах** — Telegram рендерит caption альбома документов «между» первым и вторым файлом, что визуально ломает порядок. Поэтому edge-функция проверяет количество вложений: если 2+ — шлёт текст через sendMessage перед альбомом (как в десктопном TG); если 1 — оставляет caption.

Теперь «текст + 2–3 PDF» в TG выглядит как два сообщения: текст сверху, альбом снизу.

## 5. Split text + files на две записи в БД

После того как TG-структура стала «2 сообщения», захотелось, чтобы и в ЛК было естественно: реакции и статусы доставки каждого элемента — отдельные.

### Решение
Фронтовая функция [`sendMessage`](../../src/services/api/messenger/messengerService.ts) при `hasText && attachments.length >= 2` пишет **две** строки в `project_messages`:
1. Текстовую — `content = <text>`, `has_attachments = false`, `reply_to_message_id = <reply>`.
2. Файловую — `content = '📎'` (placeholder; пустую строку БД не принимает — `CHECK (char_length(content) > 0)`), `has_attachments = true`, `reply_to_message_id = null`.

Теперь каждый баббл независим: свои реакции, свой `telegram_message_id`, свой статус доставки (`telegram_attachments_delivered`), свой ретрай. Логика кнопки «Повторить отправку» уже завязана на один `project_messages.id`, поэтому работает без изменений.

### Optimistic рендер обоих бабблов сразу
`sendMessage` возвращает `ProjectMessage[]` (массив из 1 или 2 строк). `useSendMessage` в `onMutate` создаёт столько же оптимистичных бабблов, в `onSuccess` заменяет их на реальные — по порядку (text первый, files второй). Дедупликация вставок: если realtime успел добавить реальную запись до `onSuccess`, её id фильтруется перед append, чтобы не ловить React duplicate-key warning.

### Ключевые кейсы
- **Текст + 1 файл** → одна запись в БД + один баббл в TG (текст как caption файла).
- **Текст + 2+ файлов** → две записи в БД + два баббла в TG (как у всех нормальных TG-клиентов).
- **Только файлы без текста** → одна запись, content = `📎` (placeholder, который UI и edge-функция уже умеют скрывать/не-принимать-за-caption). Проверку `hasText` пришлось уточнить: она раньше считала `📎` за настоящий текст и пыталась сделать split на пустом месте.

## 6. UI-полировка баббла с файлами

После split'а выяснилось, что вид файлового баббла с реакцией — неаккуратный: большой отступ между последним файлом и бейджем реакции, плюс время «00:30 ✓» оказывалось отдельной строкой.

Итеративно пришли к стабильной схеме:
- **Без реакций** — `pb-6`, время absolute в нижнем правом углу. Плотно под последним файлом.
- **С реакциями** — `pb-8`, время там же (absolute bottom-right), реакции absolute bottom-left. Время и реакции на одной строке внизу, как у текстовых бабблов.
- **Позиция времени стабильна** независимо от наличия реакций — бейдж просто дополняет композицию слева.

## Архитектурные моменты

- **Триггер БД как «клей» между старой колонкой и массивом.** `sync_telegram_message_ids` — BEFORE INSERT/UPDATE триггер, который автоматически добавляет `telegram_message_id` в `telegram_message_ids`. Это позволяет менять edge-функции, не синхронизируя массив руками в каждом update-sail, и не зависит от того, кто именно пишет в колонку — триггер из postgres, edge-функция, скрипт миграции. Минус: состояние массива завязано на скалярное поле — если кто-то удалит только скалярное поле в обход триггера, массив останется. В нашем домене такого не случается.
- **`CHECK (char_length(content) > 0)` на `project_messages`.** В проекте давно живёт этот чек, и когда мы захотели писать «пустой текст = только файлы», пришлось использовать `📎` как sentinel. `📎` уже был эмодзи-маркером для attachment-only в MessageBubble и edge-функции — мы просто встроились в существующий контракт, а не стали расширять схему.
- **Split при отправке vs. единая запись.** Первое решение (до сессии) — одна запись в БД, «текст + файлы» как один visual unit. После того, как в TG это почти всегда визуально два баббла, а реакции ставятся на них независимо — стало проще сломать модель на две записи при insert'е, чем натягивать абстракцию «одна запись, два слоя реакций» на UI. Упростили ценой удвоения записей в БД для случая «текст + 2+ файла» — для этого кейса это честно отражает физику.
- **`--no-verify-jwt` как обязательное правило для функций, вызываемых из postgres-триггеров.** CLI Supabase ведёт себя так, что безопасный дефолт `verify_jwt = true` на самом деле ломает legitimate internal-вызов без Authorization-заголовка. Обязательство зафиксировано в infrastructure.md, чтобы следующий деплой этих функций не откатил поведение.
- **Диагностическая колонка `telegram_error_detail`.** Без доступа к log-стриму edge-функций невозможно было понять, почему конкретный sendMediaGroup провалился — `net._http_response` хранит только данные от postgres-триггеров, а frontend-инициированные вызовы туда не попадают. Вместо построения отдельной системы логов записываем причину прямо в строку сообщения — это чинится одним SQL `SELECT id, telegram_error_detail FROM project_messages WHERE telegram_attachments_delivered = false`.
