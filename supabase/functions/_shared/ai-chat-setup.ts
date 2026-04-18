/**
 * Shared AI chat setup for Edge Functions.
 *
 * Extracts common logic: auth verification, workspace membership check,
 * AI model + API key retrieval, Supabase client creation.
 * Supports both Anthropic Claude and Google Gemini providers.
 *
 * Used by: chat-with-uploaded-file, chat-with-documents
 */

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "./cors.ts";
import { checkWorkspaceMembership } from "./safeErrorResponse.ts";
import { isGeminiModel, callGeminiApi, messagesToGeminiContents } from "./gemini-client.ts";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export type AiProvider = "anthropic" | "google";

export interface AiChatSetupResult {
  user: { id: string };
  supabaseUser: SupabaseClient;
  supabaseServiceRole: SupabaseClient;
  aiModel: string;
  aiProvider: AiProvider;
  apiKey: string;
  /** Gemini thinking budget from workspace settings. undefined = auto. */
  geminiThinkingBudget?: number;
}

/**
 * Performs common AI chat setup:
 * 1. Verifies auth header and user
 * 2. Creates Supabase clients (user + service role)
 * 3. Checks workspace membership
 * 4. Loads AI model from workspace settings
 * 5. Retrieves the correct API key (Anthropic or Google)
 *
 * Returns setup result or a Response (error) to return immediately.
 */
export async function setupAiChat(
  req: Request,
  authHeader: string,
  workspaceId: string,
): Promise<AiChatSetupResult | Response> {
  const corsHeaders = getCorsHeaders(req);
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

  // User client (with RLS)
  const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: userError,
  } = await supabaseUser.auth.getUser();

  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: jsonHeaders,
    });
  }

  // Service role client (bypasses RLS)
  const supabaseServiceRole = createClient(
    supabaseUrl,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Workspace membership check
  const isMember = await checkWorkspaceMembership(supabaseServiceRole, user.id, workspaceId);
  if (!isMember) {
    return new Response(JSON.stringify({ error: "Access denied" }), {
      status: 403,
      headers: jsonHeaders,
    });
  }

  // Get workspace AI model + thinking budget
  const { data: workspace, error: workspaceError } = await supabaseServiceRole
    .from("workspaces")
    .select("ai_model, gemini_thinking_budget")
    .eq("id", workspaceId)
    .single<{ ai_model: string | null; gemini_thinking_budget: number | null }>();

  if (workspaceError || !workspace) {
    return new Response(JSON.stringify({ error: "Workspace not found" }), {
      status: 404,
      headers: jsonHeaders,
    });
  }

  const aiModel = workspace.ai_model || "claude-3-5-haiku-20241022";
  const aiProvider: AiProvider = isGeminiModel(aiModel) ? "google" : "anthropic";

  // Get API key based on provider
  const rpcName = aiProvider === "google"
    ? "get_workspace_google_api_key"
    : "get_workspace_api_key";

  const { data: apiKeyResult, error: apiKeyError } = await supabaseServiceRole.rpc(
    rpcName,
    { workspace_uuid: workspaceId },
  );

  if (apiKeyError || !apiKeyResult) {
    const providerName = aiProvider === "google" ? "Google" : "Anthropic";
    return new Response(
      JSON.stringify({ error: `${providerName} API key not configured for this workspace` }),
      { status: 400, headers: jsonHeaders },
    );
  }

  return {
    user,
    supabaseUser,
    supabaseServiceRole,
    aiModel,
    aiProvider,
    apiKey: apiKeyResult as string,
    geminiThinkingBudget: workspace.gemini_thinking_budget ?? undefined,
  };
}

/**
 * Universal AI call — routes to Claude or Gemini based on model.
 * Returns the text answer or an error Response.
 */
export async function callAiApi(
  req: Request,
  opts: {
    apiKey: string;
    model: string;
    messages: Array<{ role: "user" | "assistant"; content: unknown }>;
    systemPrompt?: string;
    maxTokens?: number;
    geminiThinkingBudget?: number;
  },
): Promise<{ answer: string } | Response> {
  const corsHeaders = getCorsHeaders(req);
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  if (isGeminiModel(opts.model)) {
    // Route to Gemini (native generateContent API)
    try {
      const simpleMessages = opts.messages.map((m) => ({
        role: m.role,
        content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
      }));

      const answer = await callGeminiApi({
        apiKey: opts.apiKey,
        model: opts.model,
        contents: messagesToGeminiContents(simpleMessages),
        systemInstruction: opts.systemPrompt,
        thinkingBudget: opts.geminiThinkingBudget,
      });

      return { answer };
    } catch (err) {
      console.error("Gemini API error:", err);
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500,
        headers: jsonHeaders,
      });
    }
  }

  // Route to Claude (original logic)
  const body: Record<string, unknown> = {
    model: opts.model,
    max_tokens: opts.maxTokens ?? 4096,
    messages: opts.messages,
  };
  if (opts.systemPrompt) {
    body.system = opts.systemPrompt;
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": opts.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Claude API error:", errorText);
    return new Response(JSON.stringify({ error: "AI service error" }), {
      status: 500,
      headers: jsonHeaders,
    });
  }

  const result = await response.json();
  const answer = result.content[0]?.text || "Не удалось получить ответ от нейросети.";
  return { answer };
}

// Keep backward-compatible aliases
export { callAiApi as callClaudeApi };

/**
 * Converts a Blob/File to base64 using chunk-based approach (B-90: safe for large files).
 */
export async function blobToBase64(blob: Blob): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const CHUNK = 4096;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK) {
    parts.push(
      String.fromCharCode.apply(
        null,
        bytes.subarray(i, Math.min(i + CHUNK, bytes.length)) as unknown as number[],
      ),
    );
  }
  return btoa(parts.join(""));
}
