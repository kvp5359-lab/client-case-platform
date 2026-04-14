# Рефакторинг модуля досок

**Дата:** 2026-04-14
**Тип:** refactor
**Статус:** completed

---

## Проблема

Модуль досок накопил технический долг после быстрого добавления фич (cardLayout, display modes, группировка):

1. **BoardTaskRow** — 3 почти идентичных блока рендеринга (cardLayout, cards fallback, list fallback). Любой багфикс надо делать в 3 местах.
2. **BoardProjectRow** — 2 дублированных блока рендеринга.
3. **BoardListCard** — 312 строк, header + контент + меню + фильтрация в одном компоненте.
4. **ListSettingsDialog** — 13 отдельных useState, дублированная логика сброса при открытии и смене типа.
5. **swap sort_order** — два отдельных мутейта без атомарности: если первый пройдёт, а второй упадёт — данные рассогласуются.
6. **database.ts** — не синхронизирован со схемой: отсутствовали `card_layout`, `column_widths`.
7. **ListFilterEditor** — мёртвый код (145 строк), нигде не импортировался.
8. **Дублированные константы** — FONT_SIZES, TRUNCATES определены в двух файлах.

## Решение

1. Добавлена `visibleFieldsToLayout()` — конвертирует legacy visibleFields в CardLayout на лету. Теперь BoardTaskRow и BoardProjectRow всегда рендерят через единый путь (TaskField / ProjectField).
2. Выделен `BoardListHeader` — header списка с меню, swap и удалением.
3. 13 useState заменены на `useReducer` через кастомный хук `useListSettingsState`.
4. Создана RPC `swap_board_list_sort_order()` — атомарный swap в одной транзакции.
5. database.ts синхронизирован: добавлены `card_layout`, `column_widths`, RPC `swap_board_list_sort_order`.
6. ListFilterEditor удалён. Константы стилей вынесены в `listSettingsConfigs.ts`.

## Затронутые файлы

| Файл | Изменение |
|------|-----------|
| `src/components/boards/BoardTaskRow.tsx` | 3 пути → 1 через visibleFieldsToLayout. 316→178 строк |
| `src/components/boards/BoardProjectRow.tsx` | 2 пути → 1. 190→139 строк |
| `src/components/boards/BoardListCard.tsx` | Header выделен в BoardListHeader. 312→210 строк |
| `src/components/boards/BoardListHeader.tsx` | **Новый.** Header списка — 115 строк |
| `src/components/boards/ListSettingsDialog.tsx` | 13 useState → useReducer. 262→162 строки |
| `src/components/boards/hooks/useListSettingsState.ts` | **Новый.** useReducer-хук — 100 строк |
| `src/components/boards/hooks/useListMutations.ts` | Добавлен `useSwapListOrder()` |
| `src/components/boards/cardLayoutUtils.ts` | Добавлена `visibleFieldsToLayout()` |
| `src/components/boards/listSettingsConfigs.ts` | Добавлены CARD_FONT_SIZES, CARD_ALIGNS, CARD_TRUNCATES |
| `src/components/boards/CardFieldStylePopover.tsx` | Импорт констант из configs |
| `src/components/boards/ListSettingsAppearanceTab.tsx` | Импорт констант из configs |
| `src/components/boards/ListFilterEditor.tsx` | **Удалён.** Мёртвый код |
| `src/types/database.ts` | card_layout, column_widths, swap RPC |
| `supabase/migrations/swap_board_list_sort_order.sql` | RPC для атомарного swap |
