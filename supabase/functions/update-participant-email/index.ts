import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};
const json = (p: unknown, status = 200) =>
  new Response(JSON.stringify(p), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: { participant_id?: string; email?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const participantId = body.participant_id?.trim();
  const newEmail = body.email?.trim().toLowerCase();
  if (!participantId || !newEmail) return json({ error: "missing_fields" }, 400);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(newEmail))
    return json({ error: "invalid_email" }, 400);

  const authHeader = req.headers.get("authorization") ?? "";
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return json({ error: "unauthorized" }, 401);

  const service = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: participant, error: fetchErr } = await service
    .from("participants")
    .select("id, workspace_id, email, user_id")
    .eq("id", participantId)
    .eq("is_deleted", false)
    .maybeSingle();
  if (fetchErr) return json({ error: "db_error", details: fetchErr.message }, 500);
  if (!participant) return json({ error: "not_found" }, 404);

  // Проверка прав: ходим под RLS вызывающего юзера. Если он не менеджер —
  // RLS не вернёт строку или откажет в update.
  const { data: rlsRow, error: rlsErr } = await userClient
    .from("participants")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", participantId)
    .select("id")
    .maybeSingle();
  if (rlsErr || !rlsRow)
    return json({ error: "forbidden", details: rlsErr?.message }, 403);

  if (participant.email?.toLowerCase() === newEmail)
    return json({ ok: true, changed: false });

  const { data: dup } = await service
    .from("participants")
    .select("id")
    .eq("workspace_id", participant.workspace_id)
    .eq("is_deleted", false)
    .ilike("email", newEmail)
    .neq("id", participantId)
    .maybeSingle();
  if (dup) return json({ error: "email_taken_in_workspace" }, 409);

  if (participant.user_id) {
    const { data: authUser } = await service.auth.admin.getUserById(
      participant.user_id,
    );
    const authEmail = authUser?.user?.email?.toLowerCase();
    const oldEmail = participant.email?.toLowerCase();

    if (authEmail && authEmail === oldEmail) {
      const { error: authErr } = await service.auth.admin.updateUserById(
        participant.user_id,
        { email: newEmail, email_confirm: true },
      );
      if (authErr)
        return json(
          { error: "auth_update_failed", details: authErr.message },
          400,
        );
    } else {
      const { error: unlinkErr } = await service
        .from("participants")
        .update({ user_id: null })
        .eq("id", participantId);
      if (unlinkErr)
        return json({ error: "unlink_failed", details: unlinkErr.message }, 500);
    }
  }

  const { error: updErr } = await service
    .from("participants")
    .update({ email: newEmail })
    .eq("id", participantId);
  if (updErr) return json({ error: "update_failed", details: updErr.message }, 500);

  return json({ ok: true, changed: true });
});
