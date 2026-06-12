/**
 * One-off ops-утилита: устанавливает команды меню бота-секретаря v2
 * (setMyCommands + setChatMenuButton). НЕ задеплоена постоянно —
 * из прода удалена 2026-06-12 (visела открытой с verify_jwt=false,
 * аноним мог спамить Telegram API бота). При необходимости задеплоить,
 * прогнать один раз и удалить:
 *
 *   supabase functions deploy setup-bot-menu --no-verify-jwt --project-ref zjatohckcpiqmxkmfxbs
 *   curl -X POST https://zjatohckcpiqmxkmfxbs.supabase.co/functions/v1/setup-bot-menu
 *   supabase functions delete setup-bot-menu --project-ref zjatohckcpiqmxkmfxbs
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN_V2")!;

async function tg(method: string, body: unknown) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

Deno.serve(async () => {
  const commands = await tg("setMyCommands", {
    commands: [
      { command: "menu", description: "Главное меню" },
      { command: "knowledge", description: "Полезные материалы" },
      { command: "upload", description: "Загрузить документ" },
      { command: "start", description: "Начать" },
    ],
  });

  const menuButton = await tg("setChatMenuButton", {
    menu_button: { type: "commands" },
  });

  const getMe = await tg("getMe", {});

  return new Response(
    JSON.stringify({ getMe, commands, menuButton }, null, 2),
    { headers: { "Content-Type": "application/json" } }
  );
});
