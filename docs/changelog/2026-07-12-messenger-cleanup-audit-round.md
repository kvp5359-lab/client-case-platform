# Раунд чистоты мессенджера по итогам полного аудита (4 картографа)

**Дата:** 2026-07-12
**Тип:** refactor + test + ci (мессенджер: фронт, edge, БД; карантинная зона)
**Статус:** фронт/CI — push в main → CI/CD; edge — ждёт ручного редеплоя + смок; БД (self-test RPC) — уже в проде

---

Второй за день проход по мессенджеру с целью «максимум поддерживаемости». Запущен
полный read-only аудит четырьмя суб-агентами (фронт / edge-функции / mtproto-сервис
/ БД+тесты). Оценки: фронт ~7, edge ~7.5 (безопасность 9), mtproto ~8 (лучший блок,
все баги закрыты, паритет htmlFormatting цел), БД+тесты ~6 (слабейшее — хрупкое ядро
без поведенческих тестов + спящий страж утечки). Сделаны находки с хорошим
соотношением риск/польза; крупные распилы и тест ядра — с проверками. Канальную
логику маршрутизации (dispatch/webhook/send/visibility) не меняли — только
дедуп/чистка/вынос, поведение идентично.

Полная запись расследования — в [`messenger-ledger.md`](../../.claude/rules/messenger-ledger.md)
(журнал, раздел «2026-07-12 (2)»).

## 🔴 CI-страж утечки visibility — был спящий

`scripts/check-edge-invariants.mjs` (гард против утечки внутреннего сообщения
клиенту, инцидент 2026-07-08) существовал, но **не был подключён ни к одному
workflow** — единственная авто-защита на уровне канала бездействовала. Добавлен
шаг «Инварианты edge-отправки» в `db-drift.yml` (Ops Checks). Теперь удаление
visibility-backstop из любой из 7 send/edit-функций валит CI.

## Единый membership-хелпер (дедуп в security-месте)

Были две идентичные реализации проверки членства в воркспейсе —
`checkWorkspaceMembership` (`_shared/safeErrorResponse.ts`, ~30 вызовов) и
`assertWorkspaceMembership` (`_shared/outgoing.ts`, 9) + 2 инлайн-копии в Wazzup.
Сведено к **одной реализации**: `outgoing.ts` теперь реэкспорт-алиас (9 вызовов
`assert` не переписывались — минимум движения в карантине); `wazzup-send-reaction`
и `wazzup-mark-read` переведены с инлайна на хелпер; убран мёртвый импорт `assert`
в `telegram-send-message`/`wazzup-send`/`telegram-business-send`.

⚠️ `telegram-business-react`/`telegram-mtproto-react` инлайны **не трогали** — они
строже (проверяют `participant.id === body.participant_id`, не просто членство),
это не дубль.

Плюс: `telegram-edit-message` переведён с инлайн-гейта visibility на общий
`isInternalVisibility` (устранён рассинхрон с `telegram-mtproto-edit`);
stale-комментарии про удалённый v1 webhook (`syncTelegramReactions.ts`, mtproto).

## Фронт: мёртвая search-цепочка + единый escapeHtml

- **Удалён `useMessageSearch`** и вся его проводка (`searchQuery`/`setSearchQuery`/
  `searchResults`/`isSearchActive`/`onJumpToMessage`) из `useMessengerState` →
  `MessengerContext` → `MessageBubble`/`MessengerTabContent`. Инлайн-поиск ленты
  всегда был неактивен — заменён оверлеем `ThreadSearchOverlay` ещё 2026-07-10;
  jump-кнопка в баббле была мертва (`isSearchActive` всегда `false`).
  `handleJumpToMessage` оставлен (живой — его зовёт оверлей).
- **`escapeHtml` ×3 → один экспорт** из `messengerHtml.ts` (`QaPickerTab`,
  `forwardContent` переведены на общий).

## Гейт видимости вложений: тест + дедуп предиката

Точка утечки 2026-07-08 (внутреннее сообщение с файлом ушло клиенту) не была
покрыта ни одним тестом. Гейт `(visibility ?? 'client') === 'client'` дублировался
инлайном в `messengerService.send` (×2) и `messengerDraftService`.

- Новый leaf-модуль `src/lib/messenger/visibility.ts` — `isClientVisibleForDelivery`
  (зеркало edge-предиката `isInternalVisibility`), + 5 тестов.
- Обе точки переведены на общую функцию (3-я копия предиката устранена).

## Распил `MessageInput` 731→624

Единственный God-компонент фронта. Черновик/ресайз/файлы/quote уже были в хуках;
осталась связная забота «плашка Переведено» (state + persistence + восстановление
после reload + 2 хендлера, ~90 строк) — вынесена verbatim в
`hooks/useComposerTranslation.ts`.

## Распил `email-internal-send` 887→346

Самый большой edge-файл. `index.ts` оставлен тонким хендлером (валидация, дедуп,
threading, сборка HTML/текста/вложений, роутинг). Вынесены (verbatim, поведение не
менялось):

- `email-format.ts` (146) — HTML/текст-хелперы + `buildRfc2822`/RFC2047-кодирование;
- `email-types.ts` (64) — `MessageRow`/`ThreadRow`/`WorkspaceRow`/`OutboundEmailCtx`;
- `email-transports.ts` (351) — `sendViaEmployeeMailbox`/`sendViaResend`/
  `findGmailThreadByMessageId` + env-константы `ROOT_DOMAIN`/`RESEND_API_KEY`.

Каждый файл <400 строк. `index` заодно переведён с алиаса `assertWorkspaceMembership`
на прямой `checkWorkspaceMembership`. `deno check` (без `--node-modules-dir` →
lockfile не тронут) — 5 ошибок, все pre-existing strict-null deno-шум, новых 0.

## ⭐ Поведенческий self-test счётчиков непрочитанного (в CI)

Самая хрупкая функция мессенджера — `recompute_thread_unread_for` (расчёт красных
счётчиков непрочитанного), её многократно ломали правкой одного правила, задевая
другое. Тестов не было — только живая проверка руками.

Решение (по идее владельца «завязать на тестовые треды», безопасно): RPC
`_selftest_recompute_unread()` (миграция `20260712180000`, SECURITY DEFINER,
service_role only). Создаёт fixture во **ВНУТРЕННЕМ треде без канала** (триггер
отправки наружу ничего не шлёт — ветка «нет канала → sent») и **откатывает весь
fixture через вложенный `BEGIN/EXCEPTION` (savepoint)** — в базе ноль следов даже
при падении. Проверяет 4 сценария:

1. базовый unread (подписан, клиентское сообщение от другого) → 1;
2. own-watermark-гонка (моё сообщение позже чужого → чужое прочитано) → 0;
3. mute-архив (заглушён → обычный счётчик 0, архивный 1);
4. priority-пробой mute (ответ на моё сообщение пробивает заглушку) → 1.

Возвращает `'PASS'` или текст первого проваленного ассерта. Раннер
`scripts/check-recompute-selftest.mjs` (`.rpc` → ждёт `'PASS'`) добавлен в CI Ops
Checks. Прогнан в проде → `PASS`, leftover=0. Манифест дрейфа дополнен.

**Не сделано осознанно** (плохое риск/польза): `jsonResponse` ×14 → общий (14
карантинных редеплоев ради стиля); автостражи sync-точек `is_staff_role`↔
`permissions.ts` и `dispatch`↔`resolveThreadChannel` (хрупкий парсер двух форматов
ради стабильных констант — задокументированы в audit-false-positives).

## Проверки

- `tsc` 0, полный `lint` 0, **932 теста** (+5 visibility), edge-страж visibility 7/7.
- `deno check` email-модулей — новых ошибок 0.
- self-test recompute в проде — `PASS`, следов 0.

## Что осталось (ручное, за владельцем)

Edge-функции ждут редеплоя + смок (поведение идентично, но код менялся):
`wazzup-send-reaction`/`wazzup-mark-read` (реакция/mark-read в свой тред + 403 на
чужой), `telegram-edit-message` (правка внутреннего не уходит), **`email-internal-send`
(распил → смок отправки письма через Gmail-ящик И через Resend, вложения, склейка в
цепочку)**. Косметика/дедуп в `telegram-send-message`/`wazzup-send`/
`telegram-business-send`/`_shared` — редеплой безвреден. mtproto-комментарии
редеплоя не требуют. БД-часть (self-test RPC) уже в проде.
