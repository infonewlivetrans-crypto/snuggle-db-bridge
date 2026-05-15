import { createFileRoute } from "@tanstack/react-router";
import { listHandler, insertHandler } from "@/server/table-crud.server";

export const Route = createFileRoute("/api/stock-transfers")({
  server: {
    handlers: {
      GET: listHandler({
        table: "stock_transfers",
        filters: { from_warehouse_id: "eq", to_warehouse_id: "eq", status: "eq" },
        defaultOrder: { column: "created_at", ascending: false },
        cacheSeconds: 10,
      }),
      POST: insertHandler("stock_transfers", { returning: true }),
    },
  },
});
