import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/auth/me")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const { data } = await auth.client.from("profiles").select("email, full_name").eq("user_id", auth.userId).maybeSingle();
        return jsonResponse({
          user_id: auth.userId,
          email: (data as { email?: string } | null)?.email ?? null,
          full_name: (data as { full_name?: string } | null)?.full_name ?? null,
        });
      },
    },
  },
});
