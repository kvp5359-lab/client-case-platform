import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { checkWorkspaceMembership } from "../_shared/safeErrorResponse.ts";
import { isValidUUID } from "../_shared/validation.ts";
import {
  getFormKitData,
  getWorkspaceAIConfig,
  buildExtractionPrompt,
  callExtraction,
  buildExtractionResponse,
  arrayBufferToBase64,
  SUPPORTED_MIME_TYPES,
  ExtractionError,
} from "../_shared/ai-extraction.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: getCorsHeaders(req),
    });
  }

  const headers = { ...getCorsHeaders(req), "Content-Type": "application/json" };

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers },
      );
    }

    // Parse FormData
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const form_kit_id = formData.get("form_kit_id") as string;
    const workspace_id = formData.get("workspace_id") as string;

    if (!file || !form_kit_id || !workspace_id) {
      return new Response(
        JSON.stringify({ error: "file, form_kit_id and workspace_id are required" }),
        { status: 400, headers },
      );
    }

    if (!SUPPORTED_MIME_TYPES.includes(file.type)) {
      return new Response(
        JSON.stringify({
          error: `Unsupported file type: ${file.type}. Supported: PDF, JPG, PNG`,
        }),
        { status: 400, headers },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers },
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRole);

    if (!isValidUUID(form_kit_id) || !isValidUUID(workspace_id)) {
      return new Response(
        JSON.stringify({ error: "form_kit_id and workspace_id must be valid UUIDs" }),
        { status: 400, headers },
      );
    }

    const isMember = await checkWorkspaceMembership(supabaseAdmin, user.id, workspace_id);
    if (!isMember) {
      return new Response(
        JSON.stringify({ error: "Access denied" }),
        { status: 403, headers },
      );
    }

    const supabase = supabaseUser;

    // 1. Get form kit data and AI config
    const { aiPrompt, fields } = await getFormKitData(supabase, form_kit_id);
    const { aiModel, apiKey } = await getWorkspaceAIConfig(supabase, supabaseAdmin, workspace_id);

    // 2. Convert file to base64
    const base64 = arrayBufferToBase64(await file.arrayBuffer());

    // 3. Extract data via Claude
    const prompt = buildExtractionPrompt(fields, aiPrompt);
    const extractedData = await callExtraction({
      apiKey,
      model: aiModel,
      base64,
      mimeType: file.type,
      prompt,
    });

    return new Response(
      JSON.stringify(buildExtractionResponse(extractedData, fields.length)),
      { status: 200, headers },
    );
  } catch (error) {
    if (error instanceof ExtractionError) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: error.status, headers },
      );
    }
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers },
    );
  }
});
