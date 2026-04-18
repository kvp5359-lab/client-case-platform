import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { checkWorkspaceMembership } from "../_shared/safeErrorResponse.ts";
import { isValidUUID } from "../_shared/validation.ts";
import { isGeminiModel, callGeminiApi } from "../_shared/gemini-client.ts";

interface GenerateMergeNameRequest {
  workspace_id: string;
  document_names: string;
  count: number;
}

interface WorkspaceData {
  ai_model: string | null;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const { workspace_id, document_names, count: rawCount } = await req.json() as GenerateMergeNameRequest;

    if (!workspace_id || !document_names) {
      return new Response(
        JSON.stringify({ error: "workspace_id and document_names are required" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Validate count: must be a positive integer, fallback to actual document count
    const fallbackCount = document_names.split(",").length;
    const count = (Number.isInteger(rawCount) && rawCount > 0) ? rawCount : fallbackCount;

    if (!isValidUUID(workspace_id)) {
      return new Response(
        JSON.stringify({ error: "workspace_id must be a valid UUID" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Limit document_names length
    const MAX_NAMES_LENGTH = 5000;
    if (typeof document_names === "string" && document_names.length > MAX_NAMES_LENGTH) {
      return new Response(
        JSON.stringify({ error: `document_names exceeds maximum of ${MAX_NAMES_LENGTH} characters` }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client with user's auth
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify workspace membership
    const supabaseServiceRole = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const isMember = await checkWorkspaceMembership(supabaseServiceRole, user.id, workspace_id);
    if (!isMember) {
      return new Response(
        JSON.stringify({ error: "Access denied" }),
        { status: 403, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Get workspace settings (AI model)
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("ai_model")
      .eq("id", workspace_id)
      .single<WorkspaceData>();

    const aiModel = workspace?.ai_model || "claude-3-5-haiku-20241022";
    const useGemini = isGeminiModel(aiModel);

    // Get API key from vault using service role
    const rpcName = useGemini ? "get_workspace_google_api_key" : "get_workspace_api_key";
    const { data: apiKeyResult, error: apiKeyError } = await supabaseServiceRole
      .rpc(rpcName, { workspace_uuid: workspace_id });

    if (apiKeyError || !apiKeyResult) {
      const providerName = useGemini ? "Google" : "Anthropic";
      return new Response(
        JSON.stringify({ error: `${providerName} API key not configured for this workspace` }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const apiKey = apiKeyResult as string;

    const mergePrompt = `Сгенерируй краткое название (2-3 слова, максимум 50 символов) для объединённого PDF документа.

Исходные документы (${count} шт.): ${document_names}

Требования:
- Название должно отражать общую тему документов
- Используй язык оригинальных документов (если испанский — пиши на испанском)
- Без расширения .pdf
- Без кавычек и лишних символов
- Только само название, без пояснений

Ответь ТОЛЬКО названием, ничего больше.`;

    let generatedName = "";

    if (useGemini) {
      try {
        generatedName = await callGeminiApi({
          apiKey,
          model: aiModel,
          contents: [{ role: "user", parts: [{ text: mergePrompt }] }],
          thinkingBudget: 0,
        });
        generatedName = generatedName.trim();
      } catch (err) {
        console.error("Gemini API error:", err);
        return new Response(
          JSON.stringify({ error: "AI service error" }),
          { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
        );
      }
    } else {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: aiModel,
          max_tokens: 100,
          messages: [{ role: "user", content: mergePrompt }],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Claude API error:", errorText);
        return new Response(
          JSON.stringify({ error: "AI service error" }),
          { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
        );
      }

      const result = await response.json();
      generatedName = result.content[0]?.text?.trim() || "";
    }

    // Clean up the name
    const cleanName = generatedName
      .replace(/^["']|["']$/g, '') // Remove quotes
      .replace(/\.pdf$/i, '') // Remove .pdf extension if present
      .trim();

    return new Response(
      JSON.stringify({
        success: true,
        name: cleanName || `Объединённый документ (${count})`,
      }),
      { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
