import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { carrierUpdateSchema } from "@/lib/dispatcher/schemas";

const TABLE = "dispatcher_carrier_ext";
const ALLOWED_ROLES = ["admin", "dispatcher"];

const SELECT =
  "id, name, carrier_kind, inn, ogrn, phone, email, city, whatsapp, telegram, max_messenger, " +
  "bank_name, bank_account, bank_bik, bank_corr_account, commission_rate, payment_method, " +
  "commission_agreed, commission_agreed_at, commission_agreed_by, commission_agreement_text, " +
  "commission_payment_method, verification_status, dispatcher_comment, production_carrier_id, " +
  "created_at, updated_at";

export const Route = createFileRoute("/api/dispatcher/carriers/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        if (!params.id) return jsonResponse({ error: "id required" }, { status: 400 });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (auth.client.from(TABLE as never) as any)
          .select(SELECT)
          .eq("id", params.id)
          .maybeSingle();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        if (!data) return jsonResponse({ error: "not_found" }, { status: 404 });
        return jsonResponse({ row: data });
      },

      PATCH: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        if (!params.id) return jsonResponse({ error: "id required" }, { status: 400 });
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: "invalid JSON" }, { status: 400 });
        }
        const parsed = carrierUpdateSchema.safeParse(body);
        if (!parsed.success) {
          const src = (body ?? {}) as Record<string, unknown>;
          const details = parsed.error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
            code: i.code,
            received: i.path.length > 0 ? src[i.path[0] as string] : undefined,
          }));
          console.error("[api/dispatcher/carriers/:id PATCH] validation_failed", {
            id: params.id,
            details,
          });
          return jsonResponse(
            { error: "validation_failed", issues: parsed.error.issues, details },
            { status: 400 },
          );
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (auth.client.from(TABLE as never) as any)
          .update(parsed.data as unknown as never)
          .eq("id", params.id)
          .select(SELECT)
          .maybeSingle();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        if (!data) return jsonResponse({ error: "not_found" }, { status: 404 });
        return jsonResponse({ row: data });
      },

      // Soft-delete: переводим в архив. Production-записи не трогаем.
      DELETE: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        if (!params.id) return jsonResponse({ error: "id required" }, { status: 400 });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (auth.client.from(TABLE as never) as any)
          .update({ verification_status: "archive" } as unknown as never)
          .eq("id", params.id);
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ ok: true });
      },
    },
  },
});
