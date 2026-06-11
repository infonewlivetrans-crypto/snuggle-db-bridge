import { createFileRoute } from "@tanstack/react-router";
import {
  cacheHeaders,
  jsonResponse,
  parseListParams,
  requireAnyRole,
} from "@/server/api-helpers.server";
import { freightCreateSchema } from "@/lib/dispatcher/schemas";
import { FREIGHT_KINDS, FREIGHT_STATUSES } from "@/lib/dispatcher/statuses";

const TABLE = "dispatcher_freights";
const ALLOWED_ROLES = ["admin", "dispatcher"];

const SELECT =
  "id, title, loading_city, unloading_city, loading_date, unloading_date, " +
  "cargo_name, weight_kg, volume_m3, body_type, load_methods, rate, " +
  "payment_type, payment_delay_days, source, source_url, " +
  "contact_name, contact_phone, contact_whatsapp, contact_telegram, contact_max_messenger, " +
  "comment, dispatcher_status, freight_kind, " +
  "assigned_carrier_ext_id, assigned_driver_ext_id, assigned_vehicle_ext_id, " +
  "carrier_request_id, deal_id, signed_pdf_document_id, " +
  "signed_sent_at, signed_sent_channel, signed_sent_comment, " +
  "source_type, source_email_from, source_email_subject, source_email_body, " +
  "source_received_at, source_document_count, parse_status, " +
  "customer_email, customer_name, customer_phone, " +
  "created_at, updated_at";

export const Route = createFileRoute("/api/dispatcher/freights")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        const { limit, offset, search, url } = parseListParams(request);
        const status = url.searchParams.get("status");
        const loadingCity = url.searchParams.get("loading_city");
        const unloadingCity = url.searchParams.get("unloading_city");
        const bodyType = url.searchParams.get("body_type");
        const dateFrom = url.searchParams.get("loading_date_from");
        const dateTo = url.searchParams.get("loading_date_to");
        const freightKind = url.searchParams.get("freight_kind");

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q: any = (auth.client.from(TABLE as never) as any)
          .select(SELECT, { count: "exact" });

        if (status && status !== "all" && (FREIGHT_STATUSES as readonly string[]).includes(status)) {
          q = q.eq("dispatcher_status", status);
        }
        if (freightKind && (FREIGHT_KINDS as readonly string[]).includes(freightKind)) {
          q = q.eq("freight_kind", freightKind);
        }
        if (loadingCity) q = q.ilike("loading_city", `%${loadingCity}%`);
        if (unloadingCity) q = q.ilike("unloading_city", `%${unloadingCity}%`);
        if (bodyType) q = q.ilike("body_type", `%${bodyType}%`);
        if (dateFrom) q = q.gte("loading_date", dateFrom);
        if (dateTo) q = q.lte("loading_date", dateTo);
        if (search) {
          const s = search.replace(/[%,]/g, " ").trim();
          q = q.or(
            `title.ilike.%${s}%,cargo_name.ilike.%${s}%,loading_city.ilike.%${s}%,` +
              `unloading_city.ilike.%${s}%,source.ilike.%${s}%,contact_name.ilike.%${s}%`,
          );
        }
        q = q.order("created_at", { ascending: false }).range(offset, offset + limit - 1);
        const { data, error, count } = await q;
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse(
          { rows: data ?? [], total: count ?? data?.length ?? 0 },
          { headers: cacheHeaders(0) },
        );
      },

      POST: async ({ request }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: "invalid JSON" }, { status: 400 });
        }
        const parsed = freightCreateSchema.safeParse(body);
        if (!parsed.success) {
          return jsonResponse(
            { error: "validation_failed", issues: parsed.error.issues },
            { status: 400 },
          );
        }
        const payload = { ...parsed.data, created_by: auth.userId };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (auth.client.from(TABLE as never) as any)
          .insert(payload as unknown as never)
          .select(SELECT)
          .single();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ row: data }, { status: 201 });
      },
    },
  },
});
