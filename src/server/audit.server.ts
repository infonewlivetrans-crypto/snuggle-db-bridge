import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type AuditEvent = {
  userId?: string | null;
  userName?: string | null;
  userRole?: string | null;
  section: string;
  action: string;
  objectType?: string | null;
  objectId?: string | null;
  objectLabel?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
  details?: unknown;
};

export async function writeAudit(e: AuditEvent) {
  const { error } = await (supabaseAdmin.from("audit_log") as unknown as { insert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }> }).insert({
    user_id: e.userId ?? null,
    user_name: e.userName ?? null,
    user_role: e.userRole ?? null,
    section: e.section,
    action: e.action,
    object_type: e.objectType ?? null,
    object_id: e.objectId ?? null,
    object_label: e.objectLabel ?? null,
    old_value: e.oldValue ?? null,
    new_value: e.newValue ?? null,
    ip_address: e.ipAddress ?? null,
    user_agent: e.userAgent ?? null,
    details: e.details ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function listAudit(filters: {
  from?: string | null;
  to?: string | null;
  userId?: string | null;
  role?: string | null;
  section?: string | null;
  action?: string | null;
  search?: string | null;
  page?: number;
  pageSize?: number;
}) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(Math.max(1, filters.pageSize ?? 25), 200);
  const fromIdx = (page - 1) * pageSize;
  const toIdx = fromIdx + pageSize - 1;

  let q = supabaseAdmin
    .from("audit_log")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(fromIdx, toIdx);

  if (filters.from) q = q.gte("created_at", filters.from);
  if (filters.to) q = q.lte("created_at", filters.to);
  if (filters.userId) q = q.eq("user_id", filters.userId);
  if (filters.role) q = q.eq("user_role", filters.role);
  if (filters.section) q = q.eq("section", filters.section);
  if (filters.action) q = q.eq("action", filters.action);
  if (filters.search && filters.search.trim()) {
    const s = filters.search.trim().replace(/[%_]/g, "\\$&");
    q = q.or(
      `user_name.ilike.%${s}%,object_label.ilike.%${s}%,action.ilike.%${s}%`,
    );
  }

  const { data, error, count } = await q;
  if (error) throw new Error(error.message);
  return { rows: data ?? [], total: count ?? 0 };
}
