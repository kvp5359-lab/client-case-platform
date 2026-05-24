# Перевод 4 справочников на `useTemplateList`

**Статус:** РЕШЕНИЕ — миграция нецелесообразна. Каждый из 4 справочников
имеет специфику, которую `useTemplateList` не покрывает без существенного
расширения. Документ оставлен как обоснование «почему не делаем».
**Дата:** 2026-05-24.

## Решение после анализа

Аудит был излишне оптимистичен. После детального чтения 4 файлов:

- **FieldTemplates** — selectedType-фильтр + FieldDefinitionDialog
  (не стандартный диалог).
- **FormTemplates** — D&D-переупорядочивание + колонка fields_count
  (join из подзапроса) + свой useFormTemplateMutations.
- **DocumentTemplates** — это не CRUD, а загрузчик файлов:
  upload-dialog (replace classic create), inline-rename, replace-file,
  placeholder-mapping. Copy не нужен.
- **SlotTemplates** — 5 кастомных полей в insert/update + 3 доп. queries
  (articles/groups/articleGroups для ArticleTreePicker) + EditSlotDialog.

Перевод требовал бы либо мощного расширения хука (extraFilter, customColumns,
customDialog, customDnD, customQueries), либо custom*-функций для каждого
поля — что съест выигрыш от DRY.

**Ценность миграции** — ~400 строк копипасты прибрать. **Цена** — рефакторинг
4 рабочих экранов без тестов на них + риск визуальной регрессии. ROI
отрицательный.

Если возникнет необходимость менять CRUD-логику справочников разом
(например, добавить аудит-лог на удаление) — лучше написать общий вспомогательный
хелпер `useStandardConfirmedDelete` или `useTemplateCopy`, а не переводить
все на useTemplateList.

## Контекст

Хук `src/components/templates/useTemplateList.ts` инкапсулирует CRUD-логику
справочников шаблонов: поиск, загрузка, создание, удаление, копирование, диалог.

Сейчас используют:
- `FolderTemplatesContent.tsx`
- `ProjectTemplatesContent.tsx`
- `DocumentKitTemplatesContent.tsx`
- `ThreadTemplatesContent.tsx`

Не используют (4 файла, ~1050 строк суммарно):
- `FieldTemplatesContent.tsx` (232)
- `FormTemplatesContent.tsx` (279)
- `DocumentTemplatesContent.tsx` (286)
- `SlotTemplatesContent.tsx` (252)

## Специфика каждого

### FieldTemplatesContent
- Доп. фильтр `selectedType` (поле по типу).
- Диалог: `FieldDefinitionDialog` (нестандартный).
- Нет copy-mutation.
- **Сложность миграции:** средняя. Нужно добавить `customFilterFn` в useTemplateList
  или оставить selectedType снаружи.

### FormTemplatesContent
- TODO: проверить специфику.

### DocumentTemplatesContent
- TODO: проверить специфику.

### SlotTemplatesContent
- 5 кастомных полей в insert/update (name, description, knowledge_article_id,
  ai_naming_prompt, ai_check_prompt).
- 3 доп. query (articles/groups/articleGroups).
- Диалог: `EditSlotDialog` (нестандартный).
- Copy-mutation копирует все 5 полей, не только name+description.
- **Сложность миграции:** высокая. Нужно `customCreateFn` + `customCopyFn`,
  доп. queries оставить снаружи.

## Стратегия

Не делать все 4 разом — слишком много специфики. Подход:

1. **Расширить useTemplateList** опциями:
   - `customSaveFields: string[]` — список полей для дефолтного INSERT/UPDATE
     (вместо хардкода name+description в copy).
   - `extraFilterPredicate?: (item) => boolean` — для FieldTemplates по типу.
2. **Мигрировать по одному**, в порядке возрастающей сложности:
   FormTemplates → DocumentTemplates → FieldTemplates → SlotTemplates.
3. После каждой миграции — npm run lint && npm test + проверить UI справочника.

## ROI

- Сэкономит ~400-600 строк копипасты.
- Уменьшит риск рассинхрона CRUD-логики (toast'ы, инвалидации) между справочниками.
- Нет автоматических тестов на этих экранах — миграция требует ручной проверки UI.
