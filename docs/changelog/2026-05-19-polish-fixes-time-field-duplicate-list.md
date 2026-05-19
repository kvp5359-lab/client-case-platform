# Полировка дня: поле «Время», дублирование списка, фиксы TaskPanel/перевода, новый header «Из источника»

**Дата:** 2026-05-19
**Тип:** feature + fix
**Статус:** completed

---

## Контекст

Набор разнородных мелких улучшений и фиксов, всплывших в обычной работе:

1. Ошибка перевода в баблах сообщений показывалась как абстрактное
   «Edge Function returned a non-2xx status code» — пользователь не
   понимает, что упало.
2. В карточках задач на досках не хватало «времени по слоту» — отдельно
   от поля «Дедлайн», которое показывает только дату.
3. Не было дублирования колонки доски — приходилось руками создавать
   новый список и переносить туда фильтры/раскладку.
4. Шапка `TaskPanel` залипала на старом контакте, если из треда с
   контактом переключиться на тред без контакта и без проекта.
5. Раздел «Из источника» в правой панели показывал шестерёнку
   «настройки» и иконку глаза без подписи. Хотелось как у тредов:
   статус-иконка (Drive с именем папки / Unplug) + кликабельный чип
   для «показывать скрытые».

## Главное 1: человеческий текст ошибки в `translate-message`

Симптом: иногда при клике «перевести сообщение» баббл показывал toast
`Edge Function returned a non-2xx status code`. Расследование показало,
что чаще всего это краткосрочная перегрузка Anthropic (тип ошибки
`overloaded_error`) — само пройдёт через минуту, но юзер этого не знает.

### Edge function

В [`supabase/functions/_shared/ai-chat-setup.ts`](../../supabase/functions/_shared/ai-chat-setup.ts)
функция `callAiApi` теперь парсит сырое тело ответа от Anthropic/Gemini
(JSON формат `{"error":{"type":"…","message":"…"}}`), сопоставляет
известные типы (`overloaded_error`, `rate_limit_error`,
`authentication_error`, `permission_error`, `not_found_error`,
`invalid_request_error`, 529 service unavailable, billing/quota) и
возвращает короткий русский текст:

- `Anthropic перегружен. Попробуй через минуту.`
- `Anthropic: превышен лимит запросов. Попробуй чуть позже.`
- `Google: неверный или отсутствующий API-ключ. Проверь настройки воркспейса.`
- `Anthropic: модель не найдена. Проверь, что выбранная модель ещё доступна.`
- `Anthropic: закончился баланс / квота на ключе.`

Если ничего не подошло — фолбэк на `parsedMessage` от провайдера.

Статус функции сменили с **500 → 502** (правильнее семантически: это
ошибка апстрима, не нашего кода). Сырая ошибка провайдера и его статус
дополнительно кладутся в тело как `provider_error` / `provider_status`
для дебага в консоли.

### Frontend

В [`src/hooks/messenger/useTranslateMessage.ts`](../../src/hooks/messenger/useTranslateMessage.ts)
добавлен хелпер `extractFunctionError`. `supabase.functions.invoke` на
non-2xx бросает `FunctionsHttpError`, в `.context` лежит Response —
достаём оттуда `body.error` и пробрасываем как `Error.message`. Toast
теперь показывает реальный текст, а не статус-код.

### Что НЕ задеплоено автоматом

Изменение в shared-файле `ai-chat-setup.ts` затрагивает все edge
functions, использующие `callAiApi`. Из них прямо в сессии задеплоен
только `translate-message`. Остальные (`chat-with-uploaded-file`,
`chat-with-documents`, `generate-block`, `generate-document` и др.) —
продолжат отдавать «AI service error» до ручного редеплоя.

## Главное 2: поле «Время» в карточке задачи доски

В реестре полей карточки ([`CARD_FIELD_DEFS`](../../src/components/boards/listSettingsConfigs.ts))
добавлено поле `id: 'time'`, label `Время`, доступно только для
`entityType='thread'`. Доступно в настройках колонки → «Отображение»
рядом с «Дедлайн».

В отличие от `deadline` (показывает дату — «Сегодня», «15 апр»), поле
`time` выводит интервал по календарному слоту треда:

```
14:00–15:30   // оба заполнены
14:00         // только start_at
до 15:30      // только end_at
(не рендерится) // нет ничего
```

Хелпер — `formatTimeRange(startAt, endAt)` в
[`boardListUtils.ts`](../../src/components/boards/boardListUtils.ts).
RPC `get_workspace_threads` уже возвращает `start_at/end_at` с
2026-05-17 (миграция `20260517_get_workspace_threads_with_time`), так
что дополнительно ничего тянуть не надо.

Рендер — `case 'time'` в `TaskField`
([`BoardTaskRow.tsx`](../../src/components/boards/BoardTaskRow.tsx)).
Класс `tabular-nums` — чтобы цифры не плясали по ширине.

## Главное 3: дублирование колонки доски

В контекстном меню `BoardListHeader` появился пункт «Дублировать» (с
иконкой `Copy`). Скрыт для inbox-списка — у него нет смысла копировать.

Новый хук [`useDuplicateList`](../../src/components/boards/hooks/useListMutations.ts):
1. Читает исходный `board_list` целиком.
2. Считает `sort_order` для копии — `max(sort_order) + 1` в той же
   `column_index` (копия встаёт в конец колонки).
3. Вставляет копию со всеми параметрами оригинала: `filters`,
   `sort_by/dir`, `display_mode`, `visible_fields`, `group_by`,
   `list_height`, `header_color`, `card_layout`, `calendar_settings`.
4. Имя — `«<исходное имя> (копия)»`.

## Главное 4: TaskPanel — фикс «залипшего» контакта в шапке

Симптом (продемонстрировано юзером на инбоксе): открыть тред с
контактом-email `anna@olivetreeschool.cat` (нет проекта). В шапке
правой панели — `anna@olivetreeschool.cat • Личный диалог`. Кликаем на
другой тред без проекта и без контакта — шапка продолжает показывать
прежний контакт, хотя сам контент панели сменился.

Корень — кривое условие `scopeChanged` в `openThreadTab`
([`TaskPanelTabbedShell.tsx:194-197`](../../src/components/tasks/TaskPanelTabbedShell.tsx)):

```js
// было
const scopeChanged =
  targetPid !== activeProjectId ||
  (targetContactId !== null && targetContactId !== activeContactId)
```

Условие `(targetContactId !== null && …)` не срабатывает на «контакт
сбрасывается в null» — `false && …` = `false`. В результате
`setActiveContactId(null)` не вызывается, пропсы `contactId` в
`TaskPanelTabbedShellRenderer` остаются старыми, и пока React Query
не загрузит новый `activeThreadScope` — fallback `?? contactId`
возвращает прежний `"anna_id"` и рисует прежнюю шапку.

Фикс — убрать защиту `!== null`:

```js
// стало
const scopeChanged =
  targetPid !== activeProjectId ||
  targetContactId !== activeContactId
```

Теперь смена «контакт был → контакт null» ловится так же, как обратное.
Симметрично с тем, как уже работало для `projectId`.

## Главное 5: новый header у раздела «Из источника»

В правой панели → «Дополнительно» → «Нераспределённые» → «Из источника»
([`UnassignedTabContent.tsx`](../../src/components/projects/DocumentKitsTab/containers/UnassignedTabContent.tsx))
переделан правый блок управления.

### Было

```
[🔄 sync] [👁 toggle hidden] [⚙ settings] [Google Drive: "name"]
```

Иконка глаза без подписи, шестерёнка дублирует имя папки (клик и там,
и там открывает один диалог настроек).

### Стало

```
collapse + name + count    [👁/EyeOff Показывать скрытые]  ←—gap—→   [🔄 sync] [🟦 Google Drive: "name"]
                                                                     либо [⛔ Unplug] если не подключён
```

Логика:
- **Чип «Показывать скрытые / Не показывать скрытые»** — слева, сразу
  после счётчика документов. Активный фон при `showHiddenSourceDocs=true`.
- **Sync + Drive** — справа (через `ml-auto` на их обёртке).
- **Drive-кнопка** заменила шестерёнку: при подключённом источнике —
  цветная иконка Drive + название папки, клик открывает диалог
  настроек. При не подключённом — серая иконка `Unplug` с тем же
  кликом (диалог содержит форму подключения).
- Sync и чип скрыты, если источник не подключён — без папки они
  бессмысленны.

### Параллельный баг: имя папки не сохранялось в стор

В процессе перевода шестерёнки в Drive-иконку всплыл реальный баг в
[`useFolderNamesCache`](../../src/components/projects/DocumentKitsTab/hooks/useFolderNamesCache.ts):
async-получение имени папки через edge function `google-drive-get-folder-name`
ВСЕГДА срабатывало, но к моменту resolved'а у `useEffect` стоит
`cancelled = true` — `setSourceFolderName(name)` пропускается. В сторе
остаётся пустая строка. До этого баг был замаскирован заглушкой
`getFolderName: async () => null` (стояла как TODO), теперь обнаружился.

Точечный обход: в `UnassignedTabContent` тянем имя папки **отдельным
React Query прямо в компоненте** (`useSourceFolderInfo` — внутренняя
функция), `staleTime: 30 мин`. Стор `documentKitUI.sourceFolderName`
остаётся как fallback, но основной источник правды — этот хук.

Сам багованный `useFolderNamesCache` не трогали — он используется ещё
для `exportFolder` (там та же гонка cancelled-флага, но визуально пока
не критично, имя экспорт-папки не рендерится в видимом UI). При случае
переписать его без cancelled-флага (например, через React Query) —
будет полезно.

## Файлы

### Frontend

- [`src/hooks/messenger/useTranslateMessage.ts`](../../src/hooks/messenger/useTranslateMessage.ts)
  — хелпер `extractFunctionError`, оба хука (`useTranslateMessage`,
  `useTranslatePreview`) теперь показывают читаемое сообщение.
- [`src/components/boards/types.ts`](../../src/components/boards/types.ts)
  — `'time'` в `CardFieldId`.
- [`src/components/boards/listSettingsConfigs.ts`](../../src/components/boards/listSettingsConfigs.ts)
  — `{ id: 'time', label: 'Время', entityTypes: ['thread'] }` в
  `CARD_FIELD_DEFS`.
- [`src/components/boards/BoardTaskRow.tsx`](../../src/components/boards/BoardTaskRow.tsx)
  — рендер поля `time` в `TaskField`.
- [`src/components/boards/boardListUtils.ts`](../../src/components/boards/boardListUtils.ts)
  — `formatTimeRange(startAt, endAt)`.
- [`src/components/boards/hooks/useListMutations.ts`](../../src/components/boards/hooks/useListMutations.ts)
  — `useDuplicateList`.
- [`src/components/boards/BoardListHeader.tsx`](../../src/components/boards/BoardListHeader.tsx)
  — пункт «Дублировать» в DropdownMenu.
- [`src/components/tasks/TaskPanelTabbedShell.tsx`](../../src/components/tasks/TaskPanelTabbedShell.tsx)
  — `scopeChanged` без защиты `!== null`.
- [`src/components/projects/DocumentKitsTab/containers/UnassignedTabContent.tsx`](../../src/components/projects/DocumentKitsTab/containers/UnassignedTabContent.tsx)
  — переписанный header + локальный `useSourceFolderInfo`.
- [`src/components/projects/DocumentKitsTab/hooks/useDocumentKitEffects.ts`](../../src/components/projects/DocumentKitsTab/hooks/useDocumentKitEffects.ts)
  — комментарий-метка про обход багованного `useFolderNamesCache`.

### Edge functions

- [`supabase/functions/_shared/ai-chat-setup.ts`](../../supabase/functions/_shared/ai-chat-setup.ts)
  — `humanizeProviderError`, передача `provider_error`/`provider_status`,
  статус 500 → 502.
- Задеплоено в этой сессии: `translate-message`. Остальные функции с
  этим shared-файлом — без редеплоя (отложено).

## Известные ограничения / на будущее

- **`useFolderNamesCache` с cancelled-флагом** — баг не починен,
  обойдён локально. При случае переписать на React Query — это уберёт
  два глобальных Zustand-поля (`sourceFolderName`, `exportFolderName`)
  и кучу проп-проброса.
- **Дубль колонки доски** ставит «(копия)» в конец колонки, а не сразу
  после оригинала. Сдвигать `sort_order` соседей не хотелось ради
  одной операции. При желании потом — добавить шифт.
- **Поле «Время»** показывает локальное время браузера, без зон. Когда
  доедет `participants.time_zone` (см. backlog по календарю) — можно
  пересчитывать.
- **Чип «Показывать скрытые»** показывает Eye/EyeOff одинаково по
  левому краю; визуально активное состояние — фон. Если будет
  путаница, добавим тонкую обводку.
- **Human-error в AI** работает только для `translate-message` сегодня.
  Остальные функции — следующей итерацией.
