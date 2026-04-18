import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const t_start = performance.now();

    const { api_key, file_base64, mime_type, model } = await req.json();

    if (!api_key || !file_base64 || !mime_type) {
      return new Response(
        JSON.stringify({ error: "api_key, file_base64, mime_type are required" }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const useModel = model || "claude-haiku-4-5-20251001";
    const isPdf = mime_type === "application/pdf";
    const isImage = mime_type.startsWith("image/");

    if (!isPdf && !isImage) {
      return new Response(
        JSON.stringify({ error: "Only PDF and images are supported" }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // Build content block
    const fileContent = isPdf
      ? { type: "document", source: { type: "base64", media_type: mime_type, data: file_base64 } }
      : { type: "image", source: { type: "base64", media_type: mime_type, data: file_base64 } };

    const t_api = performance.now();
    const t_prep = t_api - t_start;

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: useModel,
        max_tokens: 4096,
        messages: [{
          role: "user",
          content: [
            fileContent,
            { type: "text", text: "Extract all text from this document. Return only the document text, no comments." },
          ],
        }],
      }),
    });

    const t_api_done = performance.now();
    const t_api_ms = t_api_done - t_api;

    if (!resp.ok) {
      const errorText = await resp.text();
      return new Response(
        JSON.stringify({
          error: `Claude API error ${resp.status}`,
          details: errorText,
          timing: { prep_ms: Math.round(t_prep), api_ms: Math.round(t_api_ms) },
        }),
        { status: 502, headers: CORS_HEADERS }
      );
    }

    const result = await resp.json();
    const text = result.content?.[0]?.text || "";
    const t_total = performance.now() - t_start;

    return new Response(
      JSON.stringify({
        success: true,
        model: useModel,
        text_length: text.length,
        text_preview: text.substring(0, 500),
        usage: result.usage,
        timing: {
          prep_ms: Math.round(t_prep),
          api_ms: Math.round(t_api_ms),
          total_ms: Math.round(t_total),
        },
      }),
      { status: 200, headers: CORS_HEADERS }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
});
