import { createFileRoute } from "@tanstack/react-router";
import { cacheHeaders, jsonResponse, requireAuth } from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/order-delivery-result")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const url = new URL(request.url);
        const orderId = url.searchParams.get("order_id");
        if (!orderId) return jsonResponse({ error: "order_id required" }, { status: 400 });

        const { data: point, error: ptErr } = await auth.client
          .from("route_points")
          .select(
            "id, dp_status, dp_amount_received, dp_payment_comment, dp_status_changed_at, dp_status_changed_by, route_id",
          )
          .eq("order_id", orderId)
          .in("dp_status", ["delivered", "not_delivered", "returned_to_warehouse"] as never)
          .order("dp_status_changed_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (ptErr) return jsonResponse({ error: ptErr.message }, { status: 500 });
        if (!point) return jsonResponse({ point: null }, { headers: cacheHeaders(15) });

        const p = point as Record<string, unknown> & { id: string; route_id: string };
        const [routeRes, photosRes] = await Promise.all([
          auth.client
            .from("routes")
            .select("id, route_number, driver_name")
            .eq("id", p.route_id)
            .maybeSingle(),
          auth.client
            .from("route_point_photos")
            .select("kind, file_url")
            .eq("route_point_id", p.id),
        ]);
        return jsonResponse(
          {
            point: { ...p, route: (routeRes as { data: unknown }).data ?? null },
            photos: (photosRes.data ?? []) as Array<{ kind: string; file_url: string }>,
          },
          { headers: cacheHeaders(15) },
        );
      },
    },
  },
});
