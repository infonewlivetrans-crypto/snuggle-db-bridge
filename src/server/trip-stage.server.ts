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
  // Если активируем departed/in_progress — также фиксируем departed_at
  if (newStage === "in_progress" && input.stage === "departed") {
    patch.departed_at = now;
  }
  // Если завершён рейс — обновляем delivery_routes.status='completed' (для совместимости с пайплайном)
  if (input.stage === "finished") {
    patch.status = "completed";
  }

  const { error: upErr } = await supabaseAdmin
    .from("delivery_routes")
    .update(patch as never)
    .eq("id", input.deliveryRouteId);
  if (upErr) throw new Error(upErr.message);
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
