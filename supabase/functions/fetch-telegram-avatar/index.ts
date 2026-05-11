/**
 * Загружает аватар Telegram-пользователя по `tg_user_id` через Bot API и
 * кэширует в Storage (`participant-avatars/tg/<tg_user_id>.jpg`).
 *
 * Используется для показа аватара клиента в списке «Входящие» — для
 * Telegram Business / MTProto / Group, где у клиента нет participant'а в БД.
 *
 * Кэш: `telegram_user_avatars (tg_user_id PK, avatar_url, is_missing, fetched_at)`.
 * Если is_missing — фото не найдено, ре-чекаем не раньше чем через 7 дней.
 * Если есть avatar_url — ре-чекаем не раньше чем через 30 дней.
 *
 * Auth: x-internal-secret ИЛИ Bearer JWT (для вызова из фронта).
 *
 * Body: { tg_user_id: number, force?: boolean }
 */
import {
  getServiceClient,
  jsonRes,
  preflight,
  requireInternalSecret,
} from "../_shared/edge.ts";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BUSINESS_BOT_TOKEN") ??
  Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";

const CACHE_HIT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CACHE_MISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (!requireInternalSecret(req, true)) {
    return jsonRes({ error: "unauthorized" }, 401, req);
  }
  if (!BOT_TOKEN) {
    return jsonRes({ error: "bot_token_missing" }, 500, req);
  }

  let payload: { tg_user_id?: number; force?: boolean };
  try {
    payload = await req.json();
  } catch {
    return jsonRes({ error: "invalid_json" }, 400, req);
  }

  const tgUserId = Number(payload.tg_user_id);
  if (!tgUserId || !Number.isFinite(tgUserId)) {
    return jsonRes({ error: "tg_user_id_required" }, 400, req);
  }

  const service = getServiceClient();

  // Проверяем кэш
  if (!payload.force) {
    const { data: cached } = await service
      .from("telegram_user_avatars")
      .select("avatar_url, is_missing, fetched_at")
      .eq("tg_user_id", tgUserId)
      .maybeSingle();

    if (cached) {
      const ageMs = Date.now() - new Date(cached.fetched_at).getTime();
      const ttl = cached.is_missing ? CACHE_MISS_TTL_MS : CACHE_HIT_TTL_MS;
      if (ageMs < ttl) {
        return jsonRes({
          cached: true,
          avatar_url: cached.avatar_url,
          is_missing: cached.is_missing,
        }, 200, req);
      }
    }
  }

  // getUserProfilePhotos
  const photosRes = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/getUserProfilePhotos?user_id=${tgUserId}&limit=1`,
  );
  const photosJson = await photosRes.json();
  if (!photosJson.ok) {
    // Bot не может «видеть» этого пользователя или другая ошибка.
    // Помечаем как missing на короткий TTL и выходим.
    await service.from("telegram_user_avatars").upsert({
      tg_user_id: tgUserId,
      avatar_url: null,
      is_missing: true,
      fetched_at: new Date().toISOString(),
    });
    return jsonRes({
      avatar_url: null,
      is_missing: true,
      reason: photosJson.description ?? "tg_api_error",
    }, 200, req);
  }

  const photos = photosJson.result?.photos ?? [];
  if (photos.length === 0 || photos[0].length === 0) {
    await service.from("telegram_user_avatars").upsert({
      tg_user_id: tgUserId,
      avatar_url: null,
      is_missing: true,
      fetched_at: new Date().toISOString(),
    });
    return jsonRes({ avatar_url: null, is_missing: true }, 200, req);
  }

  // Берём самое крупное фото (последний размер) первого набора.
  const sizes = photos[0];
  const largest = sizes[sizes.length - 1];
  const fileId = largest.file_id;

  const fileRes = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`,
  );
  const fileJson = await fileRes.json();
  if (!fileJson.ok) {
    await service.from("telegram_user_avatars").upsert({
      tg_user_id: tgUserId,
      avatar_url: null,
      is_missing: true,
      fetched_at: new Date().toISOString(),
    });
    return jsonRes({
      avatar_url: null,
      is_missing: true,
      reason: fileJson.description ?? "get_file_failed",
    }, 200, req);
  }

  const filePath = fileJson.result?.file_path;
  if (!filePath) {
    return jsonRes({ avatar_url: null, is_missing: true }, 200, req);
  }

  const dlRes = await fetch(
    `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`,
  );
  if (!dlRes.ok) {
    return jsonRes({ avatar_url: null, is_missing: true }, 200, req);
  }
  const bytes = new Uint8Array(await dlRes.arrayBuffer());

  const storagePath = `tg/${tgUserId}.jpg`;
  const { error: uploadError } = await service.storage
    .from("participant-avatars")
    .upload(storagePath, bytes, {
      contentType: "image/jpeg",
      upsert: true,
    });
  if (uploadError) {
    return jsonRes({ error: "storage_upload_failed", detail: uploadError.message }, 500, req);
  }

  const { data: publicUrl } = service.storage
    .from("participant-avatars")
    .getPublicUrl(storagePath);

  // Cache-buster: file menяется при перезагрузке, чтобы клиенты подхватили новую версию.
  const url = `${publicUrl.publicUrl}?v=${Date.now()}`;

  await service.from("telegram_user_avatars").upsert({
    tg_user_id: tgUserId,
    avatar_url: url,
    is_missing: false,
    fetched_at: new Date().toISOString(),
  });

  return jsonRes({ avatar_url: url, is_missing: false }, 200, req);
});
