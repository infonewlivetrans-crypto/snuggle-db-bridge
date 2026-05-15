import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAdmin } from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/system-settings/$id")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const auth = await requireAdmin(request);
        if (auth instanceof Response) return auth;
        let body: { setting_value?: unknown; description?: string | null };
        try { body = (await request.json()) as typeof body; } catch { return jsonResponse({ error: "Некорректный JSON" }, { status: 400 }); }
        const patch: Record<string, unknown> = {};
        if (body.setting_value !== undefined) patch.setting_value = body.setting_value;
        if (body.description !== undefined) patch.description = body.description;
        if (Object.keys(patch).length === 0) return jsonResponse({ error: "Нет полей для обновления" }, { status: 400 });
        const { error } = await auth.client
          .from("system_settings")
          .update(patch as never)
          .eq("id", params.id);
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ ok: true });
      },
    },
  },
});
