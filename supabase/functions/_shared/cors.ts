/**
 * Общий модуль CORS для всех Edge Functions.
 *
 * Разрешённые origins берутся из переменной окружения ALLOWED_ORIGINS
 * (через запятую).  Если переменная не задана, разрешается только localhost
 * для локальной разработки.
 *
 * Пример ALLOWED_ORIGINS:
 *   https://myapp.com,https://www.myapp.com
 */

const DEFAULT_DEV_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:8080",
  "http://localhost:8081",
  "http://localhost:8082",
];

function getAllowedOrigins(): string[] {
  const envOrigins = Deno.env.get("ALLOWED_ORIGINS");
  if (envOrigins) {
    return [
      ...envOrigins.split(",").map((o) => o.trim()).filter(Boolean),
      ...DEFAULT_DEV_ORIGINS,
    ];
  }
  return DEFAULT_DEV_ORIGINS;
}

export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = getAllowedOrigins();

  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };

  if (allowed.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }

  return headers;
}
