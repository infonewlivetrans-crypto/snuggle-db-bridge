import { createFileRoute } from "@tanstack/react-router";
import { patchByIdHandler } from "@/server/table-crud.server";

export const Route = createFileRoute("/api/inbound-shipment-items/$id")({
  server: {
    handlers: {
      PATCH: patchByIdHandler("inbound_shipment_items", [
        "qty_received",
        "comment",
      ]),
    },
  },
});
