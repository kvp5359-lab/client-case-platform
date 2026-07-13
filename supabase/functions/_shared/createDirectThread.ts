// Создание «личного диалога» (project_id=NULL) для Telegram-канала без проекта.
// Поиск существующего диалога — на стороне вызывающего (у каждого канала свои
// ключи связи: лид-бот — через project_telegram_chats, Business/MTProto — через
// свои колонки треда), поэтому здесь только само создание: контакт + дефолты
// канала + INSERT треда.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { resolveChannelDefault } from "./channelDefaults.ts";

export interface CreateDirectThreadArgs {
  workspaceId: string;
  /** Владелец треда (главный ответственный) или null (виден только менеджерам + members). */
  ownerUserId: string | null;
  clientTgUserId: number;
  clientDisplayName: string;
  /** Ключ дефолтов канала для иконки/цвета (workspaces.channel_defaults). */
  channelDefaultKey: string;
  fallbackIcon: string;
  fallbackAccent: string;
  /** Доп. колонки при создании (напр. lead_source). */
  extraColumns?: Record<string, unknown>;
}

export async function createDirectThread(
  service: SupabaseClient,
  args: CreateDirectThreadArgs,
): Promise<{ threadId: string; contactParticipantId: string | null }> {
  // Контакт в справочнике участников: ищем по telegram_user_id, при отсутствии создаём.
  const { data: contactId } = await service.rpc("find_or_create_contact_participant", {
    p_workspace_id: args.workspaceId,
    p_name: args.clientDisplayName,
    p_telegram_user_id: args.clientTgUserId,
  });

  const def = await resolveChannelDefault(service, args.workspaceId, args.channelDefaultKey, {
    icon: args.fallbackIcon,
    accent_color: args.fallbackAccent,
  });

  const { data: created, error } = await service
    .from("project_threads")
    .insert({
      project_id: null,
      owner_user_id: args.ownerUserId,
      contact_participant_id: (contactId as string | null) ?? null,
      workspace_id: args.workspaceId,
      name: args.clientDisplayName,
      type: "chat",
      access_type: "all",
      icon: def.icon,
      accent_color: def.accent_color,
      created_by: args.ownerUserId,
      ...(args.extraColumns ?? {}),
    })
    .select("id")
    .single();
  if (error || !created) {
    throw new Error(`createDirectThread: failed to create thread: ${error?.message}`);
  }
  return {
    threadId: created.id as string,
    contactParticipantId: (contactId as string | null) ?? null,
  };
}
