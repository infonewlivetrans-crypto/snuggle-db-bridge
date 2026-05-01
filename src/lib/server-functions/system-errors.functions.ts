import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { listErrors, recordError, updateErrorStatus } from "../../server/system-errors.server";

async function userInfo(userId: string) {
  const [{ data: prof }, { data: roles }] = await Promise.all([
    supabaseAdmin.from("profiles").select("full_name").eq("user_id", userId).maybeSingle(),
    supabaseAdmin.from("user_roles").select("role").eq("user_id", userId),
  ]);
  const role = (roles ?? [])[0]?.role ?? null;
  return { name: (prof as { full_name?: string | null } | null)?.full_name ?? null, role };
}

async function ensureAdminOrDirector(userId: string, mustBeAdmin = false) {
  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const set = new Set((roles ?? []).map((r) => r.role));
  if (mustBeAdmin) {
    if (!set.has("admin")) throw new Error("Доступ разрешён только администратору");
  } else if (!set.has("admin") && !set.has("director")) {
    throw new Error("Нет доступа к разделу «Ошибки системы»");
  }
}

const ReportInput = z.object({
  code: z.string().max(64).optional().nullable(),
  title: z.string().min(1).max(255),
  message: z.string().max(2000).optional().nullable(),
  technical: z.string().max(8000).optional().nullable(),
  section: z.string().max(64).optional().nullable(),
  action: z.string().max(64).optional().nullable(),
  severity: z.enum(["info", "warning", "error", "critical"]).optional(),
  url: z.string().max(1024).optional().nullable(),
});

export const reportErrorFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ReportInput.parse(d))
  .handler(async ({ data, context }) => {
    const req = getRequest();
    const ip =
      req?.headers.get("cf-connecting-ip") ??
      req?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      null;
    const ua = req?.headers.get("user-agent") ?? null;
    const info = await userInfo(context.userId);
    const res = await recordError({
      ...data,
      severity: data.severity ?? "error",
      userId: context.userId,
      userName: info.name,
      userRole: info.role,
      ipAddress: ip,
      userAgent: ua,
    });
    // Параллельно фиксируем в общем журнале действий
    try {
      await (supabaseAdmin.from("audit_log") as unknown as {
        insert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
      }).insert({
        user_id: context.userId,
        user_name: info.name,
        user_role: info.role,
        section: data.section ?? "system",
        action: "error",
        object_type: "system_error",
        object_id: res.id,
        object_label: data.title.slice(0, 200),
        details: { code: data.code, severity: data.severity, technical: data.technical, url: data.url },
        ip_address: ip,
        user_agent: ua,
      });
    } catch {
      // молча — журнал не должен блокировать запись ошибки
    }
    return res;
  });

const ListInput = z.object({
  status: z.string().optional().nullable(),
  severity: z.string().optional().nullable(),
  section: z.string().optional().nullable(),
  from: z.string().optional().nullable(),
  to: z.string().optional().nullable(),
  limit: z.number().int().min(1).max(2000).optional(),
});

export const listSystemErrorsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ListInput.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await ensureAdminOrDirector(context.userId, false);
    return await listErrors(data);
  });

const UpdateInput = z.object({
  id: z.string().uuid(),
  status: z.enum(["new", "in_progress", "resolved"]),
  note: z.string().max(2000).optional().nullable(),
});

export const updateSystemErrorFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => UpdateInput.parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdminOrDirector(context.userId, true);
    await updateErrorStatus(data.id, data.status, data.note ?? null, context.userId);
    return { ok: true };
  });

const NotifyInput = z.object({
  errorId: z.string().uuid().optional().nullable(),
  title: z.string().min(1).max(255),
  message: z.string().max(2000).optional().nullable(),
  url: z.string().max(1024).optional().nullable(),
});

export const notifyAdminAboutErrorFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => NotifyInput.parse(d))
  .handler(async ({ data, context }) => {
    const info = await userInfo(context.userId);
    const body =
      `Пользователь ${info.name ?? context.userId} (${info.role ?? "—"}) сообщает об ошибке.\n` +
      `${data.title}` +
      (data.message ? `\n${data.message}` : "") +
      (data.url ? `\nСтраница: ${data.url}` : "");
    await (supabaseAdmin.from("notifications") as unknown as {
      insert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
    }).insert({
      kind: "system_error_report",
      title: `Сообщение об ошибке: ${data.title}`.slice(0, 255),
      body,
      payload: {
        recipients: ["admin"],
        error_id: data.errorId ?? null,
        reported_by: context.userId,
        reporter_name: info.name,
        reporter_role: info.role,
        url: data.url ?? null,
      },
    });
    return { ok: true };
  });
