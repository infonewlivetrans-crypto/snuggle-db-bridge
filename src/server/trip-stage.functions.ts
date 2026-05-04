import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  listRouteReturns,
  listStageEvents,
  recordRouteReturn,
  recordStageEvent,
  type RouteReturnRow,
  type StageEventRow,
} from "./trip-stage.server";
import type { TripStage } from "@/lib/tripStage";

const ALLOWED_STAGES: TripStage[] = [
  "arrived_loading",
  "loaded",
  "departed",
  "finished",
  "cash_returned",
];

export const advanceTripStageFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      deliveryRouteId: string;
      stage: TripStage;
      comment?: string | null;
      gps?: { lat: number; lng: number } | null;
      actorName?: string | null;
    }) => {
      if (!input?.deliveryRouteId) throw new Error("deliveryRouteId обязателен");
      if (!ALLOWED_STAGES.includes(input.stage)) {
        throw new Error("Недопустимый этап");
      }
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    await recordStageEvent({
      deliveryRouteId: data.deliveryRouteId,
      stage: data.stage,
      comment: data.comment ?? null,
      gps: data.gps ?? null,
      actorUserId: context.userId,
      actorName: data.actorName ?? null,
    });
    return { ok: true };
  });

export const listStageEventsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { deliveryRouteId: string }) => {
    if (!input?.deliveryRouteId) throw new Error("deliveryRouteId обязателен");
    return input;
  })
  .handler(async ({ data }): Promise<StageEventRow[]> => {
    return listStageEvents(data.deliveryRouteId);
  });

export const recordRouteReturnFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      deliveryRouteId: string;
      orderId?: string | null;
      reason: string;
      comment?: string | null;
      actorName?: string | null;
    }) => {
      if (!input?.deliveryRouteId) throw new Error("deliveryRouteId обязателен");
      if (!input?.reason?.trim()) throw new Error("Укажите причину возврата");
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    await recordRouteReturn({
      deliveryRouteId: data.deliveryRouteId,
      orderId: data.orderId ?? null,
      reason: data.reason.trim(),
      comment: data.comment ?? null,
      actorUserId: context.userId,
      actorName: data.actorName ?? null,
    });
    return { ok: true };
  });

export const listRouteReturnsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { deliveryRouteId: string }) => {
    if (!input?.deliveryRouteId) throw new Error("deliveryRouteId обязателен");
    return input;
  })
  .handler(async ({ data }): Promise<RouteReturnRow[]> => {
    return listRouteReturns(data.deliveryRouteId);
  });
