# Дедлайн и исполнители в Email-шаблоне треда

**Дата:** 2026-06-29
**Тип:** feat
**Статус:** completed (ждёт деплоя фронта)

---

## Запрос

В редакторе шаблона треда поля «Дедлайн (N дней)» и «Исполнители» были доступны
только в режиме Задача. Нужны и для Email-шаблонов.

## Корень

Не баг бэкенда — цепочка создания письма (`useChatSettingsSave`, ветка chat/email
поддерживает «как задача»: дедлайн, исполнители, статус) и `applyTemplate`
(считает `taskDeadline`/`taskAssigneeIds` для любого типа, применяет
`useChatSettingsTemplateApply` безусловно) уже всё применяли. Блокировал только
**редактор шаблона**: оба поля были под условием `isTask`.

## Что сделано

- `ThreadTemplateFields.tsx`: гейт блоков «Дедлайн» и «Исполнители» расширен с
  `isTask` на `(isTask || isEmail)`.
- `useThreadTemplateForm.ts` (`handleSave`): `deadline_days` и `assignee_ids`
  сохраняются при `isTask || isEmail`.
- Статус (`default_status_id`) и автопереход проекта (`on_complete...`) остались
  task-only (не запрашивались).

## Грабли

`ThreadTemplateFields` общий с `RecurringRuleDialog` — там `isEmail` не
выставляется, гейт `(isTask || isEmail)` его не задевает.

## Файлы

- `src/components/templates/ThreadTemplateFields.tsx`
- `src/components/templates/useThreadTemplateForm.ts`

## Проверки

tsc 0, lint 0. Чистый фронт, БД/каналы не трогали. Смок после деплоя: в
email-шаблоне задать дедлайн+исполнителей → применить шаблон → у созданного
письма дедлайн и исполнители проставлены.
