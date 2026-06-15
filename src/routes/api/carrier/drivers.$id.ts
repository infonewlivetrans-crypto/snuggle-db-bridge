import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { resolveCarrierCtx } from "@/server/carrier-cabinet.server";

// PATCH /api/carrier/drivers/:id  — обновление полей водителя.
// DELETE /api/carrier/drivers/:id — мягкая архивация (status = 'archive').

const MUTABLE_FIELDS = [
  "full_name",
  "phone",
  "email",
  "whatsapp",
  "telegram",
  "max_messenger",
  "city",
  "dispatcher_comment",
] as const;

const DRIVER_STATUS_WHITELIST = new Set([
  "new",
  "docs_unchecked",
  "ready_to_work",
  "free",
  "on_trip",
  "resting",
  "inactive",
  "archive",
]);

export const Route = createFileRoute("/api/carrier/drivers/$id")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ["carrier", "admin"]);
        if (auth instanceof Response) return auth;
        if (!params.id) return jsonResponse({ error: "id_required" }, { status: 400 });
        const ctx = await resolveCarrierCtx(auth);
        if (ctx instanceof Response) return ctx;

        let body: Record<string, unknown>;
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return jsonResponse({ error: "invalid_json" }, { status: 400 });
        }

        const update: Record<string, unknown> = {};
        for (const k of MUTABLE_FIELDS) if (k in body) update[k] = body[k];
        if (
          typeof body.dispatcher_status === "string" &&
          DRIVER_STATUS_WHITELIST.has(body.dispatcher_status)
        ) {
          update.dispatcher_status = body.dispatcher_status;
        }
        if (Object.keys(update).length === 0) {
          return jsonResponse({ ok: true, noop: true });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const upd = await (ctx.admin.from("dispatcher_driver_ext" as never) as any)
          .update(update)
          .eq("id", params.id)
          .select("id")
          .single();
        if (upd.error) {
          if (upd.error.code === "42501")
            return jsonResponse({ error: "forbidden" }, { status: 403 });
          return jsonResponse(
            { error: "update_failed", detail: upd.error.message },
            { status: 400 },
          );
        }

        // Optional: bind/rebind vehicle assignment.
        if ("vehicle_id" in body) {
          const vehicleId = typeof body.vehicle_id === "string" ? body.vehicle_id : null;
          // Clear current bindings for this driver.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (ctx.admin.from("dispatcher_vehicle_ext" as never) as any)
            .update({ dispatcher_driver_ext_id: null })
            .eq("dispatcher_driver_ext_id", params.id);
          if (vehicleId) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (ctx.admin.from("dispatcher_vehicle_ext" as never) as any)
              .update({ dispatcher_driver_ext_id: params.id })
              .eq("id", vehicleId);
          }
        }

        return jsonResponse({ ok: true });
      },

      DELETE: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ["carrier", "admin"]);
        if (auth instanceof Response) return auth;
        if (!params.id) return jsonResponse({ error: "id_required" }, { status: 400 });
        const ctx = await resolveCarrierCtx(auth);
        if (ctx instanceof Response) return ctx;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const upd = await (ctx.admin.from("dispatcher_driver_ext" as never) as any)
          .update({ dispatcher_status: "archive" })
          .eq("id", params.id);
        if (upd.error) {
          if (upd.error.code === "42501")
            return jsonResponse({ error: "forbidden" }, { status: 403 });
          return jsonResponse(
            { error: "archive_failed", detail: upd.error.message },
            { status: 400 },
          );
        }
        // Unbind from vehicles too.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (ctx.admin.from("dispatcher_vehicle_ext" as never) as any)
          .update({ dispatcher_driver_ext_id: null })
          .eq("dispatcher_driver_ext_id", params.id);
        return jsonResponse({ ok: true });
      },
    },
  },
});
