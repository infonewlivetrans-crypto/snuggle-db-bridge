import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireCookieAuth } from "@/server/auth-middleware.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { listAudit, writeAudit } from "../../server/audit.server";

async function userInfo(userId: string) {
  const [{ data: prof }, { data: roles }] = await Promise.all([
    supabaseAdmin.from("profiles").select("full_name").eq("user_id", userId).maybeSingle(),
    supabaseAdmin.from("user_roles").select("role").eq("user_id", userId),
  ]);
  const role = (roles ?? [])[0]?.role ?? null;
  return { name: (prof as { full_name?: string | null } | null)?.full_name ?? null, role };
}

const LogInput = z.object({
  section: z.string().min(1).max(64),
  action: z.string().min(1).max(64),
  objectType: z.string().max(64).optional().nullable(),
  objectId: z.string().max(128).optional().nullable(),
  objectLabel: z.string().max(255).optional().nullable(),
  oldValue: z.unknown().optional(),
  newValue: z.unknown().optional(),
  details: z.unknown().optional(),
});

export const logAuditFn = createServerFn({ method: "POST" })
  .middleware([requireCookieAuth])
  .inputValidator((d) => LogInput.parse(d))
  .handler(async ({ data, context }) => {
    const req = getRequest();
    const ip =
      req?.headers.get("cf-connecting-ip") ??
      req?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      null;
    const ua = req?.headers.get("user-agent") ?? null;
    const info = await userInfo(context.userId);
    await writeAudit({
      userId: context.userId,
      userName: info.name,
      userRole: info.role,
      ipAddress: ip,
      userAgent: ua,
      ...data,
    });
    return { ok: true };
  });

const ListInput = z.object({
  from: z.string().optional().nullable(),
  to: z.string().optional().nullable(),
  userId: z.string().uuid().optional().nullable(),
  role: z.string().optional().nullable(),
  section: z.string().optional().nullable(),
  action: z.string().optional().nullable(),
  search: z.string().max(200).optional().nullable(),
  page: z.number().int().min(1).max(10000).optional(),
  pageSize: z.number().int().min(1).max(200).optional(),
});

export const listAuditFn = createServerFn({ method: "POST" })
  .middleware([requireCookieAuth])
  .inputValidator((d) => ListInput.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    // Доступ только для admin/director
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const roleSet = new Set((roles ?? []).map((r) => r.role));
    if (!roleSet.has("admin") && !roleSet.has("director")) {
      throw new Error("Нет доступа к журналу действий");
    }
    return await listAudit(data);
  });
