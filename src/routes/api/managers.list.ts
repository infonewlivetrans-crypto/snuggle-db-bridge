import { createFileRoute } from "@tanstack/react-router";
import { cacheHeaders, jsonResponse, requireAuth } from "@/server/api-helpers.server";

// Лёгкий список менеджеров для дропдаунов: requireAuth, без admin.
export const Route = createFileRoute("/api/managers/list")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const { data, error } = await auth.client
          .from("managers")
          .select("id, full_name, phone")
          .eq("is_active", true)
          .order("full_name", { ascending: true });
        if (error) return jsonResponse({ rows: [], total: 0 }, { status: 500 });
        return jsonResponse(
          { rows: data ?? [], total: (data ?? []).length },
          { headers: cacheHeaders(120) },
        );
      },
    },
  },
});
