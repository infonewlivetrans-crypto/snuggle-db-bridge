import { createFileRoute } from "@tanstack/react-router";
import { deleteByIdHandler, patchByIdHandler } from "@/server/table-crud.server";

export const Route = createFileRoute("/api/supply-in-transit/$id")({
  server: {
    handlers: {
      PATCH: patchByIdHandler("supply_in_transit"),
      DELETE: deleteByIdHandler("supply_in_transit"),
    },
  },
});
