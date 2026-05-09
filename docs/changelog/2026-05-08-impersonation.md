# «Войти под пользователем» (read-only impersonation) + фикс лайтбокса

**Дата:** 2026-05-08
**Тип:** feat + fix
**Статус:** completed

---

## Контекст

Владелец воркспейса хотел способ «увидеть глазами сотрудника» — посмотреть,
какие у конкретного юзера задачи, какие ему доступны чаты, как у него
настроен сайдбар, в каком порядке всё показывается. Без этого диагностика
жалоб «у меня тут ничего не отображается» сводилась к подкручиванию прав
и переоткрытию вслепую — долго и неприятно.

Подход взяли как у Planfix: режим строго для просмотра, любые изменения
заблокированы. Это снимает 80% сложности — не нужно ломать атрибуцию
записей, аудит-логи, write-permissions. Только посмотреть, выйти.

Параллельно всплыло два мелких UX-бага в существующем лайтбоксе картинок,
которые после внедрения баннера impersonation стали особенно заметны.

## Решение

### 1. Impersonation — JWT-подмена + БД-триггер

Архитектурно — самая чистая схема: владелец получает короткоживущий JWT
с custom-claim `app_metadata.impersonated_by`, фронт подменяет сессию
через `supabase.auth.setSession`, RLS работает «из коробки» (auth.uid()
теперь = target). Запись блокируется единым триггером на всех public-
таблицах.

**БД-сторона:**

- `impersonation_sessions (id, owner_user_id, target_user_id,
  workspace_id, jti, started_at, ended_at, expires_at, user_agent,
  ip)` — журнал сессий для аудита. SELECT — только владелец и сам
  target (если активна), INSERT/UPDATE — только service role.
- `is_impersonating()` — читает claim из `auth.jwt()`, возвращает
  bool.
- `impersonating_owner_id()` — uuid владельца, инициировавшего
  импersonацию (или NULL).
- `is_workspace_owner(user_id, workspace_id)` — проверка, что юзер
  имеет роль `Владелец` в воркспейсе.
- `start_impersonation_session(owner, workspace, target, jti, exp,
  ua, ip) → uuid` — SECURITY DEFINER, доступна только service_role.
  Делает все проверки прав: owner-only, цель ≠ self, цель ≠ другой
  владелец, цель — активный участник воркспейса.
- `end_impersonation_session(session_id)` — SECURITY DEFINER,
  authenticated. Может закрыть и сам владелец, и target из
  импersonationного JWT.
- `prevent_writes_during_impersonation()` — BEFORE-trigger function:
  если `is_impersonating()` — RAISE EXCEPTION с маркером
  `Impersonation mode is read-only`. DO-блок навешивает её на ВСЕ
  public-таблицы (126 штук) одним проходом, кроме самой
  `impersonation_sessions`. Service-role и pg_cron проходят свободно
  (у них нет нашего claim'а в JWT).

**Edge Functions (`--no-verify-jwt false` для start, true для end):**

- `impersonate-start` — валидирует Bearer JWT владельца, дёргает RPC
  `start_impersonation_session` (там все проверки), подписывает
  кастомный JWT через `jose.SignJWT` с HS256-секретом из env
  `JWT_SIGNING_SECRET`. TTL 30 минут. Возвращает `access_token`,
  `target` (id/email/name).
- `impersonate-end` — проксит RPC `end_impersonation_session`.

**Имя env-переменной — `JWT_SIGNING_SECRET`, не `SUPABASE_JWT_SECRET`,
потому что Supabase CLI отказывается ставить секреты с префиксом
`SUPABASE_` («Env name cannot start with SUPABASE_»). Платформа
автоинжектит только URL/ANON_KEY/SERVICE_ROLE_KEY/DB_URL — JWT_SECRET
в этот список не входит, надо ставить руками.**

**Фронт:**

- `src/lib/impersonation.ts` — декод JWT, бэкап и восстановление
  оригинальной сессии в `localStorage` под ключом
  `cc_impersonation_original_session_v1`. Маркер ошибки от триггера
  для глобального хендлера.
- `src/hooks/useImpersonation.ts` — единый hook: читает состояние из
  текущего JWT (`getImpersonationClaim(session)`), методы `start({
  workspace_id, target_user_id })` и `end()`. На старте: backup →
  edge function → `setSession` → `getSession()` (форс-flush
  cookies/localStorage у `@supabase/ssr` — без этого reload-навигация
  на `/login` происходит до того, как новая сессия успеет записаться)
  → `queryClient.clear()` → `location.replace('/')`.
- `ImpersonationBanner.tsx` — sticky-баннер `z-[60]` сверху на всех
  приватных роутах. Имя/email просматриваемого юзера, таймер до
  истечения JWT, кнопка «Выйти из режима». При истечении — авто-end.
- `StartImpersonationDialog.tsx` — диалог подтверждения перед
  стартом.
- В `ParticipantMenu` — пункт «Войти под пользователем», виден только
  у активных участников с `user_id`, не у самого владельца, не у
  других владельцев. Видимость пункта определяет проп
  `canImpersonate` (= `useWorkspacePermissions().isOwner`).
- В `Providers.tsx` — `MutationCache.onError` молча гасит ошибки от
  триггера. Без этого фоновые мутации (`mark-as-read` и т.п.) при
  открытии любого треда плодили тосты «изменения недоступны» —
  пользователю это не нужно, верхний баннер уже всё объясняет.

### 2. Фикс ImageLightbox

После внедрения баннера impersonation сразу всплыли два бага в лайтбоксе:

- **z-index 50 vs 60.** Баннер (`z-[60]`) перекрывал тулбар лайтбокса
  (`z-50`) — закрыть картинку было невозможно, крестик уезжал под
  баннер. Лайтбокс поднят до `z-[100]` — модалки всегда сверху.
- **Клик по самой картинке не закрывал лайтбокс.** Контейнер
  с `<Image>` имел `onClick={(e) => e.stopPropagation()}`, что
  блокировало пробрасывание клика на бэкдроп с `onClose`. Убрал
  stopPropagation у контейнера, оставил только у тулбара (там клики
  +/-/X не должны закрывать). Теперь клик по любому месту, включая
  саму картинку, закрывает — поведение, привычное по Telegram /
  Slack / большинству просмотрщиков.

## Файлы

**Новые:**

- `supabase/migrations/20260507_impersonation.sql` — таблица + helpers + RPC + триггер
- `supabase/functions/impersonate-start/index.ts` — подпись JWT
- `supabase/functions/impersonate-end/index.ts` — закрытие сессии
- `src/lib/impersonation.ts` — JWT-декод, backup сессии
- `src/hooks/useImpersonation.ts` — hook start/end + состояние
- `src/components/impersonation/ImpersonationBanner.tsx`
- `src/components/impersonation/StartImpersonationDialog.tsx`
- `docs/changelog/2026-05-08-impersonation.md` (этот файл)

**Изменённые:**

- `src/components/auth/ProtectedRoute.tsx` — рендер баннера
- `src/components/providers/Providers.tsx` — MutationCache-suppressor
- `src/page-components/workspace-settings/ParticipantsTab.tsx` — `canImpersonate=isOwner`
- `src/page-components/workspace-settings/components/ParticipantMenu.tsx` — пункт меню + диалог
- `src/page-components/workspace-settings/components/ParticipantsTable.tsx` — проброс пропсов
- `src/components/messenger/ImageLightbox.tsx` — z-index + click-anywhere-closes
- `src/types/database.ts` — регенерация (impersonation_sessions, RPC, helpers)
- `.claude/rules/infrastructure.md` — раздел «Импersonация»

## Тестирование

- TS-сборка чистая (`npx tsc --noEmit` — три ошибки в `.test.ts`-файлах,
  не связаны: предсуществующие, всплыли после регенерации типов).
- `npm run build` — production build проходит, все 51 роут
  скомпилировались.
- End-to-end в браузере: владелец → меню сотрудника → «Войти под
  пользователем» → диалог подтверждения → перезагрузка → виден
  оранжевый баннер сверху, сервис рендерится глазами target — задачи,
  чаты, проекты. «Выйти из режима» возвращает в свою сессию, кеш
  React Query чистится.
- Лайтбокс: открыть картинку из сообщения чата — закрывается кликом
  в любом месте, крестик-зум-кнопки доступны (выше баннера).
- Триггер БД: попытка записи под импersonационным JWT отклоняется
  на уровне Postgres — никаких тостов, фоновые мутации (mark-as-read,
  last-viewed) молча падают (это и нужно — никаких сайд-эффектов
  на target-юзера).

## Деплой

Миграция `20260507_impersonation.sql` уже применена через MCP Supabase
по ходу сессии. Edge Functions `impersonate-start` (v4) и
`impersonate-end` (v1) задеплоены. Секрет `JWT_SIGNING_SECRET` залит
через `supabase secrets set`. Фронт уйдёт стандартным blue/green
pipeline'ом из `.github/workflows/deploy.yml` после push в main.

## Что осталось на потом

- **UI отзыва чужой активной сессии** — пока нет, владелец не видит
  активные impersonation-сессии и не может их погасить. Можно через
  SQL вручную. Сделать кнопку в Settings → Sidebar/Trash при
  необходимости.
- **Запись персональных UI-настроек** (фильтры, видимость колонок и
  т.п.) намеренно тоже заблокирована — Planfix их разрешает, у нас
  пока нет: проще и безопаснее. Если потребуется — белый список
  таблиц (`task_panel_tabs`, `user_settings`) для исключения из
  триггера.
- **Перенос на JWT Signing Keys (asymmetric).** Проект пока на legacy
  HS256-секрете. Если когда-нибудь надо будет «Migrate JWT secret»
  через Dashboard — придётся переписать `impersonate-start` на
  RS256-подпись с приватным ключом из JWKS (или хранить kid и
  пользоваться публичным). Сейчас не критично.

## Решения и компромиссы

**JWT-impersonation vs прокси через Edge Function.** Был выбор: либо
подменять JWT (как сделано), либо ходить во все запросы через
прокси-функцию с service_role. Прокси даёт более жёсткий контроль
(можно фильтровать каждый response), но требует переписать весь
data-layer на проксирование — неподъёмно. JWT-схема использует
существующий RLS как есть, реалтайм работает, миграция — одна.
Минус: компрометация `JWT_SIGNING_SECRET` в Edge Function = выпуск
любых токенов. Митигировано тем, что функция максимально простая,
без user-input в подписи, без зависимостей.

**Триггер-страж на ВСЕХ public-таблицах vs точечно.** Точечно — это
поддерживать список «защищённых» таблиц, который протухнет при
следующей миграции. Универсальный триггер, навешанный одним DO-блоком,
обходится без обслуживания: новая таблица в схеме `public` →
автоматически защищена при следующем применении миграции (но
изначально надо помнить добавить триггер в новой миграции, либо
переприменить эту). Service-role и pg_cron проходят свободно
автоматически — у них нет JWT-claim'а.

**Полный read-only vs «как Planfix» (можно менять только UI-настройки).**
Planfix разрешает редактировать фильтры, планировщики, табличные
настройки от имени target. Мы пока режем всё. Причина — сложность
и риск: придётся вести список «безопасных» таблиц и аудитить новые
миграции. Для основной задачи («увидеть глазами сотрудника, понять
что у него настроено») чистого просмотра достаточно. Если пойдёт
запрос «хочу подкрутить ему фильтр от его имени» — расширим точечно.

**`session_id` claim не ставим.** GoTrue валидирует `session_id`
из JWT против таблицы `auth.sessions` (`session_not_found 403`).
Создавать там запись из edge function — отдельная боль. Решение:
не включать `session_id` в payload, оставить только `jti` для
уникальности самого JWT. Realtime при смене сессии переподключается
по факту смены `access_token`, без привязки к session_id.

**Refresh_token = access_token (а не пустая строка).** SDK падает с
`AuthSessionMissingError` при пустом refresh_token, но при любой
непустой строке принимает. Реального refresh не происходит —
импersonationный токен короткоживущий, а баннер форсит выход за
секунды до истечения. Если SDK всё-таки попытается обновить и
получит ошибку — вылетит в логаут, что эквивалентно ручному
«Выйти из режима». Не критично.
