import { createFileRoute } from "@tanstack/react-router";
import { listHandler, insertHandler } from "@/server/table-crud.server";

export const Route = createFileRoute("/api/supply-in-transit")({
  server: {
    handlers: {
      GET: listHandler({
        table: "supply_in_transit",
        filters: { destination_warehouse_id: "eq", source_warehouse_id: "eq", product_id: "eq" },
        statusInColumn: "status",
        defaultOrder: { column: "expected_at", ascending: true },
        cacheSeconds: 10,
      }),
      POST: insertHandler("supply_in_transit", { returning: true }),
    },
  },
});
