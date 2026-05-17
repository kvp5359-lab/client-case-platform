# Ротация INTERNAL_FUNCTION_SECRET, паритет email-треда с доски, карантин мессенджер-кода

**Дата:** 2026-05-17
**Тип:** security (critical) + fix (high × 4) + docs (refactoring-rule)
**Статус:** completed

---

## Контекст

Одна сессия — два слабо связанных сюжета, но оба про мессенджер:

1. **Утечка `INTERNAL_FUNCTION_SECRET`.** При аудите карантинной зоны (мессенджер) обнаружено, что значение секрета, которым БД-триггер авторизуется в edge functions, **захардкожено в нескольких SQL-миграциях**, закоммиченных в публичный GitHub. Любой человек в интернете мог скопировать его и слать сообщения от имени сотрудников в Telegram/Wazzup/Email клиентам. Бонусом — обнаружено что env-секрет в Supabase и значение в триггерах БД **не совпадали** (12 ответов 401 в `net._http_response` за сутки от mtproto/business путей).

2. **Email-тред с доски — неполный паритет с шаблоном.** При создании email из колонки доски письмо не отправлялось, в редакторе после создания вкладка показывалась как «Чат», а сам тред не виден в «Мои задачи». Email из шаблона задачи работал корректно — две точки создания шли разными ветками кода с разными наборами полей.

3. **Карантинная зона.** Каждый предыдущий «полный аудит» / «рефакторинг» ломал переписку с клиентами (RLS на `project_threads_select` — 3 регрессии, дедуп TG-сообщений, отправка из триггера). Нужно зафиксировать правило: при общем рефакторинге не трогать мессенджер-код, только по явному запросу.

## Сюжет 1: ротация секрета

### Что нашли

Поиск по миграциям выявил три разных значения `x-internal-secret`, закоммиченных в репо:

- `c62e08...` — старое, в [`20260418_notify_telegram_skip_bot_event.sql`](../../supabase/migrations/20260418_notify_telegram_skip_bot_event.sql) и `retry_undelivered_telegram_messages` в БД.
- `097e79...` — актуальное (на момент аудита) значение, использовалось в 10 файлах миграций и в **трёх функциях БД** (`dispatch_send_http`, `notify_google_calendar_mirror`, `convert_external_event_to_task`) и одном **cron-job** (`google-calendar-sync`).
- `97dcdc...` — то, что лежало в Supabase env (`INTERNAL_FUNCTION_SECRET`). **Не совпадало** ни с одним значением в БД, поэтому половина исходящих писем/реакций отбивалась 401 — а пользователи об этом не знали, потому что фронт лог 401 не показывает (письмо вроде «отправилось» в UI, а до Resend не доходило).

Репозиторий [kvp5359-lab/client-case-platform](https://github.com/kvp5359-lab/client-case-platform) **публичный** — секрет был доступен любому.

### Как починили

1. Сгенерирован новый секрет `ad0fe058...` (32 байта hex).
2. `supabase secrets set INTERNAL_FUNCTION_SECRET=...` — обновлено в Supabase env.
3. Четыре функции в БД (`dispatch_send_http`, `notify_google_calendar_mirror`, `convert_external_event_to_task`, `retry_undelivered_telegram_messages`) перезаписаны через `CREATE OR REPLACE FUNCTION` напрямую через MCP. **Значение в миграции не сохранилось** — теперь это эфемерное состояние, видимое только внутри БД.
4. Cron-job `google-calendar-sync` обновлён через `cron.alter_job`.
5. На VPS пересоздан контейнер `clientcase-mtproto` (одна `docker restart` не перечитывает `.env` — env-переменные привязаны к контейнеру при создании; пришлось `docker compose up -d --force-recreate mtproto`).
6. **`telegram-mtproto-send`** передеплоен — edge functions кэшировали старое значение env, пока не было нового деплоя. Остальные edge functions подхватили на следующем cold start.
7. Все 10 файлов миграций санитизированы: реальные значения заменены на плейсхолдер `__INTERNAL_FUNCTION_SECRET__`. Чистый разворот проекта с нуля без знания актуального значения теперь не запустит триггер.

### Что осталось известным

- **Старые значения в git history.** Они отозваны (новый секрет нигде с ними не совпадает), но если параноить — `git filter-repo` + force-push. Решили не делать: для security-rotation достаточно отзыва.
- **Runbook первого деплоя.** Если разворачиваем проект на новой БД с нуля — миграция накатит плейсхолдер, триггер не сработает. После накатки миграций нужно вручную `ALTER FUNCTION` или `UPDATE pg_proc` с реальным значением из env. Это правильное поведение (защита от утечки), но требует процесса. Пока в `infrastructure.md` не описано.

## Сюжет 2: email-тред с доски

### Что было

Кнопка «Создать» в колонке доски → выбор «Email» → заполнить получателя + текст + «Создать и отправить»:

1. **Письмо не отправлялось.** [`BoardListCard.tsx`](../../src/components/boards/BoardListCard.tsx) в `onSuccess` после создания треда просто закрывал диалог. А вся логика «положить первое сообщение в `pendingInitialMessage` → мессенджер при открытии треда отправит через БД-триггер» жила только в [`TaskListView.tsx`](../../src/components/tasks/TaskListView.tsx).
2. **В редакторе треда вкладка показывалась как «Чат», не «Email».** [`useChatSettingsFormState.ts`](../../src/components/messenger/hooks/useChatSettingsFormState.ts) при открытии существующего треда делал бинарную проверку `chat.type === 'task' ? 'task' : 'chat'` — кейс `email` падал в default.
3. **Email-тред не виден в «Мои задачи».** Дедлайн и исполнители выставлены в диалоге, но при создании из «email-ветки» в [`useChatSettingsSave.ts`](../../src/components/messenger/hooks/useChatSettingsSave.ts) эти поля **не передавались** — только `contactEmails`, `emailSubject`, `accessType` и каналы. В отличие от «task-ветки», где передавалось всё.
4. **Тред создавался без `owner_user_id`**, и RPC `get_workspace_threads` не отдавал его пользователю. RPC требует либо `project_id` (для тредов в проекте), либо `owner_user_id = p_user_id` (для личных). Если нет ни того ни другого — тред «бесхозный» и не показывается даже создателю.

### Что сделано

**Извлечён хук** [`useQueueThreadInitialMessage`](../../src/components/tasks/useQueueThreadInitialMessage.ts) — общая для обоих мест логика постановки первого сообщения в очередь `pendingInitialMessage`. Открытие треда в панели остаётся на стороне страницы (у TaskListView и BoardListCard разные стратегии). Это первый камень «декомпиляции» обоих flow.

**[`useChatSettingsSave.ts`](../../src/components/messenger/hooks/useChatSettingsSave.ts)** — в «chat/email-ветке» теперь передаются `deadline`, `startAt/endAt`, `statusId`, `assigneeIds`. Для чисто чат-тредов БД эти поля игнорирует (триггер их не записывает в `task_assignees`), но передавать безопасно. Для email — теперь полный паритет с шаблоном-задачей.

**[`useChatSettingsFormState.ts`](../../src/components/messenger/hooks/useChatSettingsFormState.ts)** — при открытии треда тип конвертится в три варианта: `task` / `email` / `chat`.

**[`useProjectThreads.mutations.ts`](../../src/hooks/messenger/useProjectThreads.mutations.ts)** — при создании треда **без `project_id`** автоматически проставляется `owner_user_id = current user.id`. Это закрывает кейс «личный email», «личный чат», «задача без проекта с доски» — все будут видны создателю через `get_workspace_threads`. На существующий поток создания личных диалогов (TG Business / Wazzup / MTProto) не влияет — там `owner_user_id` уже выставлялся явно в webhook'ах.

**Backfill в БД** — `UPDATE project_threads SET owner_user_id = created_by WHERE project_id IS NULL AND owner_user_id IS NULL AND created_by IS NOT NULL AND is_deleted = false` — 15 уже существующих «бесхозных» тредов получили владельца. Без этого старые тестовые задачи и письма так и висели бы в подвешенном состоянии.

### Бонус-фикс

Заодно отрефакторен [`useCreateThread`](../../src/hooks/messenger/useProjectThreads.mutations.ts): `supabase.auth.getUser()` вызывался два раза в разных ветках; теперь вызывается один раз сверху, и `currentUser` переиспользуется и для `emailSendAccountId`, и для `ownerUserId`. Логики не меняет, читается чище.

## Сюжет 3: карантинная зона в правилах рефакторинга

История регрессий мессенджера:

- 2026-04-26 — RLS `project_threads_select` сломана рефакторингом, INSERT...RETURNING упал у всех клиентов.
- 2026-05-10 — та же RLS сломана **ещё раз** при добавлении личных диалогов.
- 2026-05-13 — сломан дедуп TG-сообщений при добавлении второго бота в группу.
- Регулярные «оптимизации» общих хелперов в `supabase/functions/_shared/` ломали отправку.

Паттерн: код мессенджера держится на неявных контрактах между БД-триггером `notify_telegram_on_new_message`, edge functions и фронтом. Любая «упрощающая» правка без знания этих контрактов = баг в проде, обнаруживаемый клиентами.

В [`.claude/rules/refactoring.md`](../../.claude/rules/refactoring.md) добавлен раздел **«🚫 Карантинные зоны»** перед списком зон 1–10. Перечень путей, которые при общем аудите **пропускаются**:

- Все `supabase/functions/telegram-*`, `wazzup-*`, `gmail-*`, `email-*`.
- `supabase/functions/_shared/` (syncTelegramIncomingMessage, htmlFormatting и т.п.).
- `mtproto-service/` целиком.
- `src/components/messenger/`, `src/hooks/messenger/`.
- Триггер `notify_telegram_on_new_message` и связанные функции/UNIQUE-индексы дедупа.
- RLS-полиция `project_threads_select`.

Правило: при команде «полный аудит» — пропускаем с пометкой в отчёте. Лезть туда — только если юзер явно сказал «отрефактори телегу / wazzup / мессенджер». При изменениях — обязательный смок-тест отправки/приёма по каждому каналу.

## Файлы

**Изменены (без миграции):**

- [`.claude/rules/refactoring.md`](../../.claude/rules/refactoring.md) — раздел «Карантинные зоны».
- [`src/components/boards/BoardListCard.tsx`](../../src/components/boards/BoardListCard.tsx), [`src/components/tasks/TaskListView.tsx`](../../src/components/tasks/TaskListView.tsx) — переход на общий хук `useQueueThreadInitialMessage`.
- [`src/components/messenger/hooks/useChatSettingsFormState.ts`](../../src/components/messenger/hooks/useChatSettingsFormState.ts) — выбор вкладки email при открытии треда.
- [`src/components/messenger/hooks/useChatSettingsSave.ts`](../../src/components/messenger/hooks/useChatSettingsSave.ts) — паритет полей в email-ветке.
- [`src/hooks/messenger/useProjectThreads.mutations.ts`](../../src/hooks/messenger/useProjectThreads.mutations.ts) — `owner_user_id` для тредов без проекта.

**Созданы:**

- [`src/components/tasks/useQueueThreadInitialMessage.ts`](../../src/components/tasks/useQueueThreadInitialMessage.ts).

**Санитизированы (10 файлов миграций):** значение секрета заменено на плейсхолдер. Не перечисляю — это `grep '__INTERNAL_FUNCTION_SECRET__' supabase/migrations/*.sql`.

**В БД (не в миграциях):** ротация секрета в 4 функциях + cron-job, backfill `owner_user_id` для 15 тредов.

## Что проверить после деплоя

- [x] Создать email с доски (с дедлайном + Я как исполнитель) → письмо доходит, появляется в «Мои задачи».
- [x] Открыть существующий email в редакторе → вкладка «Email» подсвечена.
- [x] Отправить сообщение в Telegram-группу из сервиса → доходит.
- [x] MTProto-сообщение из сервиса → доходит (после `--force-recreate` контейнера).
- [ ] Google Calendar mirror — изменить задачу с привязкой → событие обновляется (зависит от того же `dispatch_send_http`).

## Известные ограничения / TODO

- При развороте проекта с нуля миграции теперь содержат плейсхолдер — нужно добавить runbook «как накатить INTERNAL_FUNCTION_SECRET после первой миграции» в [`infrastructure.md`](../../.claude/rules/infrastructure.md).
- 401 в `net._http_response` за прошлые сутки до ротации — это пропущенные исходящие. Восстановить их нельзя, но больше их быть не должно. Если в логах снова появятся 401 — что-то ещё не подхватило новый секрет (вероятно, edge-функция требует передеплоя).
