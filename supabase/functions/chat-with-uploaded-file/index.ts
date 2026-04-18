import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { safeJsonParse, isValidUUID } from "../_shared/validation.ts";
import {
  setupAiChat,
  callClaudeApi,
  blobToBase64,
  type ChatMessage,
} from "../_shared/ai-chat-setup.ts";

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: getCorsHeaders(req)
    });
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

    // Parse multipart/form-data
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const question = formData.get("question") as string;
    const workspace_id = formData.get("workspace_id") as string;
    const conversation_history_raw = formData.get("conversation_history") as string;

    const MAX_HISTORY_MESSAGES = 20;
    const conversation_history: ChatMessage[] = conversation_history_raw
      ? (safeJsonParse<ChatMessage[]>(conversation_history_raw) ?? []).slice(-MAX_HISTORY_MESSAGES)
      : [];

    // Validate inputs
    if (!file) {
      return new Response(
        JSON.stringify({ error: "file is required" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    if (!question || question.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "question is required" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    if (!workspace_id) {
      return new Response(
        JSON.stringify({ error: "workspace_id is required" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    if (!isValidUUID(workspace_id)) {
      return new Response(
        JSON.stringify({ error: "workspace_id must be a valid UUID" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Check file type (only PDF and images supported)
    const isPdf = file.type === "application/pdf";
    const isImage = file.type.startsWith("image/");

    if (!isPdf && !isImage) {
      return new Response(
        JSON.stringify({ error: `Unsupported file type: ${file.type}. Only PDF and images are supported.` }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Auth, workspace membership, AI model & API key — shared setup
    const setup = await setupAiChat(req, authHeader, workspace_id);
    if (setup instanceof Response) return setup;

    const { aiModel, apiKey } = setup;

    // Convert file to base64
    const base64 = await blobToBase64(file);

    // System prompt (passed via API `system` parameter, not as a user message)
    const systemPrompt = `Ты помощник для анализа документов. Пользователь загрузил файл "${file.name}" для анализа. Используй информацию из этого документа для ответов на вопросы. Если информации недостаточно, укажи это. Отвечай на русском языке, используй Markdown для форматирования (заголовки, списки, таблицы, выделение текста).`;

    // Build messages array
    type MessageContent = string | Array<{ type: string; text?: string; source?: { type: string; media_type: string; data: string } }>;
    const messages: Array<{ role: "user" | "assistant"; content: MessageContent }> = [];

    // Create file content for Claude
    const fileContent = {
      type: isPdf ? "document" : "image",
      source: {
        type: "base64",
        media_type: file.type,
        data: base64,
      },
    };

    // Add messages based on conversation history
    if (!conversation_history || conversation_history.length === 0) {
      // First message - include file + question
      messages.push({
        role: "user",
        content: [
          fileContent,
          {
            type: "text",
            text: question,
          },
        ],
      });
    } else {
      // Has history - add file context first
      messages.push({
        role: "user",
        content: [
          fileContent,
          {
            type: "text",
            text: "Документ для анализа.",
          },
        ],
      });

      // Add conversation history (skip last user message)
      const historyToAdd = conversation_history.slice(0, -1);
      for (const msg of historyToAdd) {
        messages.push({
          role: msg.role === "user" ? "user" : "assistant",
          content: msg.content,
        });
      }

      // Add current question
      messages.push({
        role: "user",
        content: question,
      });
    }

    // Call Claude API via shared helper
    const result = await callClaudeApi(req, {
      apiKey: apiKey,
      model: aiModel,
      messages,
      systemPrompt,
    });
    if (result instanceof Response) return result;

    return new Response(
      JSON.stringify({
        success: true,
        answer: result.answer,
        file_name: file.name,
        file_type: file.type,
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
