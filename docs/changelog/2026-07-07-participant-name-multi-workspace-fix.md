# getParticipantName падал у юзера в нескольких воркспейсах

**Дата:** 2026-07-07
**Тип:** fix (сервис)
**Статус:** ждёт деплоя фронта

---

**Симптом:** `getParticipantName(userId)` мог падать с ошибкой запроса.

**Корень:** запрос `participants … .eq('user_id', userId).maybeSingle()`. Один
`user_id` имеет **несколько** записей `participants`, если юзер состоит в
нескольких воркспейсах → `.maybeSingle()` бросает ошибку на 2+ строках.

**Фикс** ([`participantService.ts`](../../src/services/api/participantService.ts)):
добавлены `.eq('is_deleted', false).limit(1)` перед `.maybeSingle()` — берём первую
живую запись имени (имя одинаковое во всех воркспейсах, любая подходит).

**Тест** ([`participantService.test.ts`](../../src/services/api/participantService.test.ts)):
переписан под новую цепочку запроса (хелпер `mockNameChain`), добавлены проверки
`.eq('is_deleted', false)` и `.limit(1)`.

## Проверки

tsc 0, lint 0, 11 тестов `participantService`.

**Файлы:** `participantService.ts`, `participantService.test.ts`.
