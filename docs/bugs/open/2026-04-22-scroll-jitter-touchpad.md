---
id: 2026-04-22-scroll-jitter-touchpad
title: Дёрганье при прокрутке истории и чатов на тачпаде MacBook
status: open
severity: medium
area: messenger, history, scroll
first-seen: 2026-04-22
last-investigated: 2026-04-22
reproduced: yes
---

## Симптомы

При прокрутке мессенджера (MessageList) и ленты «Вся история» (TimelineFeed) тачпадом на MacBook скролл периодически дёргается — контент резко смещается на несколько пикселей вверх/вниз. Проблема сохраняется даже после полной загрузки ленты: прокрутил вниз, вернулся, опять листаешь — всё равно дёргается.

## Как воспроизвести

1. Открыть проект с большим чатом (>30 сообщений) или «Всю историю» проекта (с сообщениями + аудит-событиями).
2. Прокрутить до верха/низа ленты двумя пальцами на тачпаде MacBook.
3. Наблюдать периодические микро-рывки вьюпорта.

## Фикс 2026-04-22 (ждём подтверждения пользователем)

После ресёрча (радар: множество открытых issue в radix-ui/primitives о jitter на trackpad macOS, issue [#2064](https://github.com/radix-ui/primitives/issues/2064), [#896](https://github.com/radix-ui/primitives/issues/896), [#2493](https://github.com/radix-ui/primitives/issues/2493), [radix-ui/themes#741](https://github.com/radix-ui/themes/issues/741)) применены три фикса:

1. **Radix `ScrollArea` заменён на нативный `<div className="overflow-y-auto">`** в `MessageList.tsx`. Главный источник jitter: Radix рендерит кастомный scrollbar и синхронизирует его позицию через ResizeObserver + rAF на каждом wheel-событии — на трекпаде (60–120 событий/сек) это даёт микродёрганье.
2. **`overflow-anchor: none` убран** в `MessageList.tsx` и `AllHistoryContent.tsx`. Раньше ставили, чтобы браузерный scroll-anchoring не конкурировал с ручной компенсацией `scrollTop`, но на деле anchoring как раз держит позицию при вставке DOM — выключив его, мы _усиливали_ прыжки. `auto` (дефолт) корректен.
3. **`contentVisibility: auto` на сообщениях удалён.** Известный эффект «dancing scrollbar» ([infrequently.org](https://infrequently.org/2020/12/content-visibility-scroll-fix/)): когда элемент уходит из вьюпорта, высота схлопывается к `contain-intrinsic-size`; если реальная высота отличается — скроллбар прыгает. В паре с Radix усиливало эффект.

## Уже пробовали (не помогло полностью)

1. **Автоскролл TimelineFeed переделан на one-shot** — раньше в течение 3 секунд после монтирования `bottomRef.scrollIntoView()` вызывался при каждом изменении длины ленты. Теперь — один раз, плюс блокируется при первом `wheel`/`touchmove`. Улучшило поведение при начальной загрузке, но основной jitter остался.

2. **`contentVisibility: auto` ослаблено в MessageList** — было `contentVisibility: auto` с `containIntrinsicSize: auto 80px` для всех сообщений кроме первых/последних 20 при `messages.length > 100`. 80px сильно меньше реальной высоты бабла, поэтому при входе в вьюпорт браузер пересчитывал макет. Подняли до 200px и включили только для списков >300. Частично помогло, но не полностью.

3. **`overflow-anchor: none`** добавлен на контейнеры скролла `MessageList` и `AllHistoryContent` — чтобы браузерный scroll-anchoring не конкурировал с ручной компенсацией `scrollTop` при подгрузке старых сообщений. Незначительно улучшило, но jitter остался.

## Возможные оставшиеся причины (требуют исследования)

1. **Radix ScrollArea** на macOS имеет известные проблемы с momentum-scroll от тачпада. Стоит попробовать заменить на обычный `<div className="overflow-y-auto">` и сравнить.

2. **Sticky day headers** в TimelineFeed (`sticky top-0 z-10`) — переходы между sticky-хедерами разных дней могут давать микроскачки из-за repaint.

3. **Re-renders во время скролла** — React Query может ре-валидировать запросы на фоне (`staleTime: 30s` у timeline messages, 5min у project history). Если кэш обновляется → новые ссылки массивов → reconciliation сотен `MessageBubble` → пропуск кадров.

4. **ResizeObserver в `useCollapsibleText`** — ref, но `useLayoutEffect` зависит от `content`. Вряд ли дёргает на скролле, но проверить.

5. **IntersectionObserver для sentinel** в MessageList может срабатывать несколько раз при быстрой прокрутке, каждый срабатывание — `onFetchOlder()` → возможно даже при `hasMoreOlder=false` стейт на долю секунды обновляется.

## План отладки

1. Снять performance trace в DevTools во время jitter-скролла — посмотреть где пик layout/paint.
2. Включить "Paint flashing" и "Layout shift regions" в Chrome DevTools → визуально засечь что перекрашивается.
3. Временно убрать `sticky` у day header — проверить, станет ли плавно.
4. Временно заменить Radix ScrollArea на plain div в MessageList.
5. Проверить, нет ли лишних re-render'ов бабблов через React DevTools Profiler (highlighting).
