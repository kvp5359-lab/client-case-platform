/**
 * Резолв и создание participant'ов по telegram_user_id.
 */

import { service } from "./shared.ts";
import type { TgUser } from "./types.ts";

/** Найти существующего participant по telegram_user_id (или null). */
export async function participantByTgId(workspaceId: string, tgId: number): Promise<string | null> {
  const { data } = await service
    .from("participants")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("telegram_user_id", tgId)
    .eq("is_deleted", false)
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * Найти или создать participant под Telegram-юзера. Race-protected через
 * unique-индекс (workspace_id, telegram_user_id): если параллельный webhook
 * вставил первым (23505), читаем существующий ряд.
 */
export async function findOrCreateParticipant(workspaceId: string, from: TgUser): Promise<string | null> {
  const { data: existing } = await service
    .from("participants")
    .select("id, telegram_username")
    .eq("workspace_id", workspaceId)
    .eq("telegram_user_id", from.id)
    .eq("is_deleted", false)
    .maybeSingle();
  if (existing) {
    // Дозаписываем @username, если у уже заведённого контакта его ещё нет
    // (чтобы из карточки можно было найти диалог в Telegram). Имя не трогаем —
    // оно могло быть отредактировано вручную.
    if (from.username && !existing.telegram_username) {
      await service
        .from("participants")
        .update({ telegram_username: from.username })
        .eq("id", existing.id);
    }
    return existing.id;
  }

  const { data: created, error } = await service
    .from("participants")
    .insert({
      workspace_id: workspaceId,
      name: from.first_name ?? "Telegram User",
      last_name: from.last_name ?? null,
      telegram_username: from.username ?? null,
      email: `tg_${from.id}@telegram.placeholder`,
      telegram_user_id: from.id,
      workspace_roles: ["Telegram-контакт"],
      can_login: false,
      is_deleted: false,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      const { data: race } = await service
        .from("participants")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("telegram_user_id", from.id)
        .maybeSingle();
      return race?.id ?? null;
    }
    console.error("create participant failed:", error);
    return null;
  }
  return created.id;
}
