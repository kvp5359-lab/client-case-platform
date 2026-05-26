# Сайдбар-сортировка + цитирование + меню ссылок (повторно)

**Дата:** 2026-05-26
**Тип:** feature + bugfix
**Статус:** completed

---

## Контекст

Дополнения после основной сессии `2026-05-26-messenger-send-flow-fixes`:
поправлено поведение сортировки проектов в сайдбаре по запросу
пользователя, добито меню ссылок (предыдущая Radix-реализация ломалась
прямо на проде из-за DismissibleLayer), переделана логика «вставки в
позицию курсора» в цитировании, потому что прошлый вариант
(`editor.isFocused`) физически не мог сработать.

---

## 1. Сайдбар: убран приоритет «непрочитанных сверху»

**Симптом / запрос:** при новом сообщении проект прыгал из общего
списка вверх (над недавно активными). Менеджер искал проект «по
последней активности» — а его место менялось.

**Что было:** в [`ProjectsList.tsx`](../../src/components/WorkspaceSidebar/ProjectsList.tsx)
непинnedные проекты делились на две группы — «с непрочитанным бейджем»
и «без», и склеивались в порядке `[...unreadUnpinned, ...readUnpinned]`.
Внутри группы — порядок RPC (`last_activity_at desc`).

**Фикс:** убрано разделение, все непинnedные идут одним блоком в
исходном порядке RPC. Бейджи с числом непрочитанных на карточках
остаются — изменилась только сортировка.

```ts
// Было:
return { pinnedProjects: pinned, unpinnedProjects: [...unreadUnpinned, ...readUnpinned] }
// Стало:
return { pinnedProjects: pinned, unpinnedProjects: unpinned }
```

Закреплённые (`pinnedIds`) по-прежнему сверху, в порядке закрепления.

---

## 2. Меню ссылок: переписано с Radix Popover на портал-`div`

**Симптом:** правый клик по ссылке в баббле — ничего не происходит.
Ни нашего меню, ни браузерного, ни общего меню сообщения (preventDefault
блокирует браузерное, stopImmediatePropagation — Radix `ContextMenuTrigger`
родителя; всё корректно). На проде и локально одинаково.

**Диагностика через `console.log`:**

```
[BubbleLinkMenu] openAt called {x: 1011, y: 542, href}
[BubbleLinkMenu] render {open: false}
[BubbleLinkMenu] setOpen(true) deferred
[BubbleLinkMenu] render {open: true}
[BubbleLinkMenu] onOpenChange false      ← Radix сам закрывает
[BubbleLinkMenu] render {open: false}
```

**Причина:** Radix `DismissibleLayer` под `Popover` слушает
`pointerup`/`pointerdown` на capture phase. Pointer-серии от того же
правого клика приходят в Layer **после** того, как Popover открылся
(`open=true`), и трактуются как outside-click → Popover моментально
схлопывается. `setTimeout(0)` перед `setOpen` не спас — событие
догоняет popup.

**Фикс** ([`BubbleLinkMenu.tsx`](../../src/components/messenger/BubbleLinkMenu.tsx)):
переписан без Radix. Простой `createPortal` на `document.body`,
`<div style={position:fixed, left, top}>` с двумя кнопками. Outside-click
— ручной listener на `mousedown` через `document`. **Окно
игнорирования 200мс** после `openAt`: тот же правый клик ещё
доставляет `mouseup` спустя ~50-150мс, иначе он закрывает меню сам.
Escape — закрывает.

```tsx
return createPortal(
  <div ref={menuRef} style={{position:'fixed', left:pos.x, top:pos.y, zIndex:60}}
       className="…rounded-md border bg-popover p-1 shadow-md"
       onContextMenu={e => e.preventDefault()}>
    <button onClick={handleOpen}>Перейти по ссылке</button>
    <button onClick={handleCopy}>Копировать ссылку</button>
  </div>,
  document.body,
)
```

`onContextMenu={preventDefault}` на самом меню — чтобы правый клик
по пункту меню не открывал браузерное контекстное.

---

## 3. Цитирование: вставка в позицию курсора через ref-флаг

**Симптом:** даже когда юзер ставит курсор в input в нужное место и
идёт выделять текст в баббле — после клика «Цитировать» цитата
всё равно падает в конец сообщения.

**Причина:** в [`useQuoteInsertion.ts`](../../src/components/messenger/hooks/useQuoteInsertion.ts)
проверка через `editor.isFocused`. К моменту клика «Цитировать»
DOM Selection ушла в баббл — Tiptap уже не сфокусирован,
`isFocused === false`. Поэтому ветка «в текущую позицию» физически
никогда не срабатывала.

**Фикс:** заменил на ref-флаг `hasBeenFocusedRef`. Подписан на
`editor.on('focus')` в [`MessageInput.tsx`](../../src/components/messenger/MessageInput.tsx),
флипает в `true` при первом фокусе редактора. Сбрасывается при смене
`threadId` (в новом треде юзер ещё не работал). Прокидывается в
`useQuoteInsertion` отдельным параметром.

```ts
// MessageInput.tsx
const hasBeenFocusedRef = useRef(false)
useEffect(() => {
  if (!editor) return
  const h = () => { hasBeenFocusedRef.current = true }
  editor.on('focus', h)
  return () => editor.off('focus', h)
}, [editor])
useEffect(() => { hasBeenFocusedRef.current = false }, [threadId])

// useQuoteInsertion.ts
if (wasFocusedRef.current) {
  editor.chain().focus().insertContent(content).run()  // в последнюю selection
} else {
  editor.chain().focus('end').insertContent(content).run()  // в конец
}
```

`editor.commands.focus()` без аргументов восстанавливает сохранённую
в Tiptap selection — даже если редактор сейчас не сфокусирован.
То есть позиция курсора, выставленная до похода в баббл, сохраняется.

---

## Затронутые файлы

- `src/components/WorkspaceSidebar/ProjectsList.tsx`
- `src/components/messenger/BubbleLinkMenu.tsx` (rewrite без Radix)
- `src/components/messenger/MessageInput.tsx`
- `src/components/messenger/hooks/useQuoteInsertion.ts`

## Проверки

- Сайдбар: проекты в сайдбаре больше не прыгают вверх при новом
  сообщении. Закреплённые сверху, остальное — в порядке RPC.
- Меню ссылок: правый клик на ссылке в баббле открывает popup
  «Перейти / Копировать». Клик мимо или Escape — закрывает.
  Pointer-up от того же правого клика больше не закрывает меню
  (200мс окно).
- Цитирование: курсор в середине input → выделить в баббле →
  «Цитировать» → цитата встаёт в позицию курсора. Открыл новый тред,
  не трогал input → цитата падает в конец.
