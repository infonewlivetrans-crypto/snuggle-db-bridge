import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type SystemErrorInput = {
  code?: string | null;
  title: string;
  message?: string | null;
  technical?: string | null;
  section?: string | null;
  action?: string | null;
  severity?: "info" | "warning" | "error" | "critical";
  url?: string | null;
  userId?: string | null;
  userName?: string | null;
  userRole?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

function makeFingerprint(e: SystemErrorInput) {
  const parts = [
    e.code ?? "unknown",
    e.section ?? "",
    e.action ?? "",
    (e.title ?? "").slice(0, 120),
  ];
  return parts.join("|").toLowerCase();
}

type DbErrorRow = { id: string; occurrences: number };

export async function recordError(e: SystemErrorInput) {
  const fingerprint = makeFingerprint(e);
  // Ищем активную (не resolved) запись с тем же отпечатком
  const { data: existing } = await supabaseAdmin
    .from("system_errors")
    .select("id, occurrences")
    .eq("fingerprint", fingerprint)
    .neq("status", "resolved")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<DbErrorRow>();

  if (existing) {
    await (supabaseAdmin
      .from("system_errors") as unknown as {
        update: (row: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<{ error: { message: string } | null }> };
      })
      .update({
        occurrences: (existing.occurrences ?? 1) + 1,
        last_seen_at: new Date().toISOString(),
        message: e.message ?? null,
        technical: e.technical ?? null,
        url: e.url ?? null,
        user_id: e.userId ?? null,
        user_name: e.userName ?? null,
        user_role: e.userRole ?? null,
        ip_address: e.ipAddress ?? null,
        user_agent: e.userAgent ?? null,
      })
      .eq("id", existing.id);
    return { id: existing.id, deduped: true as const };
  }

  const { data, error } = await (supabaseAdmin
    .from("system_errors") as unknown as {
      insert: (row: Record<string, unknown>) => {
        select: (cols: string) => { single: () => Promise<{ data: { id: string } | null; error: { message: string } | null }> };
      };
    })
    .insert({
      code: e.code ?? "unknown",
      title: e.title.slice(0, 255),
      message: e.message ?? null,
      technical: e.technical ?? null,
      section: e.section ?? null,
      action: e.action ?? null,
      severity: e.severity ?? "error",
      url: e.url ?? null,
      user_id: e.userId ?? null,
      user_name: e.userName ?? null,
      user_role: e.userRole ?? null,
      ip_address: e.ipAddress ?? null,
      user_agent: e.userAgent ?? null,
      fingerprint,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return { id: data!.id, deduped: false as const };
}

export async function listErrors(filters: {
  status?: string | null;
  severity?: string | null;
  section?: string | null;
  from?: string | null;
  to?: string | null;
  limit?: number;
}) {
  let q = supabaseAdmin
    .from("system_errors")
    .select("*")
    .order("last_seen_at", { ascending: false })
    .limit(Math.min(filters.limit ?? 500, 2000));

  if (filters.status) q = q.eq("status", filters.status);
  if (filters.severity) q = q.eq("severity", filters.severity);
  if (filters.section) q = q.eq("section", filters.section);
  if (filters.from) q = q.gte("created_at", filters.from);
  if (filters.to) q = q.lte("created_at", filters.to);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function updateErrorStatus(id: string, status: "new" | "in_progress" | "resolved", note: string | null, userId: string) {
  const patch: Record<string, unknown> = {
    status,
    admin_note: note,
  };
  if (status === "resolved") {
    patch.resolved_at = new Date().toISOString();
    patch.resolved_by = userId;
  } else {
    patch.resolved_at = null;
    patch.resolved_by = null;
  }
  const { error } = await (supabaseAdmin
    .from("system_errors") as unknown as {
      update: (row: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<{ error: { message: string } | null }> };
    })
    .update(patch)
    .eq("id", id);
  if (error) throw new Error(error.message);
}
