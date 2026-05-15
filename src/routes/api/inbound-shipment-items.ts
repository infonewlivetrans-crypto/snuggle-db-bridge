import { createFileRoute } from "@tanstack/react-router";
import { listHandler, insertHandler } from "@/server/table-crud.server";

export const Route = createFileRoute("/api/inbound-shipment-items")({
  server: {
    handlers: {
      GET: listHandler({
        table: "inbound_shipment_items",
        filters: { shipment_id: "eq", product_id: "eq" },
        cacheSeconds: 10,
      }),
      POST: insertHandler("inbound_shipment_items"),
    },
  },
});
