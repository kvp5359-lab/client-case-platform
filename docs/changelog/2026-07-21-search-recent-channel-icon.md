# 2026-07-21 — Иконка канала треда в глобальном поиске и «Недавнем»

## Проблема

В дропдауне «Недавнее» (и в результатах глобального поиска в сайдбаре) у
чат-тредов рисовалось generic-облачко (`MessageSquare`) вместо иконки канала.
Например тред «Юрий Волчек (ТГ)» (Telegram) показывался облачком, а не
самолётиком.

**Корень:** `EntityIcon` (`search-parts/index.tsx`) для чат-тредов различал
только `threadType` (task → чеклист, email → конверт) и всё остальное сводил к
`MessageSquare`. Сохранённую иконку канала (`project_threads.icon` =
`telegram`/`whatsapp`/`mail`/…) он не получал — её не отдавали RPC
`global_search` и `get_recently_viewed`.

## Что сделано

1. **RPC `global_search` + `get_recently_viewed`** — в результат добавлено поле
   `thread_icon` (= `project_threads.icon` для тредов/сообщений, NULL для
   остального). Смена RETURNS TABLE → DROP+CREATE, гранты (public) сохранены
   default-ом. Миграция `20260721130000_search_recent_thread_icon.sql`.
2. **`EntityIcon`** — для чат-тредов резолвит иконку канала через общую карту
   `iconByThreadIcon` (та же, что рисует инбокс): `telegram` → самолётик,
   `whatsapp` → WhatsApp, неизвестная/пустая → облачко. task/email не тронуты.
3. Проброс `thread_icon` через типы (`GlobalSearchRow`/`RecentlyViewedRow`/
   `DisplayRow`), маппинги recent/search и проп `threadIcon` в `EntityIcon`.
   `database.ts` Returns обеих RPC дополнены вручную.

## Проверка

- Прод: тред «Юрий Волчек (ТГ)» → `icon='telegram'`; `iconByThreadIcon['telegram']`
  = Send (самолётик). RPC отдаёт `thread_icon`.
- `tsc` 0, `eslint` 0.

## Грабли

- Иконка канала в дропдауне резолвится через общую `iconByThreadIcon` — единый
  источник с инбоксом, не плодить карту.
- Страница `/search` (`SearchPage`) имеет СВОЙ локальный `EntityIcon` — этот фикс
  её не затрагивает (там тот же паттерн, если понадобится — править отдельно).
