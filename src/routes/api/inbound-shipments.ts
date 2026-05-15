import { createFileRoute } from "@tanstack/react-router";
import { listHandler, insertHandler } from "@/server/table-crud.server";

export const Route = createFileRoute("/api/inbound-shipments")({
  server: {
    handlers: {
      GET: listHandler({
        table: "inbound_shipments",
        filters: { destination_warehouse_id: "eq", source_warehouse_id: "eq", supply_request_id: "eq" },
        statusInColumn: "status",
        defaultOrder: { column: "expected_at", ascending: true },
        cacheSeconds: 10,
      }),
      POST: insertHandler("inbound_shipments", { returning: true }),
    },
  },
});
