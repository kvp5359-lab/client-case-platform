import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import {
  safeErrorResponse,
  checkWorkspaceMembership,
} from "../_shared/safeErrorResponse.ts";
import { isValidUUID } from "../_shared/validation.ts";
import PizZip from "npm:pizzip@3";

/**
 * extract-placeholders — извлекает плейсхолдеры {{...}} из DOCX-файла.
 *
 * POST body: { file_base64: string, workspace_id: string }
 * Response:  { placeholders: [{ name: string, field_definition_id: null }] }
 */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  try {
    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return safeErrorResponse(req, getCorsHeaders, {
        status: 401,
        publicMessage: "Missing authorization header",
      });
    }

    const body = await req.json();
    const { file_base64, workspace_id } = body;

    if (!file_base64 || typeof file_base64 !== "string") {
      return safeErrorResponse(req, getCorsHeaders, {
        status: 400,
        publicMessage: "file_base64 is required",
      });
    }

    // Limit base64 size (~50 MB decoded = ~67 MB base64)
    const MAX_BASE64_LENGTH = 67_000_000;
    if (file_base64.length > MAX_BASE64_LENGTH) {
      return safeErrorResponse(req, getCorsHeaders, {
        status: 400,
        publicMessage: "File is too large. Maximum 50 MB allowed.",
      });
    }

    if (!workspace_id || !isValidUUID(workspace_id)) {
      return safeErrorResponse(req, getCorsHeaders, {
        status: 400,
        publicMessage: "Valid workspace_id is required",
      });
    }

    // Verify user + workspace membership
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseUser = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const supabaseAdmin = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const {
      data: { user },
    } = await supabaseUser.auth.getUser();
    if (!user) {
      return safeErrorResponse(req, getCorsHeaders, {
        status: 401,
        publicMessage: "Unauthorized",
      });
    }

    const isMember = await checkWorkspaceMembership(
      supabaseAdmin,
      user.id,
      workspace_id,
    );
    if (!isMember) {
      return safeErrorResponse(req, getCorsHeaders, {
        status: 403,
        publicMessage: "Access denied",
      });
    }

    // Decode base64 → parse DOCX → extract placeholders
    const buffer = Uint8Array.from(atob(file_base64), (c) => c.charCodeAt(0));
    const zip = new PizZip(buffer);

    // Extract placeholder names from all XML parts of the DOCX
    const placeholderNames = new Set<string>();
    const xmlParts = [
      "word/document.xml",
      "word/header1.xml",
      "word/header2.xml",
      "word/header3.xml",
      "word/footer1.xml",
      "word/footer2.xml",
      "word/footer3.xml",
    ];

    for (const partName of xmlParts) {
      const file = zip.file(partName);
      if (!file) continue;

      const xml = file.asText();
      // Remove XML tags to handle cases where Word splits placeholders across runs
      // e.g. <w:t>{{</w:t></w:r><w:r><w:t>name</w:t></w:r><w:r><w:t>}}</w:t>
      const cleanedXml = xml.replace(/<[^>]+>/g, "");
      const regex = /\{\{([^}]+)\}\}/g;
      let match;
      while ((match = regex.exec(cleanedXml)) !== null) {
        placeholderNames.add(match[1].trim());
      }
    }

    const placeholders = Array.from(placeholderNames).map((name) => ({
      name,
      field_definition_id: null,
    }));

    return new Response(JSON.stringify({ placeholders }), {
      status: 200,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (error) {
    return safeErrorResponse(req, getCorsHeaders, {
      status: 500,
      publicMessage: "Failed to extract placeholders",
      internalError: error,
      logPrefix: "[EXTRACT-PLACEHOLDERS]",
    });
  }
});
