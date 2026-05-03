import { createFileRoute } from "@tanstack/react-router";
import { getBearerToken, jsonResponse, requireUser } from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/user-role")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = getBearerToken(request);
        if (!token) return jsonResponse({ error: "unauthorized" }, { status: 401 });
        const auth = await requireUser(token);
        if (!auth) return jsonResponse({ error: "unauthorized" }, { status: 401 });
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
