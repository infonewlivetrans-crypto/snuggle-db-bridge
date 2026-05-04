import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  applyStage,
  nextStage,
  TRIP_STAGE_LABELS,
  TRIP_STAGE_TIMESTAMP_FIELD,
  type TripStage,
} from "@/lib/tripStage";

export type StageEventInput = {
  deliveryRouteId: string;
  stage: TripStage;
  comment?: string | null;
  gps?: { lat: number; lng: number } | null;
  actorUserId?: string | null;
  actorName?: string | null;
};

export type StageEventRow = {
  id: string;
  delivery_route_id: string;
  stage: TripStage;
  occurred_at: string;
  actor_user_id: string | null;
  actor_name: string | null;
  comment: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
};

export type RouteReturnRow = {
  id: string;
  delivery_route_id: string;
  order_id: string | null;
  reason: string;
  comment: string | null;
  actor_user_id: string | null;
  actor_name: string | null;
  occurred_at: string;
};

export async function recordStageEvent(input: StageEventInput): Promise<void> {
  const now = new Date().toISOString();
  const newStage = applyStage(input.stage);

  // 0) СТРОГАЯ ПРОВЕРКА ПЕРЕХОДА: следующий этап должен соответствовать current_stage
  const { data: routeRow, error: rErr } = await supabaseAdmin
    .from("delivery_routes")
    .select("current_stage, route_number, assigned_driver, source_request_id")
    .eq("id", input.deliveryRouteId)
    .maybeSingle();
  if (rErr) throw new Error(rErr.message);
  if (!routeRow) throw new Error("Маршрут не найден");
  const routeMeta = routeRow as {
    current_stage: TripStage | null;
    route_number: string | null;
    assigned_driver: string | null;
    source_request_id: string | null;
  };
  const current = (routeMeta.current_stage ?? "not_started") as TripStage;
  const expected = nextStage(current);
  if (expected !== input.stage) {
    throw new Error(
      `Недопустимый переход: текущий этап «${TRIP_STAGE_LABELS[current]}», ожидается «${
        expected ? TRIP_STAGE_LABELS[expected] : "—"
      }», получено «${TRIP_STAGE_LABELS[input.stage]}»`,
    );
  }

  // 1) пишем событие
  const { error: evErr } = await supabaseAdmin.from("route_stage_events").insert({
    delivery_route_id: input.deliveryRouteId,
    stage: input.stage,
    occurred_at: now,
    actor_user_id: input.actorUserId ?? null,
    actor_name: input.actorName ?? null,
    comment: input.comment ?? null,
    gps_lat: input.gps?.lat ?? null,
    gps_lng: input.gps?.lng ?? null,
  } as never);
  if (evErr) throw new Error(evErr.message);

  // 2) обновляем кеш на маршруте: текущий этап + соответствующая метка времени
  const patch: Record<string, unknown> = { current_stage: newStage };
  const tsField = TRIP_STAGE_TIMESTAMP_FIELD[input.stage];
  if (tsField) patch[tsField] = now;
  if (newStage === "in_progress" && input.stage === "departed") {
    patch.departed_at = now;
  }
  if (input.stage === "finished") {
    patch.status = "completed";
  }

  const { error: upErr } = await supabaseAdmin
    .from("delivery_routes")
    .update(patch as never)
    .eq("id", input.deliveryRouteId);
  if (upErr) throw new Error(upErr.message);

  // 3) уведомление об изменении статуса рейса (видно в /notifications, реалтайм)
  const routeLabel = routeMeta.route_number ?? input.deliveryRouteId.slice(0, 8);
  const driver = input.actorName ?? routeMeta.assigned_driver ?? "Водитель";
  const stageLabel = TRIP_STAGE_LABELS[input.stage];
  const body =
    `${driver} • Рейс ${routeLabel}: ${stageLabel}` +
    (input.comment ? ` — ${input.comment}` : "");
  const { error: nErr } = await supabaseAdmin.from("notifications").insert({
    kind: "trip_stage_changed",
    title: `Рейс ${routeLabel}: ${stageLabel}`,
    body,
    route_id: routeMeta.source_request_id,
    payload: {
      delivery_route_id: input.deliveryRouteId,
      stage: input.stage,
      new_stage: newStage,
      previous_stage: current,
      occurred_at: now,
      actor_name: driver,
      actor_user_id: input.actorUserId ?? null,
      comment: input.comment ?? null,
      gps: input.gps ?? null,
    },
  } as never);
  if (nErr) {
    // Не валим основную операцию из-за уведомления — логируем
    console.error("notifications insert failed:", nErr.message);
  }
}

export async function listStageEvents(
  deliveryRouteId: string,
): Promise<StageEventRow[]> {
  const { data, error } = await supabaseAdmin
    .from("route_stage_events")
    .select("*")
    .eq("delivery_route_id", deliveryRouteId)
    .order("occurred_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as StageEventRow[];
}

export type RecordReturnInput = {
  deliveryRouteId: string;
  orderId?: string | null;
  reason: string;
  comment?: string | null;
  actorUserId?: string | null;
  actorName?: string | null;
};

export async function recordRouteReturn(input: RecordReturnInput): Promise<void> {
  const { error } = await supabaseAdmin.from("route_returns").insert({
    delivery_route_id: input.deliveryRouteId,
    order_id: input.orderId ?? null,
    reason: input.reason,
    comment: input.comment ?? null,
    actor_user_id: input.actorUserId ?? null,
    actor_name: input.actorName ?? null,
  } as never);
  if (error) throw new Error(error.message);
}

export async function listRouteReturns(
  deliveryRouteId: string,
): Promise<RouteReturnRow[]> {
  const { data, error } = await supabaseAdmin
    .from("route_returns")
    .select("*")
    .eq("delivery_route_id", deliveryRouteId)
    .order("occurred_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as RouteReturnRow[];
}
