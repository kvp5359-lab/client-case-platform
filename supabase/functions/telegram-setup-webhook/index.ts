/**
 * Одноразовая Edge Function для настройки Telegram webhook
 * с правильными allowed_updates.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const TELEGRAM_WEBHOOK_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");

Deno.serve(async () => {
  const webhookUrl = `${SUPABASE_URL}/functions/v1/telegram-webhook`;

  const payload: Record<string, unknown> = {
    url: webhookUrl,
    allowed_updates: ["message", "edited_message", "message_reaction"],
  };

  if (TELEGRAM_WEBHOOK_SECRET) {
    payload.secret_token = TELEGRAM_WEBHOOK_SECRET;
  }

  const res = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );

  const data = await res.json();

  const infoRes = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo`,
  );
  const infoData = await infoRes.json();

  return new Response(
    JSON.stringify({ setWebhook: data, webhookInfo: infoData }, null, 2),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
});
