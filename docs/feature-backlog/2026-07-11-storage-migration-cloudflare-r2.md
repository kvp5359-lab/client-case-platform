# Миграция файлового хранилища: Supabase Storage → Cloudflare R2

**Статус:** ✅ ПРИВАТНЫЕ БАКЕТЫ В ПРОДЕ, смок всех каналов пройден (2026-07-11). Публичные бакеты — остаток (см. ниже).
**Зачем:** уйти от растущего egress-счёта Supabase; R2 = egress $0, дешёвое хранение, S3-совместимость.

## ✅ Сделано (2026-07-11, в проде)
- Флип 4 приватных бакетов (`files`,`document-files`,`document-templates`,`message-attachments`) на R2 во всех 3 средах (фронт CI-деплой + edge redeploy + mtproto rebuild). Флаг: `NEXT_PUBLIC_STORAGE_R2_BUCKETS` (фронт, deploy.yml) / `STORAGE_R2_BUCKETS` (edge secret + mtproto VPS `.env`).
- Смок вживую: документы, MTProto вх/исх, Wazzup вх/исх, TG-группа вх/исх — всё через R2.
- **Wazzup-фикс:** `attachment-proxy` (Wazzup не мог забрать R2 presigned-ссылку). **mtproto-фикс:** Node 22 (gramjs+WebSocket).

## ⏳ Остаток
1. **Публичные бакеты** (`docbuilder`,`participant-avatars`,`docbuilder-covers`,`docbuilder-screenshots`) — ещё на Supabase (флаг их не включает). Нужен публичный домен R2 `cdn.clientcase.app` (Custom Domain на бакет) + `NEXT_PUBLIC_R2_PUBLIC_BASE`/`R2_PUBLIC_BASE` + починка ~101 аватара со старым Supabase-URL (`participants.avatar_url`, `project_threads.wazzup_contact_avatar_url`).
2. **Пушнуть коммиты** `36cfed9c` (mtproto Node22), `b7d22e5f` (wazzup proxy) в main (код уже в проде через ручной деплой; пуш = синхронизация репо).
3. **Косметика:** фронт спамит 403 в консоль на smoke-картинках с путём `smoke/...` (не воркспейс) — приглушить.
4. **Через 1-2 недели** без проблем — удалить копию файлов в Supabase Storage.

---

## Решение и обоснование

Переезжаем на **Cloudflare R2**. Разбор вариантов и расчёты — в истории обсуждения (ledger/чат 2026-07-11).

- Хранение почти одинаковое везде (~$0.015–0.021/ГБ). Разница — в **egress** (плата за скачивание).
- Supabase: egress $0.09/ГБ сверх 250 ГБ, включённых в план Pro, и **растёт с трафиком бесконечно**.
- R2: egress **$0 всегда**. На 1 ТБ с активным трафиком R2 выходит ~$17/мес против ~$290 у Supabase.
- Точка перелома ~250 ГБ трафика/мес. Сейчас (4.3 ГБ) оба почти бесплатны — переезд делаем **заранее, пока дёшево и безопасно** (5000 файлов копируются за час), а не под нагрузкой на терабайтах.
- Бонус уже сейчас: egress Supabase общий для БД/реалтайма/edge/файлов — убрав файлы, освобождаем лимит для мессенджера с реалтаймом.

**Backblaze B2** рассматривали — дешевле хранение, но egress $0 только через связку с Cloudflare CDN (лишняя точка отказа). Для нашего профиля (часто открываемые документы) R2 проще и быстрее.

---

## Текущее состояние кода (что уже готово)

Слой доступа к файлам **уже абстрагирован** во всех рантаймах (сделано 2026-07-05, в проде):
- Фронт: `src/lib/storage/index.ts` (+ `buckets.ts`)
- Edge: `supabase/functions/_shared/storage.ts`
- mtproto: `mtproto-service/src/storage.ts`
- Прямых `.storage.from(...)` мимо адаптеров — **ноль** (проверено grep). Исключение — Next-route resend (свой ServiceClient, бакет через `STORAGE_BUCKETS`).

Значит переезд = поменять **внутренности этих модулей** (Supabase-вызовы → S3-протокол R2), а не искать доступ к файлам по всему коду.

### Как файлы связаны с БД (ключ к безопасности переезда)
- `files.storage_path` — **4993 записи, все хранят ПУТЬ** (не URL) → при копировании в R2 с той же структурой путей ссылки в БД остаются валидными. **Риска потери связи нет.**
- Аватары хранят **полный URL** на Supabase: `participants.avatar_url` — 83 записи, `project_threads.wazzup_contact_avatar_url` — 18. → после cutover покажут битую картинку, чинится разово (UPDATE домена) или перекачкой (идемпотентно). Косметика, не документы.

### ⚠️ Архитектурный нюанс: браузер не может держать S3-ключи
Фронт (`src/lib/storage/`) исполняется в браузере. Сейчас `upload/download/createSignedUrl` идут напрямую в Supabase (anon + RLS). У R2 нет RLS-слоя, а секретный ключ в браузер класть нельзя. Значит:
- **Публичные бакеты** (аватары, docbuilder) → отдаём через публичный домен R2 (`cdn.clientcase.app`), фронт просто строит URL. Ключи не нужны.
- **Приватные файлы** (документы, вложения) → подпись ссылок (presigned GET/PUT) должна происходить **на сервере** (edge function с ключом), фронт запрашивает готовую ссылку.

Фронт-места, дергающие storage напрямую (перевести на серверную подпись/публичный URL):
`EditParticipantDialog`, `useSourceDocumentUpload`, `tiptap-editor`, `useDocumentUpload`, `useSendEmail`, `ProjectContextItemCard`, `messengerAttachmentService`, `projectContextService`, `documentTemplateService`, `documentService`.

---

## Стратегия безопасности

Не переписываем «намертво». Переключатель **Supabase ⇄ R2 через env-флаг** + период **двойной записи**:
- Новые файлы пишем сразу в оба хранилища.
- Чтение — откуда скажет флаг (`STORAGE_BACKEND=supabase|r2`).
- Проблема → флаг обратно на Supabase, **откат за секунды** (или редеплой предыдущей версии).
- Supabase-копию держим ещё 1–2 недели после cutover как страховку, удаляем в конце.

---

## Фазы

### Фаза 0 — создать R2 ✅ ГОТОВО (2026-07-11)
- Аккаунт Cloudflare (домен `clientcase.app` уже добавлен).
- Бакет **`clientcase-files`** (Standard, Public Access disabled).
- S3 endpoint (не секрет): `https://2950470268186d8381b920fec6342604.r2.cloudflarestorage.com`
- Account API token «clientcase-app» (Object Read & Write, только на бакет `clientcase-files`). Ключи сохранены владельцем, в репо/чат НЕ попадают.

### Фаза 1 — скопировать файлы ✅ ГОТОВО (2026-07-11)
- **Инструмент:** `rclone` (не Super Slurper — тот не проходит проверку path-style Supabase). Remotes: `supa` (Supabase S3, `.../storage/v1/s3`, eu-west-1) → `r2` (Cloudflare). Флаг `--s3-no-check-bucket` (Object-токен не умеет HeadBucket).
- **Скопировано + сверено `rclone check --size-only --one-way` = 0 расхождений:** files 4813 / message-attachments 555 / docbuilder 439 / document-files 323 / participant-avatars 106. Мелкие: document-templates 2, docbuilder-covers 1. docbuilder-screenshots — пустой (бакет создан).
- R2-бакеты названы 1:1 с Supabase (public/private настроим в Фазе 4). Пробный `clientcase-files` — удалить.
- R2-токен `clientcase-app` (Object Read & Write, **все бакеты**) — станет продакшн-токеном (в секреты, Фаза 2).
- **⚠️ Supabase S3 read-ключ `slurper` засветился в скриншоте чата** → удалить сразу (в Supabase → Storage → S3 → Access keys). Для инкрементальной досинхронизации перед cutover сгенерировать свежий.
- **Инкрементальная досинхронизация** (та же команда `rclone copy`, докопирует новое) — перед cutover.

### Фаза 2 — код: S3-начинка адаптеров + серверная подпись (в работе 2026-07-11)
Флаг переезда — **по бакетам** (`NEXT_PUBLIC_STORAGE_R2_BUCKETS` фронт / `STORAGE_R2_BUCKETS` edge+mtproto; список через запятую, `*`=все, пусто=Supabase). Откат = убрать бакет.
- ✅ **Посредник `storage-r2`** (edge, `verify_jwt=true`, задеплоен): проверка доступа (участник воркспейса по 1-й папке пути для `files`/`document-files`/`document-templates`/`message-attachments`; auth-only для `docbuilder*`/`participant-avatars`) + presigned GET/PUT/remove/list. Секреты R2 в edge заданы. `aws4fetch`, self-contained.
- ✅ **Фронт** (`src/lib/storage/`): `backend.ts` (`isBucketOnR2`) + `r2Client.ts` (через `storage-r2`, прямой PUT/GET в R2) + ветвление `index.ts`. Публичный URL — `NEXT_PUBLIC_R2_PUBLIC_BASE`.
- ✅ **Edge** (`_shared/r2.ts` + ветвление `_shared/storage.ts`): прямой R2 по ключам env.
- ✅ **mtproto** (`src/r2.ts` + ветвление `storage.ts`, dep `aws4fetch`): прямой R2.
- ⏳ **Осталось для прод-флипа:** (1) верификация подписи (открыть 1 документ локально, флаг `files`); (2) R2 CORS на бакеты (localhost + прод-origin'ы); (3) публичные бакеты — public access + `R2_PUBLIC_BASE`/`NEXT_PUBLIC_R2_PUBLIC_BASE` (`cdn.clientcase.app`) + починить ~101 аватар со старым URL; (4) edge secret `STORAGE_R2_BUCKETS`, mtproto `.env` R2_*+флаг; (5) редеплой edge с storage + mtproto rsync/docker + фронт push; (6) флип флага. Двойная запись — опц. (сейчас нет; новые файлы после флипа только в R2).
- Мессенджер-edge = **карантин** → перед флипом смок всех каналов (`scripts/smoke-matrix.mjs`).

### Фаза 3 — переключение (обратимо)
- Досинхрон файлов → деплой (фронт push/CI + edge вручную `--no-verify-jwt` + mtproto rsync+docker).
- Флаг чтения → R2.
- Смок: документ, аватар, отправка/приём файла в каждом канале (TG/Wazzup/Email/MTProto).
- Откат: флаг → supabase, либо редеплой предыдущей версии.

### Фаза 4 — хвосты и уборка
- Починить ~100 аватаров с полным старым URL (UPDATE домена или перекачка).
- Публичный домен `cdn.clientcase.app` → R2 (для аватаров/docbuilder).
- Бэкап: переключить `scripts/backup-storage*.mjs` на R2.
- Пожить 1–2 недели → удалить копию в Supabase.

---

## Env-переменные (значения — только у владельца, в репо НЕ коммитить)

| Имя | Где | Значение |
|-----|-----|----------|
| `R2_ENDPOINT` | Supabase Edge secrets, mtproto `.env`, Next server env | `https://2950470268186d8381b920fec6342604.r2.cloudflarestorage.com` |
| `R2_BUCKET` | там же | `clientcase-files` |
| `R2_ACCESS_KEY_ID` | там же | *(секрет, у владельца)* |
| `R2_SECRET_ACCESS_KEY` | там же | *(секрет, у владельца)* |
| `R2_PUBLIC_BASE_URL` | там же (Фаза 4) | `https://cdn.clientcase.app` |
| `STORAGE_BACKEND` | там же | `supabase` → `dual` → `r2` |

⚠️ Ключи в браузер (`NEXT_PUBLIC_*`) НЕ класть — только серверные рантаймы.

---

## Риски / грабли
- **Карантин (мессенджер-edge)**: нельзя «просто задеплоить» — обязательный смок каналов.
- **Браузер + ключи**: приватные файлы только через серверную подпись, не прямой S3 из браузера.
- **~100 аватаров с полным URL**: единственные записи, где cutover рвёт ссылку — починить в Фазе 4.
- **Порядок**: копируем → сверяем → двойная запись → читаем из R2 → потом удаляем старое. Потеря файлов исключена при соблюдении порядка.
