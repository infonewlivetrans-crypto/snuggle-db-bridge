import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAdmin } from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/app-versions/$id")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const auth = await requireAdmin(request);
        if (auth instanceof Response) return auth;
        let body: Record<string, unknown>;
        try { body = (await request.json()) as Record<string, unknown>; } catch { return jsonResponse({ error: "Некорректный JSON" }, { status: 400 }); }
        const allowed = [
          "current_version",
          "minimum_required_version",
          "force_update",
          "update_message",
          "app_store_url",
          "play_market_url",
          "release_notes",
        ];
        const patch: Record<string, unknown> = {};
        for (const k of allowed) if (k in body) patch[k] = body[k];
        if (Object.keys(patch).length === 0) return jsonResponse({ error: "Нет полей для обновления" }, { status: 400 });
        const { error } = await auth.client
          .from("app_versions")
          .update(patch as never)
          .eq("id", params.id);
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ ok: true });
      },
    },
  },
});
