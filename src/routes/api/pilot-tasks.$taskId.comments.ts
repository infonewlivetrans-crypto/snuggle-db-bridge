import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/pilot-tasks/$taskId/comments")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ["admin", "director"]);
        if (auth instanceof Response) return auth;
        try {
          if (!params.taskId) return jsonResponse({ error: "taskId" }, { status: 400 });
          const { data, error } = await supabaseAdmin.from("pilot_task_comments")
            .select("*").eq("task_id", params.taskId).order("created_at", { ascending: true });
          if (error) throw new Error(error.message);
          return jsonResponse(data ?? []);
        } catch (e) {
          return jsonResponse({ error: (e as Error).message }, { status: 500 });
        }
      },
      POST: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ["admin", "director"]);
        if (auth instanceof Response) return auth;
        try {
          if (!params.taskId) return jsonResponse({ error: "taskId" }, { status: 400 });
          const body = (await request.json()) as { body?: string };
          const text = String(body?.body ?? "").trim();
          if (text.length < 1 || text.length > 2000) return jsonResponse({ error: "body 1..2000" }, { status: 400 });
          const { data: prof } = await supabaseAdmin.from("profiles").select("full_name").eq("user_id", auth.userId).maybeSingle();
          const { error } = await supabaseAdmin.from("pilot_task_comments").insert({
            task_id: params.taskId,
            author_user_id: auth.userId,
            author_name: (prof as { full_name?: string | null } | null)?.full_name ?? null,
            body: text,
          });
          if (error) throw new Error(error.message);
          return jsonResponse({ ok: true });
        } catch (e) {
          return jsonResponse({ error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
