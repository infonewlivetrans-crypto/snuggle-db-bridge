import { createFileRoute } from "@tanstack/react-router";
import { cacheHeaders, jsonResponse, makeAnonClient } from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/app-versions")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const platform = url.searchParams.get("platform");
        const client = makeAnonClient();
        if (platform) {
          const { data, error } = await client
            .from("app_versions")
            .select("*")
            .eq("platform", platform)
            .maybeSingle();
          if (error) return jsonResponse({ error: error.message }, { status: 500 });
          return jsonResponse({ version: data ?? null }, { headers: cacheHeaders(300, true) });
        }
        const { data, error } = await client
          .from("app_versions")
          .select("*")
          .order("platform", { ascending: true });
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ rows: data ?? [] }, { headers: cacheHeaders(300, true) });
      },
    },
  },
});
