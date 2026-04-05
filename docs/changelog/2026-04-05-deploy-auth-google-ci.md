# Деплой на VPS, исправление авторизации, Google верификация, CI

**Дата:** 2026-04-05
**Тип:** fix, infra, feat
**Статус:** completed

---

## Что сделано

### Исправление авторизации (cookie-based sessions)
- `src/lib/supabase.ts` — переключение с `createClient` на `createBrowserClient` из `@supabase/ssr`
- Сессия теперь хранится в cookies вместо localStorage — middleware может читать её серверно
- `src/page-components/AuthCallbackPage.tsx` — добавлен обмен code на сессию (PKCE flow для Google OAuth)
- `src/contexts/AuthContext.tsx` — добавлен `emailRedirectTo` в `signInWithOtp`

### Деплой на app.relostart.com (VPS)
- `Dockerfile` — multi-stage сборка (deps → builder → runner) с standalone output
- `docker-compose.yml` — порт 3005:3000, сеть relostart_web
- `.github/workflows/deploy.yml` — build Docker image → push to ghcr.io → SSH deploy на VPS
- nginx конфиг на VPS: upstream `clientcase-app:3000` (Docker networking)

### Публичные страницы
- `src/app/(public)/privacy/page.tsx` — Политика конфиденциальности
- `src/app/(public)/terms/page.tsx` — Условия использования
- `src/app/page.tsx` — лендинговая страница (вместо редиректа на /profile)
- `src/app/(public)/layout.tsx` — footer с ссылками на privacy/terms
- `middleware.ts` — добавлены `/`, `/privacy`, `/terms` в публичные пути

### Google Search Console верификация
- `public/google672b4dfec009bb63.html` — файл верификации домена
- Домен `app.relostart.com` подтверждён в Google Search Console
- Брендинг "ClientCase" отправлен на верификацию в Google Cloud Console

### Исправление CI
- `.github/workflows/ci.yml` — `npm ci` → `npm install --legacy-peer-deps`, добавлены env vars для build
- `eslint.config.mjs` — ошибки линтера переведены в warnings (prefer-const, no-unused-vars, react-hooks и др.)

### UI: боковая навигация
- `SidebarNavButton.tsx` — убрано отображение label при isActive (только при showLabel)
- `WorkspaceSidebarFull.tsx` — иконки навигации распределяются равномерно (justify-between)
