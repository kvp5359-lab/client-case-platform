# Повторный аудит переезда на R2: бэкап читает из R2 + укрепление storage-слоя

**Дата:** 2026-07-11
**Тип:** fix + refactor (инфраструктура хранилища, скрипты, edge, фронт, mtproto)
**Статус:** деплой (push в main → CI/CD для фронта; edge/mtproto/скрипты — вручную)

---

Второй, глубокий проход по переезду файлового хранилища на Cloudflare R2 (после
первого аудит-захода `5c35e27a`). Прод-путь приложения для 5 мигрированных
бакетов (`files`, `document-files`, `document-templates`, `message-attachments`,
`participant-avatars`) признан корректным: обходов storage-слоя нет, приём
крупных TG/MTProto-вложений не подвержен `R2 PUT 411` (тела известной длины, не
`ReadableStream`), подпись/пути/RLS-паритет сверены. Найдены и закрыты 6
остаточных вспомогательно-инфраструктурных и hardening-пунктов. Канальной логики
(dispatch/webhook/send/visibility) не касалось.

## A 🔴 — ночной бэкап читал файлы из Supabase (сохранность данных)

`scripts/backup-storage.mjs` снимал off-project копию 4 приватных бакетов через
Supabase Storage REST, где после переезда новых файлов уже нет (они в R2) →
файлы, созданные после флипа флага, **не бэкапились никуда**.

- Новый `scripts/lib/r2.mjs` — zero-dependency доступ к R2 (S3 SigV4 на встроенном
  `node:crypto`, без npm: бэкап бежит в голом `node:22-alpine` без `node_modules`).
  Подпись сверена с официальным тест-вектором AWS (совпала побайтово).
- `backup-storage.mjs` ветвится: бакет в `STORAGE_R2_BUCKETS` и заданы R2-ключи →
  читает из R2 (`r2List`/`r2Get`, инкрементальная сверка по `ETag`), иначе
  Supabase, как раньше. Формат state сменил `updated_at` → `tag` (первый прогон
  после деплоя перекачает всё — норма).
- `scripts/backup-storage-vps.sh` пробрасывает `R2_ENDPOINT`/`R2_ACCESS_KEY_ID`/
  `R2_SECRET_ACCESS_KEY`/`STORAGE_R2_BUCKETS` из `mtproto-service/.env` в docker-run.

## B 🟠 — смок-матрица писала тест-файл в Supabase (ложный сигнал)

`smoke-matrix.mjs` грузил тест-вложение прямым `supabase.storage.from('files')
.upload()` → файл писался в Supabase, а приложение читает из R2 → «битый квадрат»
и неверный результат смока. Теперь: если `files` на R2 → пишем через `r2Put` (тот
же `lib/r2.mjs`), иначе Supabase.

## C 🟠 — молчаливый битый публичный URL (hardening, 3 рантайма)

`r2PublicUrl` (фронт) / `r2GetPublicUrl` (edge, mtproto) при пустом
`R2_PUBLIC_BASE` возвращали битую ссылку `/key` **без ошибки** — она записывалась
в БД навсегда (аватары участников). Добавлен fail-fast: при отсутствии домена
функция бросает исключение, вызывающий показывает ошибку вместо записи мусора. В
проде `R2_PUBLIC_BASE` для `participant-avatars` задан → в норме не срабатывает.

## D 🟡 — docbuilder жёстко прибит к supabase-домену (латентно)

`analyze-documents`/`generate-block` строили публичный URL к бакету `docbuilder`
захардкоженной строкой `...supabase.co/storage/v1/object/public/docbuilder/...` в
обход storage-слоя. `getFileUrl` переведён на `storageGetPublicUrl(docbuilder)`:
`docbuilder` пока на Supabase → тот же URL (0 изменений поведения), при будущей
миграции `docbuilder` на R2 автоматически отдаст CDN-ссылку без правки здесь.

## E 🟡 — рассогласование нормализации endpoint

Edge `_shared/r2.ts` не обрезал завершающий `/` у `R2_ENDPOINT` (mtproto и Next
обрезают). При env с хвостовым слэшем получился бы `//bucket/...`. Добавлен
`.replace(/\/+$/, "")` — консистентно с остальными рантаймами.

## F 🟡 — тип загрузки допускал потоковое тело (задел под 411)

Edge `r2Upload`/`storageUpload` принимали `ReadableStream` в типе тела. У
потокового тела нет `Content-Length` → R2 отвечает `411` (тот же класс, что
ловили в Next-runtime). `ReadableStream` убран из типа — потоковая загрузка стала
compile-error; ни один вызывающий его не передавал (deno check чист).

## Проверки

- Подпись S3 SigV4 = официальный тест-вектор AWS (детерминированно, без ключей).
- Фронт: `tsc` 0, `eslint` 0 по изменённым файлам, **863 теста** зелёные.
- Edge: `deno check` `_shared/r2.ts` + `_shared/storage.ts` — 0 ошибок.
- mtproto: `tsc --noEmit` 0.
- Скрипты: `node --check` `lib/r2.mjs` / `backup-storage.mjs` / `smoke-matrix.mjs` — ok.
- Модель доступа `storage-r2` повторно сверена с живыми RLS-политиками — паритет.

## Деплой

- **Фронт** (`r2Client.ts`) — через CI blue/green (fail-fast срабатывает только при
  мисконфиге, base задан → поведение не меняется).
- **Скрипты** (A/B) — синхронизировать `scripts/` на VPS `/opt/clientcase/scripts/`
  (включая новую папку `lib/`); `mtproto-service/.env` должен содержать `R2_*` +
  `STORAGE_R2_BUCKETS` (уже есть). Смок бэкапа: прогнать с R2-env → в логе `(R2)` и
  реальные скачанные файлы.
- **Edge** (C/E/F) — redeploy функций на `_shared/r2.ts` (`fetch-telegram-avatar`,
  `telegram-register-webhook`, `telegram-webhook`, storage-функции); (D)
  `analyze-documents` + `generate-block` (опц., docbuilder не на R2). Вручную (CI их
  не катит), рантайм-поведение не меняется.
- **mtproto** (C) — rebuild.

## Затронутые файлы

`scripts/lib/r2.mjs` (нов), `scripts/backup-storage.mjs`,
`scripts/backup-storage-vps.sh`, `scripts/smoke-matrix.mjs`,
`src/lib/storage/r2Client.ts`, `supabase/functions/_shared/r2.ts`,
`supabase/functions/_shared/storage.ts`,
`supabase/functions/analyze-documents/index.ts`,
`supabase/functions/generate-block/index.ts`, `mtproto-service/src/r2.ts`,
`.claude/rules/messenger-ledger.md`.
