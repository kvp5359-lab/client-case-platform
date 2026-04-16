# Лендинг `/app` после логина — подбор воркспейса вместо пустого `/profile`

**Дата:** 2026-04-16
**Тип:** fix (UX)
**Статус:** completed

---

## Проблема

После авторизации (Google OAuth, Email OTP, Email + Password) пользователь попадал на `/profile`. На этой странице в сайдбаре нет `workspaceId` в URL, поэтому селектор воркспейса был в состоянии «Выбрать пространство», список проектов пустой («Нет проектов»). Пользователи, особенно новые и внешние сотрудники, не замечали селектор в верхнем левом углу и воспринимали это как «приложение не работает» — оставались в пустоте.

## Решение

Добавлена серверная страница-лендинг `/app`, которая после логина сама подбирает куда отправить пользователя:

1. `last_workspace_id` из `user_settings` — если пользователь всё ещё участник этого воркспейса (последний открытый);
2. иначе первый доступный воркспейс из `participants` (по email, `is_deleted = false`);
3. иначе `/workspaces` — там страница со списком и кнопкой «Создать пространство».

`last_workspace_id` уже пишется в `user_settings` в [`WorkspaceContext.tsx`](../../src/contexts/WorkspaceContext.tsx:52) при каждом открытии воркспейса — ничего нового сохранять не пришлось.

Все точки, где раньше стоял дефолт `/profile` после логина, теперь указывают на `/app`. `/profile` остался как обычная страница профиля — на неё можно зайти вручную из сайдбара.

## Что изменилось

### Новая страница

- [`src/app/(app)/app/page.tsx`](../../src/app/(app)/app/page.tsx) — Server Component. Два параллельных запроса (`user_settings` + `participants` c джойном к `workspaces`), затем `redirect(...)`. Защищён тем же auth-слоем, что и остальная `(app)`-группа.

### Обновлённые дефолты

| Файл | Было | Стало |
|---|---|---|
| [`src/hooks/shared/useAuthRedirect.ts`](../../src/hooks/shared/useAuthRedirect.ts) | `safeInternalPath` fallback `/profile` | `/app` |
| [`src/page-components/AuthCallbackPage.tsx`](../../src/page-components/AuthCallbackPage.tsx:36) | OAuth fallback `/profile` | `/app` |
| [`src/components/auth/EmailOtpForm.tsx`](../../src/components/auth/EmailOtpForm.tsx:78) | после OTP → `/profile` | `/app` |
| [`src/app/(auth)/layout.tsx`](../../src/app/(auth)/layout.tsx:19) | уже залогинен → `/profile` | `/app` |
| [`src/contexts/AuthContext.tsx`](../../src/contexts/AuthContext.tsx:94) | `/app` и `/profile` исключены из `?next=` (чтобы не закрепить их как post-login цель) | + `/app` |
| [`src/components/auth/ProtectedRoute.tsx`](../../src/components/auth/ProtectedRoute.tsx:27) | не сохранять `/` и `/profile` как `auth_redirect` | + `/app` |

## Проверка

После деплоя: `https://app.relostart.com/app` у залогиненного пользователя должен сразу редиректить на `/workspaces/<id>`, а не показывать пустой `/profile`.

## Файлы

- `src/app/(app)/app/page.tsx` (new)
- `src/app/(auth)/layout.tsx`
- `src/components/auth/EmailOtpForm.tsx`
- `src/components/auth/ProtectedRoute.tsx`
- `src/contexts/AuthContext.tsx`
- `src/hooks/shared/useAuthRedirect.ts`
- `src/page-components/AuthCallbackPage.tsx`
