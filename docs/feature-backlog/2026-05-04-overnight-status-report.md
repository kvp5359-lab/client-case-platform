# Ночной отчёт по фазе 1: subdomain routing

**Дата:** 2026-05-05 (ночь после 2026-05-04)
**Ветка:** `feat/subdomain-routing` (запушена в origin)

---

## ✅ Что сделано

### Архитектура
- **Файл `src/proxy.ts`** (Next.js 16 переименовал `middleware` → `proxy`).
- Резолв воркспейса по host:
  - `<slug>.clientcase.app` → workspace через slug.
  - `app.relostart.com` → workspace через custom_domain.
  - `my.clientcase.app` → портал (только login/register/select-workspace).
  - `clientcase.app` (корень) → редирект на my.clientcase.app.
  - `clientcase.kvp-projects.com` и прочее — legacy режим, `/workspaces/<uuid>/...` напрямую.
- URL rewrite: `rs.clientcase.app/projects` → внутренне `/workspaces/<uuid>/projects` (Next.js рендерит существующую страницу, файлы НЕ переименованы).
- Очистка URL: `/workspaces/<uuid>/...` на subdomain → 307 redirect на `/...`.
- Cookies авторизации на `*.clientcase.app` → `Domain=.clientcase.app` (shared session между поддоменами).

### БД
- `workspaces.slug` (UNIQUE) + валидация формата + чёрный список зарезервированных slug'ов.
- `workspaces.custom_domain` (UNIQUE) + валидация FQDN + запрет наших же доменов.
- `workspaces.custom_domain_status` для будущей системы провижининга.
- Назначены: workspace `8a946780-...` → slug `rs`, custom_domain `app.relostart.com`, status `active`.
- Workspace `00000000-...` → slug `demo`.
- RPC `public.resolve_workspace_by_host(host)` — для proxy.

### Frontend
- Портальная страница `/select-workspace` на `my.clientcase.app` (авто-редирект если воркспейс один; список с кликабельными карточками если несколько).
- `LoginForm` через обновлённый `useAuthRedirect`: после логина читает `?next=` из URL и редиректит на любой `*.clientcase.app` поддомен (cross-subdomain).
- `WorkspacePicker` (выбор воркспейса в сайдбаре): клик по другому воркспейсу — full reload на его поддомен/custom-домен.
- `src/lib/supabase.ts` — cookie domain `.clientcase.app` для cross-subdomain auth.

### VPS
- Получены SSL-сертификаты Let's Encrypt для:
  - `clientcase.app`
  - `www.clientcase.app`
  - `my.clientcase.app`
  - `rs.clientcase.app`
- Nginx-конфиг `/opt/relostart/nginx/conf.d/clientcase-app.conf` (server-block для всех 4 доменов выше).
- Запущен **тестовый контейнер `clientcase-app-test`** (порт 3008) с новым кодом — `clientcase:feat-subdomain` локально собранный.
- Новые домены (`*.clientcase.app`) → тестовый контейнер.
- **Прод-домены (`app.relostart.com`, `clientcase.kvp-projects.com`) — НЕ ТРОНУТЫ**, всё ещё на старом коде через upstream `clientcase` (blue/green green).

### Что работает прямо сейчас (можно проверить в браузере)
- ✅ `https://clientcase.app/` → 308 на `https://my.clientcase.app/`
- ✅ `https://my.clientcase.app/` → лендинг (или /login если не авторизован)
- ✅ `https://my.clientcase.app/login?next=...` → форма логина
- ✅ `https://rs.clientcase.app/projects` (без auth) → 307 на `https://my.clientcase.app/login?next=https://rs.clientcase.app/projects`
- ✅ `https://rs.clientcase.app/login` → 307 на `https://my.clientcase.app/login`
- ✅ После логина на портале → редирект на `rs.clientcase.app` через `next` параметр

---

## ⚠️ Что нужно от тебя утром

### 1. Проверка в браузере (~5 минут)

**Цель:** убедиться, что новый код работает корректно на rs.clientcase.app.

1. Открой `https://rs.clientcase.app/` в анонимном окне (важно: чтобы не было старых cookies от `app.relostart.com`).
2. Должен сработать редирект на `https://my.clientcase.app/login?next=https://rs.clientcase.app/`.
3. Залогинься (через email OTP, Google или email+password — что удобнее).
4. После логина — редирект обратно на `rs.clientcase.app/`.
5. Должна открыться обычная страница ClientCase (как на `app.relostart.com`), но с URL вида `rs.clientcase.app/...`.

**Что проверить:**
- Открываются проекты? Можно ли создать тред?
- Иконка переключения воркспейсов в левом верхнем углу — кликабельна, показывает оба воркспейса?
- Sidebar и роутинг работают?
- Если что-то ломается — сообщить какой URL и какая ошибка.

### 2. Подтверждение для финального переключения (если всё ОК)

После успешной проверки — даёшь команду «переключай», и я:

1. Меняю nginx-конфиг для `app.relostart.com`:
   - Сейчас → upstream `clientcase` (старый код, green).
   - Будет → `clientcase-app-test:3000` (новый код).
2. Меняю nginx-конфиг для `clientcase.kvp-projects.com`:
   - Сейчас → upstream `clientcase` (старый код).
   - Будет → 301 редиректы `/workspaces/<uuid>/...` на `https://<slug>.clientcase.app/...`.
3. Промоутю `clientcase-app-test` в новый «активный цвет» blue/green:
   - Останавливаю старый green.
   - Переименовываю test-контейнер.
   - Обновляю upstream в nginx.

### 3. Что НЕ сделано (для следующих сессий, не критично)

- UI настроек: вкладка «Домен» в `/workspaces/<id>/settings` — поля slug + custom_domain для владельца. Сейчас slug управляется через БД напрямую.
- Автопровижининг custom-доменов (UI + DNS API + auto SSL) — для добавления своих доменов клиентами.
- Удалить диагностический endpoint `__mw_test` — **уже удалён**.
- Обновить `infrastructure.md` с новой структурой доменов.

---

## 🔍 Технические детали для проверки

### Где смотреть логи
```
ssh vps "docker logs --tail 50 clientcase-app-test"
ssh vps "docker logs --tail 50 clientcase-app-green"  # старый код, прод
```

### Откатить если что-то не так
```
ssh vps "docker stop clientcase-app-test"
# Удалить новый nginx-конфиг
ssh vps "rm /opt/relostart/nginx/conf.d/clientcase-app.conf"
ssh vps "docker exec relostart-nginx nginx -s reload"
```

После этого `*.clientcase.app` перестанут открываться (502/404), а старые домены продолжат работать как раньше.

### Что лежит на VPS
- Исходники тест-кода: `/opt/clientcase-test/`
- Образ: `docker images | grep clientcase:feat-subdomain`
- Контейнер: `clientcase-app-test` (порт 3008)
- nginx: `/opt/relostart/nginx/conf.d/clientcase-app.conf`
- SSL: `/etc/letsencrypt/live/clientcase.app/`

---

## 📝 Команды для finalize (утром, после твоего ОК)

```bash
# 1. Слить feat/subdomain-routing в main → автодеплой через CI на blue/green
gh pr create --base main --head feat/subdomain-routing --title "feat: subdomain routing для воркспейсов" --body "См. docs/feature-backlog/2026-05-04-subdomain-per-workspace-routing.md"
gh pr merge --squash --delete-branch <PR-num>

# 2. После того как CI задеплоит — старый green/blue будут с новым кодом
# 3. Переключить nginx-конфиги app-relostart и clientcase-kvp на новый upstream
#    (или удалить старые отдельные конфиги, оставив clientcase-app.conf)
# 4. Гасить clientcase-app-test (он больше не нужен)
```

Этот шаг я сделаю в твоём присутствии после твоего «ОК».
