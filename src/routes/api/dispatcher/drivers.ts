import { createFileRoute } from "@tanstack/react-router";
import {
  cacheHeaders,
  jsonResponse,
  parseListParams,
  requireAnyRole,
} from "@/server/api-helpers.server";
import { driverCreateSchema } from "@/lib/dispatcher/schemas";
import { DRIVER_STATUSES } from "@/lib/dispatcher/statuses";

const TABLE = "dispatcher_driver_ext";
const ALLOWED_ROLES = ["admin", "dispatcher"];

const SELECT =
  "id, full_name, phone, email, whatsapp, telegram, max_messenger, city, " +
  "dispatcher_carrier_ext_id, dispatcher_status, docs_verified, dispatcher_comment, " +
  "production_driver_id, created_at, updated_at";

export const Route = createFileRoute("/api/dispatcher/drivers")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        const { limit, offset, search, url } = parseListParams(request);
        const status = url.searchParams.get("status");
        const city = url.searchParams.get("city");
        const carrierId = url.searchParams.get("carrier_id");

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q: any = (auth.client.from(TABLE as never) as any)
          .select(SELECT, { count: "exact" });

        if (status && status !== "all" && (DRIVER_STATUSES as readonly string[]).includes(status)) {
          q = q.eq("dispatcher_status", status);
        }
        if (city) q = q.ilike("city", `%${city}%`);
        if (carrierId) q = q.eq("dispatcher_carrier_ext_id", carrierId);
        if (search) {
          const s = search.replace(/[%,]/g, " ").trim();
          q = q.or(`full_name.ilike.%${s}%,phone.ilike.%${s}%,email.ilike.%${s}%`);
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
        const parsed = driverCreateSchema.safeParse(body);
        if (!parsed.success) {
          return jsonResponse(
            { error: "validation_failed", issues: parsed.error.issues },
            { status: 400 },
          );
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (auth.client.from(TABLE as never) as any)
          .insert(parsed.data as unknown as never)
          .select(SELECT)
          .single();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ row: data }, { status: 201 });
      },
    },
  },
});
