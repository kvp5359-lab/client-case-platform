/**
 * Аватары MTProto-контактов: скачивание profile photo через gramjs +
 * сохранение URL в participants с TTL-рефрешем.
 *
 * Вынесено из incoming.ts (аудит 2026-07-13) — механический перенос, логика
 * не менялась. Экспортируется, чтобы приём (incoming.ts) и /messages/send
 * (commands.ts) могли дёргать один путь.
 */

import { Api, TelegramClient } from "telegram"
import { STORAGE_BUCKETS, storageUpload, storageGetPublicUrl } from "../storage.js"
import { supabase } from "../db.js"
import { logger } from "../utils/logger.js"

/** Минимальный интервал между попытками рефреша аватара (24ч). */
const AVATAR_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000

/**
 * Качает profile photo клиента через gramjs и сохраняет URL в participants.
 *
 * Логика «когда пробовать»:
 *   - avatar_url IS NULL → всегда пробовать.
 *   - avatar_fetched_at IS NULL → пробовать (никогда не пытались).
 *   - avatar_fetched_at старше 24ч → пробовать (рефреш).
 *   - Иначе — пропустить, чтобы не спамить Telegram при каждом сообщении.
 *
 * Storage overwrite через upsert: при смене аватара клиентом URL остаётся
 * прежний (та же path `tg/<id>.jpg`), но мы обновляем `?v=<timestamp>` —
 * это инвалидирует CDN-кеш у получателя.
 */
export async function fetchAndStoreAvatar(
  client: TelegramClient,
  args: {
    participantId: string
    clientTgUserId: number
    peerUser: Api.PeerUser
  },
): Promise<void> {
  const { data: row } = await supabase
    .from("participants")
    .select("avatar_url, avatar_fetched_at")
    .eq("id", args.participantId)
    .maybeSingle()

  const fetchedAt = row?.avatar_fetched_at ? new Date(row.avatar_fetched_at as string).getTime() : null
  const isFresh =
    !!row?.avatar_url &&
    fetchedAt !== null &&
    Date.now() - fetchedAt < AVATAR_REFRESH_INTERVAL_MS
  if (isFresh) return

  const entity = await client.getEntity(args.peerUser)
  const hasPhoto = entity && "photo" in entity &&
    entity.photo && entity.photo.className !== "UserProfilePhotoEmpty"
  if (!hasPhoto) {
    // Стампим попытку даже при отсутствии фото — иначе будем долбить
    // getEntity на каждое сообщение клиента без аватарки.
    await supabase
      .from("participants")
      .update({ avatar_fetched_at: new Date().toISOString() })
      .eq("id", args.participantId)
    return
  }

  const buf = await client.downloadProfilePhoto(entity, { isBig: true })
  if (!buf || (buf as Buffer).length === 0) {
    await supabase
      .from("participants")
      .update({ avatar_fetched_at: new Date().toISOString() })
      .eq("id", args.participantId)
    return
  }

  const path = `tg/${args.clientTgUserId}.jpg`
  const { error: upErr } = await storageUpload(STORAGE_BUCKETS.participantAvatars, path, buf as Buffer, {
      contentType: "image/jpeg",
      upsert: true,
    })
  if (upErr) {
    logger.warn({ err: upErr, clientTgUserId: args.clientTgUserId }, "avatar storage upload failed")
    return
  }
  const { data: pub } = storageGetPublicUrl(STORAGE_BUCKETS.participantAvatars, path)
  const avatarUrl = `${pub.publicUrl}?v=${Date.now()}`

  await supabase
    .from("participants")
    .update({ avatar_url: avatarUrl, avatar_fetched_at: new Date().toISOString() })
    .eq("id", args.participantId)
}
