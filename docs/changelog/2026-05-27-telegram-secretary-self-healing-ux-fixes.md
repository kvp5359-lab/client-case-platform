# Telegram — самовосстановление привязки секретаря + UX-фиксы

**Дата:** 2026-05-27
**Тип:** bugfix + feature + UX
**Статус:** completed

---

## Контекст

Сессия из нескольких независимых правок. Основная — большое
расследование зависающих отправок в Telegram («крутится → красное»)
и связанная серия фиксов. Плюс три UX-улучшения от параллельной
сессии.

---

## 1. Расследование зависающих TG-сообщений

**Симптом:** у пользователя и коллег периодически сообщения в чатах
ЛК «крутятся → краснеют» через 60 секунд, при том что в Telegram они
часто реально доходят. Кнопка «Повторить отправку» бесполезна (статус
в БД остаётся `pending`, а retry-trigger срабатывает только на
`failed → pending`).

**Картина по данным:** найдено **5 застрявших pending-сообщений с
22 мая** — все через employee_bot путь, telegram_message_id=NULL.
Эта часть бага полностью не вскрыта — Edge Function `telegram-send-message`
для одного из случаев вернула `{ok:true}` за **33 мс**, что слишком
быстро для нормального пути (sendMessage в Telegram ≥ 200 мс).
Воспроизвести в дев не удалось.

**Что добавил для будущего отлова** ([`telegram-send-message/index.ts`](../../supabase/functions/telegram-send-message/index.ts)):

- Локальный флаг `statusWritten` — выставляется в каждой ветке после
  `markMessage{Sent,Failed}`. Если в конце функции остался false —
  пишем `console.error` с маркером `BUG.no_branch_wrote_status` **и**
  UPDATE `telegram_error_detail` на самом сообщении.
- Расширили `trace("request.start")`: `typeof body.attachments_only`,
  preview content, флаг `content === "📎"`.
- `trace("branch.decision")` — какая ветка будет выбрана, обе ли пропускаются.
- `trace("request.end")` теперь включает `statusWritten`.

При следующем воспроизведении SQL'ом сразу найдём что попало в body
и где функция потеряла нить.

---

## 2. Вложения во внутреннем чате не висят в pending

**Симптом:** Анна Бурнаева в чате без подключённых каналов отправляет
текст + 3 docx. Текстовая запись становится `sent`, файловая записывается
в БД и навсегда висит в `pending`. Через 60 сек DeliveryIndicator красит
её красным.

**Причина:** в `dispatch_message_to_channels` ранний RETURN на
`has_attachments=true` стоял **до** проверки канала. Для тредов без
внешних каналов финальный UPDATE `send_status='sent'` (для internal-тредов)
был недостижим.

**Фикс** ([`20260526_fix_internal_thread_attachments_send_status.sql`](../../supabase/migrations/20260526_fix_internal_thread_attachments_send_status.sql)):
перенёс проверку `has_attachments` **внутрь** каждой ветки канала
(mtproto / business / wazzup / telegram). Если канала нет — проваливаемся
в финальный UPDATE как и для текстовых сообщений в internal-тредах.

Плюс backfill уже застрявших сообщений того же класса.

---

## 3. Refetch при локальном timeout в DeliveryIndicator

**Симптом:** Edge function успешно отметила `send_status='sent'`, но
realtime UPDATE на фронт не доехал (или обработчик пропустил race с
мутацией). Локальный 60-сек таймер уже покрасил баббл в красное, и
без realtime UPDATE он остаётся красным до явного refetch.

**Фикс** ([`DeliveryIndicator.tsx`](../../src/components/messenger/DeliveryIndicator.tsx)):
при переходе `timedOut=false → true` делаем однократный
`queryClient.refetchQueries` по ключу треда. Если в БД статус уже
'sent' — баббл сам станет синим. Если всё ещё 'pending' — красное
остаётся обоснованно.

Не лечит случаи когда статус в БД реально завис в pending (баг 1),
но закрывает класс «backend всё сделал, фронт не подхватил».

---

## 4. Самовосстановление привязки секретаря к Telegram-группе

**Симптом (день 27 мая):** Кирилл пишет в группу «БП - Natalia
Shapovalova», сообщение становится `failed`. В БД:

```
send_failed_reason: [resolveBotToken] No integration_id for chat -5128332074.
                    Group must be linked to a workspace bot integration.
telegram_error_detail: employee_bot_error: "Bad Request: chat not found"
                       (code=400); reply=no; via=text; awaiting_fallback
```

**Картина:**
- Личный бот сотрудника пытался отправить → Telegram ответил
  «chat not found» (нашего личного бота в этой группе физически нет —
  на скриншоте в группе сидел старый @relostart123_bot).
- Edge function пошла на fallback к секретарю → `resolveBotToken`
  бросил throw, потому что `project_telegram_chats.integration_id`
  для этого чата = NULL.
- Edge function вернула 500 → watchdog отметил failed.

**Корневая причина:** в воркспейсе **15 групп из 82 (18%)** имели
`integration_id=NULL`. Webhook `/link` (`telegram-webhook-v2/commands.ts`
и `telegram-webhook/index.ts`) при создании `project_telegram_chats`
просто **не записывал поле integration_id**. И если `/link` обрабатывал
личный бот сотрудника (типичный сценарий: добавил личного бота в
группу, написал ему `/link`) — запись создавалась без указания
какого секретаря использовать для fallback'а.

Баг **продолжающийся** — на момент расследования сегодня создалось
ещё **3 новые сироты**.

### Что починил

**Backend** ([`_shared/telegramBotToken.ts`](../../supabase/functions/_shared/telegramBotToken.ts)):

- `findSecretaryInGroup(service, chatId, workspaceId)` — для каждого
  активного `telegram_workspace_bot` воркспейса дёргает Telegram
  `getChat`. Тот, кто получает `ok=true`, физически в группе.
- `resolveBotToken` теперь **self-healing**: если `integration_id=NULL`
  (или integration деактивирована) — ищет секретаря в группе через
  `findSecretaryInGroup` и записывает его в `project_telegram_chats`,
  чтобы при следующем вызове не дёргать TG API.
- Маркер `ERR_NO_SECRETARY_IN_GROUP` для случая, когда ни один
  секретарь физически не в группе. Вызывающий edge function ловит
  этот маркер и делает `markMessageFailed` с понятным reason.
- `determineIntegrationIdForLink` для webhook'а `/link`: если команду
  обработал секретарь — его id; если личный бот — ищет секретаря в
  группе через `getChat`; если никого нет — NULL.

**Webhook'и `/link`** ([`telegram-webhook-v2/commands.ts`](../../supabase/functions/telegram-webhook-v2/commands.ts),
[`telegram-webhook/index.ts`](../../supabase/functions/telegram-webhook/index.ts)):
теперь записывают `integration_id` при INSERT/UPDATE
`project_telegram_chats`. Новые группы не становятся сиротами.

**Edge function** ([`telegram-send-message/index.ts`](../../supabase/functions/telegram-send-message/index.ts)):
helper `tryFallbackToSecretary` оборачивает `resolveBotToken` в трёх
fallback-точках (text, split_text). При `ERR_NO_SECRETARY_IN_GROUP` —
`markMessageFailed` с reason «Личный бот не справился, а
бота-секретаря в этой группе нет», возвращает 200 с
`fallback_failed: "no_secretary"`. Глобальный тост у пользователя
с понятным текстом, а не «HTTP 500».

**Также** в edge function добавлена запись причины personal-bot
fail'а в `telegram_error_detail` **до** вызова resolveBotToken
(`awaiting_fallback`). Если fallback успешный — поле перезапишется
финальным результатом. Если упал на throw — у нас остаётся причина
от Telegram для SQL-post-mortem.

### Backfill сирот

Через TG `getChat` от обоих секретарей воркспейса (старый и новый)
проверили все 15 сирот:
- **13 групп** → нашли нового секретаря в группе, проставили
  `integration_id = 4539529a-cc55-4fe6-b5f5-ad07f4efa31d`.
- **2 группы** (Aliaksandr Avizhych, Илья Гордейко #2) — ни одного
  секретаря физически нет. `integration_id` оставили NULL — это
  корректное состояние, UI-баннер предупредит.

### UI-баннер

**Frontend**:

- [`useThreadTelegramHealth(threadId)`](../../src/hooks/messenger/useThreadTelegramHealth.ts) —
  хук для проверки healthcheck: есть ли запись в `project_telegram_chats`
  и заполнен ли `integration_id`.
- [`ThreadHealthBanner`](../../src/components/messenger/ThreadHealthBanner.tsx) —
  превентивный баннер в шапке треда. Видим только владельцу/менеджеру
  с правом `manage_workspace_settings`. Показывается когда привязка
  есть, но секретарь не назначен. Объясняет последствия и что делать.
- Прицеплен в [`MessengerTabContent`](../../src/components/messenger/MessengerTabContent.tsx)
  над списком сообщений.

---

## 5. UX: открыть проект сразу после создания

**Симптом:** после «Создать проект» в диалоге, пользователь оставался
на той же странице (Проекты или сайдбар), и должен был сам кликнуть
по новому проекту в списке.

**Фикс**:
- [`CreateProjectDialog`](../../src/components/projects/CreateProjectDialog.tsx)
  передаёт `onSuccess({ id })` — id нового проекта.
- [`WorkspaceSidebarFull`](../../src/components/WorkspaceSidebarFull.tsx)
  и [`ProjectsPage`](../../src/page-components/ProjectsPage.tsx) после
  создания делают `router.push('/workspaces/.../projects/{id}')`.

---

## 6. UX: глобальный поиск открывается в новой вкладке

**Симптом:** строки результатов в `SidebarGlobalSearch` были `<button>`,
и Cmd+ЛКМ / middle-click / правый клик «открыть в новой вкладке» не
работали (нативно нет URL).

**Фикс** ([`SidebarGlobalSearch.tsx`](../../src/components/WorkspaceSidebar/SidebarGlobalSearch.tsx)):
строки рендерятся как `<a href>` с правильным URL для каждого типа
(`hrefForRow`):
- Обычный ЛКМ → перехват `e.preventDefault()` + `handlePick` (открытие
  в правой панели, как было).
- Cmd/Ctrl/Shift/middle/правый клик → отпускаем дефолт, браузер
  открывает в новой вкладке.
- В `DisplayRow` добавлен `project_id` для построения href.

---

## 7. UX: «Исполнители вне проекта» в AssigneesPopover

**Симптом:** если назначить сотрудника на задачу, а потом убрать его
из проекта — он висел в карточке задачи, но в `AssigneesPopover` его
не было (фильтр показывал только участников проекта). Снять
назначение было нельзя без захода в админку.

**Фикс** ([`AssigneesPopover.tsx`](../../src/components/tasks/AssigneesPopover.tsx)):

- `useWorkspaceParticipants` теперь грузится всегда при `open`, не
  только когда у треда нет project_id. Нужно как fallback для сирот.
- Новая секция **«Не в проекте»** в popover с исполнителями, которых
  нет среди `projectParticipants`.
- Если исполнителя нет и в workspace participants (полностью удалён
  из воркспейса) — рендерим stub с id/именем из самого assignee, чтобы
  всё равно можно было снять.
- Поиск по этой секции работает (фильтр по имени).

---

## 8. UX: пустые блоки в email-баблах

**Симптом:** маркетинговое письмо в треде показывало огромную пустую
зону (десятки пустых строк) между шапкой и текстом. Старая фича
«не более одной пустой строки подряд» не срабатывала.

**Причина:** `collapseEmptyLines` в [`messengerHtml.ts`](../../src/utils/format/messengerHtml.ts)
ловил только `<div></div>` / `<p><br></p>`. Маркетинговые письма
(Gmail, Mailchimp и т.п.) валят пустоту через `<p>&nbsp;</p>`,
`<div><span>&nbsp;</span></div>` и аналогичные конструкции — они
проходили мимо regex'а.

**Фикс**:
- Переписал `collapseEmptyLines` на обход DOM. Любой блочный
  элемент (`div / p / blockquote / ol / ul / li`), внутри которого
  только whitespace + `&nbsp;` + `<br>` (без `img/svg/hr/picture/video/audio`),
  заменяется на одиночный `<br>`. Post-order — пустой
  `<div><span></span></div>` сначала схлопывается до `<br>`, потом
  родитель замечает, что стал пустым, и тоже схлопывается.
- Финальный шаг `<br>{3,} → <br><br>` сохранён — не больше одной
  пустой строки подряд.
- Старый regex оставлен как SSR-fallback (расширен на &nbsp;/&#160;/&#xA0;
  и блочные теги blockquote/li/ol/ul).

**Тесты:** добавил [`messengerHtml.test.ts`](../../src/utils/format/messengerHtml.test.ts)
— 8 кейсов: `<p>&nbsp;</p>` подряд, `<div></div>` подряд,
`<p><br></p>` подряд, вложенные пустые `<div><span>&nbsp;</span></div>`,
`<br>{20}`, неполоманный текст с ссылкой, сохранение одной пустой
строки между абзацами. Все зелёные.

---

## Затронутые файлы

**Backend:**
- `supabase/functions/_shared/telegramBotToken.ts` (deploy)
- `supabase/functions/telegram-send-message/index.ts` (deploy, версии 94 → 96)
- `supabase/functions/telegram-webhook-v2/commands.ts` (deploy)
- `supabase/functions/telegram-webhook/index.ts` (deploy)
- `supabase/migrations/20260526_fix_internal_thread_attachments_send_status.sql` (apply + backfill)

**Frontend:**
- `src/components/messenger/DeliveryIndicator.tsx`
- `src/components/messenger/MessengerTabContent.tsx`
- `src/components/messenger/ThreadHealthBanner.tsx` (new)
- `src/hooks/messenger/useThreadTelegramHealth.ts` (new)
- `src/components/projects/CreateProjectDialog.tsx`
- `src/components/WorkspaceSidebarFull.tsx`
- `src/page-components/ProjectsPage.tsx`
- `src/components/WorkspaceSidebar/SidebarGlobalSearch.tsx`
- `src/components/tasks/AssigneesPopover.tsx`
- `src/utils/format/messengerHtml.ts`
- `src/utils/format/messengerHtml.test.ts` (new)

**Дата-операции (через MCP):**
- Backfill `integration_id` для 13 из 15 сирот в воркспейсе
  `8a946780-77e9-42cd-a05b-cdb66e53c941`.

## Проверки

- `npx tsc --noEmit` — зелёный после каждой правки
- `npm run lint` — 0 ошибок, 0 warnings
- `npm test` — 652/652 passed
- Edge functions задеплоены отдельно через `supabase functions deploy --no-verify-jwt`

## Открытые вопросы

1. **Баг с 33мс ответом от Edge Function** (раздел 1) — корневая причина
   не вскрыта. Ждём следующего воспроизведения с включённой трассировкой
   `BUG.no_branch_wrote_status` в `telegram_error_detail`.
2. **Watchdog `scan_dispatch_failures`** пропускает «ответ 2xx без
   выставления send_status» — стоит расширить: если `status='pending'`
   дольше 5 минут И есть успешный dispatch — переводить в failed
   с осмысленным reason.
