/**
 * Shared logic for AI form data extraction.
 * Supports both Anthropic Claude and Google Gemini providers.
 * Used by: extract-form-data, extract-form-data-from-file
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { isGeminiModel, callGeminiApi, geminiImagePart, geminiPdfPart, geminiTextPart, type GeminiPart } from "./gemini-client.ts";

// ---------- Types ----------

export interface FormField {
  id: string;
  field_definition_id: string;
  name: string;
  field_type: string;
  is_required: boolean;
}

export interface ExtractionResult {
  success: true;
  extracted_data: Record<string, string>;
  stats: {
    total: number;
    filled: number;
    percentage: number;
  };
}

export type AiProvider = "anthropic" | "google";

// ---------- Data fetching ----------

/** Fetch form kit with AI prompt and fields. */
export async function getFormKitData(
  supabase: SupabaseClient,
  formKitId: string,
): Promise<{ aiPrompt: string; fields: FormField[] }> {
  const { data: formKit, error: formError } = await supabase
    .from("form_kits")
    .select("*, form_templates(ai_extraction_prompt)")
    .eq("id", formKitId)
    .single();

  if (formError || !formKit) {
    throw new ExtractionError("Form kit not found", 404);
  }

  const template = formKit.form_templates as { ai_extraction_prompt?: string } | null;
  const aiPrompt = template?.ai_extraction_prompt;

  if (!aiPrompt) {
    throw new ExtractionError(
      "AI extraction prompt is not configured for this form template",
      400,
    );
  }

  const { data: fields, error: fieldsError } = await supabase
    .from("form_kit_fields")
    .select("id, field_definition_id, name, field_type, is_required")
    .eq("form_kit_id", formKitId)
    .order("sort_order", { ascending: true });

  if (fieldsError || !fields || fields.length === 0) {
    throw new ExtractionError("No fields found in form", 404);
  }

  return { aiPrompt, fields: fields as FormField[] };
}

/** Get workspace AI model and API key (supports both providers). */
export async function getWorkspaceAIConfig(
  supabase: SupabaseClient,
  supabaseAdmin: SupabaseClient,
  workspaceId: string,
): Promise<{ aiModel: string; apiKey: string; aiProvider: AiProvider; thinkingBudget?: number }> {
  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("ai_model, gemini_thinking_budget")
    .eq("id", workspaceId)
    .single();

  if (workspaceError || !workspace) {
    throw new ExtractionError("Workspace not found", 404);
  }

  const aiModel = workspace.ai_model || "claude-3-5-haiku-20241022";
  const aiProvider: AiProvider = isGeminiModel(aiModel) ? "google" : "anthropic";

  const rpcName = aiProvider === "google"
    ? "get_workspace_google_api_key"
    : "get_workspace_api_key";

  const { data: apiKey, error: keyError } = await supabaseAdmin.rpc(
    rpcName,
    { workspace_uuid: workspaceId },
  );

  if (keyError || !apiKey) {
    const providerName = aiProvider === "google" ? "Google" : "Anthropic";
    throw new ExtractionError(
      `${providerName} API key not configured for workspace`,
      400,
    );
  }

  return { aiModel, apiKey, aiProvider, thinkingBudget: workspace.gemini_thinking_budget ?? undefined };
}

// ---------- AI extraction ----------

/** Build extraction prompt from fields and AI prompt template. */
export function buildExtractionPrompt(
  fields: FormField[],
  aiPrompt: string,
): string {
  const fieldsList = fields
    .map(
      (f) =>
        `- "${f.name}" (id: ${f.field_definition_id}, type: ${f.field_type}${
          f.is_required ? ", обязательное" : ""
        })`,
    )
    .join("\n");

  return `${aiPrompt}

## Список полей анкеты для заполнения:
${fieldsList}

## Формат ответа:
Верни ТОЛЬКО валидный JSON объект в следующем формате (без дополнительного текста):
{
  "field_definition_id_1": "извлеченное значение",
  "field_definition_id_2": "извлеченное значение",
  ...
}

Если значение для поля не найдено в документе, НЕ включай его в ответ.
Используй field_definition_id из списка выше в качестве ключей.`;
}

/** Call Claude API with document/image and extraction prompt. */
export async function callClaudeExtraction(opts: {
  apiKey: string;
  model: string;
  base64: string;
  mimeType: string;
  prompt: string;
}): Promise<Record<string, string>> {
  const isPdf = opts.mimeType === "application/pdf";
  const contentType = isPdf ? "document" : "image";

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": opts.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            {
              type: contentType,
              source: {
                type: "base64",
                media_type: opts.mimeType,
                data: opts.base64,
              },
            },
            {
              type: "text",
              text: opts.prompt,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Claude API error:", errorText);
    throw new ExtractionError("AI service error", 500);
  }

  const result = await response.json();
  const aiResponse = result.content?.[0]?.text || "";

  return parseExtractionJSON(aiResponse);
}

/** Call Gemini API with image/PDF and extraction prompt (native API — supports all formats). */
export async function callGeminiExtraction(opts: {
  apiKey: string;
  model: string;
  base64: string;
  mimeType: string;
  prompt: string;
  thinkingBudget?: number;
}): Promise<Record<string, string>> {
  const isPdf = opts.mimeType === "application/pdf";
  const filePart: GeminiPart = isPdf
    ? geminiPdfPart(opts.base64)
    : geminiImagePart(opts.base64, opts.mimeType);

  const aiResponse = await callGeminiApi({
    apiKey: opts.apiKey,
    model: opts.model,
    contents: [
      {
        role: "user",
        parts: [filePart, geminiTextPart(opts.prompt)],
      },
    ],
    thinkingBudget: opts.thinkingBudget,
  });

  return parseExtractionJSON(aiResponse);
}

/** Universal extraction call — routes to Claude or Gemini. */
export async function callExtraction(opts: {
  apiKey: string;
  model: string;
  base64: string;
  mimeType: string;
  prompt: string;
  thinkingBudget?: number;
}): Promise<Record<string, string>> {
  if (isGeminiModel(opts.model)) {
    return callGeminiExtraction(opts);
  }
  return callClaudeExtraction(opts);
}

/** Parse JSON from AI response (may be wrapped in markdown). */
function parseExtractionJSON(aiResponse: string): Record<string, string> {
  try {
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error("No JSON found in response");
  } catch {
    console.error("Failed to parse AI response:", aiResponse);
    throw new ExtractionError("Failed to parse AI response", 500);
  }
}

/** Build success response with extraction stats. */
export function buildExtractionResponse(
  extractedData: Record<string, string>,
  totalFields: number,
): ExtractionResult {
  const filledFields = Object.keys(extractedData).length;
  return {
    success: true,
    extracted_data: extractedData,
    stats: {
      total: totalFields,
      filled: filledFields,
      percentage: Math.round((filledFields / totalFields) * 100),
    },
  };
}

// ---------- Helpers ----------

/** Convert ArrayBuffer to base64 (chunk-based, safe for large files). */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const CHUNK_SIZE = 4096;
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, Math.min(i + CHUNK_SIZE, bytes.length));
    chunks.push(String.fromCharCode.apply(null, chunk as unknown as number[]));
  }
  return btoa(chunks.join(""));
}

/** Supported MIME types for extraction. */
export const SUPPORTED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
];

// ---------- Error ----------

export class ExtractionError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ExtractionError";
  }
}
