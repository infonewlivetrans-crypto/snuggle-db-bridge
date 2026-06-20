// Объединённый endpoint действий по документу:
// /api/carrier/edo/documents/$id/actions?op=sign-carrier|driver-action|
//   mock-shipper-sign|mock-consignee-sign|close|cancel|sync
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";
import { resolveCarrierCtx } from "@/server/carrier-cabinet.server";
import {
  loadConnectionConfig,
  logDocEvent,
  setDocStatus,
  setParticipantSigned,
} from "@/server/edo/carrier-edo.server";

export const Route = createFileRoute("/api/carrier/edo/documents/$id/actions")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const ctx = await resolveCarrierCtx(auth);
        if (ctx instanceof Response) return ctx;
        const url = new URL(request.url);
        const op = url.searchParams.get("op");
        const docId = params.id;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const c = ctx.client as any;

        const { data: doc } = await c
          .from("carrier_edo_documents")
          .select("*")
          .eq("id", docId)
          .maybeSingle();
        if (!doc) return jsonResponse({ error: "not_found" }, { status: 404 });

        const conn = await loadConnectionConfig(ctx.client, ctx.dispatcherCarrierExtId);
        const provider = conn?.cfg.provider ?? "internal_mock";
        const isMock = provider === "internal_mock";

        try {
          switch (op) {
            case "sign-carrier": {
              if (!isMock && conn) {
                const r = await conn.adapter.signAsCarrier(conn.cfg, doc.external_id ?? "");
                if (!r.ok) return jsonResponse({ error: r.error }, { status: 400 });
              }
              await setParticipantSigned(ctx.client, docId, "carrier", isMock ? "mock" : provider);
              await setDocStatus(ctx.client, docId, "waiting_driver_action", "driver",
                "Перевозчик подписал документ");
              return jsonResponse({ ok: true });
            }
            case "driver-action": {
              const body = (await request.json().catch(() => ({}))) as { action?: string };
              if (!isMock && conn) {
                const r = await conn.adapter.confirmDriverAction(
                  conn.cfg,
                  doc.external_id ?? "",
                  body.action ?? "confirm",
                );
                if (!r.ok) return jsonResponse({ error: r.error }, { status: 400 });
              }
              await setParticipantSigned(ctx.client, docId, "driver", isMock ? "mock" : provider);
              await setDocStatus(ctx.client, docId, "waiting_consignee_signature", "consignee",
                `Водитель: ${body.action ?? "подтвердил действие"}`);
              return jsonResponse({ ok: true });
            }
            case "mock-shipper-sign": {
              await setParticipantSigned(ctx.client, docId, "shipper", "mock");
              await setDocStatus(ctx.client, docId, "waiting_carrier_signature", "carrier",
                "Грузоотправитель подписал (mock)");
              return jsonResponse({ ok: true });
            }
            case "mock-consignee-sign": {
              await setParticipantSigned(ctx.client, docId, "consignee", "mock");
              await setDocStatus(ctx.client, docId, "signed", null,
                "Грузополучатель подписал (mock)");
              return jsonResponse({ ok: true });
            }
            case "close": {
              if (!isMock && conn) {
                const r = await conn.adapter.closeDocument(conn.cfg, doc.external_id ?? "");
                if (!r.ok) return jsonResponse({ error: r.error }, { status: 400 });
              }
              await setDocStatus(ctx.client, docId, "closed", null, "Документ закрыт");
              return jsonResponse({ ok: true });
            }
            case "cancel": {
              const body = (await request.json().catch(() => ({}))) as { reason?: string };
              if (!isMock && conn) {
                const r = await conn.adapter.cancelDocument(
                  conn.cfg,
                  doc.external_id ?? "",
                  body.reason ?? "",
                );
                if (!r.ok) return jsonResponse({ error: r.error }, { status: 400 });
              }
              await setDocStatus(ctx.client, docId, "cancelled", null,
                `Документ отменён: ${body.reason ?? "без причины"}`);
              return jsonResponse({ ok: true });
            }
            case "sync": {
              if (!isMock && conn) {
                const r = await conn.adapter.getEtrnStatus(conn.cfg, doc.external_id ?? "");
                if (!r.ok) return jsonResponse({ error: r.error }, { status: 400 });
                await logDocEvent(ctx.client, docId, "sync",
                  `Статус оператора: ${JSON.stringify(r.data)}`);
              } else {
                await logDocEvent(ctx.client, docId, "sync", "Mock: статус не меняется");
              }
              return jsonResponse({ ok: true });
            }
            default:
              return jsonResponse({ error: "unknown_op" }, { status: 400 });
          }
        } catch (e) {
          return jsonResponse(
            { error: "action_failed", message: e instanceof Error ? e.message : String(e) },
            { status: 400 },
          );
        }
      },
    },
  },
});
