import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse } from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/routing")({
  server: {
    handlers: {
      ANY: async () => jsonResponse({ error: "not_found" }, { status: 404 }),
    },
  },
});