import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { findInvalidUUID } from "../_shared/validation.ts";
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
import { checkWorkspaceMembership } from "../_shared/safeErrorResponse.ts";

interface ExtractFormDataRequest {
  document_id: string;
  form_kit_id: string;
  workspace_id: string;
}

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

    const { document_id, form_kit_id, workspace_id } =
      (await req.json()) as ExtractFormDataRequest;

    if (!document_id || !form_kit_id || !workspace_id) {
      return new Response(
        JSON.stringify({ error: "document_id, form_kit_id and workspace_id are required" }),
        { status: 400, headers },
      );
    }

    const invalidField = findInvalidUUID(
      { document_id, form_kit_id, workspace_id },
      ["document_id", "form_kit_id", "workspace_id"],
    );
    if (invalidField) {
      return new Response(
        JSON.stringify({ error: `${invalidField} must be a valid UUID` }),
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
    const supabase = supabaseUser;

    // Check workspace membership
    const isMember = await checkWorkspaceMembership(supabaseAdmin, user.id, workspace_id);
    if (!isMember) {
      return new Response(
        JSON.stringify({ error: "Access denied" }),
        { status: 403, headers },
      );
    }

    // 1. Get document and current file
    const { data: document, error: docError } = await supabase
      .from("documents")
      .select("*, document_files!inner(*)")
      .eq("id", document_id)
      .eq("document_files.is_current", true)
      .single();

    if (docError || !document) {
      return new Response(
        JSON.stringify({ error: "Document not found" }),
        { status: 404, headers },
      );
    }

    const currentFile = Array.isArray(document.document_files)
      ? document.document_files[0]
      : document.document_files;

    if (!currentFile) {
      return new Response(
        JSON.stringify({ error: "Document file not found" }),
        { status: 404, headers },
      );
    }

    if (!SUPPORTED_MIME_TYPES.includes(currentFile.mime_type)) {
      return new Response(
        JSON.stringify({
          error: `Unsupported file type: ${currentFile.mime_type}. Supported: PDF, JPG, PNG`,
        }),
        { status: 400, headers },
      );
    }

    // 2. Get form kit data and AI config
    const { aiPrompt, fields } = await getFormKitData(supabase, form_kit_id);
    const { aiModel, apiKey } = await getWorkspaceAIConfig(supabase, supabaseAdmin, workspace_id);

    // 3. Download file from Storage (определяем бакет через file_id или fallback)
    let bucket = "document-files";
    let storagePath = currentFile.file_path;
    if (currentFile.file_id) {
      const { data: fileRecord } = await supabaseAdmin
        .from("files")
        .select("bucket, storage_path")
        .eq("id", currentFile.file_id)
        .single();
      if (fileRecord) {
        bucket = fileRecord.bucket;
        storagePath = fileRecord.storage_path;
      }
    }
    const { data: fileData, error: downloadError } = await supabase.storage
      .from(bucket)
      .download(storagePath);

    if (downloadError || !fileData) {
      return new Response(
        JSON.stringify({ error: "Failed to download document" }),
        { status: 500, headers },
      );
    }

    const base64 = arrayBufferToBase64(await fileData.arrayBuffer());

    // 4. Extract data via Claude
    const prompt = buildExtractionPrompt(fields, aiPrompt);
    const extractedData = await callExtraction({
      apiKey,
      model: aiModel,
      base64,
      mimeType: currentFile.mime_type,
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
