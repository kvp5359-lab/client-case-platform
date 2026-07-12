# План: консолидация отправки мессенджера (сокращение карантина)

> **ПРОГРЕСС (2026-07-12):** сделано ЯДРО — Уровень 1 (D1.1 сторож
> `check-edge-invariants`, D1.2 тесты паритета маршрутизации, D1.3 частично),
> D2.1 (единый резолвер `resolveThreadChannel` + интеграция в отправку),
> D2.2 (visibility-backstop в business-send/edit + дыра закрыта),
> D3.1 (гибрид: publish во все каналы через RPC `deliver_message` → канон;
> TG-дубль publish убран = D2.4 частично; delayed покрыт = D3.2 частично).
> ⏳ Всё ждёт смока; фронт НЕ запушен (по решению владельца).
> ОСТАЛОСЬ (гигиена, не дыры): D2.3 (общие edge-хелперы, 5 функций + деплой
> каждой + смок), D4.1 (фронт-фасад `dispatchOutgoing`), D4.3 (удалить мёртвый
> gmail-send; свести markAsRead), cron+email-вложения (остаток D3.2).
>
> **Статус:** ядро реализовано, гигиена — по запросу.
> **Цель:** уменьшить хрупкость карантина — свести неявные контракты БД↔edge↔фронт
> к явным и единым, убрать дубли, закрыть дыры паритета. НЕ «переписать всё
> одним махом»: делаем маленькими обратимыми шагами, каждый со смоком.
> **Правило безопасности:** это карантин с живыми клиентами. Ни один шаг не
> уходит в прод без зелёного смока соответствующих каналов. Любой шаг обратим
> одним `git revert` / redeploy предыдущей версии.

---

## 0. Что мы НЕ трогаем (и почему) — границы

**Два транспорта остаются раздельными** и это осознанно, НЕ долг:
- **Текст** → INSERT `project_messages` → БД-триггер `dispatch_message_to_channels` (синхронно, server-side).
- **Вложения** → INSERT + загрузка в Storage → **фронт-invoke** edge-функции.

Причина фундаментальна: на момент INSERT'а файлы ещё не привязаны к
`message_attachments` (объекты `File` живут в браузере, грузятся асинхронно).
Триггер сознательно пропускает `has_attachments=true`, ожидая, что файлы дошлёт
фронт после подтверждённой загрузки. Попытка «объединить транспорт» (всё через
триггер, или всё через фронт) = переписать приём/отправку всех 5 каналов разом
= недопустимый риск. **Мы сокращаем не число транспортов, а число НЕЯВНЫХ
контрактов между ними.**

Итог сокращения (реалистичный): один источник маршрутизации, один гейт
видимости, один набор edge-контрактов, закрытые дыры паритета, убранные дубли,
инварианты-сторожа. Транспортов по-прежнему два, но их стык — явный и
проверяемый.

---

## 1. Текущее состояние (карта, факт по коду на 2026-07-12)

### Слои и точки инициации
- **БД (4 пути):** (1) INSERT нового web-сообщения → триггер `notify_telegram_on_new_message` → `dispatch_message_to_channels` (текст); (2) cron `dispatch_scheduled_messages` (созревшие черновики, `force=has_attachments` → шлёт И вложения); (3) `notify_on_send_status_retry` (failed→pending, только текст); (4) `set_initial_send_status` (BEFORE INSERT: web+не-draft+не-scheduled → pending, иначе sent).
- **Фронт: 17 живых `functions.invoke` точек** внешней доставки (4 send-вложения, 1 publish-draft, 1 edit, 8 delete, 3 react) + 1 мёртвый (`gmail-send`, `useSendEmail` — гасится в `handleSend`, кандидат на удаление).
- **Edge: 5 send + 5 delete + 4 react + 1 edit.**

### Маршрутизация канала треда живёт в ТРЁХ несинхронных представлениях
1. SQL `dispatch_message_to_channels` (текст): `email → mtproto → business → wazzup → tg-group → internal`.
2. Фронт `messengerService.send.ts` (вложения): `email → wazzup → mtproto → (business) → (tg)`.
3. Фронт `resolveMessageChannelKind` (удаление): `wazzup → mtproto → business → tg`.

Порядок веток должен совпадать **вручную**. Расхождение приоритета = доставка/
удаление не в тот канал. **Это единственный самый опасный неявный контракт.**

### Гейт видимости (`visibility='client'`) — в 5+ местах
- фронт `sendMessage` (send.ts:214), фронт `publishDraftMessage` (draft.ts:199),
- SQL-триггер `dispatch_message_to_channels`,
- edge-backstops: `telegram-send-message`, `wazzup-send`, `telegram-mtproto-send`, `email-internal-send`.
- **ДЫРА:** `telegram-business-send` и `telegram-edit-message` backstop'а НЕ имеют.

### Дыры паритета
- **`publishDraftMessage` реализует ТОЛЬКО TG-группу.** Публикация черновика в email/wazzup/mtproto-треде → триггер на UPDATE не срабатывает, фронт не шлёт → **сообщение может не уйти**.
- **Отложенное сообщение с вложениями:** cron `dispatch(force)` пропускает `has_attachments` для не-force-каналов частично, а фронт-invoke cron не делает → латентная дыра.
- `retry` (failed→pending) шлёт только текст (вложения не переотправляются через триггер).

### Дубли
- TG-вложения-блок дословно в `sendMessage` (send.ts:305-339) и `publishDraftMessage` (draft.ts:181-223).
- Удаление: `deleteFileInChannel` (per-file) и `deleteWholeMessageInChannel` — два switch по каналам, те же 4 delete-функции.
- `markAsRead`-после-отправки в 4 местах (`useSendMessage`, `useDelayedSend`, `usePublishDraft`, `useToggleReaction`).
- Edge: `loadOutgoingMessage`, `assertClientVisibility`, `assertMembership`, idempotency-guard, `resolveReplyExternalId`, auth-преамбула — повторяются в каждой send-функции.

### Расхождения edge (детали в отчёте аудита)
- idempotency-guard есть в business/wazzup, нет в telegram-send/mtproto.
- auth-модель разной силы (secret-only / getUser+membership / JWT-only).
- MTProto: финальный `send_status='sent'` ставит **mtproto-service** (Node), не edge.
- reply-fallback разошёлся по каналам (per-bot карта / reply_parameters / текст-префикс).

---

## 2. Целевое состояние

- **Один резолвер канала треда** `resolveThreadChannel(thread) → ChannelTarget` — единственный источник «куда идёт этот тред», используется отправкой, удалением, публикацией. SQL-триггер приводится в соответствие + инвариант-сторож на совпадение порядка.
- **Один гейт видимости** — вычисляется один раз, edge-backstop единый (`_shared`), присутствует во ВСЕХ send/edit (включая business).
- **Один фронт-сервис `dispatchOutgoing(messageId)`** — инкапсулирует «резолви канал+тип → сделай нужный invoke/или доверься триггеру». Все инициаторы (send/publish/delayed/forward) зовут его; дубли исчезают, паритет автоматический.
- **Единые edge-хелперы** (`loadOutgoingMessage`/`assertClientVisibility`/`assertMembership`/`idempotencyGuard`/`resolveReplyExternalId`) — расхождения выровнены.
- **Инварианты-сторожа** ловят рассинхрон маршрутизации и отсутствие backstop.

---

## 3. Инварианты безопасности (истинны ПОСЛЕ каждого шага)

1. Обычная клиентская отправка (текст/файл/альбом/reply) доходит во все 5 каналов — как раньше.
2. Внутреннее (team/self) сообщение — текст И файл — НЕ уходит клиенту ни одним путём.
3. Нет дублей отправки (отложенная, retry).
4. Смок-матрица (`smoke-matrix.mjs`) зелёная до и после шага.
5. `deno check` изменённых edge чист (lock не тронут); фронт `tsc`+`lint`+`test` зелёные.
6. Каждый шаг = отдельный коммит, обратимый независимо.
7. Ledger обновлён после шага; дрейф БД = 0, `check-db-invariants` зелёный.

---

## 4. Фазы (порядок = от нулевого риска к архитектурному)

### Уровень 1 — Заморозить контракты (риск НУЛЕВОЙ, только защита)
Прежде чем двигать код — покрыть контракты автопроверками, чтобы любой следующий
шаг, сломавший их, падал сразу. Часть уже есть (publishDraft-тест, smoke `internal-vis`).

**D1.1 — Инвариант «visibility-backstop во всех send-edge».**
CI-скрипт (или расширение `check-db-invariants`/новый `check-edge-invariants.mjs`):
grep, что каждый `*-send/index.ts` содержит проверку `visibility` перед доставкой.
- *Контракт фиксируется:* «ни одна send-функция не шлёт без гейта visibility».
- *Смок:* не нужен (скрипт, не рантайм). Прогон CI.
- *Откат:* удалить скрипт. *Готово:* скрипт падает, если убрать backstop из любой send.

**D1.2 — Тест паритета маршрутизации.**
Unit: таблица «тред-сигналы → ожидаемый канал» прогоняется через фронт-резолвер;
отдельный SQL-тест сверяет порядок веток `dispatch_message_to_channels` с той же
таблицей (через `_schema_invariants` или новый read-only RPC, отдающий порядок веток).
- *Контракт:* три представления маршрутизации дают один и тот же канал.
- *Готово:* тест падает при изменении порядка в одном из мест.

**D1.3 — Тесты пути отправки (расширить существующие).**
`sendMessage`: visibility прокидывается; split создаёт 2 записи корректно;
forward-вложения ссылаются на существующие files. Мок supabase.
- *Готово:* регрессия любого из контрактов раздела (г) ловится unit'ом.

### Уровень 2 — Убрать дубли БЕЗ смены архитектуры (риск НИЗКИЙ)

**D2.1 — Единый резолвер канала треда (фронт).**
Новый `src/services/api/messenger/resolveThreadChannel.ts`:
`(thread) → { kind: 'email'|'mtproto'|'business'|'wazzup'|'tg_group'|'internal', ... }`
с ЕДИНЫМ порядком приоритета. Заменяет ad-hoc ветвление в `sendMessage` и
`resolveMessageChannelKind` (удаление). Чистая функция → покрыта D1.2.
- *Смок:* отправка + удаление во всех каналах (порядок не съехал).
- *Откат:* revert. *Готово:* оба пути (send/delete) зовут один резолвер; дублей ветвления нет.

**D2.2 — Единый edge visibility-backstop + закрыть дыру business/edit.**
`_shared/outgoing.ts`: `assertClientVisibility(msg): boolean`. Все 5 send + edit
зовут его. **Добавить backstop в `telegram-business-send` и `telegram-edit-message`** (сейчас его нет).
- *Смок:* внутреннее в Business-тред → НЕ уходит; правка внутреннего → не уходит; клиентское → как раньше.
- *Откат:* redeploy предыдущих версий. *Готово:* backstop единый, присутствует везде, D1.1 зелёный.

**D2.3 — Общие edge-хелперы.**
В `_shared/outgoing.ts` вынести `loadOutgoingMessage`, `assertMembership`,
`idempotencyGuard`, `resolveReplyExternalId`, унифицировать auth-преамбулу на
`_shared/edge.ts`. Каждую функцию переводить ПООТДЕЛЬНО (отдельный коммит+смок),
не все разом. Выровнять расхождения: idempotency добавить в telegram-send/mtproto.
- *Смок:* полная матрица канала после КАЖДОЙ переведённой функции.
- *Откат:* пофункционально. *Готово:* дубли edge убраны, `deno check` чист.

**D2.4 — Дедуп TG-вложения-блока фронта.**
Вынести дублирующийся `telegram-send-message`-вложения-invoke из
`publishDraftMessage` и `sendMessage` в общий хелпер.
- *Готово:* один хелпер, два вызывающих.

### Уровень 3 — Закрыть дыры паритета (риск СРЕДНИЙ)

**D3.1 — `publishDraftMessage` → полный паритет с `sendMessage`.**
Публикация черновика должна уметь ВСЕ каналы (сейчас только TG). Реализуется
через D2.1 (резолвер) + общий «доставить сообщение X» хелпер.
- *Смок:* черновик в email/wazzup/mtproto-треде → публикация доходит; с вложениями — доходит.
- *Готово:* publish и send идут одним кодом доставки; дыра закрыта.

**D3.2 — Отложенные с вложениями.**
Убедиться, что созревший черновик с вложениями доставляется (cron `force` +
координация с фронт-invoke, или единый путь через D3.1). Возможно правка
`dispatch_scheduled_messages`.
- *Смок:* отложить сообщение С файлом → в срок доходит один раз, не двоится (CAS).
- *Готово:* нет латентной дыры «отложенное+вложение не ушло».

### Уровень 4 — Единая точка инициации отправки (риск ВЫШЕ СРЕДНЕГО, финал)

**D4.1 — Фронт-сервис `dispatchOutgoing(messageId, opts)`.**
Единственная функция, инкапсулирующая: резолв канала (D2.1) + тип (текст/вложение)
+ гейт visibility + нужный invoke (или «доверься триггеру» для текста). Все
инициаторы (`useSendMessage`, `usePublishDraft`, `useDelayedSend`, forward) зовут ТОЛЬКО её.
- *Смок:* вся матрица + черновики + отложенные + пересылка.
- *Откат:* revert (инициаторы возвращаются к прямым вызовам). *Готово:* одна точка инициации внешней доставки во фронте.

**D4.2 (опционально, оценить надобность) — единый edge-«диспетчер».**
Рассмотреть тонкий `outgoing-dispatch` edge поверх 5 send. Скорее всего
ИЗБЫТОЧНО после D2.3 (хелперы уже унифицируют) — решать по факту, не делать ради красоты.

**D4.3 — Чистка.**
Удалить мёртвый `gmail-send`/`useSendEmail`. Свести `markAsRead`-после-отправки
в один хелпер. Обновить `channels.md`/`gotchas.md`/ledger — контракты теперь явные.

---

## 5. Тесты и гейты, добавляемые по ходу
- D1.1: `check-edge-invariants` (backstop во всех send).
- D1.2: unit паритета маршрутизации + SQL-порядок-веток RPC.
- D1.3/D3: unit на `dispatchOutgoing`, split, forward, publish-паритет.
- Каждый уровень расширяет `smoke-matrix.mjs` новым combo (напр. publish в каждый канал).

## 6. Зависимости и порядок
D1.* → независимы, делать первыми (защита). D2.1 → база для D2.4, D3.1, D4.1.
D2.2/D2.3 → независимы друг от друга, любой порядок. D3.1 зависит от D2.1.
D4.1 зависит от D2.1+D3.1. D4.2 — по факту после D2.3.

## 7. Оценка
| Уровень | Риск | Время (со смоками) |
|---|---|---|
| 1 (защита) | нулевой | 0.5–1 день |
| 2 (дубли) | низкий | 2–3 дня |
| 3 (дыры) | средний | 1–2 дня |
| 4 (единая точка) | выше среднего | 2–3 дня |

Каждая фаза — самостоятельная ценность; можно остановиться после любого уровня.
Даже Уровень 1+2 уже существенно сокращает хрупкость (защита + единая маршрутизация
+ закрытая дыра business-backstop + убранные дубли).

## 7bis. Чистота мессенджера — backlog из полной карты (5 картографов)

Сделан ЯДРО-набор чистоты (коммичено):
- ✅ `MessageVisibility` — единый тип вместо инлайна в 11 файлах.
- ✅ `MessageBubble` раскраска → `resolveBubbleAppearance` (единое место; тело стало оркестратором).
- ✅ `DeliveryStatus` — сужение канона (`Exclude`) вместо дубля-определения.
- ✅ `resolveChannelDefault` → `_shared/channelDefaults.ts` (дедуп business/wazzup).

### 🔴 РЕАЛЬНЫЕ БАГИ (не чистота — найдены картой, требуют фикса+смока)
- **mtproto `handleEdit` без session-scope** (`raw.ts:~244`): `.eq(telegram_chat_id).contains(telegram_message_ids)` без фильтра по сессии/треду → два сотрудника ведут одного клиента + совпал `telegram_message_id` → правка уходит не туда / теряется. Соседи (реакции, read) скоупят по сессии — `handleEdit` выбивается. Добавить фильтр.
- **Правка MTProto-сообщения не доходит в Telegram**: фронт шлёт в `telegram-edit-message` (только бот-канал, нет MTProto-ветки), а mtproto `/messages/edit` не вызывается ниоткуда. Достроить проводку либо честно убрать (тогда UI не должен предлагать правку MTProto).
- **`flow.ts` утечка gramjs-коннекта** в `sendCode`/`finalizeAuth` (нет try/finally с disconnect на неуспешных путях).

### Приоритет чистоты (осталось; всё требует деплой+смок карантина)
**ВЫСОКИЙ**
- Edge **D2.3** — общие send-хелперы `_shared/outgoing.ts` (`loadOutgoingMessage`/`assertMembership`/`idempotencyGuard`/`resolveReplyExternalId` + единая auth-преамбула); выровнять расхождения (idempotency в telegram-send/mtproto; auth-модель). 5 функций.
- **v1 ретайр** (после смока треда «Клиенты» по плану F1) → снять весь v1↔v2 дубль (монолит `telegram-webhook/index.ts` 798 стр дублирует v2 без его фиксов). Не бэкпортить фиксы в v1 — ускорять вывод.

**СРЕДНИЙ**
- mtproto `commands.ts` God-file (818) → `routes/commands/{send,react,delete,backfill}.ts`; вынести send-attachments и inline-аватар-IIFE.
- mtproto `ingestMtprotoMessage` (`incoming.ts` ~232 стр) → `resolveClientIdentity`/`mergeAlbumMessage`/`insertMessageRow`.
- Дубль fire-and-forget avatar-fetch (business-webhook `triggerAvatarFetch` + v2 `sync.ts` inline) → helper.
- Двойной владелец `send_status` MTProto (edge `markMessageSent` И mtproto-service) — задокументировать источник истины.
- `gmail-webhook` `processGmailMessage` (162-319) → parse/resolveThread/persist.

**НИЗКИЙ / мёртвый код**
- Мёртвое: `telegram-setup-webhook` (нет вызывающих, регистрирует v1), mtproto `/threads/read`+`/users/fetch-avatar`+`hasClient`+`r2Remove`/`storageRemove`, фронт `gmail-send`/`useSendEmail` (гасится в handleSend).
- `DeliveryIcon` vs `DeliveryTick` дубль маппинга; `formatTime` дубль (переименовать список-версию в `formatRelativeTime`).
- mtproto `humanError` ×2 → `utils/telegramErrors.ts`; `htmlFormatting` копия edge↔mtproto (тест-паритет/ссылка).

### Неявные контракты → сделать явными (из карт)
- «downloadAttachments только при `outcome==='inserted'`» — вынести гейт внутрь общего слоя (не соглашение у каждого вызывающего).
- dedup-ключи (колонки content-UNIQUE) — константа рядом с insert-payload, а не только в SQL-индексе.
- placeholder `📎` — общий модуль (сейчас литерал в 3 местах mtproto+фронт).
- `ctx.botToken` vs `getBotToken()` в v2 — сделать выбор явным (токен параметром в горячих путях).

## 8. Явно вне scope
Объединение двух транспортов в один; переписывание приёма (webhook'ов); смена
модели хранения per-bot id; рефактор реакций-toggle (3 копии) — отдельные задачи.
