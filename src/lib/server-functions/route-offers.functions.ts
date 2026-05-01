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

const DECLINE_REASON_LABELS: Record<string, string> = {
  time: "не подходит время",
  price: "не подходит цена",
  no_vehicle: "нет машины",
  direction: "не подходит направление",
  other: "другое",
};

const respondSchema = z.object({
  offerId: z.string().uuid(),
  action: z.enum(["accept", "decline"]),
  declineReason: z.enum(["time", "price", "no_vehicle", "direction", "other"]).optional().nullable(),
  declineComment: z.string().max(1000).optional().nullable(),
});

/**
 * Перевозчик отвечает на предложение: принимает или отклоняет.
 * После ответа создаётся уведомление для логистов.
 */
export const respondToOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => respondSchema.parse(data))
  .handler(async ({ data, context }) => {
    const supa = context.supabase as unknown as AnyClient;

    // Берём текущее предложение, чтобы знать route_id, carrier_id и номер рейса
    const { data: offer, error: getErr } = await supa
      .from("route_offers")
      .select("id, route_id, carrier_id, status")
      .eq("id", data.offerId)
      .maybeSingle();
    if (getErr) throw new Error(getErr.message);
    if (!offer) throw new Error("Предложение не найдено");
    if (offer.status === "accepted" || offer.status === "declined" || offer.status === "expired") {
      throw new Error("На это предложение уже дан ответ");
    }

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { responded_at: now };

    if (data.action === "accept") {
      patch.status = "accepted";
    } else {
      patch.status = "declined";
      const reasonLabel = data.declineReason ? DECLINE_REASON_LABELS[data.declineReason] : "не указана";
      patch.decline_reason = data.declineComment
        ? `${reasonLabel}: ${data.declineComment}`
        : reasonLabel;
    }

    const { error: updErr } = await supa
      .from("route_offers")
      .update(patch)
      .eq("id", data.offerId);
    if (updErr) throw new Error(updErr.message);

    // Подтянуть номер рейса и название перевозчика для уведомления
    let routeNumber: string | null = null;
    if (offer.route_id) {
      const { data: r } = await supa
        .from("routes")
        .select("route_number")
        .eq("id", offer.route_id)
        .maybeSingle();
      routeNumber = (r as { route_number?: string } | null)?.route_number ?? null;
    }
    const { data: c } = await supa
      .from("carriers")
      .select("company_name")
      .eq("id", offer.carrier_id)
      .maybeSingle();
    const carrierName = (c as { company_name?: string } | null)?.company_name ?? "Перевозчик";

    const routeLabel = routeNumber ? `№${routeNumber}` : "(без номера)";
    const title =
      data.action === "accept"
        ? `Перевозчик принял предложение по рейсу ${routeLabel}`
        : `Перевозчик отклонил рейс ${routeLabel}`;
    const body =
      data.action === "accept"
        ? `${carrierName} принял предложение. Подтвердите назначение в карточке рейса.`
        : `${carrierName} отклонил предложение. Причина: ${patch.decline_reason as string}`;

    try {
      await supa.from("notifications").insert({
        kind: data.action === "accept" ? "carrier_offer_accepted" : "carrier_offer_declined",
        title,
        body,
        route_id: offer.route_id ?? null,
        payload: {
          offer_id: offer.id,
          carrier_id: offer.carrier_id,
          action: data.action,
          decline_reason: patch.decline_reason ?? null,
        },
      });
    } catch {
      // не блокируем ответ перевозчика
    }

    return { ok: true, status: patch.status as string };
  });

const decisionSchema = z.object({
  routeId: z.string().uuid(),
  comment: z.string().max(2000).optional().nullable(),
});

/**
 * Логист подтверждает перевозчика, ранее принявшего предложение.
 * - rоute.carrier_id, vehicle_id, driver_id обновляются из принятого offer
 * - rоute.carrier_assignment_status = 'assigned'
 * - перевозчик получает уведомление "Вы назначены на рейс №___"
 */
export const confirmCarrierForRoute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => decisionSchema.parse(data))
  .handler(async ({ data, context }) => {
    const supa = context.supabase as unknown as AnyClient;

    // 1) текущий рейс
    const { data: route, error: rErr } = await supa
      .from("routes")
      .select(
        "id, route_number, carrier_assignment_status, pending_offer_id, carrier_id, vehicle_id, driver_id",
      )
      .eq("id", data.routeId)
      .maybeSingle();
    if (rErr) throw new Error(rErr.message);
    if (!route) throw new Error("Рейс не найден");
    if (route.carrier_assignment_status !== "pending" || !route.pending_offer_id) {
      throw new Error("Нет принятого предложения, ожидающего подтверждения");
    }

    // 2) принятое предложение
    const { data: offer, error: oErr } = await supa
      .from("route_offers")
      .select("id, carrier_id, vehicle_id, driver_id")
      .eq("id", route.pending_offer_id)
      .maybeSingle();
    if (oErr) throw new Error(oErr.message);
    if (!offer) throw new Error("Предложение не найдено");

    const now = new Date().toISOString();

    // 3) обновляем рейс: закрепляем перевозчика
    const { error: updErr } = await supa
      .from("routes")
      .update({
        carrier_id: offer.carrier_id,
        vehicle_id: offer.vehicle_id ?? route.vehicle_id,
        driver_id: offer.driver_id ?? route.driver_id,
        carrier_assignment_status: "assigned",
        carrier_assigned_at: now,
        carrier_assigned_by: context.userId,
      })
      .eq("id", data.routeId);
    if (updErr) throw new Error(updErr.message);

    // 4) истечь все остальные открытые предложения по этому рейсу
    await supa
      .from("route_offers")
      .update({ status: "expired" })
      .eq("route_id", data.routeId)
      .neq("id", offer.id)
      .in("status", ["sent", "viewed"]);

    // 5) запись в историю
    await supa.from("route_carrier_history").insert({
      route_id: data.routeId,
      offer_id: offer.id,
      carrier_id: offer.carrier_id,
      vehicle_id: offer.vehicle_id,
      driver_id: offer.driver_id,
      action: "confirmed_by_logist",
      actor_user_id: context.userId,
      comment: data.comment ?? null,
    });

    // 6) уведомление перевозчику
    const routeLabel = route.route_number ? `№${route.route_number}` : "(без номера)";
    try {
      await supa.from("notifications").insert({
        kind: "carrier_assigned",
        title: `Вы назначены на рейс ${routeLabel}`,
        body:
          data.comment ??
          "Логист подтвердил ваше назначение. Водитель получает доступ к маршруту.",
        route_id: data.routeId,
        payload: {
          offer_id: offer.id,
          carrier_id: offer.carrier_id,
          vehicle_id: offer.vehicle_id,
          driver_id: offer.driver_id,
        },
      });
    } catch {
      // не блокируем подтверждение
    }

    return { ok: true };
  });

/**
 * Логист отклоняет принятого перевозчика.
 * - сбрасывает pending-состояние рейса (можно предложить другим)
 * - помечает offer как 'declined' (с причиной от логиста)
 * - уведомляет перевозчика
 */
export const rejectCarrierForRoute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => decisionSchema.parse(data))
  .handler(async ({ data, context }) => {
    const supa = context.supabase as unknown as AnyClient;

    const { data: route, error: rErr } = await supa
      .from("routes")
      .select("id, route_number, carrier_assignment_status, pending_offer_id")
      .eq("id", data.routeId)
      .maybeSingle();
    if (rErr) throw new Error(rErr.message);
    if (!route) throw new Error("Рейс не найден");
    if (route.carrier_assignment_status !== "pending" || !route.pending_offer_id) {
      throw new Error("Нет принятого предложения для отклонения");
    }

    const { data: offer } = await supa
      .from("route_offers")
      .select("id, carrier_id, vehicle_id, driver_id")
      .eq("id", route.pending_offer_id)
      .maybeSingle();

    const now = new Date().toISOString();
    const reason = data.comment?.trim() || "Отклонено логистом";

    // 1) Сбросить состояние рейса
    const { error: updErr } = await supa
      .from("routes")
      .update({
        carrier_assignment_status: "rejected",
        pending_offer_id: null,
      })
      .eq("id", data.routeId);
    if (updErr) throw new Error(updErr.message);

    // 2) Пометить offer как expired (предложение закрыто решением логиста)
    if (offer) {
      await supa
        .from("route_offers")
        .update({
          status: "expired",
          decline_reason: `Отклонено логистом: ${reason}`,
          responded_at: now,
        })
        .eq("id", offer.id);

      // 3) История
      await supa.from("route_carrier_history").insert({
        route_id: data.routeId,
        offer_id: offer.id,
        carrier_id: offer.carrier_id,
        vehicle_id: offer.vehicle_id,
        driver_id: offer.driver_id,
        action: "rejected_by_logist",
        actor_user_id: context.userId,
        reason,
      });

      // 4) Уведомление перевозчику
      const routeLabel = route.route_number ? `№${route.route_number}` : "(без номера)";
      try {
        await supa.from("notifications").insert({
          kind: "carrier_offer_rejected_by_logist",
          title: `Логист отклонил вашу заявку на рейс ${routeLabel}`,
          body: `Причина: ${reason}`,
          route_id: data.routeId,
          payload: {
            offer_id: offer.id,
            carrier_id: offer.carrier_id,
            reason,
          },
        });
      } catch {
        // не блокируем
      }
    }

    // Сразу после отказа — рейс снова доступен для предложений другим перевозчикам.
    // Если логист хочет начать заново, он может вручную вернуть статус в 'none'.
    await supa
      .from("routes")
      .update({ carrier_assignment_status: "none" })
      .eq("id", data.routeId);

    return { ok: true };
  });
