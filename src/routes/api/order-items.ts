import { createFileRoute } from "@tanstack/react-router";
import { listHandler } from "@/server/table-crud.server";

// GET /api/order-items?order_id=<id1,id2,...>&limit=...
export const Route = createFileRoute("/api/order-items")({
  server: {
    handlers: {
      GET: listHandler({
        table: "order_items",
        filters: { order_id: "in", product_id: "eq" },
        cacheSeconds: 10,
      }),
    },
  },
});
