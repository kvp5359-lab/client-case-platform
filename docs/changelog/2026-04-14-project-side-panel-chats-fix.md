# Фикс боковой панели: доступ к чатам и кнопка разворачивания

**Дата:** 2026-04-14
**Тип:** fix
**Статус:** completed

---

## Проблема

1. **Рассинхрон данных и логики.** При входе клиента в проект правая панель принудительно открывалась с табом `'client'` (чаты), даже если модуль чатов в проекте был выключен. Когда клиент сворачивал такую панель — кнопка разворачивания пропадала: `FloatingPanelButtons` не показывал её, потому что у клиента не было ни одного доступного таба (`messengerEnabled = false`, ассистент/дополнительно клиенту не положены).
2. **Legacy-данные в БД.** У двух шаблонов проектов (`Бизнес-план`, `ВНЖ cuenta propia`) в `enabled_modules` оставалось значение `'threads'` вместо `'tasks' + 'chats'`. Миграция `20260413_split_threads_into_tasks_and_chats.sql` лежала в репо, но на проде не была применена. Из-за этого `modules.chats` всегда возвращался `false` — вкладка чатов не появлялась ни у кого (ни у админа, ни у клиента).

## Решение

1. Применена миграция `20260413_split_threads_into_tasks_and_chats.sql` на продакшен-БД:
   - `project_templates.enabled_modules`: `'threads'` → `'tasks' + 'chats'`
   - `project_roles.module_access`: `"threads": bool` → `"tasks": bool + "chats": bool`
   - `project_roles.module_access`: `"card_view"` → `"documents"`
   - Проверено: после миграции 0 шаблонов с `'threads'`, 0 ролей с `'threads'`, 0 ролей с `'card_view'`.
2. `ProjectPage` больше не форсит открытие панели до загрузки модулей, и открывает таб `'client'` только когда `modules.chats = true`. Если модуль выключен — панель остаётся закрытой, а `FloatingPanelButtons` показывает кнопку разворачивания по своим правилам.
3. `modules.chats` вынесен в `useRef`, чтобы не раздувать deps `useEffect` и избежать ошибки React `array changed size between renders` при HMR.

## Затронутые файлы

| Файл | Изменение |
|------|-----------|
| `src/page-components/ProjectPage.tsx` | Ждём `!loadingModules` перед открытием панели. Форсим `'client'` только при `modules.chats`. `chatsEnabledRef` стабилизирует deps useEffect. |
| БД прода | Применена миграция `20260413_split_threads_into_tasks_and_chats.sql` |
