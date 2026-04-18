export function safeErrorResponse(
  req: Request,
  getCorsHeaders: (req: Request) => Record<string, string>,
  opts: {
    status?: number;
    publicMessage?: string;
    internalError?: unknown;
    logPrefix?: string;
  } = {},
): Response {
  const {
    status = 500,
    publicMessage = "Internal server error",
    internalError,
    logPrefix = "Edge Function error",
  } = opts;

  if (internalError) {
    console.error(`${logPrefix}:`, internalError);
  }

  return new Response(
    JSON.stringify({ error: publicMessage }),
    {
      status,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    },
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function checkWorkspaceMembership(
  supabaseAdmin: { from: (table: string) => any },
  userId: string,
  workspaceId: string,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("participants")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .eq("is_deleted", false)
    .maybeSingle();

  if (error) {
    console.error("checkWorkspaceMembership error:", error);
    return false;
  }

  return !!data;
}
