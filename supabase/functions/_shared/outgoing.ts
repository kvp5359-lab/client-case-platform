import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

/**
 * Общие куски исходящих edge-функций (send/edit/delete/react) — единый слой
 * вместо вербатим-копий в каждой функции.
 */

/**
 * Внутреннее сообщение (team/self) — во внешний канал НЕ уходит. Единый
 * предикат вместо `(v ?? 'client') !== 'client'` в каждой send/edit-функции.
 * Сторож scripts/check-edge-invariants.mjs требует его наличия в каждой.
 */
export function isInternalVisibility(visibility: string | null | undefined): boolean {
  return (visibility ?? "client") !== "client";
}

/**
 * Членство пользователя в воркспейсе (защита от чужих в JWT-пути). Единый
 * helper вместо ручного participants-select, скопированного в mtproto/business/
 * wazzup/email/delete/react функциях. Возвращает true, если участник активен.
 */
export async function assertWorkspaceMembership(
  service: SupabaseClient,
  userId: string,
  workspaceId: string,
): Promise<boolean> {
  const { data } = await service
    .from("participants")
    .select("id")
    .eq("user_id", userId)
    .eq("workspace_id", workspaceId)
    .eq("is_deleted", false)
    .maybeSingle();
  return !!data;
}
