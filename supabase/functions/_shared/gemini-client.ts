/**
 * Gemini API client using the NATIVE generateContent endpoint.
 *
 * Uses the native Gemini REST API (not OpenAI-compatible) to support:
 * - PDF documents (inlineData with application/pdf)
 * - Images (inlineData with image/*)
 * - Text conversations with system instructions
 * - Streaming via streamGenerateContent
 *
 * Endpoint: POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
 * Auth: query param ?key=API_KEY
 */

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

// ── Types ──

/** A part of content in Gemini API format */
export type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

export interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

export interface GeminiCallOptions {
  apiKey: string;
  model: string;
  contents: GeminiContent[];
  systemInstruction?: string;
  maxOutputTokens?: number;
  /** Controls thinking mode in Gemini 2.5+. Default: 1024 (low). Set 0 to disable. */
  thinkingBudget?: number;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
    finishReason?: string;
  }>;
  error?: { message?: string; code?: number };
}

// ── Main API call ──

/**
 * Call Gemini API via native generateContent endpoint.
 * Supports text, images, and PDF documents.
 */
export async function callGeminiApi(opts: GeminiCallOptions): Promise<string> {
  const url = `${GEMINI_BASE_URL}/models/${opts.model}:generateContent?key=${opts.apiKey}`;

  const body: Record<string, unknown> = {
    contents: opts.contents,
  };

  // System instruction
  if (opts.systemInstruction) {
    body.systemInstruction = {
      parts: [{ text: opts.systemInstruction }],
    };
  }

  // Generation config (only include non-empty settings)
  const generationConfig: Record<string, unknown> = {};
  if (opts.maxOutputTokens) {
    generationConfig.maxOutputTokens = opts.maxOutputTokens;
  }
  // Thinking budget — controls how much the model "thinks" before answering.
  // Only sent if explicitly provided. Omitting = model decides itself.
  if (opts.thinkingBudget !== undefined) {
    generationConfig.thinkingConfig = {
      thinkingBudget: opts.thinkingBudget,
    };
  }
  if (Object.keys(generationConfig).length > 0) {
    body.generationConfig = generationConfig;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Gemini API error ${response.status}:`, errorText);
    throw new Error(`Gemini API error (${response.status}): ${errorText}`);
  }

  const data: GeminiResponse = await response.json();

  if (data.error) {
    throw new Error(`Gemini API error: ${data.error.message || "Unknown error"}`);
  }

  // Extract text from all parts
  const parts = data.candidates?.[0]?.content?.parts || [];
  return parts.map((p) => p.text || "").join("");
}

/**
 * Call Gemini API with streaming (SSE).
 * Returns a ReadableStream of SSE events.
 * The caller must parse the stream chunks.
 */
export async function callGeminiStream(
  opts: GeminiCallOptions,
): Promise<Response> {
  const url = `${GEMINI_BASE_URL}/models/${opts.model}:streamGenerateContent?alt=sse&key=${opts.apiKey}`;

  const body: Record<string, unknown> = {
    contents: opts.contents,
  };

  if (opts.systemInstruction) {
    body.systemInstruction = {
      parts: [{ text: opts.systemInstruction }],
    };
  }

  const generationConfig: Record<string, unknown> = {};
  if (opts.maxOutputTokens) {
    generationConfig.maxOutputTokens = opts.maxOutputTokens;
  }
  if (opts.thinkingBudget !== undefined) {
    generationConfig.thinkingConfig = {
      thinkingBudget: opts.thinkingBudget,
    };
  }
  if (Object.keys(generationConfig).length > 0) {
    body.generationConfig = generationConfig;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Gemini stream error ${response.status}:`, errorText);
    throw new Error(`Gemini API error (${response.status}): ${errorText}`);
  }

  return response;
}

// ── Helper: build content parts ──

/** Build an inline data part for an image (base64) */
export function geminiImagePart(base64Data: string, mimeType: string): GeminiPart {
  return {
    inlineData: { mimeType, data: base64Data },
  };
}

/** Build an inline data part for a PDF (base64) */
export function geminiPdfPart(base64Data: string): GeminiPart {
  return {
    inlineData: { mimeType: "application/pdf", data: base64Data },
  };
}

/** Build a text part */
export function geminiTextPart(text: string): GeminiPart {
  return { text };
}

// ── Helper: convert chat messages to Gemini format ──

/**
 * Convert simple messages array (role: user/assistant, content: string)
 * to Gemini contents format (role: user/model).
 */
export function messagesToGeminiContents(
  messages: Array<{ role: string; content: string }>,
): GeminiContent[] {
  return messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role === "assistant" ? "model" as const : "user" as const,
      parts: [{ text: m.content }],
    }));
}

// ── Helper: detect provider ──

/** Check if a model ID belongs to the Gemini provider. */
export function isGeminiModel(model: string): boolean {
  return model.startsWith("gemini-");
}

/**
 * Parse Gemini SSE stream and extract text deltas.
 * Gemini native SSE format: each chunk is `data: {JSON}\n\n`
 * where JSON has candidates[0].content.parts[0].text
 */
export function parseGeminiStreamDelta(jsonStr: string): string | null {
  try {
    const parsed = JSON.parse(jsonStr);
    const parts = parsed.candidates?.[0]?.content?.parts;
    if (parts && Array.isArray(parts)) {
      return parts.map((p: { text?: string }) => p.text || "").join("");
    }
    return null;
  } catch {
    return null;
  }
}
