# Отложенная отправка сообщений, доработка пикера срока, секции «Все» во входящих

**Дата:** 2026-05-20
**Тип:** feature + UX polish + cleanup
**Статус:** completed

---

## Контекст

День разнородный, но связанный одной темой — «сообщения и их сроки»:

1. Большая фича — **отложенная отправка** сообщений в любых тредах
   (TG group / Business / MTProto / Wazzup / Email). Универсально по
   каналам, точность ±1 минута через pg_cron.
2. **Пикер срока** (TaskTimePickerPopover) переделан: компактнее,
   шапка с навигацией + корзина в одну строку, поля длительности под
   чекбоксом, time picker — сеткой во всю ширину.
3. **Вкладка «Все»** в инбоксе на досках теперь группирует
   непрочитанные сверху и прочитанные снизу с подписью.
4. Убрана временная debug-плашка drag-and-drop, которая засвечивалась
   в верхнем-левом углу при перетаскивании карточек.

## Главное 1: отложенная отправка сообщений

Архитектурно — переиспользуем существующую модель черновиков
(`project_messages.is_draft` + `scheduled_send_at`). Запланированное
сообщение = строка с `is_draft=true AND scheduled_send_at` в будущем.

### Миграция [`20260520_scheduled_messages.sql`](../../supabase/migrations/20260520_scheduled_messages.sql)

Распилили монолитный триггер `notify_telegram_on_new_message` на:

- **`dispatch_message_to_channels(p_message_id uuid, p_force_attachments boolean DEFAULT false)`**
  — чистая функция-маршрутизатор по каналам (бывшее тело триггера).
  Параметр `p_force_attachments` нужен для cron-пути: фронт раньше сам
  слал файлы вторым шагом (`attachments_only=true`), теперь то же
  делает воркер (см. ниже про карантин-багу).
- **`notify_telegram_on_new_message`** — тонкая обёртка-триггер.
  Пропускает черновики/запланированные (`is_draft=true OR
  scheduled_send_at IS NOT NULL`), всё остальное делегирует в
  `dispatch_message_to_channels`.
- **`dispatch_scheduled_messages()`** — воркер для pg_cron. Каждую
  минуту выбирает `is_draft=true AND scheduled_send_at <= now()` с
  `FOR UPDATE SKIP LOCKED`, снимает флаги, вызывает диспетчер с
  `p_force_attachments=NEW.has_attachments`.
- **`publish_scheduled_message(uuid)`** — RPC для «Отправить сейчас»
  из UI. Проверяет, что вызывающий = автор, снимает флаги, диспатчит.
  GRANT EXECUTE → authenticated.

pg_cron job `dispatch-scheduled-messages` (`* * * * *`) + индекс
`idx_project_messages_scheduled` (partial по pending only).

**Карантинная заметка**: правка триггера затрагивает все 5 каналов
(TG group / Business / MTProto / Wazzup / Email). Поведение для
обычных INSERT'ов идентично — функция просто разбита на две.

### Фронт

- [`useScheduleMessage`](../../src/hooks/messenger/useScheduleMessage.ts)
  — единый хук с `schedule(content, sendAt, attachments, replyToId,
  sender*)` / `cancel(id)` / `reschedule(id, sendAt)` / `sendNow(id)`.
  Минимум — `now + 2 минуты` (чтобы воркер успел подхватить за один
  тик cron'а). Пресеты:
  - Через 15 минут
  - Через 1 час
  - Завтра в 9:00
  - Через неделю
- [`ScheduleSendButton`](../../src/components/messenger/ScheduleSendButton.tsx)
  — кнопка с иконкой часов рядом с Send. Popover с пресетами +
  `<input type="datetime-local">` для custom. Disabled, если в
  редакторе пусто.
- [`ScheduledControls`](../../src/components/messenger/ScheduledControls.tsx)
  — контролы под баблом: «Сейчас», часы (открывают тот же
  `ScheduleSendButton` для re-schedule), крестик «Отменить».
  Хелпер `formatScheduledTime(iso)` — «сегодня в 09:50» / «завтра в
  09:50» / «20.05, 09:50».
- [`MessageInputToolbar`](../../src/components/messenger/MessageInputToolbar.tsx)
  принимает опциональный `onSchedule`, рендерит кнопку только при
  наличии. [`MessageInput`](../../src/components/messenger/MessageInput.tsx)
  собирает content/files/replyTo из редактора и зовёт колбэк.
- [`MessengerTabContent`](../../src/components/messenger/MessengerTabContent.tsx)
  подключает `useScheduleMessage` и пробрасывает handlers через
  [`MessengerContext`](../../src/components/messenger/MessengerContext.tsx)
  (новые `onCancelScheduled` / `onSendScheduledNow` / `onReschedule`).
- [`MessageBubble`](../../src/components/messenger/MessageBubble.tsx)
  — для запланированных рисует **пунктирную амбер-рамку** и лейбл
  «⏱ На сегодня в 09:50» в верхнем углу. Лейбл вынесен ЗА пределы
  бабла (overflow-hidden обрезал длинный текст). Position
  `-top-1.5 right-3 z-10`. Внутри бабла — `ScheduledControls`
  (вместо обычной `DraftPublishButton`).
- [`BubbleTextContent`](../../src/components/messenger/BubbleTextContent.tsx)
  — обычная кнопка «Опубликовать» для длинных черновиков теперь
  скрывается у запланированных (`!message.scheduled_send_at`).

### Проверено в preview

- Кнопка часов появляется при вводе текста ✓
- Popover с пресетами рендерится корректно ✓
- Клик «Через 15 минут» → toast «Запланировано на …» + бабл в ленте
  с амбер-рамкой и лейблом ✓
- «Отменить» (X) — сообщение исчезает из ленты, ошибок нет ✓
- При повторном INSERT в треде с TG-привязкой cron реально шлёт
  сообщение через минуту (проверено через `cron.job_run_details`).

### Известный нюанс — частичная доставка файлов

Первая итерация не пробрасывала `attachments_only=true` для cron-
пути → запланированные с вложением отправлялись только текстом, а
бабл показывал ошибку доставки целиком. Починили параметром
`p_force_attachments` в диспетчере. Но это **точечный костыль** —
правильное решение лежит в бэклоге:

- [`docs/feature-backlog/2026-05-20-unify-attachments-send-path.md`](../../docs/feature-backlog/2026-05-20-unify-attachments-send-path.md)
  — унификация пути отправки текста и файлов (избавиться от двухшагового
  «триггер + фронт-вызов`).
- [`docs/feature-backlog/2026-05-20-per-attachment-delivery-status.md`](../../docs/feature-backlog/2026-05-20-per-attachment-delivery-status.md)
  — статус доставки **per-attachment**, чтобы бабл показывал
  «текст ушёл, файл не доставлен» отдельным маркером, а не красным
  на всё сообщение.

## Главное 2: пикер срока (TaskTimePickerPopover)

Переделали [`TaskTimePickerPopover`](../../src/components/tasks/TaskTimePickerPopover.tsx)
с компактным layout и фиксированной шириной (`w-[17rem]` = 272px,
не прыгает при включении/выключении «Указать длительность»).

### Что поменялось

- **Корзина в правом верхнем углу** — заменила старую `X Очистить`
  внизу. При ховере подсвечивается красным (`hover:text-destructive
  hover:bg-destructive/10`), tooltip «Очистить сроки».
- **Кастомный header сверху**: `‹ май 2026 г. ›` + корзина в одной
  строке. Стрелки/название сгруппированы слева через `gap-0.5`,
  корзина — `ml-auto` справа. `hideNavigation` у DayPicker +
  собственное `displayMonth` state с prev/next кнопками.
- **Чекбокс «Указать длительность»** — переехал из верхней части
  попапа под календарь, `pl-2` для выравнивания с колонкой `пн`.
- **Поля длительности** — под чекбоксом, не над. Дата в формате
  «21 мая» (короткий, `toLocaleDateString('ru-RU', {day:'numeric',
  month:'short'})`). Время с тире плотнее (`gap-0` внутри
  start-time / dash / end-time).
- **Календарь компактнее**:
  - `--cell-size: 2.2rem` (35px) — занимает всю ширину попапа.
  - `gap-1.5` между weekdays и неделями, `mt-0.5` между неделями.
  - **outside-дни** (числа другого месяца) светлее
    (`text-muted-foreground/30`).
- **Time picker — сетка 4 колонки на всю ширину** вместо узкого
  `w-[90px]` ползунка по центру. `max-h-[220px] overflow-y-auto`,
  кнопки `text-xs rounded`.
- **Bug fix**: перелистывание месяца не работало — `useMemo` для
  `popoverBody` забыл `displayMonth` в deps. Добавили.

### Проверено в preview

- Ширина попапа стабильна 272px ✓
- Перелистывание месяца май → июнь ✓
- Дата в полях длительности «17 мая» ✓
- Time picker — 4 колонки во всю ширину ✓
- Outside-дни заметно бледнее ✓

## Главное 3: вкладка «Все» в инбоксе досок

В [`BoardInboxList`](../../src/components/boards/BoardInboxList.tsx)
на вкладке `filter === 'all'` (и без активного поиска) список тредов
теперь разделён на две секции:

```
[непрочитанные сверху, без подписи]

──── ПРОЧИТАННЫЕ ──── (если есть непрочитанные)

[прочитанные снизу]
```

Подпись `Прочитанные` — bg-muted/30, uppercase, мелкий шрифт.
Рендерится только если ОБЕ группы непустые (если непрочитанных нет —
просто плоский список без заголовка).

«Непрочитанным» считается тред с `unread_count > 0` или
`has_unread_reaction` или `manually_unread` или `unread_event_count > 0`
— ровно то же определение, что и для счётчика вкладки.

В режиме «Непрочитанные» / при активном поиске — секции не делятся
(всё одной кучей).

## Главное 4: убрана debug-плашка DnD

В [`BoardView.tsx`](../../src/components/boards/BoardView.tsx) была
временная отладочная плашка `position: fixed; top: 8; left: 8` с
текстом `active=task:... | over=task-row:...` — оставалась со старой
итерации manual-reorder. Снесли:
- state `debugInfo` + setter,
- `setDebugInfo` в `handleDragOver` и `handleDragCancel`,
- сам блок рендера в JSX.

## Файлы

### Миграции

- [`supabase/migrations/20260520_scheduled_messages.sql`](../../supabase/migrations/20260520_scheduled_messages.sql)
  — распил триггера + dispatcher + cron + индекс + RPC. Применена в
  этой сессии (+ доп. правка `p_force_attachments` поверх).

### Фронт — отложенная отправка

- [`src/hooks/messenger/useScheduleMessage.ts`](../../src/hooks/messenger/useScheduleMessage.ts) — новый.
- [`src/components/messenger/ScheduleSendButton.tsx`](../../src/components/messenger/ScheduleSendButton.tsx) — новый.
- [`src/components/messenger/ScheduledControls.tsx`](../../src/components/messenger/ScheduledControls.tsx) — новый.
- [`src/components/messenger/MessengerContext.tsx`](../../src/components/messenger/MessengerContext.tsx)
  — `onCancelScheduled`, `onSendScheduledNow`, `onReschedule`.
- [`src/components/messenger/MessengerTabContent.tsx`](../../src/components/messenger/MessengerTabContent.tsx)
  — `useScheduleMessage` + handlers + проброс в `MessageInput`.
- [`src/components/messenger/MessageInput.tsx`](../../src/components/messenger/MessageInput.tsx)
  — проп `onSchedule` + `handleSchedule` (сбор content/files из
  редактора).
- [`src/components/messenger/MessageInputToolbar.tsx`](../../src/components/messenger/MessageInputToolbar.tsx)
  — встройка `ScheduleSendButton`.
- [`src/components/messenger/MessageBubble.tsx`](../../src/components/messenger/MessageBubble.tsx)
  — пунктирная амбер-рамка / лейбл `⏱ На …` за пределами overflow /
  `ScheduledControls` внутри бабла / убрана старая `DraftPublishButton`
  для запланированных.
- [`src/components/messenger/BubbleTextContent.tsx`](../../src/components/messenger/BubbleTextContent.tsx)
  — `DraftPublishButton` скрывается для `scheduled_send_at` черновиков.

### Фронт — пикер срока

- [`src/components/tasks/TaskTimePickerPopover.tsx`](../../src/components/tasks/TaskTimePickerPopover.tsx)
  — корзина в шапке, кастомный header с навигацией, чекбокс под
  календарём, time picker сеткой, outside-дни бледнее, дата короткая,
  фикс перелистывания месяца.

### Фронт — прочее

- [`src/components/boards/BoardInboxList.tsx`](../../src/components/boards/BoardInboxList.tsx)
  — секции непрочитанные/прочитанные на «Все».
- [`src/components/boards/BoardView.tsx`](../../src/components/boards/BoardView.tsx)
  — удалена debug-плашка DnD.

### Бэклог

- [`docs/feature-backlog/2026-05-20-unify-attachments-send-path.md`](../../docs/feature-backlog/2026-05-20-unify-attachments-send-path.md)
- [`docs/feature-backlog/2026-05-20-per-attachment-delivery-status.md`](../../docs/feature-backlog/2026-05-20-per-attachment-delivery-status.md)

## Известные ограничения / на будущее

- **Запланированные сообщения и unread-счётчики**: пока что
  запланированное в БД с `is_draft=true` не должно учитываться в
  unread-логике (RPC `get_inbox_threads_v2` фильтрует по чёткой
  логике last_read_at). Стоит ещё раз пройти по инбоксу / счётчикам
  при первой реальной нагрузке.
- **Атрибуция канала**: cron-путь идентичен фронт-пути по тому,
  ЧТО отправлять, но триггеры `notify_*` каналов протестированы
  смок-тестом только на TG group. Для Business / MTProto / Wazzup /
  Email — потенциально могут вылезти кейсы (см. backlog `unify-
  attachments-send-path.md`).
- **«Перепланировать»** в `ScheduledControls` использует тот же
  popover-пикер, что и «Отправить позже» в composer'е. Для
  ре-планирования старого сообщения хорошо бы предзаполнять текущий
  `scheduled_send_at` — пока нет.
- **TaskTimePickerPopover**: при включении/выключении «Указать
  длительность» state не сразу попадает в БД (нужно закрыть попап).
  Это историческое поведение, не трогали.
