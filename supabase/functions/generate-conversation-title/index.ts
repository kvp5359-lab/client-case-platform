import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { checkWorkspaceMembership } from "../_shared/safeErrorResponse.ts";
import { isValidUUID } from "../_shared/validation.ts";
import { isGeminiModel, callGeminiApi } from "../_shared/gemini-client.ts";

interface GenerateTitleRequest {
  workspace_id: string;
  question: string;
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
    const { workspace_id, question } = await req.json() as GenerateTitleRequest;
    
    if (!workspace_id || !question) {
      return new Response(
        JSON.stringify({ error: "workspace_id and question are required" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    if (!isValidUUID(workspace_id)) {
      return new Response(
        JSON.stringify({ error: "workspace_id must be a valid UUID" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Limit question length
    const MAX_QUESTION_LENGTH = 5000;
    if (typeof question === "string" && question.length > MAX_QUESTION_LENGTH) {
      return new Response(
        JSON.stringify({ error: `question exceeds maximum of ${MAX_QUESTION_LENGTH} characters` }),
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

    // Get workspace AI model to determine provider
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("ai_model")
      .eq("id", workspace_id)
      .single<{ ai_model: string | null }>();

    const aiModel = workspace?.ai_model || "claude-3-5-haiku-20241022";
    const useGemini = isGeminiModel(aiModel);

    // Get API key from vault using service role
    const rpcName = useGemini ? "get_workspace_google_api_key" : "get_workspace_api_key";
    const { data: apiKeyResult, error: apiKeyError } = await supabaseServiceRole
      .rpc(rpcName, { workspace_uuid: workspace_id });

    if (apiKeyError || !apiKeyResult) {
      // Если нет API ключа — возвращаем обрезанный вопрос
      return new Response(
        JSON.stringify({
          success: true,
          title: question.length > 50 ? question.slice(0, 47) + '...' : question
        }),
        { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const apiKey = apiKeyResult as string;

    const titlePrompt = `Придумай краткое название (3-5 слов, максимум 50 символов) для диалога, который начинается с вопроса:

"${question}"

Требования:
- Отрази суть вопроса, а не его дословный текст
- Название должно быть понятным без контекста
- Используй язык вопроса
- Без кавычек и лишних символов

Ответь ТОЛЬКО названием, ничего больше.`;

    let generatedTitle = "";

    if (useGemini) {
      try {
        generatedTitle = await callGeminiApi({
          apiKey,
          model: aiModel,
          contents: [{ role: "user", parts: [{ text: titlePrompt }] }],
          thinkingBudget: 0,
        });
        generatedTitle = generatedTitle.trim();
      } catch (err) {
        console.error("Gemini API error:", err);
        return new Response(
          JSON.stringify({
            success: true,
            title: question.length > 50 ? question.slice(0, 47) + '...' : question
          }),
          { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
        );
      }
    } else {
      // Use a fast model for title generation regardless of workspace setting
      const titleModel = "claude-3-5-haiku-20241022";
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: titleModel,
          max_tokens: 50,
          messages: [{ role: "user", content: titlePrompt }],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Claude API error:", errorText);
        return new Response(
          JSON.stringify({
            success: true,
            title: question.length > 50 ? question.slice(0, 47) + '...' : question
          }),
          { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
        );
      }

      const result = await response.json();
      generatedTitle = result.content[0]?.text?.trim() || "";
    }

    // Clean up the title
    const cleanTitle = generatedTitle
      .replace(/^["']|["']$/g, '') // Remove quotes
      .trim();

    return new Response(
      JSON.stringify({
        success: true,
        title: cleanTitle || (question.length > 50 ? question.slice(0, 47) + '...' : question),
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
