import { createFileRoute } from "@tanstack/react-router";
import { listHandler } from "@/server/table-crud.server";

export const Route = createFileRoute("/api/stock-balances")({
  server: {
    handlers: {
      GET: listHandler({
        table: "stock_balances",
        filters: { warehouse_id: "eq", product_id: "eq" },
        cacheSeconds: 30,
      }),
    },
  },
});
