// GET snapshot параметров машины для запуска AI-поиска + список активных задач.
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import {
  getVehicleSearchSnapshot,
  listActiveTasksForVehicle,
} from "@/server/ai-dispatcher/vehicle-search-snapshot.server";

const ROLES = ["admin", "dispatcher"];

export const Route = createFileRoute("/api/dispatcher/ai-dispatcher/vehicle-snapshot/$vehicleId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ROLES);
        if (auth instanceof Response) return auth;
        if (!params.vehicleId) return jsonResponse({ error: "vehicle_id_required" }, { status: 400 });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const c: any = auth.client;
        const result = await getVehicleSearchSnapshot(c, params.vehicleId);
        if (!result) return jsonResponse({ error: "vehicle_not_found" }, { status: 404 });
        const active_tasks = await listActiveTasksForVehicle(c, params.vehicleId);
        return jsonResponse({
          snapshot: result.snapshot,
          missing_fields: result.missing_fields,
          active_tasks,
        });
      },
    },
  },
});
