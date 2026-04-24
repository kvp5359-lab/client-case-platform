# Шаблоны слотов, jump-to-search, зум лайтбокса, sticky task tabs vs финальный статус

**Дата:** 2026-04-24
**Тип:** feat + fix + polish
**Статус:** completed

---

## Контекст

Два коммита в одном релизе: большой feature-pack (шаблоны слотов, прыжок к результату поиска, зум в лайтбоксе картинок, плюс россыпь polish-правок мессенджера и досок) и мелкий, но критичный fix порядка условий в `visibleChats`, из-за которого задача с финальным статусом пропадала из вкладок сразу после «Прочитано».

---

## 1. Справочник шаблонов слотов

Новый раздел `настройки → шаблоны → шаблоны слотов` ([`SlotTemplatesContent.tsx`](../../src/components/templates/SlotTemplatesContent.tsx), [`SlotTemplatesTable.tsx`](../../src/components/templates/SlotTemplatesTable.tsx), [`SlotTemplateDialog.tsx`](../../src/components/templates/SlotTemplateDialog.tsx)).

Шаблон слота — переиспользуемая «заготовка» (например, «Загранпаспорт», «Диплом») с именем, описанием и привязкой к статье базы знаний. При добавлении слота в шаблон папки или в inline-слот набора документов можно открыть пикер ([`SlotTemplatePickerDialog.tsx`](../../src/components/templates/SlotTemplatePickerDialog.tsx)) и выбрать заготовку — её поля **копируются инлайном**, не live-reference. То есть изменения в справочнике не затрагивают ранее созданные места использования — та же модель, что у шаблонов папок и наборов документов.

`knowledge_article_id` прокинут в таблицы `folder_slots`, `document_kit_template_slots` и `document_kit_inline_slots` — прежде он жил только в `folder_slots`. Кнопка помощи на слоте ([`SlotHelpButton.tsx`](../../src/page-components/ProjectPage/components/Documents/SlotHelpButton.tsx)) теперь всегда открывает диалог со статьёй (или описанием, если статьи нет) — раньше, если статьи не было, кнопка просто не рисовалась.

Миграция: [`supabase/migrations/20260423_slot_templates.sql`](../../supabase/migrations/20260423_slot_templates.sql) — создаёт таблицу `slot_templates` (workspace-scoped), RLS привязан к участию в воркспейсе.

## 2. Прыжок к сообщению из поиска

В [`MessageList.tsx`](../../src/components/messenger/MessageList.tsx) и [`MessageBubble.tsx`](../../src/components/messenger/MessageBubble.tsx) добавлен механизм прыжка к результату поиска — аналогично reply-jump. При клике на строку в поисковом дропдауне скроллится лента, подсвечивается баббл янтарной рамкой на пару секунд. На hover найденного сообщения появляется pill-кнопка со стрелкой — удобно вернуться к найденному из любой позиции ленты.

## 3. Зум картинок в лайтбоксе

[`ImageLightbox.tsx`](../../src/components/messenger/ImageLightbox.tsx) — добавлены кнопки `−/%/+` с отображением текущего зума и кнопкой ресета, Ctrl+wheel для зума, горячие клавиши (`+`, `−`, `0`). Вьюпорт становится скроллируемым при зуме >100%.

## 4. Мессенджер — polish

- [`BubbleTextContent.tsx`](../../src/components/messenger/BubbleTextContent.tsx) — linkify ссылок внутри html-сообщений из tiptap (раньше урлы рендерились как plain-текст, если tiptap не проставил `<a>`). Маска `mask-image` заменила per-accent градиенты для fade-out «Показать полностью» — текст «Показать полностью» теперь контрастно-адаптивный.
- [`MessageInput.tsx`](../../src/components/messenger/MessageInput.tsx), [`TaskStatusPicker.tsx`](../../src/components/messenger/TaskStatusPicker.tsx) — picker статусов закрывается при выборе, send активен даже при одной лишь смене статуса (без текста).
- [`MessageBubble.tsx`](../../src/components/messenger/MessageBubble.tsx) — аватары отправителей-команды получают 3px ring в цвете проекта, чтобы визуально отличать внутренние сообщения от клиентских.
- [`useNewMessageToast.ts`](../../src/hooks/messenger/useNewMessageToast.ts) — бордер тоста при отсутствии accent в кэше fallback-ится на запрос к `project_threads`, а не показывает дефолтный серый.

## 5. Страница проекта — фикс горизонтального скролла

[`ProjectPage.tsx`](../../src/page-components/ProjectPage.tsx) — при открытой боковой панели контент вкладок иногда сдвигался под сайдбар из-за унаследованного горизонтального скролла. Добавлен hard-reset `scrollLeft = 0` на контейнере `data-project-scroll` при изменении ширины панели. Плюс [`DocumentsToolbar.tsx`](../../src/page-components/ProjectPage/components/Documents/DocumentsToolbar.tsx) — компактные подписи фильтров при открытой панели.

## 6. Доски — pan-drag через callback-ref

[`usePanDrag.ts`](../../src/components/boards/hooks/usePanDrag.ts) — раньше хук использовал обычный `useRef`. Если `BoardView` делал early-return в empty-state, ref не привязывался к DOM, и при появлении данных pan-drag не активировался до перезагрузки. Переведено на callback-ref — переживает любые early-return.

## 7. Sticky task tabs побеждает финальный статус

В [`useMessengerPanelData.ts`](../../src/hooks/messenger/useMessengerPanelData.ts) фильтр `visibleChats` имел баг порядка условий. После коммита [`9419bfb`](https://github.com/kvp5359-lab/client-case-platform/commit/9419bfb) задачи, раз засветившиеся как непрочитанные, должны были оставаться во вкладках до перезагрузки страницы. Но для задач с финальным статусом («Выполнена», «Отменена») sticky-ветка не срабатывала:

```ts
if (unreadThreadIds.has(c.id)) return true                          // пока unread — ок
if (c.type === 'task' && finalStatusIds.has(c.status_id)) return false  // срабатывает первым
if (c.type === 'task' && stickyTaskIds.has(c.id)) return true       // до сюда не доходит
```

Как только пользователь жал «Прочитано» или отправлял ответ — `unreadThreadIds` обнулялся, срабатывал хайд по финальному статусу **раньше**, чем sticky-проверка, и вкладка пропадала. Это ломало сценарий «хочу написать подряд 2-3 сообщения в задаче, которую уже закрыл».

**Фикс:** sticky-проверку подняли выше финального статуса. Теперь задача, открытая с непрочитанными в этой сессии, остаётся во вкладках до перезагрузки или навигации, вне зависимости от статуса.

Плюс удалён неиспользуемый `useState` в [`SlotTemplatesContent.tsx`](../../src/components/templates/SlotTemplatesContent.tsx), блокировавший lint.

## Результат

- Появился справочник шаблонов слотов, ускоряющий сборку шаблонов папок и наборов документов.
- Поиск по сообщениям удобно прыгает к результату, с подсветкой.
- Картинки в лайтбоксе зумятся нормально, с клавиатурными шорткатами.
- Задачи с финальным статусом не пропадают из вкладок мессенджера после «Прочитано» — можно писать подряд несколько сообщений, пока не перезагрузил страницу.
- Lint — 0 ошибок.
