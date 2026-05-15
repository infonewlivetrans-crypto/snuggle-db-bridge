import { createFileRoute } from "@tanstack/react-router";
import { listHandler, upsertHandler } from "@/server/table-crud.server";

export const Route = createFileRoute("/api/product-stock-settings")({
  server: {
    handlers: {
      GET: listHandler({
        table: "product_stock_settings",
        filters: { warehouse_id: "eq", product_id: "eq" },
        cacheSeconds: 30,
      }),
      POST: upsertHandler("product_stock_settings", "warehouse_id,product_id"),
    },
  },
});
