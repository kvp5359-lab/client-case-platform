/**
 * Общий модуль CORS для всех Edge Functions.
 *
 * Origin считается разрешённым, если он:
 *   1) есть в env-листе ALLOWED_ORIGINS (через запятую) — для custom-доменов
 *      и любых статических исключений;
 *   2) совпадает с одним из явно прошитых статических origins
 *      (my.clientcase.app — портал; clientcase.app — корень);
 *   3) матчится паттерну https://<slug>.clientcase.app — это любой поддомен
 *      воркспейса (резолвится прокси по slug, см. src/proxy.ts);
 *   4) localhost (любой порт) — для локальной разработки.
 *
 * Пример ALLOWED_ORIGINS:
 *   https://app.relostart.com,https://customer-domain.com
 */

const STATIC_ALLOWED_ORIGINS = [
  "https://my.clientcase.app",
  "https://clientcase.app",
];

// Поддомен воркспейса: https://<slug>.clientcase.app, slug = [a-z0-9-]{1,63}.
// Двойная точка/wildcard на 2-м уровне (foo.bar.clientcase.app) не разрешаем.
const WORKSPACE_SUBDOMAIN_RE = /^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.clientcase\.app$/;

// Локальная разработка: http(s)://localhost:* и 127.0.0.1:*.
const LOCALHOST_RE = /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/;

function getEnvAllowedOrigins(): string[] {
  const envOrigins = Deno.env.get("ALLOWED_ORIGINS");
  if (!envOrigins) return [];
  return envOrigins.split(",").map((o) => o.trim()).filter(Boolean);
}

function isOriginAllowed(origin: string): boolean {
  if (!origin) return false;
  if (STATIC_ALLOWED_ORIGINS.includes(origin)) return true;
  if (WORKSPACE_SUBDOMAIN_RE.test(origin)) return true;
  if (LOCALHOST_RE.test(origin)) return true;
  if (getEnvAllowedOrigins().includes(origin)) return true;
  return false;
}

export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";

  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };

  if (isOriginAllowed(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }

  return headers;
}
