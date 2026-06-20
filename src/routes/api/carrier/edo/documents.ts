import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";
import { resolveCarrierCtx } from "@/server/carrier-cabinet.server";
import { createCarrierDoc } from "@/server/edo/carrier-edo.server";

export const Route = createFileRoute("/api/carrier/edo/documents")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const ctx = await resolveCarrierCtx(auth);
        if (ctx instanceof Response) return ctx;
        const url = new URL(request.url);
        const status = url.searchParams.get("status");
        const direction = url.searchParams.get("direction");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q = (ctx.client.from("carrier_edo_documents") as any)
          .select("*")
          .eq("carrier_ext_id", ctx.dispatcherCarrierExtId)
          .order("created_at", { ascending: false })
          .limit(200);
        if (status) q = q.eq("status", status);
        if (direction) q = q.eq("direction", direction);
        const { data, error } = await q;
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ rows: data ?? [] });
      },
      POST: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const ctx = await resolveCarrierCtx(auth);
        if (ctx instanceof Response) return ctx;
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        try {
          const { id } = await createCarrierDoc(ctx.client, ctx.dispatcherCarrierExtId, {
            direction: (body.direction as "incoming" | "outgoing" | "internal" | undefined) ?? "outgoing",
            document_type: (body.document_type as
              | "etrn" | "upd" | "act" | "contract"
              | "invoice" | "transport_waybill" | "other" | undefined) ?? "etrn",
            title: (body.title as string | null) ?? null,
            document_date: (body.document_date as string | null) ?? null,
            shipper_name: (body.shipper_name as string | null) ?? null,
            shipper_inn: (body.shipper_inn as string | null) ?? null,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            shipper_provider: (body.shipper_provider as any) ?? null,
            consignee_name: (body.consignee_name as string | null) ?? null,
            consignee_inn: (body.consignee_inn as string | null) ?? null,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            consignee_provider: (body.consignee_provider as any) ?? null,
            route_summary: (body.route_summary as string | null) ?? null,
            loading_city: (body.loading_city as string | null) ?? null,
            unloading_city: (body.unloading_city as string | null) ?? null,
            cargo_summary: (body.cargo_summary as string | null) ?? null,
            vehicle_label: (body.vehicle_label as string | null) ?? null,
            driver_label: (body.driver_label as string | null) ?? null,
            loading_at: (body.loading_at as string | null) ?? null,
            unloading_at: (body.unloading_at as string | null) ?? null,
            rate_amount: (body.rate_amount as number | null) ?? null,
            doc_number: (body.doc_number as string | null) ?? null,
            freight_id: (body.freight_id as string | null) ?? null,
            trip_id: (body.trip_id as string | null) ?? null,
            connection_id: (body.connection_id as string | null) ?? null,
            comment: (body.comment as string | null) ?? null,
          });
          return jsonResponse({ id });
        } catch (e) {
          return jsonResponse(
            { error: "create_failed", message: e instanceof Error ? e.message : String(e) },
            { status: 400 },
          );
        }
      },
    },
  },
});

