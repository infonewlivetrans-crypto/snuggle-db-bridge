import { supabase } from "@/integrations/supabase/client";

export type PointActionKind =
  | "point_opened"
  | "call_client"
  | "message_client"
  | "call_manager"
  | "report_problem"
  | "open_map"
  | "status_delivered"
  | "status_not_delivered"
  | "status_returned"
  | "status_changed"
  | "payment_amount_set"
  | "comment_added"
  | "return_comment_added"
  | "photo_qr_uploaded"
  | "photo_documents_uploaded"
  | "photo_problem_uploaded"
  | "photo_uploaded";

export interface PointActionRow {
  id: string;
  route_point_id: string;
  order_id: string | null;
  route_id: string | null;
  action: PointActionKind | string;
  actor: string | null;
  details: Record<string, unknown> | null;
  comment: string | null;
  created_at: string;
}

/**
 * Записывает «UI-действие» водителя по точке (открытие точки, звонок, открытие карты).
 * Серверные триггеры сами фиксируют статусы, фото, оплату и комментарии.
 */
export async function logPointAction(args: {
  routePointId: string;
  orderId?: string | null;
  routeId?: string | null;
  action: PointActionKind;
  actor?: string | null;
  details?: Record<string, unknown>;
  comment?: string | null;
}) {
  try {
    const { error } = await (
      supabase.from("route_point_actions" as never) as unknown as {
        insert: (p: Record<string, unknown>) => Promise<{ error: Error | null }>;
      }
    ).insert({
      route_point_id: args.routePointId,
      order_id: args.orderId ?? null,
      route_id: args.routeId ?? null,
      action: args.action,
      actor: args.actor ?? "Водитель",
      details: args.details ?? {},
      comment: args.comment ?? null,
    });
    if (error) {
      // не блокируем UI — только лог
      console.warn("logPointAction failed:", error.message);
    }
  } catch (e) {
    console.warn("logPointAction error:", (e as Error).message);
  }
}

export const POINT_ACTION_LABELS: Record<string, string> = {
  point_opened: "Открыл точку",
  call_client: "Позвонил клиенту",
  message_client: "Написал клиенту",
  call_manager: "Позвонил менеджеру",
  report_problem: "Сообщил о проблеме",
  open_map: "Открыл карту",
  status_delivered: "Отметил «Доставлено»",
  status_not_delivered: "Отметил «Не доставлено»",
  status_returned: "Отметил «Возврат на склад»",
  status_changed: "Сменил статус точки",
  payment_amount_set: "Указал сумму оплаты",
  comment_added: "Добавил комментарий",
  return_comment_added: "Комментарий к возврату",
  photo_qr_uploaded: "Загрузил фото QR",
  photo_documents_uploaded: "Загрузил фото документов",
  photo_problem_uploaded: "Загрузил фото проблемы",
  photo_uploaded: "Загрузил фото",
};
