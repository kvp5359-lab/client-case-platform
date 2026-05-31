# Мессенджер — списки left-align + План — редактор текстовых блоков

**Дата:** 2026-05-31
**Тип:** bugfix + UX
**Статус:** completed

---

## 1. Нумерованные списки в мессенджере — обрезались двузначные номера

**Симптом:** в поле ввода сообщения (и в самих сообщениях) у нумерованного
списка двузначные маркеры (`10.`, `11.`) обрезались слева.

**Причина:** `list-style: decimal` + `list-style-position: outside` с малым
`padding-left` (1.25rem) — маркер «висит» в padding'е и при ширине больше
него вылезает влево, где его срезает контейнер.

**Фикс** ([`globals.css`](../../src/app/globals.css)): списки мессенджера
(`.messenger-editor .ProseMirror` и `.messenger-content`, `ol`/`ul`)
переведены на **`list-style-position: inside`** с `padding-left: 0`. Маркер
теперь внутри контента и растёт вправо → номера любой длины (10, 100…) не
обрезаются, без лишнего левого отступа. Чтобы маркер и текст были на одной
строке, `li > p` сделаны `display: inline`.

Компромисс: у переносов длинных строк нет висячего отступа (для чата ок).

## 2. План — редактирование текстовых блоков

(Доработка модуля «План», вне основной messenger-правки.)

- [`PlanBlockItem`](../../src/components/plan/PlanBlockItem.tsx):
  `htmlToPlain` экспортирована; `TextBlockBody` переделан из режима
  `editing`-флага в управляемый textarea с закрытием по `onClose` (blur).
- [`PlanSortableRow`](../../src/components/plan/PlanSortableRow.tsx):
  добавлено состояние `editingText` + кнопка-карандаш (Pencil) для входа в
  редактирование. Клик по самому тексту теперь только сворачивает/разворачивает
  блок, превью свёрнутого — через `htmlToPlain`.

## Затронутые файлы

- `src/app/globals.css`
- `src/components/plan/PlanBlockItem.tsx`
- `src/components/plan/PlanSortableRow.tsx`

## Проверки

- `npm run lint && npm test` — зелёные (перед коммитом).
