import { createFileRoute } from "@tanstack/react-router";
import { patchByIdHandler } from "@/server/table-crud.server";

export const Route = createFileRoute("/api/stock-transfers/$id")({
  server: {
    handlers: {
      PATCH: patchByIdHandler("stock_transfers"),
    },
  },
});
