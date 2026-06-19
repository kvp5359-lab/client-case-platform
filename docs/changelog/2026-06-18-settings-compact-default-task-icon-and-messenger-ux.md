# Компактные настройки, дефолтная иконка задач, быстрые действия над сообщением

**Дата:** 2026-06-18
**Тип:** feature + UX + fix
**Статус:** completed (фронт ждёт деплоя CI; миграция в проде; edge `telegram-webhook` НЕ задеплоен — см. ниже)

---

Сборный changelog за день: несколько независимых правок, закоммичены вместе.

## 1. Компактная вкладка «Общие настройки» (аккордеон)

**Было:** 11 секций настроек воркспейса шли вертикальными карточками с полным
телом — вкладка занимала несколько экранов.

**Стало:** новый сворачиваемый `SettingsCard` (на базе `@radix-ui/react-collapsible`).
Свёрнутый вид — одна строка: иконка + заголовок + шеврон. Описание показывается
только в раскрытом теле. По умолчанию свёрнуто, открыта только «Информация о
workspace». Вся вкладка умещается в один экран.

- Каждой секции добавлена своя lucide-иконка (Info, Bell, Clock, CalendarClock,
  Palette, Bot, Languages, Search, FileText, RefreshCw, Gauge).
- У AI убран эмодзи `🤖`, у «Перевода» иконка перенесена из заголовка в общий слот.

**Файлы:** `SettingsCard.tsx` (нов.), `GeneralSettingsTab.tsx`,
`WorkspaceInfoSection`, `NotificationSettingsSection`, `SendDelaySettingsSection`,
`DeadlineFormatSection`, `DefaultTaskIconColorSection`, `AISettingsSection`,
`TranslationSettingsSection`, `VoyageAISettingsSection`,
`KnowledgeSummaryPromptSection`, `InboxReconcileSection`, `PerfTraceSection`.

## 2. Дефолтная иконка и цвет новых задач (на уровне воркспейса)

Новая секция настроек «Иконка и цвет задач по умолчанию» — задаёт, с какими
иконкой/цветом создаются задачи через быстрое добавление (QuickAddModal). Если
не заданы — прежний жёсткий дефолт `message-square` / `blue`.

- Миграция `20260618_workspace_default_task_icon_accent.sql` (+`default_task_icon`,
  `default_task_accent` в `workspaces`) — **применена в прод**.
- `database.ts` дополнен колонками.
- Применение дефолтов при быстром добавлении — `ProjectFlatPlanList.tsx`.

**Файлы:** миграция выше, `DefaultTaskIconColorSection.tsx` (нов.),
`types/database.ts`, `components/plan/ProjectFlatPlanList.tsx`.

## 3. Быстрые действия над сообщением при наведении (мессенджер)

**Зона: карантин.** В ряду действий на бабле при наведении добавлены иконки
Ответить / Цитировать / Копировать / Реакция (раньше всё пряталось в меню «три
точки»). Иконки приглушённые, подсветка на hover, единая подложка в цвет бабла.

- Логика «Копировать текст» вынесена в общий хелпер `copyMessageText.ts`
  (использует и пункт меню, и быстрая иконка). Копирует text/html (формат для
  Word/Notion/Docs) + text/plain.
- Переносы строк в баббле рендерятся настоящими `<br>` (а не CSS pre-wrap),
  иначе при копировании в text/html терялись разрывы.
- «Цитировать» теперь сохраняет переносы (`stripHtmlKeepNewlines`).

**Файлы:** `MessageActions.tsx`, `MessageMenuBody.tsx`, `BubbleTextContent.tsx`,
`utils/messenger/copyMessageText.ts` (нов.).

## 4. Чистка хвостовой пустоты у входящих email

`messengerHtml.ts` — `trimEdgeWhitespaceHtml` обрезает пустоту (`<br>`,
`&nbsp;`, пустые блоки) по краям HTML. Gmail оставляет хвост из
`<br><br>&nbsp;` + пустой mail-quote-collapse — он давал видимую пустую полосу
под сообщением. +2 теста.

**Файлы:** `utils/format/messengerHtml.ts`, `messengerHtml.test.ts`.

## 5. Telegram: честная метка ошибки вложения (карантин)

**Было:** любой отказ `getFile` помечался «файл слишком большой» — ложь для
маленьких файлов (просроченный/чужой `file_id`, временный сбой, multi-bot).

**Стало:** «слишком большой» только при реальном `too big` в `description`
ответа Telegram. Иначе — «не удалось загрузить из Telegram, попросите отправить
ещё раз». В лог пишется реальный `description`.

**Файлы:** `supabase/functions/telegram-webhook/index.ts`.

> ⚠️ Edge `telegram-webhook` через CI **не деплоится**. Чтобы правка попала в
> прод — `supabase functions deploy telegram-webhook --no-verify-jwt`.
> В этом коммите функция не деплоилась.

## 6. Мелкий UX

- `ThreadHealthBanner` — кнопка-крестик «скрыть»; закрытие запоминается
  per-thread в localStorage. Если проблема реально исчезнет — баннер и так не
  покажется.
- `TaskActionsMenu` — пункт «Настройки» (проброс `onOpenSettings` из
  `TaskPanelTaskHeader`).

**Файлы:** `ThreadHealthBanner.tsx`, `TaskActionsMenu.tsx`,
`TaskPanelTaskHeader.tsx`.

## 7. Документы и инструменты (без рантайма)

- `docs/feature-backlog/2026-06-18-message-recipients-planfix-model.md` — набросок
  модели адресатов (Planfix), признан неоптимальным.
- `docs/feature-backlog/2026-06-18-message-visibility-modes-and-subscription.md` —
  финальная модель: 4 режима видимости + подписка на тред + @теги (заменяет
  предыдущий).
- `scripts/loadtest-inbox.mjs` — read-only нагрузочный тест «Входящих».

## Проверки

`tsc` 0, `eslint` (settings) 0. Группы 3 и 5 — карантин мессенджера, живой
смок-тест не проводился.
