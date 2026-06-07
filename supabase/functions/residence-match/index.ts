/**
 * residence-match — официальный расчёт подбора ВНЖ (Контур 2, Фаза F).
 *
 * Вход: { project_id }. Вызывается фронтом с JWT юриста.
 * Читает case_profiles (client-case) + правила из ВНЕШНЕЙ базы ВНЖ (mod_choice),
 * прогоняет движок на сервере (нельзя подкрутить) и пишет result_snapshot.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";
import { preflight, jsonRes, getServiceClient, getUser } from "../_shared/edge.ts";

// ── движок (порт ruleEvaluator) ──────────────────────────────────────────────
type Cond = { field: string; operator: string; value: unknown; severity?: string };
type Group = { operator: "AND" | "OR"; conditions?: Cond[]; groups?: Group[] };
type Answers = Record<string, unknown>;

function evalCond(c: Cond, a: Answers): boolean {
  const ans = a[c.field];
  if (ans === undefined || ans === null || ans === "") return false;
  const v = c.value;
  switch (c.operator) {
    case "=": return String(ans) === String(v);
    case "!=": return String(ans) !== String(v);
    case ">": return Number(ans) > Number(v);
    case "<": return Number(ans) < Number(v);
    case ">=": return Number(ans) >= Number(v);
    case "<=": return Number(ans) <= Number(v);
    case "contains": return String(ans).toLowerCase().includes(String(v).toLowerCase());
    case "in": return Array.isArray(v) ? v.map(String).includes(String(ans)) : false;
    default: return false;
  }
}
function evalGroup(g: Group, a: Answers): { passed: boolean; failed: Cond[] } {
  const failed: Cond[] = [];
  const cr = (g.conditions ?? []).map((c) => { const ok = evalCond(c, a); if (!ok) failed.push(c); return ok; });
  const gr = (g.groups ?? []).map((sg) => { const r = evalGroup(sg, a); failed.push(...r.failed); return r.passed; });
  const all = [...cr, ...gr];
  if (all.length === 0) return { passed: true, failed: [] };
  const passed = g.operator === "AND" ? all.every(Boolean) : all.some(Boolean);
  return { passed, failed: passed ? [] : failed };
}
function flatten(g: Group): Cond[] {
  const out = [...(g.conditions ?? [])];
  for (const sg of g.groups ?? []) out.push(...flatten(sg));
  return out;
}
const RANK: Record<string, number> = { eligible: 2, warning: 1, ineligible: 0 };

function evaluate(types: { id: string }[], links: { id: string; residence_type_id: string }[], rules: { link_id: string; name_ru: string; name_en: string; rule_json: Group }[], answers: Answers) {
  return types.map((rt) => {
    const linkIds = links.filter((l) => l.residence_type_id === rt.id).map((l) => l.id);
    const rs = rules.filter((r) => linkIds.includes(r.link_id));
    if (rs.length === 0) return { residenceTypeId: rt.id, status: "eligible", score: 100, failedCritical: [], warnings: [] };
    let best: { status: string; score: number; failedCritical: string[]; warnings: string[] } | null = null;
    for (const rule of rs) {
      const res = evalGroup(rule.rule_json, answers);
      const all = flatten(rule.rule_json);
      const score = all.length > 0 ? Math.round(((all.length - res.failed.length) / all.length) * 100) : 100;
      const failedCritical: string[] = [];
      const warnings: string[] = [];
      if (!res.passed) {
        const name = rule.name_ru || rule.name_en;
        if (res.failed.some((c) => c.severity === "critical")) failedCritical.push(name); else warnings.push(name);
      }
      const status = failedCritical.length > 0 ? "ineligible" : warnings.length > 0 ? "warning" : "eligible";
      if (!best || RANK[status] > RANK[best.status] || (RANK[status] === RANK[best.status] && score > best.score)) {
        best = { status, score, failedCritical, warnings };
      }
    }
    return { residenceTypeId: rt.id, status: best!.status, score: best!.score, failedCritical: best!.failedCritical, warnings: best!.warnings };
  });
}

// ── обработчик ────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);

  const user = await getUser(req);
  if (!user) return jsonRes({ error: "unauthorized" }, 401, req);

  let project_id: string | undefined;
  try { project_id = (await req.json())?.project_id; } catch { /* ignore */ }
  if (!project_id) return jsonRes({ error: "project_id required" }, 400, req);

  const service = getServiceClient();

  const { data: profile, error: pErr } = await service
    .from("case_profiles").select("*").eq("project_id", project_id).maybeSingle();
  if (pErr) return jsonRes({ error: pErr.message }, 500, req);
  if (!profile) return jsonRes({ error: "profile not found" }, 404, req);

  // доступ: пользователь должен быть активным участником воркспейса
  const { data: member } = await service
    .from("participants").select("id")
    .eq("workspace_id", profile.workspace_id).eq("user_id", user.id)
    .eq("is_deleted", false).eq("can_login", true).maybeSingle();
  if (!member) return jsonRes({ error: "forbidden" }, 403, req);

  if (!profile.country_id) return jsonRes({ error: "country not set" }, 400, req);

  // правила из внешней базы ВНЖ
  const extUrl = Deno.env.get("MODULE_SUPABASE_URL");
  const extKey = Deno.env.get("MODULE_SUPABASE_ANON_KEY");
  if (!extUrl || !extKey) return jsonRes({ error: "module db env missing" }, 500, req);
  const ext = createClient(extUrl, extKey);

  const cid = profile.country_id;
  const [typesRes, linksRes] = await Promise.all([
    ext.schema("mod_choice").from("residence_types").select("id").eq("country_id", cid).eq("is_active", true),
    ext.schema("mod_choice").from("links").select("id,residence_type_id").eq("country_id", cid).eq("is_active", true),
  ]);
  const links = linksRes.data ?? [];
  let rules: { link_id: string; name_ru: string; name_en: string; rule_json: Group }[] = [];
  if (links.length) {
    const { data } = await ext.schema("mod_choice").from("rules")
      .select("link_id,name_ru,name_en,rule_json")
      .in("link_id", links.map((l: { id: string }) => l.id)).eq("is_active", true);
    rules = (data ?? []) as typeof rules;
  }

  const result = evaluate((typesRes.data ?? []) as { id: string }[], links, rules, (profile.answers ?? {}) as Answers);

  await service.from("case_profiles")
    .update({ result_snapshot: result, computed_at: new Date().toISOString() })
    .eq("id", profile.id);

  return jsonRes({ result }, 200, req);
});
