import { createFileRoute } from "@tanstack/react-router";
import { insertHandler } from "@/server/table-crud.server";

export const Route = createFileRoute("/api/dock-loaded-items")({
  server: {
    handlers: {
      POST: insertHandler("dock_loaded_items"),
    },
  },
});
