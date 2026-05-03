import { createFileRoute } from "@tanstack/react-router";
import { getBearerToken, jsonResponse, requireUser } from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/profile")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = getBearerToken(request);
        if (!token) return jsonResponse({ error: "unauthorized" }, { status: 401 });
        const auth = await requireUser(token);
        if (!auth) return jsonResponse({ error: "unauthorized" }, { status: 401 });
        const { data, error } = await auth.client
          .from("profiles")
          .select("*")
          .eq("user_id", auth.userId)
          .maybeSingle();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse(
          { profile: data ?? null },
          { headers: { "cache-control": "private, max-age=60" } },
        );
      },
    },
  },
});
