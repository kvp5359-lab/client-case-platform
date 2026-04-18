/**
 * Ambient types для Supabase Edge Functions (Deno runtime).
 * Нужны только для IDE — чтобы TypeScript не ругался на `Deno.*`
 * и `jsr:*` импорты. На деплой в Supabase никак не влияет —
 * там реальный Deno рантайм с настоящими типами.
 */

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
  env: {
    get(key: string): string | undefined;
  };
};

declare module "jsr:@supabase/functions-js/edge-runtime.d.ts";

declare module "jsr:@supabase/supabase-js@2" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function createClient(url: string, key: string, options?: any): any;
}
