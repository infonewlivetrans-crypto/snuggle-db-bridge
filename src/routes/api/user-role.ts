import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/user-role")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const { data, error } = await auth.client
          .from("user_roles")
          .select("role")
          .eq("user_id", auth.userId);
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        const roles = (data ?? []).map((r: { role: string }) => r.role);
        return jsonResponse(
          { roles },
          { headers: { "cache-control": "private, max-age=60" } },
        );
      },
    },
  },
});
