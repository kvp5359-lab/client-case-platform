# clientcase-mtproto-service

Параллельный канал интеграции с Telegram через MTProto (gramjs). Дополняет Telegram Business: даёт реакции в обе стороны, статусы прочитанности, online presence, typing.

Зона ответственности — **только private chats** сотрудников. Групповые чаты остаются на бот-секретаре.

## Архитектура

```
┌─────────────┐         ┌──────────────────────┐         ┌──────────┐
│  Frontend   │ ──JWT──▶│  Edge Function       │         │ Telegram │
│  (React)    │         │  mtproto-proxy       │         │  Servers │
└─────────────┘         └──────────────────────┘         └────┬─────┘
                                  │                           │
                          x-internal-secret                   │
                                  ▼                           │
                        ┌──────────────────────┐              │
                        │ mtproto-service      │◀─MTProto─────┘
                        │ (этот сервис)        │
                        │                      │
                        │  - Fastify HTTP      │
                        │  - gramjs sessions   │
                        │  - encryption        │
                        └──────────┬───────────┘
                                   │
                          service_role_key
                                   ▼
                        ┌──────────────────────┐
                        │ Supabase (Postgres)  │
                        └──────────────────────┘
```

Edge Function проверяет JWT юзера и его права (manage_workspace_settings и т.п.), потом проксирует с `x-internal-secret` сюда. Этот сервис никогда не доступен напрямую из браузера.

## Установка локально

```bash
cd mtproto-service
npm install
cp .env.example .env
# Заполнить:
#   TELEGRAM_API_ID, TELEGRAM_API_HASH — https://my.telegram.org/apps
#   MTPROTO_SESSION_ENCRYPTION_KEY — `openssl rand -hex 32`
#   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — из Supabase Dashboard
#   INTERNAL_SECRET — общий секрет с Edge Functions
npm run dev
```

## Endpoints

Все требуют заголовок `x-internal-secret`. Возвращают JSON.

| Метод | Путь | Назначение |
|---|---|---|
| GET | `/health` | Health-check (без секрета не работает) |
| POST | `/auth/send-code` | Запросить код подтверждения. Body: `{ user_id, workspace_id, phone }` |
| POST | `/auth/verify-code` | Ввести код. Body: `{ user_id, code }`. Возвращает `{ signed_in, requires_2fa, tg_user? }` |
| POST | `/auth/verify-password` | 2FA cloud-пароль. Body: `{ user_id, password }` |
| POST | `/auth/disconnect` | Отключить сессию. Body: `{ user_id }` |
| GET | `/auth/status?user_id=…` | Статус сессии в БД |

## Безопасность

- **Шифрование сессий**: gramjs StringSession никогда не лежит в БД в открытом виде. AES-256-GCM, ключ — env `MTPROTO_SESSION_ENCRYPTION_KEY`. Ротация ключа = логаут всех.
- **Internal secret**: эндпоинты вызываются только нашими Edge Functions, не браузером.
- **Service role**: сервис ходит в Supabase с service-role ключом, RLS обходит. Проверка прав делается в Edge Function-прокладке до того, как запрос дойдёт сюда.

## Деплой на VPS

`Dockerfile` собирает однослойный image. На VPS используется blue/green только для основного приложения; этот сервис деплоится в один контейнер `clientcase-mtproto`. Кратковременные простои допустимы — при перезапуске сессии переподнимутся из БД (см. `bootstrapAllSessions`).

## Roadmap

- [x] Этап 2: HTTP, auth flow (send-code → verify-code → 2FA), sessions manager
- [ ] Этап 3: Send-message / set-reaction / read-thread
- [ ] Этап 4: Updates loop (входящие сообщения, реакции, прочитанность, typing)
- [ ] Этап 5: UI подключения на фронте
- [ ] Этап 6: Интеграция в pg-триггер `notify_telegram_on_new_message`
- [ ] Этап 7: Деплой через CI/CD
