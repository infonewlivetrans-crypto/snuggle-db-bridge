import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, makeAnonClient } from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/system-settings")({
  server: {
    handlers: {
      GET: async () => {
        const client = makeAnonClient();
        const { data, error } = await client
          .from("system_settings")
          .select("*")
          .order("category", { ascending: true })
          .order("setting_key", { ascending: true });
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse(
          { settings: data ?? [] },
          { headers: { "cache-control": "public, max-age=600" } },
        );
      },
    },
  },
});
