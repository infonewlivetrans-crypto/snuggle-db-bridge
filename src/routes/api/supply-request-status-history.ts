import { createFileRoute } from "@tanstack/react-router";
import { listHandler } from "@/server/table-crud.server";

export const Route = createFileRoute("/api/supply-request-status-history")({
  server: {
    handlers: {
      GET: listHandler({
        table: "supply_request_status_history",
        filters: { supply_request_id: "eq" },
        defaultOrder: { column: "changed_at", ascending: false },
        cacheSeconds: 10,
      }),
    },
  },
});
