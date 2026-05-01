import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AnyClient = { from: (t: string) => any };

const sendOfferSchema = z.object({
  routeId: z.string().uuid().nullable().optional(),
  transportRequestId: z.string().uuid().nullable().optional(),
  carrierId: z.string().uuid(),
  vehicleId: z.string().uuid().nullable().optional(),
  driverId: z.string().uuid().nullable().optional(),
  expiresInHours: z.number().min(1).max(720).default(24),
  comment: z.string().max(2000).optional().nullable(),
});

export const sendRouteOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => sendOfferSchema.parse(data))
  .handler(async ({ data, context }) => {
    const supa = context.supabase as unknown as AnyClient;
    const expiresAt = new Date(Date.now() + data.expiresInHours * 3600_000).toISOString();

    const { data: inserted, error } = await supa
      .from("route_offers")
      .insert({
        route_id: data.routeId ?? null,
        transport_request_id: data.transportRequestId ?? null,
        carrier_id: data.carrierId,
        vehicle_id: data.vehicleId ?? null,
        driver_id: data.driverId ?? null,
        status: "sent",
        expires_at: expiresAt,
        comment: data.comment ?? null,
        created_by: context.userId,
      })
      .select("id, route_id")
      .single();

    if (error) throw new Error(error.message);

    // Бросаем уведомление в общую таблицу notifications (если есть route_id)
    try {
      await supa.from("notifications").insert({
        kind: "carrier_offer",
        title: "Новое предложение рейса",
        body: data.comment ?? "Вам предложен рейс. Откройте предложение в кабинете перевозчика.",
        route_id: inserted?.route_id ?? null,
        payload: {
          offer_id: inserted?.id,
          carrier_id: data.carrierId,
          vehicle_id: data.vehicleId ?? null,
          expires_at: expiresAt,
        },
      });
    } catch {
      // не блокируем создание предложения, если уведомления недоступны
    }

    return { offerId: inserted?.id };
  });

const updateStatusSchema = z.object({
  offerId: z.string().uuid(),
  status: z.enum(["sent", "viewed", "accepted", "declined", "expired"]),
  declineReason: z.string().max(1000).optional().nullable(),
});

export const updateOfferStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => updateStatusSchema.parse(data))
  .handler(async ({ data, context }) => {
    const supa = context.supabase as unknown as AnyClient;
    const patch: Record<string, unknown> = { status: data.status };
    const now = new Date().toISOString();
    if (data.status === "viewed") patch.viewed_at = now;
    if (data.status === "accepted" || data.status === "declined") patch.responded_at = now;
    if (data.status === "declined") patch.decline_reason = data.declineReason ?? null;

    const { error } = await supa.from("route_offers").update(patch).eq("id", data.offerId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
