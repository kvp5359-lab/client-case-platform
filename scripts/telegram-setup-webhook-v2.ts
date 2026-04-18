#!/usr/bin/env -S npx tsx
/**
 * Регистрация webhook для нового Telegram-бота (v2).
 *
 * Запуск:
 *   export TELEGRAM_BOT_TOKEN_V2="..."
 *   export TELEGRAM_WEBHOOK_SECRET_V2="..."  # то же, что в Supabase secrets
 *   npx tsx scripts/telegram-setup-webhook-v2.ts
 *
 * URL функции должен быть:
 *   https://zjatohckcpiqmxkmfxbs.supabase.co/functions/v1/telegram-webhook-v2
 *
 * Скрипт также подписывает бота на получение: message, edited_message,
 * callback_query, message_reaction (нужно getUpdates allowed_updates).
 */

const TOKEN = process.env.TELEGRAM_BOT_TOKEN_V2;
const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET_V2;
const SUPABASE_REF = process.env.SUPABASE_PROJECT_REF ?? "zjatohckcpiqmxkmfxbs";

if (!TOKEN) throw new Error("TELEGRAM_BOT_TOKEN_V2 is required");
if (!SECRET) throw new Error("TELEGRAM_WEBHOOK_SECRET_V2 is required");

const WEBHOOK_URL = `https://${SUPABASE_REF}.supabase.co/functions/v1/telegram-webhook-v2`;

const ALLOWED_UPDATES = ["message", "edited_message", "callback_query", "message_reaction"];

async function main() {
  const setRes = await fetch(`https://api.telegram.org/bot${TOKEN}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: WEBHOOK_URL,
      secret_token: SECRET,
      allowed_updates: ALLOWED_UPDATES,
      drop_pending_updates: true,
    }),
  });
  const setJson = await setRes.json();
  console.log("setWebhook:", setJson);

  const info = await fetch(`https://api.telegram.org/bot${TOKEN}/getWebhookInfo`).then((r) => r.json());
  console.log("getWebhookInfo:", info);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
