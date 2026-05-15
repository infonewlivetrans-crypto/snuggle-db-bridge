import { createFileRoute } from "@tanstack/react-router";
import { listHandler, insertHandler } from "@/server/table-crud.server";

export const Route = createFileRoute("/api/stock-reservations")({
  server: {
    handlers: {
      GET: listHandler({
        table: "stock_reservations",
        filters: { warehouse_id: "eq", product_id: "eq", status: "eq" },
        defaultOrder: { column: "created_at", ascending: false },
        cacheSeconds: 10,
      }),
      POST: insertHandler("stock_reservations"),
    },
  },
});
