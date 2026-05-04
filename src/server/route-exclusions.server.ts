// Сервер: исключение заказа из рейса водителем во время погрузки.
// 1. Проверяем этап рейса: разрешено только arrived_loading / loaded.
// 2. Удаляем route_point.
// 3. Меняем статус заказа на 'excluded_from_route'.
// 4. Пишем запись в route_order_exclusions (триггер создаёт уведомление).
// 5. Триггеры на route_points сами пересчитают веса/объёмы/стоимость.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const EXCLUSION_REASONS = [
  "Не влез",
  "Отменился",
  "Нет на складе",
  "Повреждён",
  "Перенос доставки",
  "Другая причина",
] as const;
export type ExclusionReason = (typeof EXCLUSION_REASONS)[number];

const ALLOWED_STAGES = ["arrived_loading", "loaded"] as const;

export type ExcludeOrderInput = {
  deliveryRouteId: string;
  orderId: string;
  reason: ExclusionReason;
  comment?: string | null;
  actorUserId?: string | null;
  actorName?: string | null;
};

export async function excludeOrderFromRoute(input: ExcludeOrderInput): Promise<void> {
  const reason = input.reason;
  const comment = input.comment?.trim() || null;
  if (reason === "Другая причина" && !comment) {
    throw new Error("Для причины «Другая причина» необходим комментарий");
  }

  // Загружаем рейс — current_stage и source_request_id (route_id)
  const { data: dr, error: drErr } = await supabaseAdmin
    .from("delivery_routes")
    .select("id, current_stage, source_request_id")
    .eq("id", input.deliveryRouteId)
    .maybeSingle();
  if (drErr) throw new Error(drErr.message);
  if (!dr) throw new Error("Рейс не найден");

  const stage = (dr as { current_stage: string }).current_stage;
  if (!ALLOWED_STAGES.includes(stage as (typeof ALLOWED_STAGES)[number])) {
    throw new Error(
      "Убрать заказ из рейса можно только во время погрузки (этапы «Прибыл на загрузку» / «Загрузился»).",
    );
  }
  const routeId = (dr as { source_request_id: string | null }).source_request_id;

  // Находим точку
  if (!routeId) throw new Error("В рейсе нет связанного маршрута");
  const { data: pt, error: ptErr } = await supabaseAdmin
    .from("route_points")
    .select("id, route_id, order_id")
    .eq("route_id", routeId)
    .eq("order_id", input.orderId)
    .maybeSingle();
  if (ptErr) throw new Error(ptErr.message);
  if (!pt) throw new Error("Заказ не найден в маршруте");

  // 1) Удаляем точку (триггеры пересчитают вес/объём/стоимость маршрута)
  const { error: delErr } = await supabaseAdmin
    .from("route_points")
    .delete()
    .eq("id", (pt as { id: string }).id);
  if (delErr) throw new Error(delErr.message);

  // 2) Обновляем статус заказа
  const { error: ordErr } = await supabaseAdmin
    .from("orders")
    .update({ status: "excluded_from_route" as never })
    .eq("id", input.orderId);
  if (ordErr) throw new Error(ordErr.message);

  // 3) Пишем запись об исключении (триггер создаёт уведомление менеджеру)
  const { error: exErr } = await supabaseAdmin.from("route_order_exclusions").insert({
    delivery_route_id: input.deliveryRouteId,
    route_id: routeId,
    order_id: input.orderId,
    reason,
    comment,
    excluded_by: input.actorUserId ?? null,
    excluded_by_name: input.actorName ?? null,
  } as never);
  if (exErr) throw new Error(exErr.message);
}

export type RouteExclusionRow = {
  id: string;
  delivery_route_id: string;
  route_id: string | null;
  order_id: string;
  reason: string;
  comment: string | null;
  excluded_by: string | null;
  excluded_by_name: string | null;
  excluded_at: string;
};

export async function listRouteExclusions(
  deliveryRouteId: string,
): Promise<RouteExclusionRow[]> {
  const { data, error } = await supabaseAdmin
    .from("route_order_exclusions")
    .select("*")
    .eq("delivery_route_id", deliveryRouteId)
    .order("excluded_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as RouteExclusionRow[];
}
