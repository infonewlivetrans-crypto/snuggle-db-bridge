import {
  jsonResponse,
  parseListParams,
  requireAuth,
  cacheHeaders,
} from "@/server/api-helpers.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Tables = keyof Database["public"]["Tables"];

interface ListConfig {
  table: Tables;
  /** columns allowed via ?eq= */
  filters?: Record<string, "eq" | "in"  >;
  /** ?order=col.asc|desc */
  defaultOrder?: { column: string; ascending: boolean };
  /** ilike-search column */
  searchColumn?: string;
  cacheSeconds?: number;
  select?: string;
  /** apply ?status= as in (...) when comma-separated */
  statusInColumn?: string;
}

function pickFilters(
  url: URL,
  filters: Record<string, "eq" | "in"> | undefined,
  q: ReturnType<SupabaseClient["from"]>["select"] extends (...a: never[]) => infer R ? R : never,
) {
  let cur: any = q;
  if (!filters) return cur;
  for (const [key, kind] of Object.entries(filters)) {
    const v = url.searchParams.get(key);
    if (!v) continue;
    if (kind === "eq") cur = cur.eq(key, v);
    else cur = cur.in(key, v.split(",").map((s) => s.trim()).filter(Boolean));
  }
  return cur;
}

export function listHandler(cfg: ListConfig) {
  return async ({ request }: { request: Request }) => {
    const auth = await requireAuth(request);
    if (auth instanceof Response) return auth;
    const { limit, offset, search, url } = parseListParams(request);

    let q: any = (auth.client as any)
      .from(cfg.table)
      .select(cfg.select ?? "*", { count: "exact" });

    q = pickFilters(url, cfg.filters, q);

    if (cfg.statusInColumn) {
      const s = url.searchParams.get("status");
      if (s) q = q.in(cfg.statusInColumn, s.split(",").filter(Boolean));
    }

    if (search && cfg.searchColumn) q = q.ilike(cfg.searchColumn, `%${search}%`);

    const orderParam = url.searchParams.get("order");
    if (orderParam) {
      const [col, dir] = orderParam.split(".");
      if (col) q = q.order(col, { ascending: dir !== "desc" });
    } else if (cfg.defaultOrder) {
      q = q.order(cfg.defaultOrder.column, { ascending: cfg.defaultOrder.ascending });
    }

    // big page when limit explicit > 100
    const lim = Number(url.searchParams.get("limit")) || limit;
    const lim2 = Math.min(Math.max(1, lim), 1000);
    const { data, error, count } = await q.range(offset, offset + lim2 - 1);
    if (error) return jsonResponse({ error: error.message }, { status: 500 });
    return jsonResponse(
      { rows: data ?? [], total: count ?? 0 },
      { headers: cfg.cacheSeconds ? cacheHeaders(cfg.cacheSeconds) : undefined },
    );
  };
}

export function insertHandler(table: Tables, opts?: { returning?: boolean }) {
  return async ({ request }: { request: Request }) => {
    const auth = await requireAuth(request);
    if (auth instanceof Response) return auth;
    const body = (await request.json().catch(() => null)) as unknown;
    if (!body) return jsonResponse({ error: "bad_body" }, { status: 400 });
    const q = (auth.client as any).from(table).insert(body as never);
    if (opts?.returning) {
      const { data, error } = await q.select("*").maybeSingle();
      if (error) return jsonResponse({ error: error.message }, { status: 400 });
      return jsonResponse({ row: data });
    }
    const { error } = await q;
    if (error) return jsonResponse({ error: error.message }, { status: 400 });
    return jsonResponse({ ok: true });
  };
}

export function upsertHandler(table: Tables, conflict?: string) {
  return async ({ request }: { request: Request }) => {
    const auth = await requireAuth(request);
    if (auth instanceof Response) return auth;
    const body = (await request.json().catch(() => null)) as unknown;
    if (!body) return jsonResponse({ error: "bad_body" }, { status: 400 });
    const { error } = await (auth.client as any)
      .from(table)
      .upsert(body as never, conflict ? { onConflict: conflict } : undefined);
    if (error) return jsonResponse({ error: error.message }, { status: 400 });
    return jsonResponse({ ok: true });
  };
}

export function patchByIdHandler(table: Tables, allowed?: string[]) {
  return async ({ request, params }: { request: Request; params: { id: string } }) => {
    const auth = await requireAuth(request);
    if (auth instanceof Response) return auth;
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return jsonResponse({ error: "bad_body" }, { status: 400 });
    const patch: Record<string, unknown> = allowed
      ? Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)))
      : body;
    if (Object.keys(patch).length === 0)
      return jsonResponse({ error: "no_allowed_fields" }, { status: 400 });
    const { error } = await (auth.client as any)
      .from(table)
      .update(patch as never)
      .eq("id", params.id);
    if (error) return jsonResponse({ error: error.message }, { status: 400 });
    return jsonResponse({ ok: true });
  };
}

export function deleteByIdHandler(table: Tables) {
  return async ({ request, params }: { request: Request; params: { id: string } }) => {
    const auth = await requireAuth(request);
    if (auth instanceof Response) return auth;
    const { error } = await (auth.client as any)
      .from(table)
      .delete()
      .eq("id", params.id);
    if (error) return jsonResponse({ error: error.message }, { status: 400 });
    return jsonResponse({ ok: true });
  };
}
