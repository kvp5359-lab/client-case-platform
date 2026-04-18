/**
 * Edge Function: email-track
 * Serves a 1x1 transparent PNG tracking pixel.
 * When an email recipient opens the email, their client loads this image,
 * and we record the read timestamp in email_metadata.
 *
 * GET /email-track?id={message_id}
 *
 * No authentication required — called by email clients.
 * Uses message ID (UUID) as identifier — not guessable.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

// 1x1 transparent PNG (68 bytes)
const PIXEL = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
  0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x62, 0x00, 0x00, 0x00, 0x02,
  0x00, 0x01, 0xe5, 0x27, 0xde, 0xfc, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
  0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

const PIXEL_HEADERS = {
  "Content-Type": "image/png",
  "Content-Length": PIXEL.length.toString(),
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  "Pragma": "no-cache",
  "Expires": "0",
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request) => {
  // Always return the pixel — even on errors, to avoid broken images
  const returnPixel = () => new Response(PIXEL, { status: 200, headers: PIXEL_HEADERS });

  try {
    const url = new URL(req.url);
    const messageId = url.searchParams.get("id");

    if (!messageId || !UUID_REGEX.test(messageId)) {
      return returnPixel();
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Get the message
    const { data: message } = await supabaseAdmin
      .from("project_messages")
      .select("id, email_metadata")
      .eq("id", messageId)
      .eq("source", "email")
      .maybeSingle();

    if (!message) {
      return returnPixel();
    }

    // Only record first read
    const meta = (message.email_metadata ?? {}) as Record<string, unknown>;
    if (meta.read_at) {
      return returnPixel();
    }

    // Record read timestamp
    const updatedMeta = { ...meta, read_at: new Date().toISOString() };
    await supabaseAdmin
      .from("project_messages")
      .update({ email_metadata: updatedMeta })
      .eq("id", messageId);

    console.log(`[email-track] Message ${messageId} marked as read`);

    return returnPixel();
  } catch (error) {
    console.error("[email-track] Error:", error);
    return returnPixel();
  }
});
