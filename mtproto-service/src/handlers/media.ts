/**
 * Медиа входящих MTProto-сообщений: определение вложения, скачивание через
 * gramjs, заливка в Storage + строка message_attachments.
 *
 * Вынесено из incoming.ts (аудит 2026-07-13) — механический перенос, логика
 * не менялась.
 */

import { Api, TelegramClient } from "telegram"
import { randomBytes } from "node:crypto"
import { STORAGE_BUCKETS, storageUpload } from "../storage.js"
import { supabase } from "../db.js"

export interface MediaInfo {
  fileName: string
  fileSize: number
  mimeType: string | null
}

export function extractMediaInfo(msg: Api.Message): MediaInfo | null {
  const media = msg.media
  if (!media) return null

  if (media instanceof Api.MessageMediaDocument && media.document instanceof Api.Document) {
    const doc = media.document
    let fileName = `file_${Number(doc.id)}`
    const mimeType: string | null = doc.mimeType ?? null
    for (const a of doc.attributes ?? []) {
      if (a instanceof Api.DocumentAttributeFilename) fileName = a.fileName
    }
    // Если у документа нет расширения, но есть mime — добавим.
    if (!fileName.includes(".") && mimeType) {
      const ext = mimeExtension(mimeType)
      if (ext) fileName = `${fileName}.${ext}`
    }
    return {
      fileName,
      fileSize: Number(doc.size),
      mimeType,
    }
  }

  if (media instanceof Api.MessageMediaPhoto && media.photo instanceof Api.Photo) {
    return {
      fileName: `photo_${Number(media.photo.id)}.jpg`,
      fileSize: 0, // считается после скачивания
      mimeType: "image/jpeg",
    }
  }

  return null
}

function mimeExtension(mime: string): string | null {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "audio/ogg": "ogg",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "application/pdf": "pdf",
  }
  return map[mime] ?? null
}

export async function downloadAndStoreMedia(args: {
  client: TelegramClient
  message: Api.Message
  info: MediaInfo
  workspaceId: string
  threadId: string
  messageId: string
}): Promise<void> {
  const buffer = await args.client.downloadMedia(args.message)
  if (!buffer || !(buffer instanceof Buffer)) {
    throw new Error("downloadMedia returned no data")
  }

  const ext = args.info.fileName.includes(".")
    ? args.info.fileName.split(".").pop()!
    : "bin"
  const random = randomBytes(4).toString("hex")
  // У личных диалогов нет project_id, используем thread_id в storage path,
  // чтобы вложения не сваливались в одну папку «null» и были привязаны
  // к треду.
  const storagePath = `${args.workspaceId}/${args.threadId}/${args.messageId}/${Date.now()}-${random}.${ext}`

  const { error: uploadError } = await storageUpload(STORAGE_BUCKETS.messageAttachments, storagePath, buffer, {
      contentType: args.info.mimeType ?? "application/octet-stream",
      upsert: false,
    })
  if (uploadError) {
    throw new Error(`Storage upload failed: ${uploadError.message}`)
  }

  const { error: insertError } = await supabase.from("message_attachments").insert({
    message_id: args.messageId,
    file_name: args.info.fileName,
    file_size: args.info.fileSize > 0 ? args.info.fileSize : buffer.length,
    mime_type: args.info.mimeType,
    storage_path: storagePath,
  })
  if (insertError) {
    throw new Error(`message_attachments insert failed: ${insertError.message}`)
  }
}
