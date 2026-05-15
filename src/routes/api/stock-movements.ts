import { createFileRoute } from "@tanstack/react-router";
import { listHandler, insertHandler } from "@/server/table-crud.server";

export const Route = createFileRoute("/api/stock-movements")({
  server: {
    handlers: {
      GET: listHandler({
        table: "stock_movements",
        filters: { warehouse_id: "eq", product_id: "eq", movement_type: "eq" },
        defaultOrder: { column: "occurred_at", ascending: false },
        cacheSeconds: 10,
      }),
      POST: insertHandler("stock_movements"),
    },
  },
});
