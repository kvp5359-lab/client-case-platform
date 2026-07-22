# Красный бейдж при смешанном непрочитанном + две правки бабла/строк

**Дата:** 2026-07-22
**Тип:** feat + fix (мессенджер; БД + фронт)
**Статус:** БД — в проде через MCP; фронт — деплой push в main → CI/CD blue/green

---

Три изменения одной волны. Детальный журнал (замеры, гипотезы, грабли) — в
[`messenger-ledger.md`](../../.claude/rules/messenger-ledger.md), записи 2026-07-22.

## 1. Красный бейдж при смешении «Всем» + «Команде» (feat)

Внутри треда сообщения бывают клиентские (`visibility='client'`) и командные
(`team`). Теперь, если **непрочитаны и те, и другие**, бейдж треда — красный
(`rose`), тот же системный красный, что у «смешанного» бейджа проекта в
сайдбаре. Один вид непрочитанного → цвет акцента треда, как раньше.
Заглушённый тред → серый (приоритет выше).

**Почему это была не косметика.** Данных для различия не существовало:
`unread_count` складывал обе видимости в одно число, в `InboxThreadAggregate`
полей про visibility не было. Цвет бейджа брался только из акцента треда
(`accentStyles[...].badge` / `ACCENT_BADGE`), `getBadgeDisplay` решает лишь ТИП
(число/эмодзи/точка).

**БД** (миграция `20260722120000_thread_unread_mixed_visibility_badge.sql`):
- `thread_unread_state.has_mixed_unread` (булев флаг, не второй счётчик — для
  «смешано» нужен только факт наличия обоих видов);
- в `recompute_thread_unread_for` счётчик непрочитанных сообщений заменён на
  ОДИН проход с `count(*) FILTER (WHERE visibility = / <> 'client')` — общий +
  разбивка, без второго скана;
- флаг считается только для подписанного (в mute/пассиве бейдж и так серый);
  события и реакции не учитываются — у них нет видимости.

**🔑 Ключевое решение по риску:** флаг положен **только** в
`get_inbox_thread_aggregates` (+`_impl`), а НЕ в `get_inbox_threads_v3_for`. От
v3_for зависят 6 `_impl`-обёрток с жёстким совпадением колонок, и ровно такая
правка однажды клала прод (`get_workspace_threads` → `get_board_filtered_threads`:
пропали задачи, доски и календарь). Агрегаты и так грузятся на каждой странице
(сайдбар) и realtime-инвалидируются — данных хватает обоим бейджам.

**🪤 Поймано при правке (безопасность):** после `DROP+CREATE` Supabase выдаёт
новым функциям EXECUTE для `authenticated`/`service_role` по умолчанию. У
`get_inbox_thread_aggregates_impl` их быть не должно (было ноль): она
`SECURITY DEFINER` и **обходит** проверку «p_user_id = auth.uid()» из обёртки —
залогиненный мог бы прочитать чужие счётчики. Отозвано, REVOKE зафиксирован в
миграции. Правило: любой `DROP+CREATE` `_impl`-функции инбокса — сверять гранты
после.

**Фронт:** общий хук `useInboxAggregatesCache` (вынесена `useSyncExternalStore`-
логика из `UnreadBadge`, чтобы не дублировать) + `useThreadMixedUnread`.
`UnreadBadge` берёт флаг из своей же записи агрегата; `InboxChatItem` — через
хук (в строке инбокса флага нет, v3_for его не несёт).

**Бэкафилл:** 95 пар с непрочитанным → 8 смешанных; один случай сверен вручную
(1 клиентское + 2 командных → флаг верный).

## 2. 🔴 Регрессия: клик по строке треда на досках не открывал тред (fix)

Побочка недавнего «среднего клика». Гард «клик по внутреннему контролу» искал
элемент через `closest()` вверх **без границы**. `DraggableBoardTaskRow` спредит
на обёртку строки `{...attributes}` от dnd-kit `useSortable`, а там есть
`role="button"` — `closest()` находил эту обёртку (предка якоря), любой клик
считался кликом по контролу, и `onOpen()` не вызывался.

Теперь поиск идёт вверх вручную и **останавливается на самом якоре**
(`isControlInsideLink(target, currentTarget)`). Добавлен регрессионный тест на
`role="button"` у предка.

## 3. Плашка времени берёт фон бабла, а не акцент треда (fix)

`resolveBubbleAppearance` считал `timestampPillBg` от **сырого** акцента
(`colors.own`/`colors.incoming`), игнорируя `ownBubbleClass`/`incomingBubbleClass`,
посчитанные строкой выше. Из-за этого у сообщения «Команде» в клиентском чате
бабл серый, а плашка времени оставалась цвета треда (видно на вложении в
WhatsApp-треде).

Теперь плашка следует за баблом во всех режимах: команде — серый/чёрный,
заметка — тёмно-серый, «только я» — жёлтый, клиентское — акцент. Черновик и
провал доставки по-прежнему перебивают на белый. Добавлены первые тесты на
`resolveBubbleAppearance` (7 кейсов, включая регресс).

## Проверки

- Маркеры `_schema_invariants.recompute_markers` — все 5 целы (own-message
  watermark, change_deadline, assignee-гейт, visibility, subscription).
- Гранты inbox-агрегатов сверены до/после 1:1 (обёртка — authenticated +
  service_role; `_impl` — ноль).
- tsc 0, eslint 0, **1160 тестов**.
- Смок за пользователем после деплоя: тред с непрочитанными обоих видов → бейдж
  красный; один вид → акцент; заглушённый → серый; клик по строке треда на доске
  открывает тред; плашка времени совпадает с фоном бабла.

## Затронутые файлы

`supabase/migrations/20260722120000_thread_unread_mixed_visibility_badge.sql`,
`src/hooks/messenger/useInboxAggregatesCache.ts` (нов),
`src/components/tasks/UnreadBadge.tsx`,
`src/components/messenger/InboxChatItem.tsx`,
`src/services/api/inboxService.ts`, `src/types/database.ts`,
`src/lib/entityLinks.ts` (+тест),
`src/components/messenger/utils/messageStyles.ts` (+тест).

**БД (в проде через MCP):** `thread_unread_state.has_mixed_unread`,
`recompute_thread_unread_for`, `get_inbox_thread_aggregates(_impl)`.
