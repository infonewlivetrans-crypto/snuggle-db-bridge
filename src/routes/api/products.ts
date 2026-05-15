import { createFileRoute } from "@tanstack/react-router";
import { listHandler, insertHandler } from "@/server/table-crud.server";

export const Route = createFileRoute("/api/products")({
  server: {
    handlers: {
      GET: listHandler({
        table: "products",
        searchColumn: "name",
        defaultOrder: { column: "name", ascending: true },
        filters: { warehouse_id: "eq", is_active: "eq" },
        cacheSeconds: 60,
      }),
      POST: insertHandler("products", { returning: true }),
    },
  },
});

