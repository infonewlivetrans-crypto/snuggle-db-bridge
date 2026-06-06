import { createFileRoute } from "@tanstack/react-router";
import {
  jsonResponse,
  makeAdminClient,
  requireAuth,
} from "@/server/api-helpers.server";

// GET /api/carrier/me
// Возвращает данные текущего перевозчика для личного кабинета.
// carrier_id берётся из profiles по userId.

export const Route = createFileRoute("/api/carrier/me")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;

        const admin = makeAdminClient();

        const { data: profile } = await admin
          .from("profiles")
          .select("carrier_id, full_name, email, phone")
          .eq("user_id", auth.userId)
          .maybeSingle();
        const carrierId = (profile as { carrier_id: string | null } | null)?.carrier_id ?? null;
        if (!carrierId) {
          return jsonResponse({ ok: false, reason: "no_carrier_linked" }, { status: 404 });
        }

        const { data: carrier } = await admin
          .from("carriers")
          .select("*")
          .eq("id", carrierId)
          .maybeSingle();

        const { data: ext } = await admin
          .from("dispatcher_carrier_ext")
          .select("*")
          .eq("carrier_id", carrierId)
          .maybeSingle();

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
