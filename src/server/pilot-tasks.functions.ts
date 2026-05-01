import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const PRIORITIES = ["critical", "important", "later"] as const;
const STATUSES = ["new", "in_progress", "review", "done"] as const;

async function ensureAdminOrDirector(userId: string) {
  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const set = new Set((roles ?? []).map((r) => r.role));
  if (!set.has("admin") && !set.has("director")) {
    throw new Error("Доступ только для администратора и руководителя");
  }
}

export const listPilotTasksFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        priority: z.enum(PRIORITIES).optional().nullable(),
        status: z.enum(STATUSES).optional().nullable(),
        role: z.string().optional().nullable(),
        from: z.string().optional().nullable(),
        to: z.string().optional().nullable(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await ensureAdminOrDirector(context.userId);

    let q = supabaseAdmin
      .from("pilot_tasks")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.priority) q = q.eq("priority", data.priority);
    if (data.status) q = q.eq("status", data.status);
    if (data.role) q = q.eq("reporter_role", data.role);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);

    const { data: items, error } = await q;
    if (error) throw new Error(error.message);

    // Сводка
    const all = items ?? [];
    const byStatus: Record<string, number> = { new: 0, in_progress: 0, review: 0, done: 0 };
    const byPriority: Record<string, number> = { critical: 0, important: 0, later: 0 };
    for (const t of all as Array<{ status: string; priority: string }>) {
      byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
      byPriority[t.priority] = (byPriority[t.priority] ?? 0) + 1;
    }

    return {
      items: all,
      summary: {
        total: all.length,
        critical: byPriority.critical ?? 0,
        inProgress: byStatus.in_progress ?? 0,
        done: byStatus.done ?? 0,
        new: byStatus.new ?? 0,
        review: byStatus.review ?? 0,
        byStatus,
        byPriority,
      },
    };
  });

export const createPilotTaskFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        title: z.string().min(2).max(300),
        description: z.string().max(4000).optional().nullable(),
        whatBroke: z.string().max(2000).optional().nullable(),
        whereBroke: z.string().max(500).optional().nullable(),
        howToReproduce: z.string().max(2000).optional().nullable(),
        priority: z.enum(PRIORITIES).default("important"),
        assignee: z.string().max(100).optional().nullable(),
        routeLabel: z.string().max(200).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureAdminOrDirector(context.userId);
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("user_id", context.userId)
      .maybeSingle();

    const { error } = await supabaseAdmin.from("pilot_tasks").insert({
      title: data.title,
      description: data.description ?? null,
      what_broke: data.whatBroke ?? null,
      where_broke: data.whereBroke ?? null,
      how_to_reproduce: data.howToReproduce ?? null,
      priority: data.priority,
      status: "new",
      assignee: data.assignee ?? "admin",
      route_label: data.routeLabel ?? null,
      source: "manual",
      reporter_user_id: context.userId,
      reporter_name: (prof as { full_name?: string | null } | null)?.full_name ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updatePilotTaskFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        priority: z.enum(PRIORITIES).optional(),
        status: z.enum(STATUSES).optional(),
        assignee: z.string().max(100).optional().nullable(),
        title: z.string().min(2).max(300).optional(),
        description: z.string().max(4000).optional().nullable(),
        whatBroke: z.string().max(2000).optional().nullable(),
        whereBroke: z.string().max(500).optional().nullable(),
        howToReproduce: z.string().max(2000).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureAdminOrDirector(context.userId);
    const patch: Record<string, unknown> = {};
    if (data.priority !== undefined) patch.priority = data.priority;
    if (data.status !== undefined) patch.status = data.status;
    if (data.assignee !== undefined) patch.assignee = data.assignee;
    if (data.title !== undefined) patch.title = data.title;
    if (data.description !== undefined) patch.description = data.description;
    if (data.whatBroke !== undefined) patch.what_broke = data.whatBroke;
    if (data.whereBroke !== undefined) patch.where_broke = data.whereBroke;
    if (data.howToReproduce !== undefined) patch.how_to_reproduce = data.howToReproduce;

    const { error } = await supabaseAdmin
      .from("pilot_tasks")
      .update(patch as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listTaskCommentsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ taskId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdminOrDirector(context.userId);
    const { data: rows, error } = await supabaseAdmin
      .from("pilot_task_comments")
      .select("*")
      .eq("task_id", data.taskId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const addTaskCommentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ taskId: z.string().uuid(), body: z.string().min(1).max(2000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureAdminOrDirector(context.userId);
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("user_id", context.userId)
      .maybeSingle();
    const { error } = await supabaseAdmin.from("pilot_task_comments").insert({
      task_id: data.taskId,
      author_user_id: context.userId,
      author_name: (prof as { full_name?: string | null } | null)?.full_name ?? null,
      body: data.body,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
