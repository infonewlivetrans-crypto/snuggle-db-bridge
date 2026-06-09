import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";

const ALLOWED_ROLES = ["admin", "dispatcher"];
const TABLE = "dispatcher_documents";

// Совместимость со старым клиентом, который ходил на /api/dispatcher/docs.
// Прокси к существующей таблице документов, отфильтрованной по owner.
export const Route = createFileRoute("/api/dispatcher/docs")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;

        const url = new URL(request.url);
        const ownerType = url.searchParams.get("owner_type");
        const ownerId =
          url.searchParams.get("owner_id") ??
          url.searchParams.get("carrier_id") ??
          url.searchParams.get("driver_id") ??
          url.searchParams.get("vehicle_id");

        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let q: any = (auth.client.from(TABLE as never) as any).select("*");
          if (ownerType) q = q.eq("owner_type", ownerType);
          if (ownerId) q = q.eq("owner_id", ownerId);
          q = q.order("uploaded_at", { ascending: false });
          const { data, error } = await q;
          if (error) {
            return jsonResponse({ rows: [], total: 0 });
          }
          return jsonResponse({ rows: data ?? [], total: (data ?? []).length });
        } catch {
          return jsonResponse({ rows: [], total: 0 });
        }
      },
    },
  },
});
