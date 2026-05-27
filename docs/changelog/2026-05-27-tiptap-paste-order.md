# Tiptap — пасте из Notion переворачивал порядок строк

**Дата:** 2026-05-27
**Тип:** bugfix
**Статус:** completed

---

## Симптом

Копируешь нумерованный список из Notion (строки 1, 2, 3, ...,
7), вставляешь в редактор быстрого ответа (`QuickReplyFormDialog`)
или любой другой Tiptap-редактор в проекте — получается **обратный
порядок**: 7, 6, 5, ..., 1.

## Корень

В [`tiptap-editor.tsx`](../../src/components/tiptap-editor/tiptap-editor.tsx)
обработчик `handlePaste` для случая, когда Notion отдаёт «слипшийся»
HTML без `<p>/<br>/<div>` + `text/plain` с переводами строк,
строил параграфы и вставлял их так:

```ts
let tr = state.tr.deleteSelection()
for (let i = 0; i < paragraphs.length; i++) {
  const insertPos = tr.selection.from
  tr = tr.insert(insertPos, paragraphs[i])
}
```

`tr.insert(pos, node)` в ProseMirror **не сдвигает `selection.from`** —
позиция курсора остаётся прежней. На каждой итерации `insertPos`
давал ту же точку, и каждый следующий параграф вставлялся **перед**
предыдущим. Итог — обратный порядок.

## Фикс

Один `insert` с массивом нод вместо цикла:

```ts
const tr = state.tr.deleteSelection()
tr.insert(tr.selection.from, paragraphs)
dispatch(tr)
```

ProseMirror `insert` принимает `Node | Node[] | Fragment` и кладёт
ноды подряд начиная с позиции — правильный порядок гарантирован.

## Затронутые файлы

- `src/components/tiptap-editor/tiptap-editor.tsx`

## Проверки

- `npx eslint --max-warnings 0` — чисто.
- `npx tsc --noEmit` — чисто.
- Ручная проверка: копирование нумерованного списка из Notion
  → порядок сохраняется.
