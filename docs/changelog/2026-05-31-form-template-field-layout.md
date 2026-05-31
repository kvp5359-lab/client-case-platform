# Шаблоны анкет — раскладка полей, риск-тег, фиксы UX

**Дата:** 2026-05-31
**Тип:** feature + UX + bugfix
**Статус:** completed

---

## Контекст

Доработка добавления и настройки полей в шаблонах анкет (`form-templates`)
и их отображения при заполнении анкеты в проекте. Главная фича — управление
шириной поля и переносом строки прямо из редактора шаблона. Без миграций БД:
все настройки кладутся в существующую jsonb-колонку `options`.

---

## 1. Раскладка полей анкеты (ширина + перенос)

Новые настройки на каждом поле в редакторе шаблона
([`EditFieldDialog`](../../src/components/templates/FormTemplateEditorPage/dialogs/EditFieldDialog.tsx)):

- **Ширина поля**: Треть / Половина / Вся ширина (сегмент из 3 кнопок).
- **Чекбокс «Начинать с новой строки»**.
- Доступно только для обычных полей; заголовки/составные/таблицы всегда во
  всю ширину.

Хранение — в jsonb `options` поля шаблона (`width`, `newRow`), типы расширены
в [`formKit.ts`](../../src/types/formKit.ts) (`FieldOptions.width: 'full' | '1/2' | '1/3'`, `newRow`).
Настройки каскадятся в уже созданные анкеты (готовый код в `updateFieldMutation`)
и копируются в новые (`create_form_kit_from_template` мёржит `options`). State
и сохранение — в [`FormTemplateContext`](../../src/components/templates/FormTemplateEditorPage/context/FormTemplateContext.tsx) +
[`FormTemplateEditorPage`](../../src/components/templates/FormTemplateEditorPage/FormTemplateEditorPage.tsx) (патч существующих `options`, не перезапись).

Рендер заполнения — [`FieldsGrid`](../../src/components/forms/FieldsGrid.tsx):

- Сетка переведена на **6 колонок** на десктопе (НОД 2 и 3): треть = `col-span-2`,
  половина = `col-span-3`.
- **«Вся ширина» = занять остаток текущей строки**, а не всегда целая строка.
  Если строка заполнена (остаток 0) — переносится и занимает новую строку целиком.
  CSS-сетка «остаток» не считает, поэтому ведётся симуляция укладки (счётчик
  занятых колонок), `col-span` для `full` = `6 - used`.
- Принудительный перенос («с новой строки») — невидимой распоркой, добивающей
  остаток строки (без конфликта `col-start` + `col-span`).
- Дефолт = треть → текущий вид сохраняется. textarea без явной ширины — старая
  авто-группировка в 2 колонки; с явной шириной выпадает из неё.

## 2. Фикс риск-оценки — «не сохранялась»

[`useFormFields`](../../src/components/templates/FormTemplateEditorPage/hooks/useFormFields.ts) —
в `select` загрузки полей добавлена колонка `risk_assessment_enabled`. Запись в
БД работала всегда, но значение не подгружалось обратно (колонку не
запрашивали) → галочка сбрасывалась в `false`, выглядело как «не сохраняется».

## 3. Список полей в редакторе шаблона

[`DraggableFieldRow`](../../src/components/templates/FormTemplateEditorPage/components/DraggableFieldRow.tsx):

- Тег **«риск»** рядом с названием (янтарный, компактный, без контура) — для
  полей с включённой риск-оценкой.
- Описание поля — в одну строку (`truncate`), без распирания таблицы.
- Справа — маленькие серые **иконки раскладки**: перенос (`CornerDownLeft`) +
  ширина (`Columns3` / `Columns2` / `RectangleHorizontal`). Видны только у полей,
  где ширина настраивается.
- Кнопки edit/remove переведены на `hidden group-hover:flex` — убрана
  зарезервированная пустота, на hover кнопки выезжают справа и сдвигают иконки.

## 4. Диалог «Добавить поля»

[`AddFieldsDialog`](../../src/components/templates/FormTemplateEditorPage/dialogs/AddFieldsDialog.tsx):

- Фикс горизонтального скролла — `DialogContent` это CSS-grid, его элементы
  имеют `min-width: auto` и не сжимались ниже min-content (`truncate` =
  `white-space: nowrap` распирал окно). Добавлен `min-w-0` на grid-элемент и
  промежуточный flex-контейнер → длинные имена обрезаются многоточием.
- Уменьшен шрифт: имя поля `text-sm`, описание `text-xs`.

## 5. Описание поля при заполнении анкеты

[`FloatingField`](../../src/components/forms/FloatingField.tsx):

- Клик на иконку «?» больше **не переводит поле в режим редактирования** —
  фокус кнопки всплывал до контейнера с `onFocus`. Добавлен `onFocus`
  `stopPropagation` на кнопку-вопрос. Теперь сразу открывается попап.
- В попапе описания работают переносы строк (`whitespace-pre-line`). То же —
  для попапа заголовка key-value-table в `FieldsGrid`.

## Затронутые файлы

- `src/types/formKit.ts`
- `src/components/forms/FieldsGrid.tsx`, `FloatingField.tsx`
- `src/components/templates/FormTemplateEditorPage/FormTemplateEditorPage.tsx`
- `src/components/templates/FormTemplateEditorPage/context/FormTemplateContext.tsx`
- `src/components/templates/FormTemplateEditorPage/components/DraggableFieldRow.tsx`
- `src/components/templates/FormTemplateEditorPage/dialogs/AddFieldsDialog.tsx`, `EditFieldDialog.tsx`
- `src/components/templates/FormTemplateEditorPage/hooks/useFormFields.ts`

## Проверки

- `npx tsc --noEmit` — чисто.
- `eslint` по затронутым файлам — чисто.

## Открытые вопросы

- «Вся ширина» после трети+половины (2+3 из 6) даёт остаток в 1 колонку —
  поле станет узким. Это буквально «всё свободное место»; перенос только при
  остатке 0. При необходимости — добавить порог минимальной ширины.
- Симуляция укладки в `FieldsGrid` должна совпадать с auto-flow браузера —
  визуально проверено на десктопе, граничные комбинации стоит ещё прогнать.
