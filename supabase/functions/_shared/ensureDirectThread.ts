// Общее создание «личного диалога» (project_id = NULL) для Telegram-каналов
// без проекта: лид-бот, Telegram Business, MTProto.
//
// Различается у каналов только КАК найти существующий тред (ключи на треде vs
// связь в project_telegram_chats) — поэтому поиск передаётся колбэком
// `findExistingThreadId`, а объёмная общая часть (контакт + channel-defaults +
// INSERT базовых колонок) живёт здесь.
//
// Кандидат на консолидацию: ensureBusinessThread / ensureMTProtoThread повторяют
// этот же INSERT — перевести их сюда отдельным заходом со смоком.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { resolveChannelDefault } from "./channelDefaults.ts";

export interface EnsureDirectThreadArgs {
  workspaceId: string;
  /** Владелец треда (главный ответственный) или null. Тред виден owner + members + менеджерам. */
  ownerUserId: string | null;
  clientTgUserId: number;
  clientDisplayName: string;
  /** Ключ дефолтов канала для иконки/цвета (workspaces.channel_defaults). */
  channelDefaultKey: string;
  fallbackIcon: string;
  fallbackAccent: string;
  /** Поиск существующего треда (у каждого канала свои ключи). null → создаём новый. */
  findExistingThreadId: () => Promise<string | null>;
  /** Канало-специфичные колонки треда (business_connection_id / mtproto_* / …). */
  threadColumns?: Record<string, unknown>;
  /** Дополнительные колонки при создании (напр. lead_source). */
  extraColumns?: Record<string, unknown>;
}

export interface EnsureDirectThreadResult {
  threadId: string;
  created: boolean;
  contactParticipantId: string | null;
}

export async function ensureDirectThread(
  service: SupabaseClient,
  args: EnsureDirectThreadArgs,
): Promise<EnsureDirectThreadResult> {
  const existingId = await args.findExistingThreadId();
  if (existingId) {
    return { threadId: existingId, created: false, contactParticipantId: null };
  }

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
      ...(args.threadColumns ?? {}),
      ...(args.extraColumns ?? {}),
    })
    .select("id")
    .single();
  if (error || !created) {
    throw new Error(`ensureDirectThread: failed to create thread: ${error?.message}`);
  }
  return {
    threadId: created.id as string,
    created: true,
    contactParticipantId: (contactId as string | null) ?? null,
  };
}
