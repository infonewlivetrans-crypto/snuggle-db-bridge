import { createFileRoute } from "@tanstack/react-router";
import {
  jsonResponse,
  makeAdminClient,
  requireAnyRole,
} from "@/server/api-helpers.server";

// GET /api/carrier/me
// Возвращает данные текущего перевозчика для личного кабинета.
// Доступно carrier и admin. При отсутствии связи — возвращает понятный
// no_carrier_linked с user_id и profile_carrier_id (для админ-диагностики).

export const Route = createFileRoute("/api/carrier/me")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAnyRole(request, ["carrier", "admin"]);
        if (auth instanceof Response) return auth;

        const admin = makeAdminClient();

        const { data: profile } = await admin
          .from("profiles")
          .select("carrier_id, full_name, email, phone")
          .eq("user_id", auth.userId)
          .maybeSingle();
        const profileCarrierId =
          (profile as { carrier_id: string | null } | null)?.carrier_id ?? null;

        if (!profileCarrierId) {
          return jsonResponse(
            {
              ok: false,
              error: "no_carrier_linked",
              reason: "no_carrier_linked",
              user_id: auth.userId,
              profile_carrier_id: null,
              profile,
            },
            { status: 404 },
          );
        }

        // Ищем ext-запись всеми возможными способами.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tryFind = async (column: string, value: string) =>
          (admin.from("dispatcher_carrier_ext") as any)
            .select("*")
            .eq(column, value)
            .maybeSingle();

        let extResult = await tryFind("id", profileCarrierId);
        if (!extResult.data) extResult = await tryFind("carrier_id", profileCarrierId);
        if (!extResult.data) extResult = await tryFind("production_carrier_id", profileCarrierId);

        const ext = extResult.data as Record<string, unknown> | null;
        const carrierId =
          (ext?.carrier_id as string | undefined) ?? profileCarrierId;

        const { data: carrier } = await admin
          .from("carriers")
          .select("*")
          .eq("id", carrierId)
          .maybeSingle();

        if (!ext && !carrier) {
          return jsonResponse(
            {
              ok: false,
              error: "no_carrier_linked",
              reason: "no_carrier_linked",
              user_id: auth.userId,
              profile_carrier_id: profileCarrierId,
              profile,
            },
            { status: 404 },
          );
        }

        const { data: vehicles } = await admin
          .from("vehicles")
          .select("id, plate_number, brand, model, body_type, capacity_kg, volume_m3, is_active")
          .eq("carrier_id", carrierId)
          .order("created_at", { ascending: false });

        const { data: drivers } = await admin
          .from("drivers")
          .select("id, full_name, phone, is_active")
          .eq("carrier_id", carrierId)
          .order("created_at", { ascending: false });

        return jsonResponse({
          ok: true,
          profile,
          carrier,
          ext,
          vehicles: vehicles ?? [],
          drivers: drivers ?? [],
          trips: [],
        });
      },
    },
  },
});
