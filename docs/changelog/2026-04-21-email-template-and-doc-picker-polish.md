# Email-шаблон, DocumentPicker и красный срок у завершённых задач

**Дата:** 2026-04-21
**Тип:** fix
**Статус:** completed

---

## Контекст

Пачка мелких, но заметных багов, набежавших по ходу работы с тредами и задачами. Ничего архитектурного — всё про UX.

1. При выборе email-шаблона в диалоге создания треда **текст первого сообщения не подхватывался**: тема, получатели, название — всё нормально, а поле «Первое сообщение» оставалось пустым.
2. После применения шаблона переносы строк в первом сообщении **пропадали** — всё слипалось в одну строку.
3. В диалоге «Выбрать из проекта» (прикрепление документов к сообщению) названия документов **не обрезались по ширине**, вылезали за границу окна. Плюс при клике на чекбокс всё смещалось влево, а консоль сыпала hydration error «button cannot contain a nested button».
4. Там же — шрифт мелковат, нет кнопки «Отметить все / Снять все», которая особенно нужна когда документов много.
5. В списке задач проекта у **завершённых задач** срок выполнения подсвечивался **красным**, если дата прошла. Финальные статусы не должны менять цвет шрифта — задача закрыта, «просрочки» уже нет.

## Решение

### 1. Первое сообщение из шаблона: гонка с Tiptap

`useEditor` в [`MinimalTiptapEditor`](../../src/components/messenger/MinimalTiptapEditor.tsx:170) настроен с `immediatelyRender: false` (SSR-safe вариант), поэтому `editor` инициализируется асинхронно — на первом рендере `editorRef.current === null`. Старый код в [`useChatSettingsTemplateApply`](../../src/components/messenger/hooks/useChatSettingsTemplateApply.ts) дёргал `composeRef.current?.setHtml(html)` сразу при открытии диалога (useEffect на `open`), а optional-chaining молча проглатывал вызов, если editor ещё не готов.

Починили через декларативный проп `initialHtml` у [`ComposeField`](../../src/components/messenger/ComposeField.tsx). Хук хранит `pendingInitialHtml` в стейте и пробрасывает его через [`useChatSettingsActions`](../../src/components/messenger/hooks/useChatSettingsActions.ts) → [`ChatSettingsDialog`](../../src/components/messenger/ChatSettingsDialog.tsx) → `ComposeField`. Внутри `ComposeField` отдельный `useEffect` смотрит за `[editor, initialHtml]` и вызывает `editor.commands.setContent(html)`, когда оба есть. `appliedHtmlRef` защищает от повторного применения одного и того же значения. Императивный `composeRef.current?.setHtml()` оставили как фолбэк — для ручного выбора шаблона, когда редактор уже готов.

### 2. Переносы строк в HTML

Поле `thread_templates.initial_message_html` редактируется через обычный [`<Textarea>`](../../src/components/templates/ThreadTemplateDialog.tsx:361) и хранит plain text с `\n`. Tiptap через `setContent(html)` переносы строк без тегов игнорирует — отсюда слипание в одну строку.

В [`applyTemplate`](../../src/hooks/messenger/useThreadTemplates.ts:230) добавили конвертацию: если в строке нет HTML-тегов (regex `/<\/?[a-z][\s\S]*?>/i` не срабатывает), HTML-entities экранируются и `\r?\n` заменяется на `<br>`. Если юзер всё-таки положил в поле HTML — прокидывается как есть, без изменений. Совместимо со старыми шаблонами в обоих направлениях.

### 3. DocumentPickerDialog: ширина, hydration, шрифт, «Отметить все»

[`DocumentPickerDialog`](../../src/components/messenger/DocumentPickerDialog.tsx) — диалог выбора документов проекта, открывается из `ComposeField` при вложении файла в сообщение. В нём накопилось сразу четыре проблемы:

- **Hydration error `<button> cannot be a descendant of <button>`.** Обёртка строки документа была `<button>`, а внутри — Radix `Checkbox`, который тоже рендерится как `<button>`. Переделали на `<div role="button" tabIndex={0}>` с `onClick` и `onKeyDown` (Enter/Space). Доступность сохранена, невалидного HTML больше нет.
- **Обрезка названий не работала.** Виноват был `@radix-ui/react-scroll-area`: у его Viewport внутри `display: table`, из-за чего контейнер разворачивается по ширине содержимого, игнорируя max-width родителя. Результат — длинные имена выходили за диалог, а при клике на чекбокс (что меняет ширину строки из-за bg-highlight) вся колонка «прыгала» влево. Заменили `<ScrollArea>` на обычный `<div className="max-h-[60vh] overflow-y-auto">`. `truncate` на span с `flex-1 min-w-0` наконец-то отрабатывает.
- **Шрифт поднят на шаг** (`text-xs` → `text-sm` в документах и папках, `text-[11px]` → `text-xs` в заголовках kit, `h-3 w-3` → `h-3.5 w-3.5` на чекбоксах и иконке папки).
- **Кнопка-тогл «Отметить все / Снять все»** в шапке диалога (`variant="outline"` + иконка `CheckSquare`/`Square`). Меняет текст в зависимости от того, выделены ли все документы.

### 4. Красный срок у завершённых задач

В [`TaskRow`](../../src/components/tasks/TaskRow.tsx:78) и [`DeadlinePopover`](../../src/components/tasks/DeadlinePopover.tsx:27) логика корректная: `isOverdue = !isFinal && deadline < now`. Финальные задачи не должны краситься красным. Но в [`TaskGroupList`](../../src/components/tasks/TaskGroupList.tsx) внутри секции «Завершены» (строка 336) и в `DragOverlay` (строка 363) `TaskRow` рендерился **без** `finalStatusIds`. Внутри `TaskRow` проп опциональный, `isFinal` уходил в `false`, и у всех развёрнутых завершённых задач срок оставался красным. Прокинули `finalStatusIds` в обоих местах.

Логика «завершена или нет» в списке задач опирается на `closedStatusIds` из [`useTaskFilters`](../../src/components/tasks/useTaskFilters.ts:187) — это пересечение `is_final=true` и `show_to_creator=false`. Именно эти статусы попадают в секцию «Завершены» и теперь получают `isFinal=true` в `TaskRow`.

## Архитектурные моменты

- **Где починили гонку шаблона — там же и канонизировали паттерн.** Прокидывание начального контента в rich-text-редактор теперь происходит через декларативный проп, а не императивный ref-вызов. Если кто-то в будущем добавит ещё один потребитель `ComposeField` — та же история с async-инициализацией Tiptap его не укусит.
- **`ScrollArea` — не бесплатная замена `overflow-y-auto`.** Её `display: table` стоит учитывать везде, где контент должен подчиняться ширине родителя. Для простых вертикальных списков без кастомного скролла нативный div проще и безопаснее.
- **Вложенные `<button>` в списках.** Здесь чекбокс был визуальной частью кликабельной строки, но сам Radix Checkbox — полноценная кнопка. В таких случаях внешний контейнер должен быть `<div role="button">`, а не `<button>`.
