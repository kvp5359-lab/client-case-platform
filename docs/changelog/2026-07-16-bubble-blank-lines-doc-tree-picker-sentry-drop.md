# Пустые строки баблов 1:1 + дерево документов в пикере «молнии» + Sentry-дроп шума

**Дата:** 2026-07-16
**Тип:** bugfix + feature + infra
**Статус:** completed (деплой: push в main → CI/CD blue/green; миграция doc_tree уже в проде через MCP)

---

Три независимых блока за день (две параллельные сессии + фикс мессенджера).

## 1. Мессенджер: «пересылка добавляет пустые строки» → бабл теперь показывает сообщение 1:1

**Симптом.** «Переслать сообщение → Оригинал» вставлял в поле ввода пустые
строки, которых «не было» в исходном бабле.

**Замер (прод, сообщение «БРИФ» `c6c29153`).** Сырой HTML сообщения реально
содержит двойные пустые абзацы `<p></p><p></p>`, `<br><br>` — так набрал автор.
Корень: бабл прогонял ЛЮБОЕ сообщение через email-пайплайн `collapseEmptyLines`
(потолок «максимум одна пустая строка подряд») → показывал меньше, чем хранится.
Пересылка вставляла сырой HTML → редактор показывал всё честно. Пересылка ни при
чём — бабл прятал.

**Решение (выбор владельца):** схлопывание — только для писем.
- [`src/utils/format/messengerHtml.ts`](../../src/utils/format/messengerHtml.ts) —
  `sanitizeMessengerHtml(html, { email })`: email → прежний полный пайплайн
  чисток; не-email → новый `normalizeMessageBlankLines` (пустые строки 1:1,
  пустой `<p></p>` → видимая `<p><br></p>`, хвостовые `<br>` выносятся, без
  потолка и email-чисток).
- [`BubbleTextContent.tsx`](../../src/components/messenger/BubbleTextContent.tsx),
  [`copyMessageText.ts`](../../src/utils/messenger/copyMessageText.ts) — флаг по
  `isEmailSource(message.source)`.
- +7 тестов (1055 всего). Детали и грабли — `messenger-ledger.md` за 2026-07-16.

Итог: не-email бабл = редактор = пересылка. Побочно: старые сообщения с «лишними»
пустыми строками в бабле станут длиннее — теперь честно, как набрано.

## 2. Пикер «молнии»: вкладка «Документы» = полное дерево вкладки «Документы» проекта

**Было.** Вкладка «Описания документов» показывала только статьи-описания,
привязанные к папкам/слотам, плоскими группами — без структуры и без узлов,
у которых статьи нет.

**Стало.** Вкладка (переименована в «Документы»,
[`QuickReplyPicker.tsx`](../../src/components/messenger/QuickReplyPicker.tsx))
показывает всё дерево «набор → папки → слоты»:

- Чекбокс = что вставить; номер = позиция в сообщении (правится вручную —
  «начни с 3» сдвигает хвост); перетаскивание = порядок (только в сообщении,
  сами документы проекта не трогаются). Порядок кликов ни на что не влияет.
- Есть статья → кликабельная ссылка; нет → просто название.
- Папка отмечена → жирный заголовок без номера, слоты вложены (1.1, 1.2);
  не отмечена → её слоты становятся верхним уровнем.
- Настройки формата (прятать под названием / нумеровать) — пер-пользователь
  в localStorage (`useSharePrefs`).

**Файлы:** [`ShareLinksTab.tsx`](../../src/components/share/ShareLinksTab.tsx)
(распил-оркестратор), новые
[`DocTreeView.tsx`](../../src/components/share/DocTreeView.tsx),
[`ArticleGroupsView.tsx`](../../src/components/share/ArticleGroupsView.tsx),
[`ExternalLinksView.tsx`](../../src/components/share/ExternalLinksView.tsx),
[`shareRowParts.tsx`](../../src/components/share/shareRowParts.tsx),
[`useShareExpansion.ts`](../../src/components/share/useShareExpansion.ts),
[`useSharePrefs.ts`](../../src/components/share/useSharePrefs.ts), чистая сборка
вставки [`src/lib/share/docTreeInsert.ts`](../../src/lib/share/docTreeInsert.ts)
(+тест), типы в [`shareLinks.ts`](../../src/services/api/shareLinks.ts).

**Миграция** [`20260715210000_shareable_doc_tree.sql`](../../supabase/migrations/20260715210000_shareable_doc_tree.sql)
(⭐ уже в проде): RPC `get_project_shareable_resources` отдаёт секцию `doc_tree`;
секция `articles` намеренно не тронута (прод-фронт до выката читает описания
оттуда — убрать fold-ветку можно отдельным заходом ПОСЛЕ выката фронта).

## 3. Sentry: транзиентный шум теперь дропается (квота Developer 5k)

Первая версия правки (2026-07-09) понижала шум до `level='warning'`. 2026-07-15
кончился триал Sentry → план Developer, 5000 событий/месяц, и квота считается по
ФАКТУ отправки — уровень не влияет. Исчерпание квоты → Sentry дропает всё подряд,
включая реальные краши.

- [`src/instrumentation-client.ts`](../../src/instrumentation-client.ts) —
  `beforeSend` на noise-паттернах (`^Не удалось загрузить`, `Failed to fetch`,
  `NetworkError`, `Loading chunk … failed` и т.п.) возвращает `null` (дроп).
- [`docs/bugs/open/2026-07-08-sentry-load-fail-noise.md`](../bugs/open/2026-07-08-sentry-load-fail-noise.md)
  — обоснование дропа vs понижения.

После деплоя проверить: реальные краши (ErrorBoundary, Maximum update depth)
по-прежнему летят как `error` — под noise-паттерны они не попадают.

## Смок после деплоя

- Бабл «БРИФ» показывает двойные пустые строки; «Переслать → Оригинал» = бабл
  без расхождений; входящие письма рендерятся как раньше (компактно).
- Молния → вкладка «Документы»: дерево, чекбоксы/номера/перетаскивание, вставка
  ссылок и названий.
