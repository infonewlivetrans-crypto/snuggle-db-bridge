import { createFileRoute } from "@tanstack/react-router";
import { listHandler, insertHandler } from "@/server/table-crud.server";

export const Route = createFileRoute("/api/supply-requests")({
  server: {
    handlers: {
      GET: listHandler({
        table: "supply_requests",
        filters: {
          destination_warehouse_id: "eq",
          source_warehouse_id: "eq",
          product_id: "eq",
        },
        statusInColumn: "status",
        defaultOrder: { column: "created_at", ascending: false },
        cacheSeconds: 10,
      }),
      POST: insertHandler("supply_requests", { returning: true }),
    },
  },
});
