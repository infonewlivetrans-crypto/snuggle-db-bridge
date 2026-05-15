import { createFileRoute } from "@tanstack/react-router";
import { patchByIdHandler } from "@/server/table-crud.server";

export const Route = createFileRoute("/api/inbound-shipments/$id")({
  server: {
    handlers: {
      PATCH: patchByIdHandler("inbound_shipments"),
    },
  },
});
