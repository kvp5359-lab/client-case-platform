/**
 * Best-effort учёт токенов ИИ на уровне воркспейса.
 *
 * Пишет расход в БД (RPC `log_ai_usage`, service_role). Спроектирован так, чтобы
 * НИКОГДА не бросать и не задерживать ответ ИИ: при любой ошибке молча выходит.
 * Поэтому вызывать можно без await в hot-path (fire-and-forget) — но проще
 * `await logAiUsage(...)` в конце обработчика, ошибка всё равно проглатывается.
 *
 * Данные копятся с момента деплоя — задним числом токены не восстановить.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

export interface AiUsageInput {
  /** Без workspaceId запись пропускается (нечего тарифицировать). */
  workspaceId?: string | null;
  functionName?: string;
  provider?: "anthropic" | "google" | "openai" | string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  userId?: string | null;
  feature?: string;
  meta?: Record<string, unknown>;
}

/** Достаёт токены из ответа Anthropic (`usage.input_tokens/output_tokens`). */
export function anthropicUsage(data: unknown): { inputTokens: number; outputTokens: number } {
  const u = (data as { usage?: { input_tokens?: number; output_tokens?: number } })?.usage;
  return { inputTokens: u?.input_tokens ?? 0, outputTokens: u?.output_tokens ?? 0 };
}

/** Достаёт токены из ответа Gemini (`usageMetadata.promptTokenCount/candidatesTokenCount`). */
export function geminiUsage(data: unknown): { inputTokens: number; outputTokens: number } {
  const u = (data as {
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  })?.usageMetadata;
  return { inputTokens: u?.promptTokenCount ?? 0, outputTokens: u?.candidatesTokenCount ?? 0 };
}

export async function logAiUsage(u: AiUsageInput): Promise<void> {
  try {
    if (!u.workspaceId) return;
    const inTok = Math.max(0, Math.round(u.inputTokens ?? 0));
    const outTok = Math.max(0, Math.round(u.outputTokens ?? 0));
    if (inTok === 0 && outTok === 0) return; // нечего писать

    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return;

    const svc = createClient(url, key);
    await svc.rpc("log_ai_usage", {
      p_workspace_id: u.workspaceId,
      p_input_tokens: inTok,
      p_output_tokens: outTok,
      p_function_name: u.functionName ?? null,
      p_provider: u.provider ?? null,
      p_model: u.model ?? null,
      p_user_id: u.userId ?? null,
      p_feature: u.feature ?? null,
      p_meta: u.meta ?? null,
    });
  } catch (_e) {
    // best-effort: учёт не должен влиять на ответ ИИ
  }
}
