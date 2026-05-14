import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/auth/me")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const [{ data: profile }, { data: roleRow }] = await Promise.all([
          auth.client
            .from("profiles")
            .select("email, full_name")
            .eq("user_id", auth.userId)
            .maybeSingle(),
          auth.client
            .from("user_roles")
            .select("role")
            .eq("user_id", auth.userId)
            .maybeSingle(),
        ]);
        return jsonResponse({
          id: auth.userId,
          email: (profile as { email?: string } | null)?.email ?? null,
          name: (profile as { full_name?: string } | null)?.full_name ?? null,
          role: (roleRow as { role?: string } | null)?.role ?? null,
        });
      },
    },
  },
});
