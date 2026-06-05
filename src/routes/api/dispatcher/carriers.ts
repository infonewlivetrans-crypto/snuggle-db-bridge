import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  cacheHeaders,
  jsonResponse,
  parseListParams,
  requireAnyRole,
} from "@/server/api-helpers.server";
import { carrierCreateSchema } from "@/lib/dispatcher/schemas";
import { CARRIER_STATUSES } from "@/lib/dispatcher/statuses";

const TABLE = "dispatcher_carrier_ext";
const ALLOWED_ROLES = ["admin", "dispatcher"];

const SELECT =
  "id, name, carrier_kind, inn, ogrn, phone, email, city, whatsapp, telegram, max_messenger, " +
  "bank_name, bank_account, bank_bik, bank_corr_account, commission_rate, payment_method, " +
  "commission_agreed, commission_agreed_at, commission_agreed_by, commission_agreement_text, " +
  "commission_payment_method, verification_status, dispatcher_comment, production_carrier_id, " +
  "created_at, updated_at";

export const Route = createFileRoute("/api/dispatcher/carriers")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        const { limit, offset, search, url } = parseListParams(request);
        const status = url.searchParams.get("status");
        const city = url.searchParams.get("city");

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q: any = (auth.client.from(TABLE as never) as any)
          .select(SELECT, { count: "exact" });

        if (status && status !== "all" && (CARRIER_STATUSES as readonly string[]).includes(status)) {
          q = q.eq("verification_status", status);
        }
        if (city) q = q.ilike("city", `%${city}%`);
        if (search) {
          const s = search.replace(/[%,]/g, " ").trim();
          q = q.or(
            `name.ilike.%${s}%,phone.ilike.%${s}%,email.ilike.%${s}%,inn.ilike.%${s}%`,
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
        const parsed = carrierCreateSchema.safeParse(body);
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

// Подавляем TS-предупреждение про неиспользованный импорт z, если zod не требуется выше.
void z;
