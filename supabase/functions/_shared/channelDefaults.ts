import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

/**
 * Дефолтные иконка+цвет нового чата канала из workspaces.channel_defaults
 * (через SQL-хелпер resolve_channel_default — единый источник фолбэков БД).
 * Вынесено из webhook'ов (был вербатим-дубль в business/wazzup): один код,
 * фолбэк — параметром (у каждого канала свой icon/accent по умолчанию).
 */
export async function resolveChannelDefault(
  service: SupabaseClient,
  workspaceId: string,
  channelKey: string,
  fallback: { icon: string; accent_color: string },
): Promise<{ icon: string; accent_color: string }> {
  const { data } = await service.rpc("resolve_channel_default", {
    p_workspace_id: workspaceId,
    p_channel_key: channelKey,
  });
  const r = Array.isArray(data) ? data[0] : data;
  return {
    icon: (r?.icon as string) ?? fallback.icon,
    accent_color: (r?.accent_color as string) ?? fallback.accent_color,
  };
}
