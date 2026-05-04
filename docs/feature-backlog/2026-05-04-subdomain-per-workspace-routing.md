# ТЗ: Поддомены и custom-домены воркспейсов (рефакторинг роутинга)

**Дата:** 2026-05-04
**Статус:** черновик, на согласовании
**Зависимости:** до этого ТЗ — только покупка `clientcase.app` и DNS (выполнено).
**Не входит:** почта (отдельное ТЗ `2026-05-04-email-postmark-internal-addresses.md`).

---

## 1. Что хотим получить

Чтобы каждый воркспейс был доступен по «красивой» ссылке вида:

```
https://rs.clientcase.app/         ← воркспейс с slug=rs
https://petrov.clientcase.app/     ← воркспейс с slug=petrov
```

И опционально — по «своему домену» владельца воркспейса (как у Planfix, Notion, Substack):

```
https://app.relostart.com/         ← тот же воркспейс rs, но через свой домен клиента
```

Внутри воркспейса URL чистые, без UUID:

```
https://rs.clientcase.app/projects/abc123
https://rs.clientcase.app/tasks
https://rs.clientcase.app/settings
```

Текущий формат `https://clientcase.kvp-projects.com/workspaces/<uuid>/projects/abc123` уходит.

---

## 2. Зачем это сейчас

1. **Единственный момент сделать без боли** — пока у нас один пользователь и один реальный воркспейс. Через год переезд = разрывы у клиентов.
2. **Custom-домены — это монетизируемая фича.** «Подключи свой бренд» — стандартное предложение Pro-тарифов SaaS.
3. **Готовность к публичному запуску.** Бренд `clientcase.app` единый везде.
4. **Связка с почтой.** Поддомен `rs.clientcase.app` будет использоваться и для веба, и для почтовых адресов (`*@rs.clientcase.app`) — единая архитектура.

---

## 3. Архитектура

### 3.1 Резолв воркспейса по домену

```
HTTP запрос → nginx → Next.js
                       ↓
                   middleware:
                   1. Читает Host из заголовка
                   2. Определяет тип:
                      - <slug>.clientcase.app → ищем workspace by slug
                      - произвольный домен  → ищем workspace by custom_domain
                      - clientcase.app (корень) → лендинг / редирект на my.
                      - my.clientcase.app   → портал логина / выбора воркспейса
                   3. Кладёт workspace в context
```

### 3.2 Структура доменов

| Домен | Назначение |
|-------|------------|
| `clientcase.app` | Корень. Маркетинговый лендинг (заглушка на старте) или редирект на `my.` |
| `my.clientcase.app` | Портал логина и выбора воркспейса |
| `<slug>.clientcase.app` | Дефолтная точка входа в воркспейс |
| `<custom-domain>` | Опционально подключённый свой домен воркспейса |

### 3.3 Auth-flow

```
1. Пользователь открывает rs.clientcase.app → редирект на my.clientcase.app/login (если не авторизован)
2. На my.clientcase.app/login — форма логина
3. После логина — определяем воркспейсы пользователя
4. Если воркспейс один → редирект на <slug>.clientcase.app
5. Если несколько → my.clientcase.app/select-workspace → выбор → редирект
```

**Cookies для шаринга сессии между поддоменами:**
- Domain=`.clientcase.app` (с точкой) → cookie доступна на всех поддоменах.
- Custom-домены — отдельная сессия, отдельный логин.

### 3.4 Custom-домены — как подключаются

В настройках воркспейса:
1. Владелец вводит `app.relostart.com`.
2. Сервис показывает: «Добавьте у себя в DNS запись `CNAME app.relostart.com → rs.clientcase.app`» (или A-запись на наш VPS).
3. После сохранения — фоновая проверка резолва каждые 5 минут.
4. Когда домен резолвится на наш VPS — автоматически выпускается SSL-сертификат через Let's Encrypt (HTTP-01 challenge — работает после того, как DNS настроен).
5. Статус домена в настройках: `pending` → `dns_ok` → `ssl_issued` → `active`.

---

## 4. Изменения в БД

### 4.1 Расширение `workspaces`

```sql
ALTER TABLE workspaces
  ADD COLUMN slug text UNIQUE,                   -- 'rs', формирует rs.clientcase.app
  ADD COLUMN custom_domain text UNIQUE,          -- 'app.relostart.com', опционально
  ADD COLUMN custom_domain_status text
    CHECK (custom_domain_status IN ('pending', 'dns_ok', 'ssl_issued', 'active', 'failed')),
  ADD COLUMN custom_domain_verified_at timestamptz;

CREATE INDEX idx_workspaces_slug ON workspaces(slug) WHERE slug IS NOT NULL;
CREATE INDEX idx_workspaces_custom_domain ON workspaces(custom_domain) WHERE custom_domain IS NOT NULL;
```

**Валидация slug:**
- Только латиница [a-z], цифры, дефис.
- Длина 2-30 символов.
- Не начинается и не заканчивается дефисом.
- Запрещены резерв-слова: `my`, `www`, `api`, `admin`, `mail`, `app`, `static`, `assets`, `cdn`, `help`, `docs`, `blog`, `support` — всё что мы можем захотеть для системных поддоменов.

**Валидация custom_domain:**
- Полный FQDN (например, `app.relostart.com`).
- Не наш домен (нельзя подключить `что-то.clientcase.app` как «свой»).
- Уникальный (один домен — один воркспейс).

### 4.2 Slug для существующего воркспейса

Миграция должна:
1. Для каждого существующего воркспейса сгенерировать дефолтный slug на основе названия (транслит → kebab-case → проверка уникальности).
2. Для текущего воркспейса (Relostart) — установить `slug='rs'` вручную.

---

## 5. Изменения в приложении

### 5.1 Next.js middleware

Файл `src/middleware.ts` (расширить существующий).

**Логика:**
1. Прочитать `host` из заголовка.
2. Определить тип домена:
   - Заканчивается на `.clientcase.app` и не равен `my.clientcase.app`/`clientcase.app` → `subdomain`.
   - Произвольный → `custom_domain`.
   - `my.clientcase.app` → `portal`.
   - `clientcase.app` → `marketing` (на старте — редирект на `my.`).
3. Для `subdomain` — извлечь slug, найти воркспейс через RPC.
4. Для `custom_domain` — найти воркспейс по полному `host`.
5. Положить `workspace_id` в request context (через `x-workspace-id` header или cookie).
6. Если воркспейс не найден — 404.

### 5.2 Рефакторинг роутов

**Было:**
```
src/app/(app)/workspaces/[id]/projects/page.tsx
src/app/(app)/workspaces/[id]/tasks/page.tsx
src/app/(app)/workspaces/[id]/settings/page.tsx
...
```

**Станет:**
```
src/app/(app)/projects/page.tsx
src/app/(app)/tasks/page.tsx
src/app/(app)/settings/page.tsx
...
```

И добавляются:
```
src/app/(portal)/login/page.tsx              ← на my.clientcase.app
src/app/(portal)/select-workspace/page.tsx   ← на my.clientcase.app
src/app/(marketing)/page.tsx                 ← на clientcase.app (заглушка-редирект)
```

`workspaceId` передаётся через React Context (`WorkspaceProvider`), а не через `params.id`.

### 5.3 Все ссылки в коде

Любое место, где формируется ссылка `/workspaces/${id}/...` — переписать. Список таких мест нужно собрать grep'ом перед началом работы.

Принципы:
- Внутри воркспейса — относительные пути (`/projects/abc`, не `/workspaces/${id}/projects/abc`).
- Между воркспейсами (например, переключатель) — абсолютные URL: `https://${otherSlug}.clientcase.app/`.
- Письма-уведомления (когда сделаем почту) — формируют URL на основе текущего воркспейса.

### 5.4 Обратная совместимость

Старые URL `clientcase.kvp-projects.com/workspaces/<uuid>/...`:
- Резолвим UUID → находим slug → 301 редирект на `<slug>.clientcase.app/...`.
- Этот редирект живёт минимум 6 месяцев — на случай, если у тебя где-то остались старые закладки.

`app.relostart.com` (текущий полный ClientCase):
- После рефакторинга превращается в custom-домен воркспейса `rs`.
- В БД у воркспейса rs выставляется `custom_domain='app.relostart.com'`, `custom_domain_status='active'`.
- Всё, что приходит на этот домен, отдаёт только воркспейс rs.

---

## 6. Инфраструктура (VPS, nginx, SSL)

### 6.1 SSL-сертификаты

**На старте — три отдельных сертификата** (HTTP-01 через certbot):
1. `clientcase.app` + `www.clientcase.app`
2. `my.clientcase.app`
3. `rs.clientcase.app` (и далее на каждый новый воркспейс)

`app.relostart.com` — у тебя уже есть.

**Когда будет много воркспейсов** — переходим на wildcard SSL через DNS-01 (отдельный шаг, не сейчас).

### 6.2 Nginx

Один универсальный server-блок, который ловит:
- Любой `*.clientcase.app` (через `server_name *.clientcase.app;`).
- Все custom-домены — каждый прописывается отдельной строкой `server_name` или через include-файл, который генерируется при подключении домена.

Все они проксируют на один upstream `clientcase` (blue/green как сейчас).

Буферы прокси — обязательны (`proxy_buffer_size 256k` и т.д., как в текущих конфигах ClientCase).

### 6.3 Автовыпуск SSL для custom-доменов

Edge Function `provision-custom-domain-ssl`:
1. После того как DNS клиента указывает на наш VPS (проверяется `dig`).
2. SSH на VPS → `certbot certonly -d <custom-domain>` (HTTP-01).
3. Добавление nginx-блока с этим доменом.
4. `nginx -s reload`.
5. Обновление `custom_domain_status='active'` в БД.

**Важно:** Edge Function на Supabase не может SSH'иться на VPS напрямую. Нужен webhook на VPS или мини-API на самом VPS, который принимает запросы от Edge Function и выпускает сертификаты. Это отдельный микросервис (написать на Node.js/Bash скрипт, повесить за nginx с авторизацией).

---

## 7. UI

### 7.1 Настройки воркспейса (для владельца)

Новая вкладка `/workspaces/<id>/settings/domain` (или просто `/settings/domain` после рефакторинга):

**Блок 1: Slug**
- Текущий slug, ссылка-превью `https://rs.clientcase.app`.
- Кнопка «Изменить slug» — с предупреждением «существующие ссылки сломаются».
- Изменение slug запрещено, если воркспейс активно используется (есть данные/участники) — на старте можно разрешить однократно, потом фиксировать.

**Блок 2: Свой домен**
- Поле ввода `app.relostart.com`.
- После сохранения — инструкция: «В DNS вашего домена добавьте CNAME → `<slug>.clientcase.app`» с кнопкой «Скопировать».
- Статус: «Ожидаем настройку DNS» / «DNS настроен, выпускаем сертификат» / «Активно».
- Кнопка «Перепроверить» — форсирует проверку DNS.
- Кнопка «Отключить домен».

### 7.2 Портал на `my.clientcase.app`

- `/login` — форма логина.
- `/register` — форма регистрации.
- `/select-workspace` — список воркспейсов пользователя, клик → редирект.
- `/create-workspace` — создание нового воркспейса (с выбором slug).

### 7.3 Корень `clientcase.app`

На старте — простая заглушка с двумя кнопками: «Войти» (→ `my.clientcase.app/login`) и «Зарегистрироваться» (→ `/register`). Маркетинговый лендинг — позже, отдельно.

---

## 8. Миграция текущего состояния

### 8.1 Сейчас

- ClientCase живёт на двух доменах: `clientcase.kvp-projects.com` и `app.relostart.com`. Оба показывают полный сервис со всеми воркспейсами.
- Воркспейс «rs» (Relostart) — основной активный, есть и другие тестовые.

### 8.2 После рефакторинга

- `clientcase.kvp-projects.com` → редиректы на `<slug>.clientcase.app` для всех старых URL. Через 6 месяцев — отключение.
- `app.relostart.com` → custom-домен воркспейса rs. Только этот воркспейс отображается, доступ к другим воркспейсам с этого домена невозможен.
- `my.clientcase.app` → новая точка логина.
- `rs.clientcase.app` → дефолтная точка воркспейса rs.

### 8.3 План миграции (пошагово)

1. Применить миграцию БД (slug + custom_domain).
2. Назначить slug каждому существующему воркспейсу (`rs` для Relostart, остальные — автогенерация).
3. Назначить `custom_domain='app.relostart.com'` воркспейсу rs.
4. Развернуть новый код приложения.
5. На VPS поднять SSL-сертификаты для `clientcase.app`, `my.clientcase.app`, `rs.clientcase.app` + nginx-блоки.
6. Тестирование: открыть `rs.clientcase.app` и `app.relostart.com` — оба должны вести в воркспейс rs.
7. Старый `clientcase.kvp-projects.com` — обновить, чтобы он работал в режиме редиректов.

---

## 9. Безопасность

1. **Защита от подмены slug.** Резерв-слова в чёрном списке (см. 4.1).
2. **Изоляция cookies.** Сессионная cookie на `.clientcase.app` — расшаривается между поддоменами (нужно для авторизации). Custom-домены — отдельные cookies.
3. **CSRF.** В существующих CSRF-проверках убедиться, что они работают через `Origin` и `Referer` для всех вариантов доменов.
4. **CORS.** Если есть API-роуты, открытые для воркспейса — настроить CORS на свой домен + custom-домены.
5. **HTTPS принудительно.** `.app` в HSTS preload — Chrome требует HTTPS. Все redirect 80 → 443 в nginx.
6. **Ограничение custom-доменов.** Запрет подключать наш `*.clientcase.app` как custom (защита от перехвата).

---

## 10. План реализации (фазы)

### Фаза 0 — подготовка (готово)

- [x] Куплен `clientcase.app`.
- [x] DNS wildcard A → VPS.

### Фаза 1 — БД и slug (0.5 дня)

- [ ] Миграция: slug, custom_domain, статусы.
- [ ] Назначить slug всем существующим воркспейсам.
- [ ] Установить `rs` для Relostart, `custom_domain='app.relostart.com'`.

### Фаза 2 — middleware и резолв воркспейса (1-2 дня)

- [ ] Расширить `src/middleware.ts` — резолв по host.
- [ ] WorkspaceProvider в React-контексте.
- [ ] Backend RPC для резолва workspace by slug / custom_domain.

### Фаза 3 — рефакторинг роутов (2-3 дня)

- [ ] Переименовать `app/(app)/workspaces/[id]/...` → `app/(app)/...`.
- [ ] Обновить все хуки и компоненты, читающие `params.id` → читать из контекста.
- [ ] Обновить все ссылки в коде (`Link`, `router.push`, etc.).
- [ ] Тесты на типичных сценариях.

### Фаза 4 — портал на `my.clientcase.app` (1 день)

- [ ] Раздел `(portal)` с login/register/select-workspace.
- [ ] Auth-flow с cookies на `.clientcase.app`.

### Фаза 5 — VPS и SSL (0.5 дня)

- [ ] Получить SSL для `clientcase.app`, `my.clientcase.app`, `rs.clientcase.app`.
- [ ] Nginx-блоки.
- [ ] Тесты — все домены работают.

### Фаза 6 — custom-домены (1-2 дня)

- [ ] UI настроек домена в воркспейсе.
- [ ] Edge Function для проверки DNS клиента.
- [ ] Микросервис на VPS для автовыпуска SSL.
- [ ] Состояния домена: pending → dns_ok → ssl_issued → active.

### Фаза 7 — обратная совместимость (0.5 дня)

- [ ] На `clientcase.kvp-projects.com` — server-блок, который редиректит `/workspaces/<uuid>/...` на `<slug>.clientcase.app/...`.
- [ ] Тестирование всех ссылок.

**Итого: ~6-9 рабочих дней.**

---

## 11. Открытые вопросы

1. **Slug текущего воркспейса** — `rs`? Подтвердить.
2. **Slug для остальных существующих воркспейсов** — генерируем автоматически или согласовываем?
3. **Должен ли владелец иметь право менять slug** после создания? (Да, но с предупреждением, и только пока есть только владелец? Отложить.)
4. **Можно ли создать воркспейс БЕЗ slug** (типа «черновик»)? — Не нужно, slug обязателен с момента создания.
5. **Лимит custom-доменов на воркспейс** — один или несколько? (Достаточно одного на старте.)
6. **Биллинг custom-домена** — платная фича или для всех бесплатно? (На старте — для всех бесплатно, монетизация позже.)
7. **Поддержка субдоменов в custom_domain** — `app.relostart.com` ок, а `app.legal.relostart.com` ок? (Любой FQDN — ок.)

---

## 12. Метрики успеха

- `https://rs.clientcase.app/` открывает приложение и сразу показывает воркспейс rs.
- `https://app.relostart.com/` открывает то же самое (через custom-домен).
- Все старые ссылки `clientcase.kvp-projects.com/workspaces/<uuid>/...` корректно редиректят.
- Логин на одном поддомене → доступ ко всем поддоменам без повторного логина.
- Создание нового воркспейса с slug → сразу доступен по `<slug>.clientcase.app`.
- Подключение custom-домена → за 5-15 минут после настройки DNS клиентом всё активно.
