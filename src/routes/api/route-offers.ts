import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = { from: (t: string) => any };

const DECLINE_REASON_LABELS: Record<string, string> = {
  time: "не подходит время",
  price: "не подходит цена",
  no_vehicle: "нет машины",
  direction: "не подходит направление",
  other: "другое",
};

function isUuid(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export const Route = createFileRoute("/api/route-offers")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const supa = auth.client as unknown as AnyClient;
        const url = new URL(request.url);
        const carrierId = url.searchParams.get("carrier_id");
        const status = url.searchParams.get("status");
        const fields = url.searchParams.get("fields") || "*";
        const limit = Math.min(Math.max(1, Number(url.searchParams.get("limit")) || 200), 500);
        let q = supa.from("route_offers").select(fields).order("sent_at", { ascending: false }).limit(limit);
        if (carrierId) q = q.eq("carrier_id", carrierId);
        if (status) q = q.eq("status", status);
        const { data, error } = await q;
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse(data ?? []);
      },
      // action: send | update | respond | confirm | reject
      POST: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const supa = auth.client as unknown as AnyClient;
        try {
          const body = (await request.json()) as Record<string, unknown>;
          const action = String(body.action ?? "");

          if (action === "send") {
            if (!isUuid(body.carrierId)) return jsonResponse({ error: "carrierId" }, { status: 400 });
            const expiresInHours = Number(body.expiresInHours ?? 24);
            if (!(expiresInHours >= 1 && expiresInHours <= 720)) return jsonResponse({ error: "expiresInHours 1..720" }, { status: 400 });
            const expiresAt = new Date(Date.now() + expiresInHours * 3600_000).toISOString();
            const { data: inserted, error } = await supa.from("route_offers").insert({
              route_id: (body.routeId as string | null) ?? null,
              transport_request_id: (body.transportRequestId as string | null) ?? null,
              carrier_id: body.carrierId,
              vehicle_id: (body.vehicleId as string | null) ?? null,
              driver_id: (body.driverId as string | null) ?? null,
              status: "sent",
              expires_at: expiresAt,
              comment: (body.comment as string | null) ?? null,
              created_by: auth.userId,
            }).select("id, route_id").single();
            if (error) throw new Error(error.message);
            try {
              await supa.from("notifications").insert({
                kind: "carrier_offer",
                title: "Новое предложение рейса",
                body: (body.comment as string | null) ?? "Вам предложен рейс. Откройте предложение в кабинете перевозчика.",
                route_id: inserted?.route_id ?? null,
                payload: { offer_id: inserted?.id, carrier_id: body.carrierId, vehicle_id: body.vehicleId ?? null, expires_at: expiresAt },
              });
            } catch { /* ignore */ }
            return jsonResponse({ offerId: inserted?.id });
          }

          if (action === "update") {
            const offerId = String(body.offerId ?? "");
            const status = String(body.status ?? "");
            if (!isUuid(offerId)) return jsonResponse({ error: "offerId" }, { status: 400 });
            if (!["sent", "viewed", "accepted", "declined", "expired"].includes(status)) {
              return jsonResponse({ error: "status" }, { status: 400 });
            }
            const patch: Record<string, unknown> = { status };
            const now = new Date().toISOString();
            if (status === "viewed") patch.viewed_at = now;
            if (status === "accepted" || status === "declined") patch.responded_at = now;
            if (status === "declined") patch.decline_reason = (body.declineReason as string | null) ?? null;
            const { error } = await supa.from("route_offers").update(patch).eq("id", offerId);
            if (error) throw new Error(error.message);
            return jsonResponse({ ok: true });
          }

          if (action === "respond") {
            const offerId = String(body.offerId ?? "");
            const respondAction = String(body.respondAction ?? "");
            if (!isUuid(offerId)) return jsonResponse({ error: "offerId" }, { status: 400 });
            if (!["accept", "decline"].includes(respondAction)) return jsonResponse({ error: "respondAction" }, { status: 400 });
            const { data: offer, error: getErr } = await supa.from("route_offers")
              .select("id, route_id, carrier_id, status").eq("id", offerId).maybeSingle();
            if (getErr) throw new Error(getErr.message);
            if (!offer) throw new Error("Предложение не найдено");
            if (["accepted", "declined", "expired"].includes(offer.status)) {
              throw new Error("На это предложение уже дан ответ");
            }
            const now = new Date().toISOString();
            const patch: Record<string, unknown> = { responded_at: now };
            if (respondAction === "accept") {
              patch.status = "accepted";
            } else {
              patch.status = "declined";
              const reasonKey = (body.declineReason as string | null) ?? null;
              const reasonLabel = reasonKey ? DECLINE_REASON_LABELS[reasonKey] ?? "не указана" : "не указана";
              const cmt = body.declineComment as string | null;
              patch.decline_reason = cmt ? `${reasonLabel}: ${cmt}` : reasonLabel;
            }
            const { error: updErr } = await supa.from("route_offers").update(patch).eq("id", offerId);
            if (updErr) throw new Error(updErr.message);

            let routeNumber: string | null = null;
            if (offer.route_id) {
              const { data: r } = await supa.from("routes").select("route_number").eq("id", offer.route_id).maybeSingle();
              routeNumber = (r as { route_number?: string } | null)?.route_number ?? null;
            }
            const { data: c } = await supa.from("carriers").select("company_name").eq("id", offer.carrier_id).maybeSingle();
            const carrierName = (c as { company_name?: string } | null)?.company_name ?? "Перевозчик";
            const routeLabel = routeNumber ? `№${routeNumber}` : "(без номера)";
            const title = respondAction === "accept" ? `Перевозчик принял предложение по рейсу ${routeLabel}` : `Перевозчик отклонил рейс ${routeLabel}`;
            const noteBody = respondAction === "accept"
              ? `${carrierName} принял предложение. Подтвердите назначение в карточке рейса.`
              : `${carrierName} отклонил предложение. Причина: ${patch.decline_reason as string}`;
            try {
              await supa.from("notifications").insert({
                kind: respondAction === "accept" ? "carrier_offer_accepted" : "carrier_offer_declined",
                title, body: noteBody, route_id: offer.route_id ?? null,
                payload: { offer_id: offer.id, carrier_id: offer.carrier_id, action: respondAction, decline_reason: patch.decline_reason ?? null },
              });
            } catch { /* ignore */ }
            return jsonResponse({ ok: true, status: patch.status });
          }

          if (action === "confirm" || action === "reject") {
            const routeId = String(body.routeId ?? "");
            if (!isUuid(routeId)) return jsonResponse({ error: "routeId" }, { status: 400 });
            const { data: route, error: rErr } = await supa.from("routes")
              .select("id, route_number, carrier_assignment_status, pending_offer_id, carrier_id, vehicle_id, driver_id")
              .eq("id", routeId).maybeSingle();
            if (rErr) throw new Error(rErr.message);
            if (!route) throw new Error("Рейс не найден");
            if (route.carrier_assignment_status !== "pending" || !route.pending_offer_id) {
              throw new Error(action === "confirm" ? "Нет принятого предложения, ожидающего подтверждения" : "Нет принятого предложения для отклонения");
            }
            const { data: offer } = await supa.from("route_offers").select("id, carrier_id, vehicle_id, driver_id").eq("id", route.pending_offer_id).maybeSingle();

            const now = new Date().toISOString();
            if (action === "confirm") {
              if (!offer) throw new Error("Предложение не найдено");
              const { error: updErr } = await supa.from("routes").update({
                carrier_id: offer.carrier_id,
                vehicle_id: offer.vehicle_id ?? route.vehicle_id,
                driver_id: offer.driver_id ?? route.driver_id,
                carrier_assignment_status: "assigned",
                carrier_assigned_at: now,
                carrier_assigned_by: auth.userId,
              }).eq("id", routeId);
              if (updErr) throw new Error(updErr.message);
              await supa.from("route_offers").update({ status: "expired" }).eq("route_id", routeId).neq("id", offer.id).in("status", ["sent", "viewed"]);
              await supa.from("route_carrier_history").insert({
                route_id: routeId, offer_id: offer.id, carrier_id: offer.carrier_id,
                vehicle_id: offer.vehicle_id, driver_id: offer.driver_id,
                action: "confirmed_by_logist", actor_user_id: auth.userId,
                comment: (body.comment as string | null) ?? null,
              });
              const routeLabel = route.route_number ? `№${route.route_number}` : "(без номера)";
              try {
                await supa.from("notifications").insert({
                  kind: "carrier_assigned",
                  title: `Вы назначены на рейс ${routeLabel}`,
                  body: (body.comment as string | null) ?? "Логист подтвердил ваше назначение. Водитель получает доступ к маршруту.",
                  route_id: routeId,
                  payload: { offer_id: offer.id, carrier_id: offer.carrier_id, vehicle_id: offer.vehicle_id, driver_id: offer.driver_id },
                });
              } catch { /* ignore */ }
              return jsonResponse({ ok: true });
            }

            // reject
            const reason = ((body.comment as string | null) ?? "").trim() || "Отклонено логистом";
            const { error: updErr } = await supa.from("routes").update({
              carrier_assignment_status: "rejected", pending_offer_id: null,
            }).eq("id", routeId);
            if (updErr) throw new Error(updErr.message);
            if (offer) {
              await supa.from("route_offers").update({
                status: "expired", decline_reason: `Отклонено логистом: ${reason}`, responded_at: now,
              }).eq("id", offer.id);
              await supa.from("route_carrier_history").insert({
                route_id: routeId, offer_id: offer.id, carrier_id: offer.carrier_id,
                vehicle_id: offer.vehicle_id, driver_id: offer.driver_id,
                action: "rejected_by_logist", actor_user_id: auth.userId, reason,
              });
              const routeLabel = route.route_number ? `№${route.route_number}` : "(без номера)";
              try {
                await supa.from("notifications").insert({
                  kind: "carrier_offer_rejected_by_logist",
                  title: `Логист отклонил вашу заявку на рейс ${routeLabel}`,
                  body: `Причина: ${reason}`, route_id: routeId,
                  payload: { offer_id: offer.id, carrier_id: offer.carrier_id, reason },
                });
              } catch { /* ignore */ }
            }
            await supa.from("routes").update({ carrier_assignment_status: "none" }).eq("id", routeId);
            return jsonResponse({ ok: true });
          }

          return jsonResponse({ error: "Неизвестное действие" }, { status: 400 });
        } catch (e) {
          return jsonResponse({ error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
